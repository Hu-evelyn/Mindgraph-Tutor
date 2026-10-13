const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const sqlite3 = require('sqlite3');

let app;
let appServer;
let modelServer;
let db;
let dbReady;
let baseUrl;
let tempDir;
let modelCalls = 0;
let modelMode = 'valid';
let createMode = 'valid';
const modelRequests = [];

const mockAnswer = () => modelMode === 'empty'
  ? { content: 'Expanded without children', terminal: true, reason: 'No smaller topic', children: [] }
  : { content: 'Expanded content', terminal: false,
      children: [{ label: 'Generated child', description: 'Details', relation: 'RELATED' }] };

const createAnswer = () => ({
  core_concept: 'Test Topic',
  description: 'Overview',
  children: [
    { label: 'Root child 1', description: 'First topic', relation: 'PART_OF' },
    { label: 'Root child 2', description: 'Second topic', relation: 'PART_OF' },
  ],
});

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (error) {
      error ? reject(error) : resolve(this.lastID);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
  });
}

async function newNode() {
  const treeId = await run('INSERT INTO knowledge_trees (user_id, root_topic) VALUES (1, ?)', ['Test']);
  const nodeId = await run(
    'INSERT INTO knowledge_nodes (tree_id, label, content) VALUES (?, ?, ?)',
    [treeId, 'Parent', 'Original content']
  );
  return { treeId, nodeId };
}

async function expand(nodeId, treeId) {
  const response = await fetch(`${baseUrl}/api/expand-node`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodeId, treeId, nodeLabel: 'Untrusted label' }),
  });
  return { status: response.status, body: await response.json() };
}

async function createTree() {
  const response = await fetch(`${baseUrl}/api/generate-tree`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userPrompt: 'Learn test topic', userId: 1 }),
  });
  return { status: response.status, body: await response.json() };
}

async function deleteTree(treeId) {
  const response = await fetch(`${baseUrl}/api/tree/${treeId}`, { method: 'DELETE' });
  return { status: response.status, body: await response.json() };
}

