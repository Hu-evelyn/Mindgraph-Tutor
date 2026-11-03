const {test}=require('node:test');
const assert=require('node:assert/strict');
const {UserFacingError,publicFailure}=require('../publicErrors');
const {OutputValidationError}=require('../structuredOutput');
test('internal errors are never passed directly to users, even with an HTTP status',()=>{
  for(const error of [new OutputValidationError('sourceIds parse position 150'),Object.assign(new Error('SQLITE_ERROR /private/db'),{status:500}),Object.assign(new Error('provider credentials'),{status:401})]){
    const result=publicFailure(error,'资料导入失败，请稍后重试');
    assert.equal(result.message,'资料导入失败，请稍后重试');
    assert(!JSON.stringify(result).includes(error.message));
  }
});
test('explicit actionable messages and missing-content hints are preserved',()=>{
  assert.deepEqual(publicFailure(new UserFacingError('资料过长，请按章节拆分后导入')),{status:400,message:'资料过长，请按章节拆分后导入'});
  assert.equal(publicFailure({status:404,message:'SQL details'}).message,'内容不存在，请刷新页面后重试');
  assert.equal(publicFailure({status:413,message:'parser details'}).message,'文件过大，请缩小文件后重试');
});
