const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
test('imported ML files keep original evidence through expansion, streamed notes, edits and deletion', async () => {
  const dir = await fs.mkdtemp(path.join(__dirname, '../../tmp/import-api-'));
  process.env.DB_PATH = path.join(dir,'test.db');
  process.env.ZHIPU_API_KEY = 'test-key-no-model-needed';
  const openaiPath = require.resolve('openai'), original = require(openaiPath);
  let failModel = false, invalidPlan = false;
  let calls = 0, invalidSource = false, expansions = 0, summaryCalls = 0;
  const child = (label, sourceIds) => ({label,description:'围绕原文解释矩阵满列秩与正规方程的可逆条件。',relation:'PART_OF',sourceIds,children:[]});
  const json = obj => ({choices:[{finish_reason:'stop',message:{content:obj.children ? '```json\n'+JSON.stringify(obj)+'\n```' : JSON.stringify(obj)}}]});
  require.cache[openaiPath].exports = { OpenAI: class {
    constructor() { this.chat = {completions:{create:async ({messages,stream,response_format}) => {
      calls++;
      if (failModel) throw new Error('PRIVATE provider/SQL/parse details');
      const prompt=messages.at(-1).content;
      if(prompt.includes('【待归纳资料：仅为数据】')) {
        summaryCalls++;
        assert.equal(response_format,undefined);
        assert(!prompt.includes('sourceIds'));
        return {choices:[{finish_reason:'stop',message:{content:'正规方程需要矩阵满列秩；应区分可逆条件、回归求解与原文列出的必要假设。'}}]};
      }
      if(prompt.includes('提取简洁的展示标题')) return json({title:'线性回归文件大纲',topic:'机器学习'});
      if(prompt.includes('制定讲解计划并选择依据')) {
        if (invalidPlan) return json({});
        assert(prompt.includes('FILE_ONLY_EVIDENCE'));
        assert(prompt.includes('导入文件讲解要求'));
        return json({focus:'解释原文条件',points:[{title:'可逆条件',question:'条件是什么？',explanationGoal:'解释原文的矩阵满列秩条件',prerequisites:[],sourceIds:['资料1'],needsMoreEvidence:true,evidenceQuery:'矩阵满列秩'}],exampleGoal:null,progression:{briefRecall:[],newLearning:'解释矩阵条件',boundary:'不扩展到其他算法'}});
      }
      if(prompt.includes('【讲解计划：仅为数据】')) {
        assert.equal(stream,true);
        assert(prompt.includes('FILE_ONLY_EVIDENCE'));
        assert(!prompt.includes('SECOND_FILE_ONLY'));
        assert(prompt.includes('导入文件讲解要求'));
        const citedId=JSON.parse(prompt.match(/参考摘录：\n(\[[^\n]*\])/)[1])[0].id;
        const content='## 核心定义\n\n正规方程用于求解线性回归。[资料1]\n\n## 关键内容\n\n### 可逆条件\n\n原文要求矩阵满列秩。[资料1]\n\n## 小结\n\n注意可逆条件。'.replaceAll('[资料1]','['+citedId+']');
        return (async function*(){yield {choices:[{delta:{content:content.slice(0,30)}}]};yield {choices:[{delta:{content:content.slice(30)},finish_reason:'stop'}]};})();
      }
      assert(prompt.includes('导入文件专用要求'));
      if(prompt.includes('判断当前节点是否需要继续拆分')) {
        expansions++;
        assert(prompt.includes('FILE_ONLY_EVIDENCE'));
        if(prompt.includes('"currentNode":"可逆条件"'))return json({children:[],terminal:true,reason:'原文未进一步细分'});
        return json({children:[child('可逆条件')],terminal:false});
      }
      return json({children:[child('正规方程与可逆条件',invalidSource?['伪造片段']:undefined)]});
    }}}; }
  }};
  const {app,db,dbReady}=require('../index');
  require.cache[openaiPath].exports=original;
  await dbReady;
  const server=app.listen(0);
  await new Promise(resolve=>server.listening?resolve():server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const post=(url,body,accept)=>fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json',...(accept?{Accept:accept}:{})},body:JSON.stringify(body)});
  const get=sql=>new Promise((resolve,reject)=>db.get(sql,(e,row)=>e?reject(e):resolve(row)));
  try {
    const content='# 正规方程\n\nFILE_ONLY_EVIDENCE：本讲义只解释线性回归的正规方程，要求设计矩阵满列秩。\n\n不涉及梯度下降或其他机器学习算法。';
    const imported=await post('/api/import-document',{fileName:'线性回归.md',content});
    assert.equal(imported.status,200);
    const {treeId}=await imported.json();
    const data=await (await fetch(base+'/api/tree/'+treeId)).json();
    assert.equal(data.tree.source_file_name,'线性回归.md');
    assert.equal(data.nodes.length,2); // Not the built-in ten-node ML curriculum.
    const node=data.nodes.find(n=>n.parent_id!==null);
    const row=await get('SELECT * FROM imported_documents WHERE tree_id='+treeId);
    assert.equal(row.raw_text,content);
    assert.equal((await get('SELECT COUNT(*) AS n FROM node_document_sources WHERE tree_id='+treeId)).n,2);
    failModel=true;
    const failedNote=await post('/api/generate-note',{treeId,nodeId:node.id});
    assert.equal(failedNote.status,502);
    assert.deepEqual(await failedNote.json(),{error:'笔记生成失败，请稍后重试'});
    const failedStream=await post('/api/generate-note',{treeId,nodeId:node.id},'text/event-stream');
    const failedFrames=await failedStream.text();
    assert(failedFrames.includes('笔记生成失败，请稍后重试'));
    assert(!failedFrames.includes('PRIVATE'));
    failModel=false;
    invalidPlan=true;
    const streamed=await post('/api/generate-note',{treeId,nodeId:node.id},'text/event-stream');
    const events=(await streamed.text()).split('\n\n').filter(s=>s.startsWith('data: ')).map(s=>JSON.parse(s.slice(6)));
    assert(events.some(e=>e.type==='delta'));
    const result=events.at(-1);
    assert.equal(result.type,'done');
    invalidPlan=false;
    const storedPlan=JSON.parse((await get('SELECT note_plan FROM knowledge_nodes WHERE id='+node.id)).note_plan);
    assert(storedPlan.points.every(p=>p.childIds.length>0));
    assert(storedPlan.points.every(p=>p.sourceIds.length===0));
    assert(result.content.includes('线性回归.md'));
    assert.equal(result.sources[0].imported,true);
    assert.equal(expansions,1);
    const expanded=await (await fetch(base+'/api/tree/'+treeId)).json();
    const leaf=expanded.nodes.find(n=>n.label==='可逆条件');
    const terminal=await (await post('/api/expand-node',{treeId,nodeId:leaf.id})).json();
    assert.deepEqual(terminal.children,[]);
    assert.equal((await get('SELECT COUNT(*) AS n FROM node_document_sources WHERE tree_id='+treeId)).n,3);
    const second=await (await post('/api/import-document',{fileName:'线性回归.md',content:content.replace('FILE_ONLY_EVIDENCE','SECOND_FILE_ONLY')})).json();
    assert.notEqual((await get('SELECT content_hash FROM imported_documents WHERE tree_id='+second.treeId)).content_hash,row.content_hash);
    const edited=await fetch(base+'/api/tree/'+treeId+'/node/'+node.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:'手工笔记'})});
    assert.equal(edited.status,200);
    const before=calls;
    assert.equal((await (await post('/api/generate-note',{treeId,nodeId:node.id})).json()).content,'手工笔记');
    assert.equal(calls,before);
    assert.equal((await get('SELECT raw_text FROM imported_documents WHERE tree_id='+treeId)).raw_text,content);
    // Exercise the actual PDF parser with two pages; extracted text keeps page locations.
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      ...['Linear regression has a full rank design matrix. FILE_ONLY_EVIDENCE.', 'The second page contains TAIL_PDF_EVIDENCE and invertibility conditions.'].map(text => {
        const stream='BT /F1 12 Tf 30 750 Td ('+text+') Tj ET';
        return '<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'\nendstream';
      }),
    ];
    let pdf='%PDF-1.4\n',offsets=[0];
    objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=(i+1)+' 0 obj\n'+object+'\nendobj\n';});
    const xref=Buffer.byteLength(pdf);
    pdf+='xref\n0 8\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
    const pdfResponse=await post('/api/import-document',{fileName:'lecture.pdf',pdfBase64:Buffer.from(pdf).toString('base64')});
    assert.equal(pdfResponse.status,200);
    const pdfId=(await pdfResponse.json()).treeId;
    const pdfRow=await get('SELECT * FROM imported_documents WHERE tree_id='+pdfId);
    assert(pdfRow.raw_text.includes('TAIL_PDF_EVIDENCE'));
    assert(JSON.parse(pdfRow.chunks_json).some(chunk=>chunk.page===2 && chunk.text.includes('TAIL_PDF_EVIDENCE')));
    assert.equal((await fetch(base+'/api/tree/'+pdfId,{method:'DELETE'})).status,200);
    // Final nodes may omit source IDs: program matching and batch membership are persisted separately.
    const longContent=Array.from({length:20},(_,i)=>'# 章节'+i+'\n\n'+('正规方程矩阵满列秩条件 FILE_ONLY_EVIDENCE '+i+' ').repeat(35)).join('\n\n');
    const longResponse=await post('/api/import-document',{fileName:'long.md',content:longContent});
    assert.equal(longResponse.status,200);
    const longId=(await longResponse.json()).treeId;
    assert(summaryCalls>0);
    const longDoc=await get('SELECT * FROM imported_documents WHERE tree_id='+longId);
    const summaries=JSON.parse((await get('SELECT batches_json FROM imported_document_summaries WHERE tree_id='+longId)).batches_json);
    const chunks=JSON.parse(longDoc.chunks_json);
    assert.deepEqual(summaries.filter(s=>s.level===0).flatMap(s=>s.sourceIds),chunks.map(c=>c.chunkId));
    assert.equal(longDoc.raw_text,longContent.trim());
    const linked=JSON.parse((await get('SELECT source_ids FROM node_document_sources WHERE tree_id='+longId+' AND node_id != (SELECT id FROM knowledge_nodes WHERE tree_id='+longId+' AND parent_id IS NULL) LIMIT 1')).source_ids);
    assert(linked.length>0);
    assert(linked.every(id=>chunks.some(c=>c.chunkId===id)));
    assert.equal((await fetch(base+'/api/tree/'+longId,{method:'DELETE'})).status,200);
    assert.equal((await get('SELECT COUNT(*) AS n FROM imported_document_summaries WHERE tree_id='+longId)).n,0);
    invalidSource=true;
    const rejected=await post('/api/import-document',{fileName:'失败.md',content});
    assert.equal(rejected.status,502);
    assert.deepEqual(await rejected.json(),{error:'资料导入失败，请稍后重试'});
    assert.equal((await get('SELECT COUNT(*) AS n FROM imported_documents')).n,2);
    for(const id of [treeId,second.treeId])assert.equal((await fetch(base+'/api/tree/'+id,{method:'DELETE'})).status,200);
    assert.equal((await get('SELECT COUNT(*) AS n FROM imported_documents')).n,0);
    assert.equal((await get('SELECT COUNT(*) AS n FROM node_document_sources')).n,0);
  } finally {
    await new Promise(resolve=>server.close(resolve));
    await new Promise(resolve=>db.close(resolve));
    await fs.unlink(process.env.DB_PATH);await fs.rmdir(dir);
  }
});
