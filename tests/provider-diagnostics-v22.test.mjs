import test from 'node:test';
import assert from 'node:assert/strict';
import {handlePhotoDirections} from '../src/lib/photo-direction-api.ts';
const request=()=>new Request('https://unit.test/api/photos/directions',{method:'POST',body:JSON.stringify({photos:[{id:'fictional-photo',image:'data:image/png;base64,aGVsbG8='}]})});
for(const [status,code] of [[401,'invalid_api_key'],[403,'unsupported_country_region_territory'],[404,'model_not_found'],[429,'insufficient_quota'],[400,'UNTRUSTED_SECRET_VALUE']]){
 test(`Direction provider ${status} is distinct from Site authentication and never leaks credentials`,async()=>{
  let calls=0;const result=await handlePhotoDirections(request(),{apiKey:'TEST_ONLY_SECRET'},async()=>{calls++;return Response.json({error:{code,message:'TEST_ONLY_SECRET',param:'TEST_ONLY_SECRET'}},{status});});
  assert.equal(calls,1);assert.equal(result.status,status===429?429:502);
  const text=await result.text(),body=JSON.parse(text);assert.equal(body.code,'provider_error');assert.equal(body.providerStatus,status);assert.equal(body.providerAttempted,true);assert.equal(body.providerErrorCode,status===400?null:code);assert.doesNotMatch(text,/TEST_ONLY_SECRET|UNTRUSTED_SECRET_VALUE/);
 });
}
test('Non-JSON provider error still exposes only status, without retrying',async()=>{
 let calls=0;const result=await handlePhotoDirections(request(),{apiKey:'TEST_ONLY_SECRET'},async()=>{calls++;return new Response('TEST_ONLY_SECRET',{status:503});});
 assert.equal(calls,1);const text=await result.text();assert.equal(JSON.parse(text).providerStatus,503);assert.doesNotMatch(text,/TEST_ONLY_SECRET/);
});
