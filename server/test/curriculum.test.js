const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planCourseNode, resolveCourseTopic, validateSpecificPlan } = require('../mlCurriculum');
const { parseGeneratedOutput } = require('../structuredOutput');
const { buildExpandPrompt } = require('../notePrompts');
test('课程骨架及所有下一层符合结构约束，叶子不再拆成通用笔记栏目', () => {
    const root = planCourseNode('机器学习');
    parseGeneratedOutput(JSON.stringify(root), 'tree');
    let count = 0;
    for (const top of root.children) {
        const plan = planCourseNode(top.label, ['机器学习']);
        parseGeneratedOutput(JSON.stringify(plan), 'expand');
        validateSpecificPlan(plan, top.label);
        for (const leaf of plan.children) {
            count++;
            const terminal = planCourseNode(leaf.label, ['机器学习', top.label]);
            assert.equal(terminal.terminal, true);
            parseGeneratedOutput(JSON.stringify({ ...terminal, reason: '具体学习问题在笔记中展开' }), 'expand');
        }
    }
    assert(count >= 40);
    assert.equal(planCourseNode('支持向量机', ['机器学习', '线性回归']), null);
});
test('规划器获取教材依据与当前范围，拒绝空泛节点', () => {
    const prompt = buildExpandPrompt({ nodeLabel: '测试知识点', topic: '机器学习', currentSummary: '只讨论训练集', sources: [{ id: '资料1', headingPath: ['教材', '评估'], text: '训练集证据' }], maxChildren: 5 });
    assert.match(prompt, /训练集证据/);
    assert.match(prompt, /只讨论训练集/);
    assert.match(prompt, /具体、可独立学习/);
    assert.throws(() => validateSpecificPlan({ children: [{ label: '基本概念' }] }, '线性回归'), /具体/);
    assert.equal(resolveCourseTopic('自然语言处理'), null);
    assert.equal(resolveCourseTopic('机器学习'), '机器学习');
});
