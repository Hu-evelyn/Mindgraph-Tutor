const { test } = require('node:test');
const assert = require('node:assert/strict');
const { splitDocument, prepareOutline, rankChunks, asSources, batches } = require('../importedDocuments');
const { addSourceReferences } = require('../rag');
test('preserve headings, PDF pages, original text and oversized paragraph overlap', () => {
  const doc = splitDocument({ fileName: '讲义.pdf', pages: [{ page: 1, text: '# 线性回归\n\n' + '甲'.repeat(2200) }, { page: 2, text: '正规方程的条件\n\n$$\nA^TAw=A^Ty\n$$' }] });
  assert.equal(doc.chunks.at(-1).page, 2);
  assert.deepEqual(doc.chunks.at(-1).headingPath, ['线性回归']);
  assert(doc.chunks.at(-1).text.includes('A^TAw=A^Ty'));
  assert(doc.rawText.includes('甲'.repeat(2200)));
  const long = doc.chunks.filter(c => c.text.startsWith('甲'));
  assert.equal(long[0].text.slice(-160), long[1].text.slice(0,160));
  const sources = asSources(doc, [doc.chunks.at(-1)]);
  assert.match(addSourceReferences('条件。[资料1]', sources), /讲义.pdf.*PDF 第 2 页/);
});
test('linked evidence and file-local supplementary retrieval retain context without cross-file results', () => {
  const doc = splitDocument({fileName:'a.md',text:'# 条件\n\n矩阵的秩。\n\n# 推导\n\n正规方程依据。\n\n# 其他\n\n无关章节。'});
  const linked = rankChunks(doc.chunks,'改名后的节点',[doc.chunks[1].chunkId],2);
  assert(linked.some(c=>c.text.includes('正规方程')));
  assert.equal(rankChunks(doc.chunks,'completelymissing',[],2).length,0);
  assert(rankChunks(doc.chunks,'矩阵',[],2).some(c=>c.text.includes('矩阵')));
  const other = splitDocument({fileName:'a.md',text:'不同的内容'});
  assert.notEqual(asSources(doc,[doc.chunks[0]])[0].chunkId,asSources(other,[other.chunks[0]])[0].chunkId);
});


test('plain-text summaries read the tail and program-owned membership covers every input', async () => {
  const doc=splitDocument({fileName:'long.md',text:Array.from({length:30},(_,i)=>'# 章节'+i+'\n\n'+('内容'+i+' ').repeat(200)).join('\n\n')+'\n\nTAIL_UNIQUE_QUESTION'});
  const prompts=[];
  const outline=await prepareOutline(doc,async prompt=>{
    prompts.push(prompt);
    assert(!prompt.includes('sourceIds'));
    assert(!prompt.includes('输出契约'));
    return prompt.includes('TAIL_UNIQUE_QUESTION') ? '文末的独特知识问题 TAIL_UNIQUE_QUESTION' : '本批主要概念与条件的简明归纳';
  });
  assert(prompts.length>1);
  assert(JSON.stringify(outline.evidence).includes('TAIL_UNIQUE_QUESTION'));
  assert.deepEqual(new Set(outline.sourceIds),new Set(doc.chunks.map(c=>c.chunkId)));
  const levelZero=outline.summaries.filter(s=>s.level===0);
  assert.deepEqual(levelZero.flatMap(s=>s.sourceIds),doc.chunks.map(c=>c.chunkId));
});
test('short files use full original evidence without summary calls',async()=>{
  const doc=splitDocument({fileName:'short.md',text:'# 条件\n\n矩阵应当满列秩。'});
  const outline=await prepareOutline(doc,()=>{throw Error('must not call');});
  assert.equal(outline.summaries.length,0);
  assert(outline.evidence[0].text.includes('满列秩'));
});
test('summary failures stop rather than recursively subdividing input',async()=>{
  const doc=splitDocument({fileName:'error.md',text:'original '.repeat(4000)});
  let calls=0;
  await assert.rejects(prepareOutline(doc,async()=>{calls++;throw Error('service unavailable');}),/service unavailable/);
  assert.equal(calls,1);
});
test('summary planning stops at a fixed call budget',async()=>{
  const doc={chunks:Array.from({length:1000},(_,i)=>({chunkId:'片段'+i,text:'正文'.repeat(900),headingPath:[]}))};
  let calls=0;
  await assert.rejects(prepareOutline(doc,async()=>{calls++;return '主要概念与条件的简明归纳';}),/资料过长/);
  assert.equal(calls,64);
});
test('unmatched node text does not receive an arbitrary source',()=>{
  const doc=splitDocument({fileName:'a.md',text:'matrix rank condition'});
  assert.deepEqual(rankChunks(doc.chunks,'unrelated quantum',[],6),[]);
});
