const { test } = require('node:test');
const assert = require('node:assert/strict');

test('笔记摘要读取真实节点、缓存同版笔记并在编辑后更新', async () => {
  process.env.DB_PATH = ':memory:';
  process.env.ZHIPU_API_KEY = 'test-key';
  const requests = [];
  const openaiPath = require.resolve('openai');
  const originalOpenAI = require(openaiPath);
  // 固定模型回复，验证摘要接口行为时不会访问真实模型或用户数据库。
  require.cache[openaiPath].exports = { OpenAI: class {
    constructor() {
      this.chat = { completions: { create: async request => {
        requests.push(request);
        const note = request.messages[1].content;
        return { choices: [{ finish_reason: 'stop', message: { content: note.includes('NOTE_B') ? '新版笔记摘要。' : '旧版笔记摘要。' } }] };
      } } };
    }
  } };
  let api;
  let db;
  try {
    const loaded = require('../index');
    require.cache[openaiPath].exports = originalOpenAI;
    db = loaded.db;
    await loaded.dbReady;
    const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (error) {
      error ? reject(error) : resolve(this.lastID);
    }));
    const treeId = await run('INSERT INTO knowledge_trees (user_id, root_topic) VALUES (1, ?)', ['测试知识树']);
    const nodeId = await run('INSERT INTO knowledge_nodes (tree_id, label, content) VALUES (?, ?, ?)', [treeId, '测试节点', 'NOTE_A：旧笔记。']);
    const emptyId = await run('INSERT INTO knowledge_nodes (tree_id, label, content) VALUES (?, ?, ?)', [treeId, '空节点', '']);
    api = loaded.app.listen(0, '127.0.0.1');
    await new Promise(resolve => api.once('listening', resolve));
    const ask = async (id, body = {}) => {
      const response = await fetch(`http://127.0.0.1:${api.address().port}/api/tree/${treeId}/node/${id}/summary`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      return { status: response.status, data: await response.json() };
    };

    const first = await ask(nodeId, { content: '伪造的客户端笔记' });
    assert.equal(first.status, 200);
    assert.equal(first.data.summary, '旧版笔记摘要。');
    assert.equal(first.data.cached, false);
    assert.match(requests[0].messages[1].content, /NOTE_A/);
    assert.doesNotMatch(requests[0].messages[1].content, /伪造的客户端笔记/);
    const cached = await ask(nodeId);
    assert.equal(cached.data.cached, true);
    assert.equal(requests.length, 1);

    const edited = await fetch(`http://127.0.0.1:${api.address().port}/api/tree/${treeId}/node/${nodeId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'NOTE_B：新版笔记。' }),
    });
    assert.equal(edited.status, 200);
    const refreshed = await ask(nodeId);
    assert.equal(refreshed.data.summary, '新版笔记摘要。');
    assert.equal(requests.length, 2);
    assert.deepEqual((await ask(emptyId)).data, { summary: '', cached: true });
    assert.equal((await ask(999999)).status, 404);
    assert.equal(requests.length, 2);
  } finally {
    require.cache[openaiPath].exports = originalOpenAI;
    if (api) await new Promise(resolve => api.close(resolve));
    if (db) await new Promise(resolve => db.close(resolve));
  }
});
