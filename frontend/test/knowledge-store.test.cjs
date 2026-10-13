const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function treeResponse(treeId, nodes) {
  return { tree: { id: treeId, root_topic: `Tree ${treeId}` }, nodes, totalNodes: nodes.length };
}

function node(id, treeId) {
  return { id, tree_id: treeId, parent_id: null, label: `Node ${id}`, content: '' };
}

function createStore(knowledgeApi) {
  // 转译状态模块并注入假 API，测试请求时序而不依赖浏览器或真实后端。
  const source = fs.readFileSync(path.join(__dirname, '../src/stores/useKnowledgeStore.ts'), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let state;
  const create = initializer => {
    const set = update => {
      const next = typeof update === 'function' ? update(state) : update;
      if (next !== state) state = { ...state, ...next };
    };
    const get = () => state;
    state = initializer(set, get);
    return { getState: get };
  };
  const module = { exports: {} };
  const mockedRequire = name => {
    if (name === 'zustand') return { create };
    if (name === '../services/api') return { knowledgeApi };
    throw new Error(`Unexpected import: ${name}`);
  };
  new Function('require', 'module', 'exports', code)(mockedRequire, module, module.exports);
  return module.exports.useKnowledgeStore;
}

test('concurrent loads of the selected tree share one request', async () => {
  const request = deferred();
  let calls = 0;
  const store = createStore({ getTree: () => { calls++; return request.promise; } });
  store.getState().setCurrentTree(1);
  const first = store.getState().loadTree(1);
  const second = store.getState().loadTree(1);
  assert.equal(first, second);
  assert.equal(calls, 1);
  request.resolve(treeResponse(1, [node(11, 1)]));
  await first;
  assert.equal(store.getState().currentTreeNodes[0].id, 11);
});

test('a slow response cannot replace a more recently selected tree', async () => {
  const requests = new Map();
  const store = createStore({
    getTree: treeId => {
      const request = deferred();
      requests.set(treeId, request);
      return request.promise;
    },
  });
  store.getState().setCurrentTree(1);
  const first = store.getState().loadTree(1);
  store.getState().setCurrentTree(2);
  const second = store.getState().loadTree(2);
  requests.get(2).resolve(treeResponse(2, [node(22, 2)]));
  await second;
  requests.get(1).resolve(treeResponse(1, [node(11, 1)]));
  await first;
  assert.equal(store.getState().currentTreeId, 2);
  assert.deepEqual(store.getState().currentTreeNodes.map(item => item.id), [22]);
});

test('reselecting a tree starts a fresh request and ignores the first response', async () => {
  const requests = [];
  const store = createStore({
    getTree: () => {
      const request = deferred();
      requests.push(request);
      return request.promise;
    },
  });
  store.getState().setCurrentTree(1);
  const first = store.getState().loadTree(1);
  store.getState().setCurrentTree(2);
  const second = store.getState().loadTree(2);
  store.getState().setCurrentTree(1);
  const third = store.getState().loadTree(1);
  assert.equal(requests.length, 3);
  requests[2].resolve(treeResponse(1, [node(13, 1)]));
  await third;
  requests[0].resolve(treeResponse(1, [node(11, 1)]));
  requests[1].resolve(treeResponse(2, [node(22, 2)]));
  await Promise.all([first, second]);
  assert.deepEqual(store.getState().currentTreeNodes.map(item => item.id), [13]);
});

test('creating a tree selects it without issuing a second detail request', async () => {
  let detailCalls = 0;
  const store = createStore({
    createTree: async () => ({ treeId: 3 }),
    getUserTrees: async () => ({ trees: [{ id: 3, root_topic: 'New' }] }),
    getTree: async () => { detailCalls++; return treeResponse(3, [node(31, 3)]); },
  });
  await store.getState().createNewTree('New');
  assert.equal(store.getState().currentTreeId, 3);
  assert.equal(detailCalls, 0);
  await store.getState().loadTree(3);
  assert.equal(detailCalls, 1);
});

test('expansion refreshes the selected tree once and keeps new nodes', async () => {
  let detailCalls = 0;
  const store = createStore({
    getTree: async () => {
      detailCalls++;
      return treeResponse(1, detailCalls === 1 ? [node(11, 1)] : [node(11, 1), node(12, 1)]);
    },
    expandNode: async () => ({ success: true }),
  });
  store.getState().setCurrentTree(1);
  await store.getState().loadTree(1);
  await store.getState().expandNode(11, 1);
  assert.equal(detailCalls, 2);
  assert.deepEqual(store.getState().currentTreeNodes.map(item => item.id), [11, 12]);
  assert.equal(store.getState().currentTreeNodes[0].isExpanded, true);
});

test('an expansion finishing after a tree switch cannot change the new tree', async () => {
  const expansion = deferred();
  const calls = [];
  const store = createStore({
    getTree: async treeId => {
      calls.push(treeId);
      return treeResponse(treeId, [node(treeId * 10 + 1, treeId)]);
    },
    expandNode: () => expansion.promise,
  });
  store.getState().setCurrentTree(1);
  await store.getState().loadTree(1);
  const pending = store.getState().expandNode(11, 1);
  store.getState().setCurrentTree(2);
  await store.getState().loadTree(2);
  expansion.resolve({ success: true });
  await pending;
  assert.deepEqual(calls, [1, 2]);
  assert.equal(store.getState().currentFocusNodeId, null);
  assert.deepEqual(store.getState().currentTreeNodes.map(item => item.id), [21]);
});
