const test = require('node:test');
const assert = require('node:assert/strict');

test('节点编辑会持久化并保护手工笔记', async t => {
  // 独立内存数据库与无效模型地址确保测试不改动用户数据，也不会调用付费模型。
  process.env.DB_PATH = ':memory:';
  process.env.ZHIPU_API_KEY = 'test-key';
  process.env.ZHIPU_BASE_URL = 'http://127.0.0.1:1/v4';
  const { app, db, dbReady } = require('./index');
  await dbReady;
  const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (error) {
    error ? reject(error) : resolve(this.lastID);
  }));
  const treeId = await run('INSERT INTO knowledge_trees (user_id, root_topic) VALUES (?, ?)', [1, '高等数学']);
  const rootId = await run('INSERT INTO knowledge_nodes (tree_id, label, content) VALUES (?, ?, ?)', [treeId, '高等数学', '旧笔记']);
  const childId = await run('INSERT INTO knowledge_nodes (tree_id, parent_id, label, content) VALUES (?, ?, ?, ?)',
    [treeId, rootId, '导数', '旧内容']);
  const otherTreeId = await run('INSERT INTO knowledge_trees (user_id, root_topic) VALUES (?, ?)', [1, '物理']);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => db.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const patch = async (tree, node, body) => {
    const response = await fetch(`${base}/tree/${tree}/node/${node}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  };

  // 名称和笔记分别提交：改名不能把已有笔记误标为手工内容。
  const root = await patch(treeId, rootId, { label: '微积分' });
  assert.equal(root.status, 200);
  assert.equal(root.data.rootTopic, '微积分');
  assert.equal(root.data.node.note_is_manual, 0);
  const tree = await (await fetch(`${base}/tree/${treeId}`)).json();
  assert.equal(tree.tree.root_topic, '微积分');
  assert.equal(tree.nodes.find(node => node.id === rootId).content, '旧笔记');

  const noteEdit = await patch(treeId, rootId, { content: '手工根笔记' });
  assert.equal(noteEdit.status, 200);
  assert.equal(noteEdit.data.rootTopic, null);
  assert.equal(noteEdit.data.node.note_is_manual, 1);

  // 重新选中节点时应直接返回手工内容，而不是让自动生成覆盖它。
  const noteResponse = await fetch(`${base}/generate-note`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ treeId, nodeId: rootId }),
  });
  assert.equal(noteResponse.status, 200);
  assert.equal((await noteResponse.json()).content, '手工根笔记');

  assert.equal((await patch(treeId, childId, { label: '极限' })).status, 200);
  assert.equal((await patch(treeId, childId, { content: '手工子节点笔记' })).status, 200);
  assert.equal((await patch(otherTreeId, childId, { label: '错误归属' })).status, 404);
  assert.equal((await patch(treeId, childId, { label: '   ' })).status, 400);
  assert.equal((await patch(treeId, childId, {})).status, 400);
  const updated = await (await fetch(`${base}/tree/${treeId}`)).json();
  assert.equal(updated.nodes.find(node => node.id === childId).label, '极限');
  assert.equal(updated.nodes.find(node => node.id === childId).content, '手工子节点笔记');
});
