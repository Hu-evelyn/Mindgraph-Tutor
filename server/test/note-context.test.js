const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildContinuity } = require('../noteContext');
const { parseNotePlan } = require('../notePlan');
const parent = { label: '父主题', content: '## 1 核心定义\n\n整体认识。\n\n## 2 关键内容\n\n### 2.1 当前主题\n\n父层已经解释的分工。\n\n### 2.2 相邻主题\n\n其他范围。' };
test('父层实际覆盖、当前主题摘录及兄弟范围均保留', () => {
 const result = buildContinuity(parent, [{ label: '相邻主题', content: '负责另一种方法' }], '当前主题');
 assert.equal(result.parent.hasNote, true);
 assert.equal(result.parent.currentTopicExcerpt, '父层已经解释的分工。');
 assert(result.parent.coveredSections.some(s => s.title === '相邻主题'));
 assert.equal(result.siblingScopes[0].scope, '负责另一种方法');
 assert.notEqual(result.version, buildContinuity({ ...parent, content: parent.content + '\n新增说明' }, [], '当前主题').version);
});
test('没有父笔记时不假定已有教学，根节点不造父语境', () => {
 assert.equal(buildContinuity({ label: '父主题', content: '结构摘要' }, [], '当前主题').parent.hasNote, false);
 assert.equal(buildContinuity(null, [], '主题').parent, null);
});
test('子节点计划必须明确深化目标、回顾和边界', () => {
 const plan = { focus: '问题', points: [{ title: '机制', question: '为什么成立、如何操作？', explanationGoal: '解释机制', prerequisites: [], sourceIds: [] }], exampleGoal: null };
 assert.throws(() => parseNotePlan(JSON.stringify(plan), { hasParent: true }), /父子衔接/);
 plan.progression = { briefRecall: ['分工'], newLearning: '完成一次操作并解释原因', boundary: '相邻方法仅简要关联' };
 assert.equal(parseNotePlan(JSON.stringify(plan), { hasParent: true }).progression.newLearning, plan.progression.newLearning);
});
