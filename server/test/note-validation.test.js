const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateNote, normalizeNote } = require('../noteValidation');
const note = '## 1 核心定义\n\n定义正文。\n\n## 2 关键内容\n\n### 2.1 方法\n\n解释正文。\n\n## 3 小结\n\n总结正文。';
test('修复编号标题层级、标点和空行，结果可重复规范化', () => {
 const raw = '# 1、核心定义\n定义正文。\n## 2. 关键内容\n#### 2.1 方法\n解释正文。\n**3 小结**\n总结正文。';
 const actual = validateNote(raw);
 assert.equal(actual, note);
 assert.equal(normalizeNote(actual), actual);
});
test('代码注释和公式内的井号不作为标题，不改写普通编号列表', () => {
 const block = '\x60\x60\x60python\n# comment\n## not a heading\n\x60\x60\x60\n\n$$\n# symbol\n$$\n\n1. 普通列表';
 const actual = validateNote(note.replace('解释正文。', () => '解释正文。\n\n' + block));
 assert(actual.includes(block));
});
test('编号由程序修复，缺少必要栏目仍然拒绝', () => {
 assert.equal(validateNote(note.replace('2.1 方法', '2.3 方法')), note);
 assert.throws(() => validateNote(note.replace('## 3 小结', '## 3 其他')), /小结/);
 assert.equal(validateNote(note.replace('### 2.1 方法', '### 方法')), note);
});

test('真实失败样式：缺少编号的小结自动补号', () => {
 assert.equal(validateNote(note.replace('## 3 小结', '## 小结')), note);
 assert.equal(validateNote(note.replace('## 1 核心定义', '## 核心定义').replace('## 2 关键内容', '## 关键内容').replace('## 3 小结', '## 小结')), note);
});

test('无编号多层标题统一编号，重复与跳号不再触发重新生成', () => {
 const raw = '## 核心定义\n定义正文。\n## 关键内容\n### 方法\n解释正文。\n#### 条件\n必要条件。\n### 2.9 步骤\n操作正文。\n## 5 小结\n总结正文。';
 const result = validateNote(raw);
 assert(result.includes('#### 2.1.1 条件'));
 assert(result.includes('### 2.2 步骤'));
 assert(result.includes('## 3 小结'));
 assert.equal(normalizeNote(result), result);
});
test('完整 Markdown 外围栏可移除，但必要正文缺失不能被格式修复掩盖', () => {
 const fence = String.fromCharCode(96).repeat(3);
 assert.equal(validateNote(fence + 'markdown\n' + note + '\n' + fence), note);
 assert.throws(() => validateNote(note.replace('解释正文。', '')), /缺少正文/);
});
