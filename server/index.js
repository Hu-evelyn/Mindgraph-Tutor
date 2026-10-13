require('dotenv').config();//读env文件//require是调用包
const express = require('express');//创建express对象
const cors = require('cors');//创建cors对象
const sqlite3 = require('sqlite3').verbose();
const { OpenAI } = require('openai');
const { parseGeneratedOutput, OutputValidationError, MAX_ROOT_CHILDREN, MAX_EXPAND_CHILDREN } = require('./structuredOutput');

const app = express();
const port = process.env.PORT || 3000;

// 初始化 OpenAI 客户端 (配置DeepSeek)
const client = new OpenAI({
  baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
  defaultHeaders: { "X-Failover-Enabled": "true" },
  timeout: 90000,
});

// 中间件
app.use(cors());
app.use(express.json());

// 初始化 SQLite 数据库
let resolveDbReady;
let rejectDbReady;
const dbReady = new Promise((resolve, reject) => {
  resolveDbReady = resolve;
  rejectDbReady = reject;
});
const db = new sqlite3.Database(process.env.DB_PATH || 'database.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
    rejectDbReady(err);
  } else {
    console.log('✅ Connected to SQLite database.');
    // 创建表（如果不存在）
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
      if (columns.some(column => column.name === 'children_generated')) {
        return resolveDbReady();
      }
      db.run('ALTER TABLE knowledge_nodes ADD COLUMN children_generated BOOLEAN DEFAULT 0', migrationError => {
        if (migrationError) return rejectDbReady(migrationError);
        resolveDbReady();
      });
    });
  }
});
dbReady.catch(error => console.error('Database initialization failed:', error));

const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
});
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
});
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (error) {
    error ? reject(error) : resolve({ lastID: this.lastID, changes: this.changes });
  });
});

// sqlite3 共用单连接，串行执行多语句事务，防止不同请求的 SQL 交叉入库。
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
      await dbRun('ROLLBACK').catch(rollbackError => console.error('事务回滚失败:', rollbackError));
      throw error;
    }
  });
  writeQueue = result.catch(() => {});
  return result;
}
const expansionsInFlight = new Map();


// 仅对模型输出格式或字段错误再试一次；调用失败直接上抛。
async function aiGenerateNodes(prompt, kind) {
  let validationError;
  for (let attempt = 0; attempt < 2; attempt++) {
    let response;
    try {
      response = await client.chat.completions.create({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: '仅返回符合用户示例的合法 JSON 对象，不要添加 Markdown 或解释。' },
          { role: 'user', content: attempt === 0 ? prompt : `${prompt}\n上次输出无效：${validationError.message}。请重新输出完整 JSON。` },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 4096,
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
      console.warn(`AI 输出校验失败（第 ${attempt + 1} 次）:`, error.message);
    }
  }
  throw validationError;
}

// 树、根节点和一级节点作为一个整体写入，任一插入失败都回滚。
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
         (tree_id, parent_id, label, content, relation_type, importance, difficulty, estimated_time, is_boundary, is_core)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [tree.lastID, root.lastID, child.label, child.description, child.relation,
          child.importance, child.difficulty, child.estimated_time,
          child.is_boundary ? 1 : 0, child.is_core ? 1 : 0]
      );
    }
    return {
      success: true,
      treeId: tree.lastID,
      rootNode: { id: root.lastID, label: topic, content: rootContent },
      nodes: children,
    };
  });
}

