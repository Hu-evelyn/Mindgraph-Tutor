const { test } = require('node:test');
const assert = require('node:assert/strict');
const { markdownSections, chunkSections, expandQuery, addSourceReferences, cosine, retrieveMaterials } = require('../rag');
const doc = { id: 'fixture', title: '测试教材', chapter: '回归', file: 'sample.md', version: '1', language: 'zh', url: 'https://example.org/book' };
test('公式和代码里的标题不会破坏章节，标题路径保留', () => {
    const math = '$$\na = b\n\n+ c\n$$';
    const sections = markdownSections('# 回归\n\n定义。\n\n## 损失\n\n' + math + '\n\n' + String.fromCharCode(96).repeat(3) + 'python\n# code heading\nprint(1)\n' + String.fromCharCode(96).repeat(3), doc);
    assert.equal(sections.length, 2);
    assert.deepEqual(sections[1].headingPath, ['测试教材', '回归', '损失']);
    assert(sections[1].blocks.includes(math));
    assert.equal(chunkSections(sections, doc).parents.length, 2);
});
test('跨语言别名且短缩写不误匹配普通英文', () => { assert.match(expandQuery('主成分分析'), /principal component analysis/); assert.match(expandQuery('SVM'), /支持向量机/); assert(!expandQuery('misguided').includes('stochastic')); });
test('引用拒绝伪造编号，并展示真实章节与 PDF 页码', () => {
    assert.throws(() => addSourceReferences('结论[资料2]', [{ id: '资料1' }]), /未提供/);
    const output = addSourceReferences('结论[资料1]', [{ id: '资料1', title: 'Book', edition: '2020', headingPath: ['Book', '9 Regression'], page: 20, pageEnd: 21, url: 'https://example.org' }]);
    assert.match(output, /9 Regression/);
    assert.match(output, /20–21/);
});
test('默认使用机器学习资料，仅显式 none 用于无 RAG 对照', async () => {
 const result = await retrieveMaterials({nodeLabel:'线性回归'});
 assert(result.sources.length > 0);
 assert.deepEqual((await retrieveMaterials({nodeLabel:'线性回归',mode:'none'})).sources,[]);
 await assert.rejects(retrieveMaterials({datasetId:'nlp'}), /仅提供机器学习/);
 await assert.rejects(retrieveMaterials({datasetId:'../escape'}), /无效/);
});
test('余弦距离计算和维度检查', () => { assert.equal(cosine([1, 0], [1, 0]), 1); assert.equal(cosine([1, 0], [0, 1]), 0); assert.throws(() => cosine([1], [1, 2]), /维度/); });
test('真实机器学习索引：中文检索英文 PCA、资料去重、无关查询不命中', async () => {
    const result = await retrieveMaterials({ datasetId: 'machine-learning', nodeLabel: '主成分分析' });
    assert(result.sources.some(s => s.documentId === 'mml' && /10\./.test(s.headingPath.join(' '))));
    assert.equal(new Set(result.sources.map(s => s.sectionId)).size, result.sources.length);
    assert(result.sources.every(s => s.pageEnd === null || s.pageEnd >= s.page));
    assert.equal((await retrieveMaterials({ datasetId: 'machine-learning', nodeLabel: '秦始皇统一六国' })).sources.length, 0);
});

test('有资料但无引用必须说明覆盖不足，避免静默回退', () => {
 assert.throws(() => addSourceReferences('完整笔记但未引用', [{id:'资料1'}]), /正文没有引用/);
 assert.equal(addSourceReferences('资料不足：缺少对应推导。', [{id:'资料1'}]), '资料不足：缺少对应推导。');
 assert.equal(addSourceReferences('无资料对照', []), '无资料对照');
});

test('同页引用合并并连续编号，仅展示书名小节页码', () => {
 const sources = [
  { id: '资料1', title: '中文教材', edition: '长版本哈希', headingPath: ['中文教材', '验证集'], url: 'https://example.org/model.html' },
  { id: '资料3', title: 'MML', heading: '8.6 Model Selection', page: 290, printedPage: '284', sourceUrl: 'https://example.org/book.pdf', url: 'https://example.org/' },
  { id: '资料5', title: '中文教材', heading: 'K折交叉验证', url: 'https://example.org/model.html' }
 ];
 const output = addSourceReferences('论断[资料5][资料1]。另一论断[资料3]。', sources);
 assert.match(output, /论断\[资料1\]。另一论断\[资料2\]/);
 assert(!output.includes('查看原文'));
 assert(!output.includes('https://')); 
 assert(!output.includes('长版本哈希'));

 assert.match(output, /书内第 284 页/);
 assert.match(output, /验证集/);
 assert.match(output, /K折交叉验证/);
});
