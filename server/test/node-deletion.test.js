const { test } = require('node:test');
const assert = require('node:assert/strict');

// 删除只影响指定树中的节点及其后代；根节点删除时知识树也要消失。
test('删除节点递归移除子树，保留兄弟节点，并正确处理根节点', async () => {
  process.env.DB_PATH = ':memory:';
  process.env.ZHIPU_API_KEY = 'test-key';
  const { app, db, dbReady } = require('../index');
  await dbReady;
  const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (error) {
    error ? reject(error) : resolve(this.lastID);
  }));
  const firstTree = await run('INSERT INTO knowledge_trees (user_id, root_topic) VALUES (1, ?)', ['第一棵树']);
  const root = await run('INSERT INTO knowledge_nodes (tree_id, label, children_generated) VALUES (?, ?, 1)', [firstTree, '根节点']);
  const branch = await run('INSERT INTO knowledge_nodes (tree_id, parent_id, label) VALUES (?, ?, ?)', [firstTree, root, '待删除分支']);
  const grandchild = await run('INSERT INTO knowledge_nodes (tree_id, parent_id, label) VALUES (?, ?, ?)', [firstTree, branch, '后代节点']);
  const sibling = await run('INSERT INTO knowledge_nodes (tree_id, parent_id, label) VALUES (?, ?, ?)', [firstTree, root, '保留的兄弟']);
  const secondTree = await run('INSERT INTO knowledge_trees (user_id, root_topic) VALUES (1, ?)', ['第二棵树']);
  const otherRoot = await run('INSERT INTO knowledge_nodes (tree_id, label) VALUES (?, ?)', [secondTree, '另一棵树的根']);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const remove = async (treeId, nodeId) => {
    const response = await fetch(`${base}/tree/${treeId}/node/${nodeId}`, { method: 'DELETE' });
    return { status: response.status, data: await response.json() };
  };
  const nodesOf = async treeId => (await (await fetch(`${base}/tree/${treeId}`)).json());
  try {
    assert.equal((await remove(secondTree, branch)).status, 404);
    assert.equal((await nodesOf(firstTree)).nodes.length, 4);

    const removedBranch = await remove(firstTree, branch);
    assert.equal(removedBranch.status, 200);
    assert.deepEqual(new Set(removedBranch.data.deletedNodeIds), new Set([branch, grandchild]));
    assert.equal(removedBranch.data.deletedNodes, 2);
    assert.equal(removedBranch.data.deletedTree, false);
    const afterBranch = (await nodesOf(firstTree)).nodes;
    assert.deepEqual(new Set(afterBranch.map(node => node.id)), new Set([root, sibling]));
    assert.equal(afterBranch.find(node => node.id === root).children_generated, 1);

    assert.equal((await remove(firstTree, sibling)).status, 200);
    const parentAfterLastChild = (await nodesOf(firstTree)).nodes.find(node => node.id === root);
    assert.equal(parentAfterLastChild.children_generated, 0);
    assert.equal(parentAfterLastChild.note_generation_paused, 1);

    const removedRoot = await remove(firstTree, root);
    assert.equal(removedRoot.status, 200);
    assert.equal(removedRoot.data.deletedTree, true);
    assert.equal((await nodesOf(firstTree)).tree, undefined);
    assert.deepEqual((await nodesOf(secondTree)).nodes.map(node => node.id), [otherRoot]);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => db.close(resolve));
  }
});
