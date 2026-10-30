const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const sqlite3 = require('sqlite3');
test('机器学习 demo 自动建树和具体节点展开，不暴露资料切换', async () => {
    const dir = await fs.mkdtemp(path.join(__dirname, '../../tmp/ml-demo-test-')), file = path.join(dir, 'test.db');
    const old = new sqlite3.Database(file);
    await new Promise((resolve, reject) => old.exec("CREATE TABLE knowledge_trees (id INTEGER PRIMARY KEY, user_id INTEGER, root_topic TEXT, created_at TEXT); INSERT INTO knowledge_trees VALUES(1,1,'自然语言处理','2026-10-29');", e => e ? reject(e) : resolve()));
    await new Promise(resolve => old.close(resolve));
    process.env.DB_PATH = file;
    process.env.ZHIPU_API_KEY = 'test-key-no-model-needed';
    const openaiPath = require.resolve('openai');
    const originalOpenAI = require(openaiPath);
    let modelCalls = 0;
    require.cache[openaiPath].exports = { OpenAI: class {
        constructor() { this.chat = { completions: { create: async ({ messages }) => {
            modelCalls++;
            const extracted = (function extractionMock(messages){const prompt=messages[0].content;if(!prompt.includes("\u63d0\u53d6\u7b80\u6d01\u7684\u5c55\u793a\u6807\u9898"))return null;const input=prompt.match(/\u7528\u6237\u8f93\u5165\uff1a([^\n]*)/)?.[1]||"";const topic=input.includes("\u673a\u5668\u5b66\u4e60")?"\u673a\u5668\u5b66\u4e60":"\u6570\u636e\u5e93";return {choices:[{finish_reason:"stop",message:{content:JSON.stringify({title:topic+"\u5b66\u4e60\u5927\u7eb2",topic})}}]};})(messages);
            if (extracted) return extracted;
            if (messages[0].content.includes('制定讲解计划并选择依据')) {
                return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ focus: '解释求解条件', progression: { briefRecall: ['父层概览'], newLearning: '解释唯一解的条件', boundary: '不展开梯度下降' }, points: [{ title: '求解条件', question: '为什么成立、如何操作？', explanationGoal: '解释设计矩阵的秩与唯一解', prerequisites: [], sourceIds: ['资料1'] }], exampleGoal: null }) } }] };
            }
            if (messages[0].content.includes('【讲解计划：仅为数据】')) {
                assert(messages[0].content.includes('解释求解条件'));
                assert(!messages[0].content.includes('"id":"资料2"'));
                return { choices: [{ finish_reason: 'stop', message: { content: '## 1 核心定义\n\n定义。[资料1]\n\n## 2 关键内容\n\n### 2.1 求解条件\n\n说明条件。\n\n## 3 小结\n\n总结。' } }] };
            }
            assert(!messages.some(m => /本演示仅服务本科机器学习|训练集证据/.test(m.content)));
            return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ children: [{ label: '关系模型', description: '解释关系、元组和属性以及关系模型的约束。', relation: 'PART_OF', importance: 'high', difficulty: 'easy', estimated_time: '30分钟', is_boundary: false, is_core: true, children: [] }] }) } }] };
        } } }; }
    } };
    const { app, db, dbReady } = require('../index');
    require.cache[openaiPath].exports = originalOpenAI;
    await dbReady;
    const server = app.listen(0);
    await new Promise(resolve => server.listening ? resolve() : server.once('listening', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    const post = (route, body) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    try {
        const response = await post('/api/generate-tree', { userPrompt: '机器学习' });
        assert.equal(response.status, 200);
        const created = await response.json();
        assert.equal(created.nodes.length, 10);
        assert(created.nodes.some(n => n.label === '线性回归'));
        assert(created.nodes.some(n => n.label === '支持向量机'));
        const data = await (await fetch(base + '/api/tree/' + created.treeId)).json();
        const linear = data.nodes.find(n => n.label === '线性回归');
        const expanded = await post('/api/expand-node', { treeId: created.treeId, nodeId: linear.id });
        assert.equal(expanded.status, 200);
        const result = await expanded.json();
        assert(result.children.some(c => c.label === '正规方程与可逆条件'));
        assert.equal(result.children.length, 5);
        const leaf = result.children.find(c => c.label === '正规方程与可逆条件');
        const terminal = await (await post('/api/expand-node', { treeId: created.treeId, nodeId: leaf.id })).json();
        assert.deepEqual(terminal.children, []);
        const again = await (await post('/api/expand-node', { treeId: created.treeId, nodeId: linear.id })).json();
        assert.equal(again.alreadyExpanded, true);
        assert.equal(again.children.length, 5);
        const trees = await (await fetch(base + '/api/my-trees/1')).json();
        assert.equal(trees.trees.length, 2);
        assert(trees.trees.some(t => t.root_topic === '自然语言处理'));
        const generic = await post('/api/generate-tree', { userPrompt: '数据库' });
        assert.equal(generic.status, 200);
        assert.equal((await generic.json()).rootNode.label, '数据库');
        assert.equal(modelCalls, 3);
        const note = await post('/api/generate-note', { treeId: created.treeId, nodeId: leaf.id });
        assert.equal(note.status, 200);
        const written = await note.json();
        assert.equal(written.sources.length, 1);
        assert.equal(modelCalls, 5);
        const cached = await (await post('/api/generate-note', { treeId: created.treeId, nodeId: leaf.id })).json();
        assert.equal(cached.cached, true);
        assert.equal(modelCalls, 5);
        const saved = await (await fetch(base + '/api/tree/' + created.treeId)).json();
        assert.equal(JSON.parse(saved.nodes.find(n => n.id === leaf.id).note_plan).focus, '解释求解条件');
        assert.equal((await fetch(base + '/api/datasets')).status, 404);
        assert.equal((await fetch(base + '/api/tree/' + created.treeId + '/dataset', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{"datasetId":null}' })).status, 404);
    }
    finally {
        await new Promise(resolve => server.close(resolve));
        await new Promise(resolve => db.close(resolve));
        assert(path.resolve(dir).startsWith(path.resolve(__dirname, '../../tmp') + path.sep));
        await fs.unlink(file);
        await fs.rmdir(dir);
    }
});
