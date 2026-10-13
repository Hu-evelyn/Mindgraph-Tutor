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

const mockAnswer = () => modelMode === 'empty'
  ? { content: 'Expanded without children', children: [] }
  : { content: 'Expanded content', children: [{ label: 'Generated child', description: 'Details' }] };

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

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindgraph-expand-'));
  modelServer = http.createServer((request, response) => {
    modelCalls++;
    request.resume();
    request.on('end', () => {
      const content = modelMode === 'invalid' ? 'not JSON' : JSON.stringify(mockAnswer());
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
  assert.equal(failed.status, 500);
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
