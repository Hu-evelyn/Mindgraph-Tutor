
require('dotenv').config({
  path: require('path').join(__dirname, '.env.local'),
});
require('dotenv').config();

const { validateNote } = require('./noteValidation');
const { retrieveMaterials, addSourceReferences } = require('./rag');
const { buildTreePrompt, buildExpandPrompt, buildNotePrompt } = require('./notePrompts');
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { OpenAI } = require('openai');
const {
  parseGeneratedOutput,
  OutputValidationError,
  MAX_ROOT_CHILDREN,
  MAX_EXPAND_CHILDREN,
} = require('./structuredOutput');

const app = express();
const port = process.env.PORT || 3000;

const { fetch: directFetch, Agent } = require('undici');
const directAgent = new Agent();

const client = new OpenAI({
  baseURL: process.env.ZHIPU_BASE_URL,
  apiKey: process.env.ZHIPU_API_KEY,
  fetch: (url, options) =>
    directFetch(url, { ...options, dispatcher: directAgent }),
  timeout: 90000,
  maxRetries: 0,
});

app.use(cors());
app.use(express.json());

// 初始化 SQLite 数据库
let resolveDbReady;
let rejectDbReady;
const dbReady = new Promise((resolve, reject) => {
  resolveDbReady = resolve;
  rejectDbReady = reject;
});

const db = new sqlite3.Database(
  process.env.DB_PATH || 'database.db',
  (err) => {
    if (err) {
      console.error('Error opening database:', err);
      rejectDbReady(err);
    } else {
      console.log('✅ Connected to SQLite database.');

      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        email TEXT
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS knowledge_trees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        root_topic TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS knowledge_nodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tree_id INTEGER,
        parent_id INTEGER,
        label TEXT,
        content TEXT,
        is_learned BOOLEAN DEFAULT 0,
        relation_type TEXT,
        importance TEXT,
        difficulty TEXT,
        estimated_time TEXT,
        is_boundary BOOLEAN DEFAULT 0,
        is_core BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        children_generated BOOLEAN DEFAULT 0,
        FOREIGN KEY (tree_id) REFERENCES knowledge_trees (id),
        FOREIGN KEY (parent_id) REFERENCES knowledge_nodes (id)
      )`);

      db.all('PRAGMA table_info(knowledge_nodes)', (schemaError, columns) => {
        if (schemaError) return rejectDbReady(schemaError);

        const migrations = [
          ['children_generated', 'BOOLEAN DEFAULT 0'],
          ['note_structure_key', 'TEXT'],
          ['note_sources', 'TEXT'],
        ].filter(([name]) => !columns.some(column => column.name === name));
        const migrate = () => {
          const next = migrations.shift();
          if (!next) return resolveDbReady();
          db.run('ALTER TABLE knowledge_nodes ADD COLUMN ' + next.join(' '), error => {
            if (error) return rejectDbReady(error);
            migrate();
          });
        };
        migrate();
      });
    }
  }
);

dbReady.catch(error =>
  console.error('Database initialization failed:', error)
);

const dbGet = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) =>
      error ? reject(error) : resolve(row)
    );
  });

const dbAll = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) =>
      error ? reject(error) : resolve(rows)
    );
  });

const dbRun = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (error) {
      error
        ? reject(error)
        : resolve({ lastID: this.lastID, changes: this.changes });
    });
  });

// 共用单连接时，串行执行事务，避免不同请求交叉写入。
let writeQueue = Promise.resolve();

function withTransaction(operation) {
  const result = writeQueue.then(async () => {
    await dbReady;
    await dbRun('BEGIN IMMEDIATE');

    try {
      const value = await operation();
      await dbRun('COMMIT');
      return value;
    } catch (error) {
      await dbRun('ROLLBACK').catch(rollbackError =>
        console.error('事务回滚失败:', rollbackError)
      );
      throw error;
    }
  });

  writeQueue = result.catch(() => {});
  return result;
}

const expansionsInFlight = new Map();

// 模型输出格式或字段错误时重试一次，调用失败则直接上抛。
async function aiGenerateNodes(prompt, kind) {
  let validationError;

  for (let attempt = 0; attempt < 2; attempt++) {
    let response;

    try {
      response = await client.chat.completions.create({
        model: process.env.ZHIPU_MODEL || 'glm-4.5-flash',
        thinking: { type: 'disabled' },
        messages: [
          {
            role: 'system',
            content:
              '仅返回合法 JSON 对象，不添加外层代码围栏或解释。content 和 description 字符串内部允许 Markdown，必须正确转义。',
          },
          {
            role: 'user',
            content:
              attempt === 0
                ? prompt
                : `${prompt}\n上次输出无效：${validationError.message}。请重新输出完整 JSON。`,
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: kind === 'expand' ? 8192 : 4096,
        temperature: 0.3,
      });
    } catch (error) {
      console.error('AI 调用失败:', error.message);
      const serviceError = new Error('AI 服务暂不可用');
      serviceError.status = 502;
      throw serviceError;
    }

    try {
      const choice = response.choices?.[0];

      if (choice?.finish_reason && choice.finish_reason !== 'stop') {
        throw new OutputValidationError('AI 输出被截断或未正常结束');
      }

      return parseGeneratedOutput(choice?.message?.content, kind);
    } catch (error) {
      if (!(error instanceof OutputValidationError)) throw error;

      validationError = error;
      console.warn(
        `AI 输出校验失败（第 ${attempt + 1} 次）:`,
        error.message
      );
    }
  }

  throw validationError;
}

// 树、根节点和一级节点作为整体保存，任一插入失败则回滚。
async function saveTree(userId, topic, rootContent, children) {
  return withTransaction(async () => {
    const tree = await dbRun(
      'INSERT INTO knowledge_trees (user_id, root_topic) VALUES (?, ?)',
      [userId, topic]
    );

    const root = await dbRun(
      'INSERT INTO knowledge_nodes (tree_id, label, content, relation_type, children_generated) VALUES (?, ?, ?, ?, 1)',
      [tree.lastID, topic, rootContent, 'core']
    );

    for (const child of children) {
      await dbRun(
        `INSERT INTO knowledge_nodes
         (tree_id, parent_id, label, content, relation_type, importance,
          difficulty, estimated_time, is_boundary, is_core)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tree.lastID,
          root.lastID,
          child.label,
          child.description,
          child.relation,
          child.importance,
          child.difficulty,
          child.estimated_time,
          child.is_boundary ? 1 : 0,
          child.is_core ? 1 : 0,
        ]
      );
    }

    return {
      success: true,
      treeId: tree.lastID,
      rootNode: {
        id: root.lastID,
        label: topic,
        content: rootContent,
      },
      nodes: children,
    };
  });
}

