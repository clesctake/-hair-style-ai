import test from 'node:test';
import assert from 'node:assert/strict';
import {auditProviderAuthentication} from '../src/lib/provider-auth-audit.ts';
import {fitSupportNextCopy} from '../src/lib/support-text-fit.ts';
import {requireVisionContext,VISION_CONTEXT_ERROR} from '../src/lib/vision-context.ts';
import {boundedVisionFallback} from '../src/lib/photo-analysis-provider.ts';
test('Format-only runtime diagnostics never contact OpenAI or disclose a credential, length, or fingerprint',async()=>{
 for(const [key,flag]of [['sk-proj-…REDACTED','containsRedactionMarkers'],['OPENAI_API_KEY=TEST_ONLY_SECRET','assignmentSyntax'],['***','maskedPlaceholder'],['{"key":"TEST_ONLY_SECRET"}','jsonContainer'],['sk-proj-TEST_ONLY_SECRET','expectedKeyPrefix']]){
  const r=await auditProviderAuthentication(key,()=>{throw Error('provider must not be called');},false);
  assert.equal(r.attempted,false);assert.equal(r.code,'format_only');assert.equal(r.format[flag],true);assert.doesNotMatch(JSON.stringify(r),/TEST_ONLY_SECRET|length|sha256|fingerprint/);
 }
});
test('Failed vision inference falls back only once across a three-photo run and closes both providers',async()=>{
 const result={hairConfidence:null,maskWidth:null,maskHeight:null,faces:[],errors:['HAIR_INFERENCE: unavailable']};let loads=0,closedWorker=0,closedMain=0;
 const worker={execution:'WORKER_CPU',predict:async()=>result,close(){closedWorker++;}};
 const provider=boundedVisionFallback(worker,async()=>{loads++;return {execution:'MAIN_THREAD_CPU',predict:async()=>result,close(){closedMain++;}};});
 for(let i=0;i<3;i++)assert.equal(await provider.predict(new Uint8ClampedArray(4),1,1,true),result);
 assert.equal(loads,1);assert.equal(provider.execution,'MAIN_THREAD_CPU');provider.close();assert.equal(closedWorker,1);assert.equal(closedMain,1);await assert.rejects(provider.predict(new Uint8ClampedArray(4),1,1,true),/中止/);
});
test('A failed fallback initialization never sends subsequent photos to the terminated worker or retries model loading',async()=>{
 let workerCalls=0,loads=0;const worker={execution:'WORKER_CPU',predict:async()=>{workerCalls++;throw Error('worker unavailable');},close(){}};
 const provider=boundedVisionFallback(worker,async()=>{loads++;throw Error(VISION_CONTEXT_ERROR);});
 for(let i=0;i<3;i++)await assert.rejects(provider.predict(new Uint8ClampedArray(4),1,1,true),e=>e.message===VISION_CONTEXT_ERROR);
 assert.equal(workerCalls,1);assert.equal(loads,1);provider.close();
});
test('Missing WebGL2 is an explicit environment failure, never a fabricated analysis or a credential error',()=>{
 assert.throws(()=>requireVisionContext({getContext:()=>null}),e=>e.message===VISION_CONTEXT_ERROR);
 const context={};assert.equal(requireVisionContext({getContext:()=>context}),context);
});
test('Server credential audit returns only format flags; no provider error text or key escapes',async()=>{
 const key=' "TEST_ONLY_SECRET"\n';let calls=0;
 const r=await auditProviderAuthentication(key,async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/models');assert.equal(options.headers.Authorization,'Bearer '+key);return Response.json({error:{code:'invalid_api_key',message:key}},{status:401});});
 assert.equal(calls,1);assert.equal(r.status,401);assert.equal(r.code,'invalid_api_key');assert.equal(r.format.outerWhitespace,true);assert.equal(r.format.lineBreak,true);assert.equal(r.format.quoted,true);assert.doesNotMatch(JSON.stringify(r),/TEST_ONLY_SECRET/);
});
test('Missing key never starts a provider request; models permission failure is not reported as successful auth',async()=>{
 assert.equal((await auditProviderAuthentication(undefined,()=>{throw Error('called');})).attempted,false);
 const r=await auditProviderAuthentication('TEST',async()=>Response.json({error:{code:'insufficient_permissions'}},{status:403}));assert.equal(r.authenticated,false);assert.equal(r.status,403);assert.equal(r.code,'insufficient_permissions');
});
test('Successful model authentication and transport failure are distinct and never retry',async()=>{
 assert.equal((await auditProviderAuthentication('TEST',async()=>Response.json({data:[]}))).authenticated,true);
 let n=0;const r=await auditProviderAuthentication('TEST',async()=>{n++;throw Error('TEST_SECRET');});assert.equal(n,1);assert.equal(r.code,'transport_error');assert.doesNotMatch(JSON.stringify(r),/TEST_SECRET/);
});
function copyFixture(lines){const values={},card={clientHeight:308,offsetTop:128,offsetParent:null},text={offsetTop:267,offsetParent:card,style:{removeProperty(k){delete values[k];},set fontSize(v){values['font-size']=v;},set lineHeight(v){values['line-height']=v;}}},original='全文を削除せず保持する';text.textContent=original;text.closest=s=>s==='.as-next'?card:{};Object.defineProperty(text,'scrollHeight',{get:()=>Math.ceil(lines*parseFloat(values['font-size']??12)*Number(values['line-height']??1.35))});return {text,card,values,original,sheet:{querySelectorAll:()=>[text]}};}
test('Overflow fitting keeps full text, card and photo geometry and resets metrics after copy shortens',()=>{
 const f=copyFixture(3);fitSupportNextCopy(f.sheet);assert.ok(f.text.scrollHeight<=31.5);assert.equal(f.text.textContent,f.original);assert.equal(f.card.clientHeight,308);assert.equal(f.text.offsetTop,267);
 const short=copyFixture(1);fitSupportNextCopy(short.sheet);assert.deepEqual(short.values,{});
});
test('Unbounded confirmed text is not truncated or hidden when fitting reaches its legibility floor',()=>{
 const f=copyFixture(100);fitSupportNextCopy(f.sheet);assert.equal(f.text.textContent,f.original);assert.equal(f.values['font-size'],'10px');assert.equal(f.values['line-height'],'1');assert.ok(f.text.scrollHeight>31.5);
});