// API路由：创建新知识树
app.post('/api/generate-tree', async (req, res) => {
  const { userPrompt, userId = 1 } = req.body || {};
  if (typeof userPrompt !== 'string' || !userPrompt.trim() || userPrompt.length > 500) {
    return res.status(400).json({ error: 'userPrompt 必须是 1-500 字符的文本' });
  }
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: '无效的 userId' });
  }

  try {
    console.log("\n=== /api/generate-tree 请求开始 ===");
    console.log("收到 userPrompt:", userPrompt);

    // 1. 提取主题
    const extractPrompt = `用户说：“${userPrompt}” 请从中提取学习主题，仅返回主题名。`;
    const topicResp = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [{ role: "user", content: extractPrompt }],
      temperature: 0,
    });
    const topic = topicResp.choices?.[0]?.message?.content?.trim() || "未知主题";
    console.log("📘 提取到的主题:", topic);

    // 2. 评估难度
    const diffPrompt = `请评估主题"${topic}"的难度，仅返回 easy、medium 或 hard。`;
    const diffResp = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [{ role: "user", content: diffPrompt }],
      temperature: 0,
    });
    const difficulty = diffResp.choices?.[0]?.message?.content?.trim() || "medium";
    console.log("难度评估结果:", difficulty);

    // 3. 根节点内容
    const rootPrompt = `为主题"${topic}"写一个详细介绍（50~100字），纯文本返回。`;
    const rootResp = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [{ role: "user", content: rootPrompt }],
      temperature: 0.7,
    });
    const rootContent = rootResp.choices?.[0]?.message?.content?.trim() || "暂无内容";

    // 4. 生成子节点；动态主题以 JSON 字符串写入示例，避免引号或换行破坏格式。
    // const nodeCount = difficulty === "easy" ?  3: 2;
    const outlinePrompt = `
    先判断主题"${topic}"可以被拆成几个子部分，生成 1-${MAX_ROOT_CHILDREN} 个一级节点，
再将这些子部分作为主题"${topic}"的一级知识点，每个子部分按以下格式生成
⚠️ 严格要求：
1. 只返回一个标准 JSON 对象，禁止输出 Markdown（如 \`\`\`json）、解释或实际换行。
2. 若内容需要换行，请在字符串中使用两个字符 "\\n" 表示换行，而不是实际换行。

{
  "core_concept": ${JSON.stringify(topic)},
  "description": ${JSON.stringify('## ' + topic + '总览\n简要解释...')},
  "children": [
    {
      "label": "子主题名称",
      "relation": "PART_OF",
      "description": "### 子主题解释\\n通俗解释 + **定义** + 公式 + 小例子",
      "importance": "high",
      "estimated_time": "30分钟",
      "difficulty": "medium",
      "is_boundary": false,
      "is_core": true,
      "expanded": true,
      "children": []
    }
  ]
}
直接返回 JSON，不要任何额外文字。`;

    const aiRes = await aiGenerateNodes(outlinePrompt, 'tree');
    res.json(await saveTree(userId, topic, rootContent, aiRes.children));
  } catch (err) {
    console.error("生成知识树失败:", err.message);
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

// 模型调用在事务外完成；入库前再次检查归属和已有子节点，覆盖并发请求。
async function saveExpansion(nodeId, treeId, aiResponse) {
  const { content, children } = aiResponse;
  return withTransaction(async () => {
    const node = await dbGet('SELECT * FROM knowledge_nodes WHERE id = ? AND tree_id = ?', [nodeId, treeId]);
    if (!node) throw new Error('节点不存在或不属于该知识树');
    const existing = await dbAll(
      'SELECT * FROM knowledge_nodes WHERE parent_id = ? AND tree_id = ? ORDER BY id',
      [nodeId, treeId]
    );
    if (node.children_generated || existing.length > 0) {
      return { success: true, alreadyExpanded: true, content: node.content, children: savedChildren(existing) };
    }

    await dbRun('UPDATE knowledge_nodes SET content = ? WHERE id = ? AND tree_id = ?', [content, nodeId, treeId]);
    const saved = [];
    for (const child of children) {
      const result = await dbRun(
        `INSERT INTO knowledge_nodes
         (tree_id, parent_id, label, content, relation_type, importance, difficulty, estimated_time, is_boundary, is_core)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [treeId, nodeId, child.label, child.description, child.relation,
          child.importance, child.difficulty, child.estimated_time,
          child.is_boundary ? 1 : 0, child.is_core ? 1 : 0]
      );
      saved.push({ id: result.lastID, ...child });
    }
    await dbRun('UPDATE knowledge_nodes SET children_generated = 1 WHERE id = ? AND tree_id = ?', [nodeId, treeId]);
    return { success: true, content, children: saved };
  });
}

// API路由：扩展节点
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
    return { success: true, alreadyExpanded: true, content: node.content, children: savedChildren(existingChildren) };
  }
  // 提示词只使用数据库中的标签，不信任客户端传来的 nodeLabel。
  const nodeLabel = node.label;
  console.log(`\n=== /api/expand-node (${nodeLabel}) ===`);

  try {
    const prompt = `
    先判断父节点"${nodeLabel}"能否继续拆分，最多生成 ${MAX_EXPAND_CHILDREN} 个子节点，
再将这些子节点作为父节点"${nodeLabel}"的一级知识点，每个子节点按以下格式生成
⚠️ 严格要求：
1. **禁止输出 Markdown（如 \`\`\`json）或额外文字说明**。
2. **禁止实际换行**，如需换行请使用两个字符 "\\n"。
3. **所有字符串值必须用双引号包裹**，确保是标准 JSON。

返回的格式必须严格如下（不要添加任何注释或额外字段）：

{
  "content": ${JSON.stringify('## ' + nodeLabel + '详解\n通俗介绍 + **定义** + 公式 + 小例子')},
  "terminal": false,
  "children": [
    {
      "label": "子主题名称",
      "description": "### 子主题描述\\n同样包含定义、公式、例子",
      "relation": "RELATED",
      "importance": "medium",
      "estimated_time": "30分钟",
      "difficulty": "medium",
      "is_boundary": false,
      "is_core": false,
      "expanded": false,
      "children": []
    }
  ]
}
若确实无法继续拆分，返回 children: []、terminal: true，并提供非空的 reason 字段。
仅返回这个 JSON 对象本身。`;

    const aiResponse = await aiGenerateNodes(prompt, 'expand');
    return await saveExpansion(nodeId, treeId, aiResponse);
  } catch (err) {
    console.error("expand-node 出错:", err.message);
    throw err;
  }
}

app.post('/api/expand-node', async (req, res) => {
  // 严格要求数字 ID，避免隐式类型转换及跨树写入。
  const nodeId = req.body?.nodeId;
  const treeId = req.body?.treeId;
  if (!Number.isSafeInteger(nodeId) || nodeId <= 0 || !Number.isSafeInteger(treeId) || treeId <= 0) {
    return res.status(400).json({ error: '无效的 nodeId 或 treeId' });
  }
  const key = `${treeId}:${nodeId}`;
  let operation = expansionsInFlight.get(key);
  if (!operation) {
    operation = expandNodeOnce(nodeId, treeId).finally(() => expansionsInFlight.delete(key));
    expansionsInFlight.set(key, operation);
  }
  try {
    res.json(await operation);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});


// API路由：获取用户的知识树
app.get('/api/my-trees/:userId', (req, res) => {
  const { userId } = req.params;
  db.all(
    `SELECT kt.*, (SELECT COUNT(*) FROM knowledge_nodes WHERE tree_id = kt.id) AS node_count
     FROM knowledge_trees kt WHERE user_id = ? ORDER BY created_at DESC`,
    [userId],
    (err, trees) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ trees });
    }
  );
});

// API路由：获取特定知识树的完整节点结构
app.get('/api/tree/:treeId', (req, res) => {
  const { treeId } = req.params;
  db.all(
    `SELECT * FROM knowledge_nodes WHERE tree_id = ? ORDER BY parent_id IS NULL DESC, id ASC`,
    [treeId],
    (err, nodes) => {
      if (err) return res.status(500).json({ error: err.message });
      db.get(`SELECT * FROM knowledge_trees WHERE id = ?`, [treeId], (err, tree) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ tree, nodes, totalNodes: nodes.length });
      });
    }
  );
});

// API路由：删除知识树及其所有节点
app.delete('/api/tree/:treeId', async (req, res) => {
  const treeId = Number(req.params.treeId);
  if (!Number.isSafeInteger(treeId) || treeId <= 0) {
    return res.status(400).json({ error: '无效的 treeId' });
  }
  try {
    // 节点和树必须一起删除；第二步失败时恢复已删除的节点。
    const result = await withTransaction(async () => {
      const tree = await dbGet('SELECT id FROM knowledge_trees WHERE id = ?', [treeId]);
      if (!tree) {
        const error = new Error('知识树不存在');
        error.status = 404;
        throw error;
      }
      const deletedNodes = await dbRun('DELETE FROM knowledge_nodes WHERE tree_id = ?', [treeId]);
      await dbRun('DELETE FROM knowledge_trees WHERE id = ?', [treeId]);
      return { success: true, deletedNodes: deletedNodes.changes };
    });
    res.json(result);
  } catch (error) {
    console.error('删除知识树失败:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});


if (require.main === module) {
  app.listen(port, () => {
    console.log(`🚀 MindGraph Tutor server running at http://localhost:${port}`);
  });
}

module.exports = { app, db, dbReady };