async function count(table) {
  const [row] = await all(`SELECT COUNT(*) AS total FROM ${table}`);
  return row.total;
}

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindgraph-expand-'));
  // 按提示词和模式模拟模型响应，覆盖格式错误、字段错误及有限重试。
  modelServer = http.createServer((request, response) => {
    modelCalls++;
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      const payload = JSON.parse(body);
      modelRequests.push(payload);
      const prompt = payload.messages.find(message => message.role === 'user')?.content || '';
      let content;
      if (prompt.includes('提取学习主题')) content = 'Test Topic';
      else if (prompt.includes('请评估主题')) content = 'medium';
      else if (prompt.includes('写一个详细介绍')) content = 'Root introduction';
      else if (prompt.includes('core_concept')) {
        if (createMode === 'invalid') content = 'not JSON';
        else if (createMode === 'too-many') content = JSON.stringify({
          ...createAnswer(),
          children: Array.from({ length: 7 }, (_, index) => ({
            label: `Root ${index}`, description: 'Details', relation: 'PART_OF',
          })),
        });
        else content = JSON.stringify(createAnswer());
      } else if (modelMode === 'invalid') content = 'not JSON';
      else if (modelMode === 'invalid-once') {
        content = 'not JSON';
        modelMode = 'valid';
      } else if (modelMode === 'missing-children') content = JSON.stringify({ content: 'Details' });
      else if (modelMode === 'empty-unmarked') content = JSON.stringify({ content: 'Details', children: [] });
      else if (modelMode === 'blank-label') content = JSON.stringify({
        ...mockAnswer(), children: [{ label: ' ', description: 'Details', relation: 'RELATED' }],
      });
      else if (modelMode === 'bad-relation') {
        content = JSON.stringify({ ...mockAnswer(), children: [{ label: 'Bad child', description: 'Details', relation: 'UNKNOWN' }] });
      } else if (modelMode === 'too-many') {
        content = JSON.stringify({ ...mockAnswer(), children: Array.from({ length: 6 }, (_, index) => ({
          label: `Child ${index}`, description: 'Details', relation: 'RELATED',
        })) });
      } else content = JSON.stringify(mockAnswer());
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        id: 'mock', object: 'chat.completion',
        choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
      }));
    });
  });
  await new Promise(resolve => modelServer.listen(0, '127.0.0.1', resolve));
  process.env.DEEPSEEK_API_KEY = 'test-key';
  process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${modelServer.address().port}/v1`;
  process.env.DB_PATH = path.join(tempDir, 'test.db');
  const legacyDb = new sqlite3.Database(process.env.DB_PATH);
  await new Promise((resolve, reject) => legacyDb.run(`CREATE TABLE knowledge_nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, tree_id INTEGER, parent_id INTEGER, label TEXT,
    content TEXT, is_learned BOOLEAN DEFAULT 0, relation_type TEXT, importance TEXT,
    difficulty TEXT, estimated_time TEXT, is_boundary BOOLEAN DEFAULT 0,
    is_core BOOLEAN DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, error => error ? reject(error) : resolve()));
  await new Promise((resolve, reject) => legacyDb.close(error => error ? reject(error) : resolve()));
  ({ app, db, dbReady } = require('../index.js'));
  await dbReady;
  appServer = app.listen(0, '127.0.0.1');
  await new Promise(resolve => appServer.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${appServer.address().port}`;
});

test('adds generated flag to an existing database schema', async () => {
  const columns = await all('PRAGMA table_info(knowledge_nodes)');
  assert.ok(columns.some(column => column.name === 'children_generated'));
});

after(async () => {
  if (appServer) await new Promise(resolve => appServer.close(resolve));
  if (db) await new Promise(resolve => db.close(resolve));
  if (modelServer) await new Promise(resolve => modelServer.close(resolve));
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

test('concurrent and repeated expansion inserts children once', async () => {
  modelMode = 'valid';
  const { nodeId, treeId } = await newNode();
  const beforeCalls = modelCalls;
  const [first, second] = await Promise.all([expand(nodeId, treeId), expand(nodeId, treeId)]);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(first.body.children.length, 1);
  assert.equal(second.body.children[0].id, first.body.children[0].id);
  assert.equal(modelCalls, beforeCalls + 1);

  const third = await expand(nodeId, treeId);
  assert.equal(third.status, 200);
  assert.equal(third.body.alreadyExpanded, true);
  assert.equal(modelCalls, beforeCalls + 1);
  const nodes = await all('SELECT * FROM knowledge_nodes WHERE id = ? OR parent_id = ?', [nodeId, nodeId]);
  assert.equal(nodes.length, 2);
  assert.equal(nodes.find(node => node.id === nodeId).children_generated, 1);
});

test('existing children from older data are not generated twice', async () => {
  const { nodeId, treeId } = await newNode();
  const childId = await run(
    'INSERT INTO knowledge_nodes (tree_id, parent_id, label) VALUES (?, ?, ?)',
    [treeId, nodeId, 'Existing child']
  );
  const beforeCalls = modelCalls;
  const result = await expand(nodeId, treeId);
  assert.equal(result.status, 200);
  assert.equal(result.body.alreadyExpanded, true);
  assert.equal(result.body.children[0].id, childId);
  assert.equal(modelCalls, beforeCalls);
});

test('empty result is remembered and does not regenerate', async () => {
  modelMode = 'empty';
  const { nodeId, treeId } = await newNode();
  const beforeCalls = modelCalls;
  const first = await expand(nodeId, treeId);
  const second = await expand(nodeId, treeId);
  assert.equal(first.status, 200);
  assert.equal(first.body.children.length, 0);
  assert.equal(second.body.alreadyExpanded, true);
  assert.equal(modelCalls, beforeCalls + 1);
  modelMode = 'valid';
});

test('invalid model output leaves node retryable', async () => {
  const { nodeId, treeId } = await newNode();
  modelMode = 'invalid';
  const failed = await expand(nodeId, treeId);
  assert.equal(failed.status, 502);
  const [node] = await all('SELECT * FROM knowledge_nodes WHERE id = ?', [nodeId]);
  assert.equal(node.children_generated, 0);
  assert.equal(node.content, 'Original content');
  modelMode = 'valid';
  const retried = await expand(nodeId, treeId);
  assert.equal(retried.status, 200);
  assert.equal(retried.body.children.length, 1);
});

test('rejects a node from another tree before calling the model', async () => {
  const { nodeId } = await newNode();
  const { treeId } = await newNode();
  const beforeCalls = modelCalls;
  const result = await expand(nodeId, treeId);
  assert.equal(result.status, 404);
  assert.equal(modelCalls, beforeCalls);
});

test('failed child insert rolls back content and generated flag', async () => {
  const { nodeId, treeId } = await newNode();
  await run(`CREATE TRIGGER block_child BEFORE INSERT ON knowledge_nodes
    WHEN NEW.parent_id = ${nodeId} BEGIN SELECT RAISE(FAIL, 'blocked'); END`);
  const failed = await expand(nodeId, treeId);
  assert.equal(failed.status, 500);
  const [node] = await all('SELECT * FROM knowledge_nodes WHERE id = ?', [nodeId]);
  assert.equal(node.content, 'Original content');
  assert.equal(node.children_generated, 0);
  assert.equal((await all('SELECT * FROM knowledge_nodes WHERE parent_id = ?', [nodeId])).length, 0);
  await run('DROP TRIGGER block_child');
  assert.equal((await expand(nodeId, treeId)).status, 200);
});

test('structured calls use JSON mode and ignore a forged node label', async () => {
  modelMode = 'valid';
  const { nodeId, treeId } = await newNode();
  const beforeRequests = modelRequests.length;
  assert.equal((await expand(nodeId, treeId)).status, 200);
  const request = modelRequests[beforeRequests];
  assert.deepEqual(request.response_format, { type: 'json_object' });
  assert.equal(request.max_tokens, 4096);
  const prompt = request.messages.find(message => message.role === 'user').content;
  assert.match(prompt, /Parent/);
  assert.doesNotMatch(prompt, /Untrusted label/);
});

test('invalid structure, relation, count and unmarked empty list never write', async t => {
  t.after(() => { modelMode = 'valid'; });
  for (const mode of ['missing-children', 'blank-label', 'bad-relation', 'too-many', 'empty-unmarked']) {
    modelMode = mode;
    const { nodeId, treeId } = await newNode();
    const beforeCalls = modelCalls;
    const result = await expand(nodeId, treeId);
    assert.equal(result.status, 502, mode);
    assert.equal(modelCalls, beforeCalls + 2, mode);
    const [node] = await all('SELECT * FROM knowledge_nodes WHERE id = ?', [nodeId]);
    assert.equal(node.children_generated, 0, mode);
    assert.equal(node.content, 'Original content', mode);
    assert.equal((await all('SELECT * FROM knowledge_nodes WHERE parent_id = ?', [nodeId])).length, 0, mode);
  }
});

test('one invalid JSON response is retried once and then succeeds', async () => {
  modelMode = 'invalid-once';
  const { nodeId, treeId } = await newNode();
  const beforeCalls = modelCalls;
  const result = await expand(nodeId, treeId);
  assert.equal(result.status, 200);
  assert.equal(modelCalls, beforeCalls + 2);
});

test('creating a tree stores root and validated children together', async () => {
  createMode = 'valid';
  const beforeTrees = await count('knowledge_trees');
  const beforeNodes = await count('knowledge_nodes');
  const result = await createTree();
  assert.equal(result.status, 200);
  assert.equal(result.body.nodes.length, 2);
  assert.equal(await count('knowledge_trees'), beforeTrees + 1);
  assert.equal(await count('knowledge_nodes'), beforeNodes + 3);
  const [root] = await all('SELECT * FROM knowledge_nodes WHERE id = ?', [result.body.rootNode.id]);
  assert.equal(root.children_generated, 1);
  const request = modelRequests.findLast(payload => payload.messages.some(message =>
    message.role === 'user' && message.content.includes('core_concept')));
  assert.deepEqual(request.response_format, { type: 'json_object' });
});

test('invalid tree outline fails without creating any rows', async t => {
  t.after(() => { createMode = 'valid'; });
  for (const mode of ['invalid', 'too-many']) {
    createMode = mode;
    const beforeTrees = await count('knowledge_trees');
    const beforeNodes = await count('knowledge_nodes');
    const result = await createTree();
    assert.equal(result.status, 502, mode);
    assert.equal(await count('knowledge_trees'), beforeTrees, mode);
    assert.equal(await count('knowledge_nodes'), beforeNodes, mode);
  }
});

test('failure inserting the second child rolls back the entire new tree', async () => {
  // 在第二个子节点插入时制造数据库错误，确认先前写入也被回滚。
  await run(`CREATE TRIGGER block_second_tree_child BEFORE INSERT ON knowledge_nodes
    WHEN NEW.label = 'Root child 2' BEGIN SELECT RAISE(FAIL, 'blocked'); END`);
  const beforeTrees = await count('knowledge_trees');
  const beforeNodes = await count('knowledge_nodes');
  const result = await createTree();
  assert.equal(result.status, 500);
  assert.equal(await count('knowledge_trees'), beforeTrees);
  assert.equal(await count('knowledge_nodes'), beforeNodes);
  await run('DROP TRIGGER block_second_tree_child');
});

test('failed tree deletion restores its nodes, then can be retried', async () => {
  const created = await createTree();
  assert.equal(created.status, 200);
  const treeId = created.body.treeId;
  // 在删除树本体时制造错误，确认已删节点会随事务恢复。
  await run(`CREATE TRIGGER block_tree_delete BEFORE DELETE ON knowledge_trees
    WHEN OLD.id = ${treeId} BEGIN SELECT RAISE(FAIL, 'blocked'); END`);
  const failed = await deleteTree(treeId);
  assert.equal(failed.status, 500);
  assert.equal((await all('SELECT * FROM knowledge_trees WHERE id = ?', [treeId])).length, 1);
  assert.equal((await all('SELECT * FROM knowledge_nodes WHERE tree_id = ?', [treeId])).length, 3);
  await run('DROP TRIGGER block_tree_delete');

  const deleted = await deleteTree(treeId);
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.deletedNodes, 3);
  assert.equal((await all('SELECT * FROM knowledge_trees WHERE id = ?', [treeId])).length, 0);
  assert.equal((await all('SELECT * FROM knowledge_nodes WHERE tree_id = ?', [treeId])).length, 0);
});

test('invalid IDs and cross-tree expansion are rejected before model calls', async () => {
  const beforeCalls = modelCalls;
  const invalid = await fetch(`${baseUrl}/api/expand-node`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodeId: '1', treeId: 1 }),
  });
  assert.equal(invalid.status, 400);
  assert.equal((await deleteTree('invalid')).status, 400);
  assert.equal(modelCalls, beforeCalls);
});
