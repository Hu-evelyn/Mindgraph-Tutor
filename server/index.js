require('dotenv').config();//读env文件//require是调用包
const express = require('express');//创建express对象
const cors = require('cors');//创建cors对象
const sqlite3 = require('sqlite3').verbose();
const { OpenAI } = require('openai');

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

let expansionWriteQueue = Promise.resolve();
function serializeExpansionWrite(operation) {
  const result = expansionWriteQueue.then(operation);
  expansionWriteQueue = result.catch(() => {});
  return result;
}
const expansionsInFlight = new Map();


//消毒函数：防止返回不符合json格式的文本
function sanitizeAndParse(rawStr) {
  if (typeof rawStr !== 'string') return null;
  let str = rawStr.trim();

  // 去掉 Markdown 包裹
  str = str
    .replace(/^```json\s*/i, '')
    .replace(/^```/i, '')
    .replace(/```$/i, '')
    .trim();

  // 取第一个 { ... } 块
  const match = str.match(/\{[\s\S]*\}/);
  if (match) str = match[0];

  // 尝试第一次解析（正常 JSON）
  try {
    return JSON.parse(str);
  } catch (e1) {
    // console.warn('⚠️ 初次解析失败，尝试修复非法字符');
  }

  // 修复非法控制字符（0x00–0x1F 中除 \t,\n,\r 外的）
  str = str.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, "");

  // 将实际换行转成 \n，但保留已转义的 \\n
  str = str
    .replace(/\r\n/g, "\\n")
    .replace(/\r/g, "\\n")
    .replace(/([^\\])\n/g, (_, p1) => `${p1}\\n`);

  // 防止多余的反斜杠导致双转义
  str = str.replace(/\\\\n/g, "\\n").replace(/\\\\t/g, "\\t");

  // 去除 BOM 或意外字符
  str = str.replace(/^\uFEFF/, "").trim();

  // 再次尝试解析
  try {
    return JSON.parse(str);
  } catch (e2) {
    console.error("❌ JSON 仍无法解析:", e2.message);
    console.error("Input (first 300 chars):", str.slice(0, 300));
    return null;
  }
}


// 通用函数：调用AI生成内容 
async function aiGenerateNodes(prompt, opts = {}) {
  try {
    const response = await client.chat.completions.create({
      model: opts.model || "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.6,
    });

    const raw = response.choices?.[0]?.message?.content;
    if (!raw) throw new Error('模型返回空内容');

    console.log('🤖 AI 原始返回（前 800 字）:\n', raw.slice(0, 800));
    const parsed = sanitizeAndParse(raw);
    if (!parsed || !parsed.children) {
  // 如果 AI 返回的不是纯 JSON 或带多余文本，尝试第二次解析
  const cleaned = raw.replace(/^[^{]*?(\{[\s\S]*\})[^}]*$/m, '$1');
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error('AI 返回无法解析');
  }
}

    return parsed;
  } catch (err) {
    console.error('AI 调用失败:', err.message);
    if (err.message === 'AI 返回无法解析' || err.message === '模型返回空内容') throw err;
    throw new Error('AI 服务暂不可用');
  }
}

// API路由：创建新知识树
app.post('/api/generate-tree', async (req, res) => {
  const { userPrompt, userId = 1 } = req.body;
  if (!userPrompt) return res.status(400).json({ error: "缺少 userPrompt 字段" });

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

    // 4. 生成子节点
    // const nodeCount = difficulty === "easy" ?  3: 2;
    const outlinePrompt = `
    先判断主题"${topic}"可以被拆成几个子部分，
再将这些子部分作为主题"${topic}"的一级知识点，每个子部分按以下格式生成
⚠️ 严格要求：
1. 只返回一个标准 JSON 对象，禁止输出 Markdown（如 \`\`\`json）、解释或实际换行。
2. 若内容需要换行，请在字符串中使用两个字符 "\\n" 表示换行，而不是实际换行。

{
  "core_concept": "${topic}",
  "description": "## ${topic}总览\\n简要解释...",
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

    const aiRes = await aiGenerateNodes(outlinePrompt);
    const firstLevelNodes = aiRes?.children || [];

    // 5. 存入数据库
    db.run('INSERT INTO knowledge_trees (user_id, root_topic) VALUES (?, ?)', [userId, topic], async function (err) {
      if (err) return res.status(500).json({ error: err.message });
      const treeId = this.lastID;

      // 根节点
      const rootNodeId = await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO knowledge_nodes (tree_id, label, content, relation_type) VALUES (?, ?, ?, ?)',
          [treeId, topic, rootContent, "core"],
          function (err) { err ? reject(err) : resolve(this.lastID); }
        );
      });

      // 子节点插入
      for (const node of firstLevelNodes) {
        await new Promise((resolve, reject) => {
          db.run(
            `INSERT INTO knowledge_nodes 
            (tree_id, parent_id, label, content, relation_type, importance, difficulty, estimated_time, is_boundary, is_core)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              treeId,
              rootNodeId,
              node.label || node.name || "未命名",
              node.description || "",
              node.relation || "PART_OF",
              node.importance || "medium",
              node.difficulty || "medium",
              node.estimated_time || "30分钟",
              node.is_boundary ? 1 : 0,
              node.is_core ? 1 : 0
            ],
            function (err) {
              if (err) {
                console.error("插入子节点出错:", err.message, node);
                reject(err);
              } else {
                console.log("✅ 插入子节点:", node.label || node.name);
                resolve();
              }
            }
          );
        });
      }

      res.json({
        success: true,
        treeId,
        rootNode: { id: rootNodeId, label: topic, content: rootContent },
        nodes: firstLevelNodes,
      });
    });
  } catch (err) {
    console.error("生成知识树失败:", err.message);
    res.status(500).json({ error: err.message });
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

async function saveExpansion(nodeId, treeId, aiResponse) {
  const { content, children } = aiResponse || {};
  if (typeof content !== 'string' || !Array.isArray(children) ||
      children.some(child => !child || typeof child.label !== 'string' || !child.label.trim())) {
    throw new Error('AI 返回格式错误');
  }

  return serializeExpansionWrite(async () => {
    await dbRun('BEGIN IMMEDIATE');
    try {
      const node = await dbGet('SELECT * FROM knowledge_nodes WHERE id = ? AND tree_id = ?', [nodeId, treeId]);
      if (!node) throw new Error('节点不存在或不属于该知识树');
      const existing = await dbAll(
        'SELECT * FROM knowledge_nodes WHERE parent_id = ? AND tree_id = ? ORDER BY id',
        [nodeId, treeId]
      );
      if (node.children_generated || existing.length > 0) {
        await dbRun('COMMIT');
        return { success: true, alreadyExpanded: true, content: node.content, children: savedChildren(existing) };
      }

      await dbRun('UPDATE knowledge_nodes SET content = ? WHERE id = ? AND tree_id = ?', [content, nodeId, treeId]);
      const saved = [];
      for (const child of children) {
        const result = await dbRun(
          `INSERT INTO knowledge_nodes
           (tree_id, parent_id, label, content, relation_type, importance, difficulty, estimated_time, is_boundary, is_core)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [treeId, nodeId, child.label, child.description || '', child.relation || 'RELATED',
            child.importance || 'medium', child.difficulty || 'medium', child.estimated_time || '30分钟',
            child.is_boundary ? 1 : 0, child.is_core ? 1 : 0]
        );
        saved.push({ id: result.lastID, ...child });
      }
      await dbRun('UPDATE knowledge_nodes SET children_generated = 1 WHERE id = ? AND tree_id = ?', [nodeId, treeId]);
      await dbRun('COMMIT');
      return { success: true, content, children: saved };
    } catch (error) {
      await dbRun('ROLLBACK').catch(rollbackError => console.error('回滚扩展失败:', rollbackError));
      throw error;
    }
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
  const nodeLabel = node.label;
  console.log(`\n=== /api/expand-node (${nodeLabel}) ===`);

  try {
    const prompt = `
    先判断父节点"${nodeLabel}"可以被拆成几个子节点，
再将这些子节点作为父节点"${nodeLabel}"的一级知识点，每个子节点按以下格式生成
⚠️ 严格要求：
1. **禁止输出 Markdown（如 \`\`\`json）或额外文字说明**。
2. **禁止实际换行**，如需换行请使用两个字符 "\\n"。
3. **所有字符串值必须用双引号包裹**，确保是标准 JSON。

返回的格式必须严格如下（不要添加任何注释或额外字段）：

{
  "content": "## ${nodeLabel}详解\\n通俗介绍 + **定义** + 公式 + 小例子",
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
仅返回这个 JSON 对象本身。`;

    const aiResponse = await aiGenerateNodes(prompt);
    return await saveExpansion(nodeId, treeId, aiResponse);
  } catch (err) {
    console.error("expand-node 出错:", err.message);
    throw err;
  }
}

app.post('/api/expand-node', async (req, res) => {
  const nodeId = Number(req.body?.nodeId);
  const treeId = Number(req.body?.treeId);
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
app.delete('/api/tree/:treeId', (req, res) => {
  const { treeId } = req.params;
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    db.run('DELETE FROM knowledge_nodes WHERE tree_id = ?', [treeId]);
    db.run('DELETE FROM knowledge_trees WHERE id = ?', [treeId]);
    db.run('COMMIT', (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    });
  });
});


if (require.main === module) {
  app.listen(port, () => {
    console.log(`🚀 MindGraph Tutor server running at http://localhost:${port}`);
  });
}

module.exports = { app, db, dbReady };
