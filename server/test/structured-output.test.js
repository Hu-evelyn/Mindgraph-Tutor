const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseModelJson, parseGeneratedOutput } = require('../structuredOutput');
const child = { label:'正规方程', description:'矩阵条件', relation:'PART_OF' };
test('valid JSON and a single outer code block preserve fields exactly', () => {
  const value = { children:[{...child,description:'公式 \\theta，"条件"\n下一行',sourceIds:['片段1']}] };
  assert.deepEqual(parseModelJson(JSON.stringify(value)),value);
  assert.deepEqual(parseModelJson('\n```json\n'+JSON.stringify(value)+'\n```\n'),value);
});
test('malformed JSON is rejected without guessing content or delimiters', () => {
  for(const raw of ['{"children":[', '{"description":"say "hello""}', '{"children":[]}]}', '{"children":[],}', '{"description":"bad\\q"}', '{"description":"literal\nnewline"}', '{"children":[]} {"more":true}', '说明：{"children":[]}']) {
    assert.throws(()=>parseModelJson(raw));
  }
});
test('node contracts remain validated independently of JSON parsing',()=>{
  assert.throws(()=>parseGeneratedOutput('{"children":[]}','tree'),/至少需要/);
  assert.throws(()=>parseGeneratedOutput(JSON.stringify({children:[{...child,relation:'FAKE'}]}),'tree'),/取值无效/);
  assert.equal(parseGeneratedOutput(JSON.stringify({children:[child]}),'tree').children[0].label,child.label);
});
test('parse diagnostics stay structured and omit response text from the error message',()=>{
  assert.throws(()=>parseModelJson('{"children":[SECRET'),error=>{
    assert.equal(error.code,'MODEL_JSON_INVALID');
    assert.equal(typeof error.parseDetails.length,'number');
    assert(!error.message.includes('SECRET'));
    return true;
  });
});
test('backend diagnostics preserve response without saving credentials',async()=>{
  const fs=require('node:fs/promises'),path=require('node:path');
  const {saveOutputDiagnostic}=require('../outputDiagnostics');
  const dir=await fs.mkdtemp(path.join(__dirname,'../../tmp/output-diagnostic-test-'));
  const file=await saveOutputDiagnostic({stage:'document-tree',attempt:2,response:{model:'test',choices:[{finish_reason:'stop',message:{content:'invalid original'}}],apiKey:'NEVER_STORE'},error:{code:'MODEL_JSON_INVALID',message:'invalid'},sourceCount:3},dir);
  const text=await fs.readFile(file,'utf8');
  assert.equal(JSON.parse(text).rawContent,'invalid original');
  assert(!text.includes('NEVER_STORE'));
  await fs.unlink(file);await fs.rmdir(dir);
});
