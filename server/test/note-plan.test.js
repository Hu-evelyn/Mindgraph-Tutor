const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseNotePlan, selectPlanSources, generateNotePlan } = require('../notePlan');
const sources = [{ id: '资料1', text: '原文' }, { id: '资料2', text: '旁注' }];
const plan = { focus: '核心问题', points: [{ title: '要点', question: '为什么成立、如何操作？', explanationGoal: '解释机制', prerequisites: [], sourceIds: ['资料1'] }], exampleGoal: null };
test('计划选择保留原始证据并拒绝伪造编号与子节点改写', () => {
 const parsed = parseNotePlan(JSON.stringify(plan), { sources });
 assert.deepEqual(selectPlanSources(parsed, sources), [sources[0]]);
 assert.throws(() => parseNotePlan(JSON.stringify(plan), { sources: [] }), /不存在/);
 assert.throws(() => parseNotePlan(JSON.stringify(plan), { sources, children: [{ label: '原有节点' }] }), /子节点/);
 const generic = { ...plan, points: [{ ...plan.points[0], sourceIds: [] }] };
 assert.deepEqual(selectPlanSources(parseNotePlan(JSON.stringify(generic)), []), []);
});
test('结构无效仅重试一次，网络错误不重试', async () => {
 let calls = 0;
 const client = { chat: { completions: { create: async () => { calls++; return { choices: [{ finish_reason: 'stop', message: { content: calls === 1 ? '{}' : JSON.stringify(plan) } }] }; } } } };
 await generateNotePlan(client, 'prompt', { sources }, 'test');
 assert.equal(calls, 2);
 calls = 0;
 client.chat.completions.create = async () => { calls++; return { choices: [{ finish_reason: 'stop', message: { content: '{}' } }] }; };
 await assert.rejects(generateNotePlan(client, 'prompt', { sources }, 'test'), /无效/);
 assert.equal(calls, 2);
 calls = 0;
 client.chat.completions.create = async () => { calls++; throw new Error('network'); };
 await assert.rejects(generateNotePlan(client, 'prompt', { sources }, 'test'), /network/);
 assert.equal(calls, 1);
});

test('按缺证据要点补检索，保留原文、编号唯一并区分补充候选', async () => {
 const { supplementPlanSources } = require('../notePlan');
 const input = { focus: '问题', points: [
  { title: '已覆盖', question: '为什么成立、如何操作？', explanationGoal: '说明', prerequisites: [], sourceIds: ['资料1'] },
  { title: '缺失', question: '为什么成立、如何操作？', explanationGoal: '解释', prerequisites: [], sourceIds: [], evidenceQuery: '评价指标' },
  { title: '部分覆盖', question: '为什么成立、如何操作？', explanationGoal: '解释', prerequisites: [], sourceIds: ['资料1'], needsMoreEvidence: true }
 ], exampleGoal: null };
 const initial = [{ id: '资料1', chunkId: 'a', text: '原文A' }, { id: '资料5', chunkId: 'unused', text: '未选中' }];
 const queries = [];
 const result = await supplementPlanSources(input, initial, async q => {
   queries.push(q);
   return { sources: [{ id: '资料1', chunkId: 'b', text: '补充原文B' }, { id: '资料2', chunkId: 'a', text: '原文A' }] };
 });
 assert.deepEqual(queries.map(q => q.nodeLabel), ['评价指标', '部分覆盖 为什么成立、如何操作？']);
 assert(queries.every(q => q.children.length === 0 && q.limit === 2));
 assert.deepEqual(result.sources.map(s => s.id), ['资料1', '资料6']);
 assert.equal(result.sources[1].text, '补充原文B');
 assert.deepEqual(result.plan.points[1].supplementalSourceIds, ['资料6', '资料1']);
 assert(!input.points[1].supplementalSourceIds);
 assert(!result.sources.some(s => s.chunkId === 'unused'));
});
test('补检索无结果不制造引用，遵守字符预算和数量限额', async () => {
 const { supplementPlanSources } = require('../notePlan');
 const input = { focus: '问题', points: [{ title: '缺失', question: '为什么成立、如何操作？', explanationGoal: '解释', prerequisites: [], sourceIds: [] }], exampleGoal: null };
 const empty = await supplementPlanSources(input, [], async () => ({ sources: [] }));
 assert.deepEqual(empty.sources, []);
 assert.deepEqual(empty.plan.points[0].supplementalSourceIds, []);
 const capped = await supplementPlanSources(input, [], async () => ({ sources: [{ id: '资料1', text: '过长原文' }] }), { maxChars: 1 });
 assert.deepEqual(capped.sources, []);
});
