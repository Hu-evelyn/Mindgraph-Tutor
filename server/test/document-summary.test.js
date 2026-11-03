const {test}=require('node:test');
const assert=require('node:assert/strict');
const {generateDocumentSummary}=require('../documentSummary');
const response=(content,finish_reason='stop')=>({choices:[{finish_reason,message:{content}}]});
test('summary accepts plain prose without any JSON or source enumeration',async()=>{
  const text=await generateDocumentSummary('资料',async options=>{
    assert.equal(options.response_format,undefined);
    assert(!options.messages.some(m=>m.content.includes('sourceIds')));
    return response('DMA 在内存与设备间传输数据，中断用于通知传输完成。');
  });
  assert(text.includes('DMA'));
});
test('malformed or truncated summaries retry once then stop',async()=>{
  for(const output of [response('unfinished','length'),response(''),response('{"children":[]}')]){
    let calls=0;
    await assert.rejects(generateDocumentSummary('资料',async()=>{calls++;return output;}),/连续两次/);
    assert.equal(calls,2);
  }
});
test('a second complete summary succeeds, network errors do not cause recursive retries',async()=>{
  let calls=0;
  const result=await generateDocumentSummary('资料',async()=>++calls===1?response('partial','length'):response('矩阵满列秩时可使用正规方程求解回归参数。'));
  assert.equal(calls,2);assert(result.includes('满列秩'));
  calls=0;
  await assert.rejects(generateDocumentSummary('资料',async()=>{calls++;throw Error('offline');}),/模型调用失败/);
  assert.equal(calls,1);
});
