const { test } = require('node:test');
const assert = require('node:assert/strict');

// 使用内存数据库和固定课程规划验证编辑选项，不请求真实模型服务。
test('编辑节点可保留旧子树与笔记，显式重生成只替换旧子树', async () => {
  process.env.DB_PATH = ':memory:';
  process.env.ZHIPU_API_KEY = 'test-key';
  const openaiPath = require.resolve('openai');
  const originalOpenAI = require(openaiPath);
  // 固定模型回答，只验证“是”确实写入新笔记，且不会隐式创建子节点。
  require.cache[openaiPath].exports = { OpenAI: class {
    constructor() {
      this.chat = { completions: { create: async ({ messages }) => ({
        choices: [{ finish_reason: 'stop', message: { content: messages[0].content.includes('制定讲解计划并选择依据')
          ? JSON.stringify({ focus: '解释新概念', progression: { briefRecall: [], newLearning: '认识新概念', boundary: '只解释本节点' },
            points: [{ title: '新概念', question: '是什么？', explanationGoal: '说明定义', prerequisites: [], sourceIds: [] }], exampleGoal: null })
          : '## 1 核心定义\n\n新笔记定义。\n\n## 2 关键内容\n\n### 2.1 新概念\n\n详细解释。\n\n## 3 小结\n\n记住新概念。' } }],
      }) } };
    }
  } };
  const { app, db, dbReady } = require('../index');
  require.cache[openaiPath].exports = originalOpenAI;
  await dbReady;
  const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (error) {
    error ? reject(error) : resolve(this.lastID);
  }));
  const treeId = await run('INSERT INTO knowledge_trees (user_id, root_topic) VALUES (1, ?)', ['机器学习']);
  const rootId = await run('INSERT INTO knowledge_nodes (tree_id, label) VALUES (?, ?)', [treeId, '机器学习']);
  const nodeId = await run('INSERT INTO knowledge_nodes (tree_id, parent_id, label, content) VALUES (?, ?, ?, ?)',
    [treeId, rootId, '旧主题', '保留的手工笔记']);
  const oldChildId = await run('INSERT INTO knowledge_nodes (tree_id, parent_id, label, content) VALUES (?, ?, ?, ?)',
    [treeId, nodeId, '旧子节点', '旧子节点笔记']);
  const oldGrandchildId = await run('INSERT INTO knowledge_nodes (tree_id, parent_id, label) VALUES (?, ?, ?)',
    [treeId, oldChildId, '旧孙节点']);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (path, method, body) => {
    const response = await fetch(base + path, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  };
  try {
    const edited = await request(`/tree/${treeId}/node/${nodeId}`, 'PATCH', { label: '线性回归' });
    assert.equal(edited.status, 200);
    assert.equal(edited.data.node.content, '保留的手工笔记');
    assert.equal(edited.data.node.note_generation_paused, 1);
    const preserved = (await request(`/tree/${treeId}`, 'GET')).data.nodes;
    assert(preserved.some(node => node.id === oldGrandchildId));
    const note = await request('/generate-note', 'POST', { treeId, nodeId });
    assert.equal(note.status, 200);
    assert.equal(note.data.content, '保留的手工笔记');
    assert.equal(note.data.cached, true);

    const regenerated = await request(`/tree/${treeId}/node/${nodeId}/regenerate-children`, 'POST');
    assert.equal(regenerated.status, 200);
    assert(regenerated.data.children.length > 0);
    const nodes = (await request(`/tree/${treeId}`, 'GET')).data.nodes;
    assert(!nodes.some(node => node.id === oldChildId || node.id === oldGrandchildId));
    assert(nodes.filter(node => node.parent_id === nodeId).length > 0);
    assert(nodes.filter(node => node.parent_id === nodeId).every(child =>
      !nodes.some(descendant => descendant.parent_id === child.id)));
    assert.equal(nodes.find(node => node.id === nodeId).content, '保留的手工笔记');
    assert.equal((await request('/generate-note', 'POST', { treeId, nodeId })).data.content, '保留的手工笔记');

    const secondTreeId = await run('INSERT INTO knowledge_trees (user_id, root_topic) VALUES (1, ?)', ['数学']);
    const secondRootId = await run('INSERT INTO knowledge_nodes (tree_id, label) VALUES (?, ?)', [secondTreeId, '数学']);
    const noteNodeId = await run('INSERT INTO knowledge_nodes (tree_id, parent_id, label, content) VALUES (?, ?, ?, ?)',
      [secondTreeId, secondRootId, '旧概念', '需要替换的旧笔记']);
    await request(`/tree/${secondTreeId}/node/${noteNodeId}`, 'PATCH', { label: '新概念' });
    const forced = await request('/generate-note', 'POST', { treeId: secondTreeId, nodeId: noteNodeId, force: true });
    assert.equal(forced.status, 200, JSON.stringify(forced.data));
    assert.match(forced.data.content, /新笔记定义/);
    const afterNote = (await request(`/tree/${secondTreeId}`, 'GET')).data.nodes;
    assert.equal(afterNote.find(node => node.id === noteNodeId).note_generation_paused, 0);
    assert.equal(afterNote.filter(node => node.parent_id === noteNodeId).length, 0);

    // 非课程主题的模型规划失败时，事务尚未开始，旧子树不能丢失。
    const intactChildId = await run('INSERT INTO knowledge_nodes (tree_id, parent_id, label) VALUES (?, ?, ?)',
      [secondTreeId, noteNodeId, '保留的旧子节点']);
    const failed = await request(`/tree/${secondTreeId}/node/${noteNodeId}/regenerate-children`, 'POST');
    assert.equal(failed.status, 502);
    assert((await request(`/tree/${secondTreeId}`, 'GET')).data.nodes.some(node => node.id === intactChildId));
  } finally {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => db.close(resolve));
  }
});