// 创建新知识树
app.post('/api/generate-tree', async (req, res) => {
  const { userPrompt, userId = 1 } = req.body || {};

  if (
    typeof userPrompt !== 'string' ||
    !userPrompt.trim() ||
    userPrompt.length > 500
  ) {
    return res.status(400).json({
      error: 'userPrompt 必须是 1-500 字符的文本',
    });
  }

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: '无效的 userId' });
  }

  try {
    console.log('\n=== /api/generate-tree 请求开始 ===');
    console.log('收到 userPrompt:', userPrompt);

    // 1. 提取主题
    const extractPrompt =
      `用户说：“${userPrompt}” 请从中提取学习主题，仅返回主题名。`;

    const topicResp = await client.chat.completions.create({
      model: process.env.ZHIPU_MODEL || 'glm-4.5-flash',
      thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: extractPrompt }],
      temperature: 0,
    });

    const topic =
      topicResp.choices?.[0]?.message?.content?.trim() || '未知主题';

    console.log('📘 提取到的主题:', topic);

    // 2. 评估难度
    const diffPrompt =
      `请评估主题"${topic}"的难度，仅返回 easy、medium 或 hard。`;

    const diffResp = await client.chat.completions.create({
      model: process.env.ZHIPU_MODEL || 'glm-4.5-flash',
      thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: diffPrompt }],
      temperature: 0,
    });

    const difficulty =
      diffResp.choices?.[0]?.message?.content?.trim() || 'medium';

    console.log('难度评估结果:', difficulty);

    // 笔记在选择节点时独立生成，建树只生成结构。
    const rootContent = '';

    // 4. 生成一级节点
    const outlinePrompt = buildTreePrompt({ topic, maxChildren: MAX_ROOT_CHILDREN });

    const aiRes = await aiGenerateNodes(outlinePrompt, 'tree');

    res.json(
      await saveTree(userId, topic, rootContent, aiRes.children)
    );
  } catch (err) {
    console.error('生成知识树失败:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

function savedChildren(rows) {
  return rows.map(row => ({
    id: row.id,
    label: row.label,
    description: row.content,
    relation: row.relation_type,
    importance: row.importance,
    difficulty: row.difficulty,
    estimated_time: row.estimated_time,
    is_boundary: Boolean(row.is_boundary),
    is_core: Boolean(row.is_core),
  }));
}

// 入库前再次检查节点归属和已有子节点，覆盖并发请求。
async function saveExpansion(nodeId, treeId, aiResponse) {
  const { children } = aiResponse;

  return withTransaction(async () => {
    const node = await dbGet(
      'SELECT * FROM knowledge_nodes WHERE id = ? AND tree_id = ?',
      [nodeId, treeId]
    );

    if (!node) throw new Error('节点不存在或不属于该知识树');

    const existing = await dbAll(
      'SELECT * FROM knowledge_nodes WHERE parent_id = ? AND tree_id = ? ORDER BY id',
      [nodeId, treeId]
    );

    if (node.children_generated || existing.length > 0) {
      return {
        success: true,
        alreadyExpanded: true,
        content: node.content,
        children: savedChildren(existing),
      };
    }


    const saved = [];

    for (const child of children) {
      const result = await dbRun(
        `INSERT INTO knowledge_nodes
         (tree_id, parent_id, label, content, relation_type, importance,
          difficulty, estimated_time, is_boundary, is_core)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          treeId,
          nodeId,
          child.label,
          child.description,
          child.relation,
          child.importance,
          child.difficulty,
          child.estimated_time,
          child.is_boundary ? 1 : 0,
          child.is_core ? 1 : 0,
        ]
      );

      saved.push({ id: result.lastID, ...child });
    }

    await dbRun(
      'UPDATE knowledge_nodes SET children_generated = 1 WHERE id = ? AND tree_id = ?',
      [nodeId, treeId]
    );

    return { success: true, content: node.content, children: saved };
  });
}

// 从数据库取得语境，供结构规划与笔记写作分别使用。
async function getNodeContext(node) {
  const tree = await dbGet('SELECT root_topic FROM knowledge_trees WHERE id = ?', [node.tree_id]);
  const ancestors = await dbAll(
    `WITH RECURSIVE chain(id, parent_id, label, depth) AS (
      SELECT id, parent_id, label, 0 FROM knowledge_nodes WHERE id = ? AND tree_id = ?
      UNION ALL
      SELECT n.id, n.parent_id, n.label, c.depth + 1 FROM knowledge_nodes n
      JOIN chain c ON n.id = c.parent_id WHERE n.tree_id = ? AND c.depth < 50
    ) SELECT label FROM chain WHERE depth > 0 ORDER BY depth DESC`,
    [node.id, node.tree_id, node.tree_id]
  );
  const siblings = node.parent_id ? await dbAll(
    'SELECT label FROM knowledge_nodes WHERE tree_id = ? AND parent_id = ? AND id != ? ORDER BY id',
    [node.tree_id, node.parent_id, node.id]
  ) : [];
  return { topic: tree?.root_topic || node.label, ancestors: ancestors.map(row => row.label), siblings: siblings.map(row => row.label) };
}

// 只生成下一层节点，保留当前节点笔记
async function expandNodeOnce(nodeId, treeId) {
  await dbReady;

  const node = await dbGet(
    'SELECT * FROM knowledge_nodes WHERE id = ? AND tree_id = ?',
    [nodeId, treeId]
  );

  if (!node) {
    const error = new Error('节点不存在或不属于该知识树');
    error.status = 404;
    throw error;
  }

  const existingChildren = await dbAll(
    'SELECT * FROM knowledge_nodes WHERE parent_id = ? AND tree_id = ? ORDER BY id',
    [nodeId, treeId]
  );

  if (node.children_generated || existingChildren.length > 0) {
    return {
      success: true,
      alreadyExpanded: true,
      content: node.content,
      children: savedChildren(existingChildren),
    };
  }

  // 标签从数据库读取，不使用客户端传来的 nodeLabel。
  const nodeLabel = node.label;
  console.log(`\n=== /api/expand-node (${nodeLabel}) ===`);

  try {
    const prompt = buildExpandPrompt({
      ...await getNodeContext(node),
      nodeLabel,
      maxChildren: MAX_EXPAND_CHILDREN,
    });

    const aiResponse = await aiGenerateNodes(prompt, 'expand');
    return await saveExpansion(nodeId, treeId, aiResponse);
  } catch (err) {
    console.error('expand-node 出错:', err.message);
    throw err;
  }
}

// 笔记和手动展开共用结构规划请求，避免同时生成两套子节点。
function ensureNodeStructure(nodeId, treeId) {
  const key = treeId + ':' + nodeId;
  let operation = expansionsInFlight.get(key);
  if (!operation) {
    operation = expandNodeOnce(nodeId, treeId).finally(() => expansionsInFlight.delete(key));
    expansionsInFlight.set(key, operation);
  }
  return operation;
}

// content 初始是摘要，生成笔记后从核心定义提取简短语境。
function nodeSummary(content) {
  const text = content || '';
  const definition = text.match(/^## 1 核心定义\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m);
  return (definition ? definition[1] : text).trim().slice(0, 600);
}

// 笔记与结构独立保存；并发选择同一节点共用一次生成。
const notesInFlight = new Map();
async function generateNoteOnce(nodeId, treeId) {
  await dbReady;
  const node = await dbGet('SELECT * FROM knowledge_nodes WHERE id = ? AND tree_id = ?', [nodeId, treeId]);
  if (!node) { const error = new Error('节点不存在或不属于该知识树'); error.status = 404; throw error; }
  const structure = await ensureNodeStructure(nodeId, treeId);
  const children = structure.children.map(child => ({ label: child.label, summary: nodeSummary(child.description) }));
  const context = await getNodeContext(node);
  const retrieval = await retrieveMaterials({ ...context, nodeLabel: node.label, children });
  const sources = retrieval.sources;
  const structureKey = JSON.stringify({ version: 2, children: children.map(child => child.label), materials: retrieval.version });
  console.log('笔记检索: ' + node.label + '，命中 ' + sources.length + ' 个课件片段');
  if (node.note_structure_key === structureKey) {
    try { return { success: true, content: validateNote(node.content), sources: JSON.parse(node.note_sources || '[]'), cached: true }; } catch {}
  }
  const parent = node.parent_id ? await dbGet(
    'SELECT label, content FROM knowledge_nodes WHERE id = ? AND tree_id = ?', [node.parent_id, treeId]
  ) : null;
  const prompt = buildNotePrompt({
    nodeLabel: node.label, ...context,
    currentSummary: nodeSummary(node.content),
    parent: parent ? { label: parent.label, summary: nodeSummary(parent.content) } : null,
    children, sources,
  });
  let validationError;
  for (let attempt = 0; attempt < 2; attempt++) {
    let response;
    try {
      response = await client.chat.completions.create({
        model: process.env.ZHIPU_MODEL || 'glm-4.5-flash', thinking: { type: 'disabled' },
        messages: [{ role: 'user', content: prompt + (validationError ? '\n上次笔记无效：' + validationError.message + '。请重新输出完整 Markdown。' : '') }],
        temperature: 0.3, max_tokens: 8192,
      });
    } catch { const error = new Error('AI 服务暂不可用，请重试'); error.status = 502; throw error; }
    let content;
    try {
      const choice = response.choices?.[0];
      if (choice?.finish_reason !== 'stop') throw new OutputValidationError('笔记输出未正常结束');
      content = validateNote(choice?.message?.content);
      try { content = validateNote(addSourceReferences(content, sources)); }
      catch (error) { throw new OutputValidationError(error.message); }
    } catch (error) {
      if (!(error instanceof OutputValidationError)) throw error;
      validationError = error; continue;
    }
    await withTransaction(async () => {
      const result = await dbRun('UPDATE knowledge_nodes SET content = ?, note_structure_key = ?, note_sources = ? WHERE id = ? AND tree_id = ?', [content, structureKey, JSON.stringify(sources), nodeId, treeId]);
      if (!result.changes) { const error = new Error('节点已删除'); error.status = 404; throw error; }
    });
    return { success: true, content, sources, cached: false };
  }
  throw validationError;
}
app.post('/api/generate-note', async (req, res) => {
  const { nodeId, treeId } = req.body || {};
  if (![nodeId, treeId].every(id => Number.isSafeInteger(id) && id > 0)) return res.status(400).json({ error: '无效的 nodeId 或 treeId' });
  const key = treeId + ':' + nodeId;
  let operation = notesInFlight.get(key);
  if (!operation) {
    operation = generateNoteOnce(nodeId, treeId).finally(() => notesInFlight.delete(key));
    notesInFlight.set(key, operation);
  }
  try { res.json(await operation); } catch (error) { res.status(error.status || 500).json({ error: error.message }); }
});

// 扩展节点接口
app.post('/api/expand-node', async (req, res) => {
  const nodeId = req.body?.nodeId;
  const treeId = req.body?.treeId;

  if (
    !Number.isSafeInteger(nodeId) ||
    nodeId <= 0 ||
    !Number.isSafeInteger(treeId) ||
    treeId <= 0
  ) {
    return res.status(400).json({
      error: '无效的 nodeId 或 treeId',
    });
  }

  const operation = ensureNodeStructure(nodeId, treeId);

  try {
    res.json(await operation);
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
    });
  }
});

// 获取用户的知识树
app.get('/api/my-trees/:userId', (req, res) => {
  const { userId } = req.params;

  db.all(
    `SELECT kt.*,
       (SELECT COUNT(*) FROM knowledge_nodes WHERE tree_id = kt.id) AS node_count
     FROM knowledge_trees kt
     WHERE user_id = ?
     ORDER BY created_at DESC`,
    [userId],
    (err, trees) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ trees });
    }
  );
});

// 获取特定知识树的完整节点结构
app.get('/api/tree/:treeId', (req, res) => {
  const { treeId } = req.params;

  db.all(
    'SELECT * FROM knowledge_nodes WHERE tree_id = ? ORDER BY parent_id IS NULL DESC, id ASC',
    [treeId],
    (err, nodes) => {
      if (err) return res.status(500).json({ error: err.message });

      db.get(
        'SELECT * FROM knowledge_trees WHERE id = ?',
        [treeId],
        (err, tree) => {
          if (err) return res.status(500).json({ error: err.message });

          res.json({
            tree,
            nodes,
            totalNodes: nodes.length,
          });
        }
      );
    }
  );
});

// 删除知识树及其所有节点
app.delete('/api/tree/:treeId', async (req, res) => {
  const treeId = Number(req.params.treeId);

  if (!Number.isSafeInteger(treeId) || treeId <= 0) {
    return res.status(400).json({ error: '无效的 treeId' });
  }

  try {
    const result = await withTransaction(async () => {
      const tree = await dbGet(
        'SELECT id FROM knowledge_trees WHERE id = ?',
        [treeId]
      );

      if (!tree) {
        const error = new Error('知识树不存在');
        error.status = 404;
        throw error;
      }

      const deletedNodes = await dbRun(
        'DELETE FROM knowledge_nodes WHERE tree_id = ?',
        [treeId]
      );

      await dbRun(
        'DELETE FROM knowledge_trees WHERE id = ?',
        [treeId]
      );

      return {
        success: true,
        deletedNodes: deletedNodes.changes,
      };
    });

    res.json(result);
  } catch (error) {
    console.error('删除知识树失败:', error.message);
    res.status(error.status || 500).json({
      error: error.message,
    });
  }
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(
      `🚀 MindGraph Tutor server running at http://localhost:${port}`
    );
  });
}

module.exports = { app, db, dbReady };