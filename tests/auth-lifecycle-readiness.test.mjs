import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {authorizeServerRequest,createBoundedAuthorizationAudit} from '../src/lib/server-authorization.ts';
import {SqliteTestUsageStore} from '../src/lib/testing/sqlite-usage-store.ts';
import {paidApiBlocked} from '../src/lib/local-api-security.ts';

// Isolated verifier/ownership fixtures only. No real login, image or provider.
const NOW=1700000000000,origin='https://unit.test';
const principal=()=>({subject:'OWNER',authSessionId:'MOCK_LOGIN',issuedAtMs:NOW-1,expiresAtMs:NOW+60000,revoked:false,method:'platform'});
const targets={consultationId:'CONSULTATION',imageIds:['CURRENT'],jobId:'MOCK_JOB'};
function adapters(){return {trustedOrigin:origin,now:()=>NOW,sessions:{verify:async()=>principal()},ownership:{getConsultation:async id=>({id,ownerSubject:'OWNER'}),getImage:async id=>({id,consultationId:'CONSULTATION',ownerSubject:'OWNER'}),getGenerationJob:async id=>({id,consultationId:'CONSULTATION',ownerSubject:'OWNER',inputImageIds:['CURRENT'],outputImageIds:['RESULT']})}};}
const request=()=>new Request(origin+'/api/generate',{method:'POST',headers:{origin,'x-user-id':'FORGED_HEADER'}});
const policy={maxAttemptsTotal:2,maxAttemptsPerUser:2,maxAttemptsPerSession:2,maxAttemptsPerGrant:2,maxConcurrentTotal:1,maxConcurrentPerUser:1,maxConcurrentPerSession:1,maxRetriesPerJob:0,maxGrantTtlMs:60000,reservationTtlMs:1000,sentTtlMs:5000};
async function reserved(t){const directory=await mkdtemp(join(tmpdir(),'dev01-auth-lifecycle-')),store=new SqliteTestUsageStore(policy,{directory,testOnly:true,clock:()=>NOW});t.after(async()=>{await store.close();await rm(directory,{recursive:true,force:true});});const owner={userId:'OWNER',sessionId:'CONSULTATION'},grant=await store.issueGrant({owner,approvalId:'MOCK_SERVER_APPROVAL',expiresAt:NOW+60000,maxAttempts:2,operations:['MAIN']});assert.equal(grant.ok,true);const result=await store.reserve({owner,grantId:grant.grant.grantId,operation:'MAIN',requestKey:'MOCK_REQUEST',inputSha256:'a'.repeat(64)});assert.equal(result.ok,true);return {store,owner,result,attempt:{owner,jobId:result.job.jobId,attemptId:result.attempt.attemptId}};}

test('ownership image/job deadlines cannot become a late authorization or allowed audit event',async()=>{
 for(const method of ['getImage','getGenerationJob']){
  const deps=adapters(),audit=createBoundedAuthorizationAudit();deps.timeoutMs=5;deps.audit=audit;
  const read=deps.ownership[method];let release;deps.ownership[method]=id=>new Promise(resolve=>{release=async()=>resolve(await read(id));});
  const result=await authorizeServerRequest(request(),targets,'mutation',deps);assert.equal(result.ok,false);assert.equal(result.response.status,503);assert.deepEqual(await result.response.json(),{code:'security_not_ready',providerAttempted:false});
  assert.equal(typeof release,'function');await release();await new Promise(resolve=>setImmediate(resolve));assert.ok(!audit.snapshot().some(x=>x.code==='allowed'));assert.ok(audit.snapshot().some(x=>x.code==='adapter_timeout'));
 }
});
test('MOCK session revoked after durable reservation is reauthorized and stopped before any send',async t=>{
 const deps=adapters();assert.equal((await authorizeServerRequest(request(),targets,'mutation',deps)).ok,true);const f=await reserved(t);let sends=0;
 deps.sessions.verify=async()=>({...principal(),revoked:true});
 const recheck=await authorizeServerRequest(request(),targets,'mutation',deps);assert.equal(recheck.ok,false);assert.equal(recheck.response.status,401);
 if(recheck.ok)sends++;else assert.equal((await f.store.cancelBeforeSend(f.attempt)).ok,true);
 assert.equal(sends,0);const job=await f.store.readJob({owner:f.owner,jobId:f.result.job.jobId});assert.equal(job.ok,true);assert.equal(job.job.attempts[0].state,'FAILED');assert.equal(job.job.history.at(-1).reason,'CANCELLED_BEFORE_SEND');assert.equal(paidApiBlocked().status,503);
});
test('MOCK ownership change after reservation denies the current image and preserves consumed history',async t=>{
 const deps=adapters();assert.equal((await authorizeServerRequest(request(),targets,'mutation',deps)).ok,true);const f=await reserved(t);
 deps.ownership.getImage=async id=>({id,consultationId:'CONSULTATION',ownerSubject:'ANOTHER_OWNER'});
 const recheck=await authorizeServerRequest(request(),targets,'mutation',deps);assert.equal(recheck.ok,false);assert.equal(recheck.response.status,403);await f.store.cancelBeforeSend(f.attempt);
 const job=await f.store.readJob({owner:f.owner,jobId:f.result.job.jobId});assert.equal(job.ok,true);assert.equal(job.job.attempts.length,1);assert.equal(job.job.history.at(-1).state,'FAILED');
});
test('saved-result reads validate the server owner of job and every input/output image',async()=>{
 const req=()=>new Request(origin+'/api/results/MOCK_JOB',{method:'GET',headers:{'x-user-id':'OWNER'}}),deps=adapters();
 assert.equal((await authorizeServerRequest(req(),targets,'read',deps)).ok,true);
 const normal=deps.ownership.getImage;deps.ownership.getImage=async id=>id==='RESULT'?{id,consultationId:'CONSULTATION',ownerSubject:'OTHER_OWNER'}:normal(id);
 let result=await authorizeServerRequest(req(),targets,'read',deps);assert.equal(result.ok,false);assert.equal(result.response.status,403);assert.doesNotMatch(await result.response.text(),/OTHER_OWNER|RESULT|MOCK_JOB/);
 deps.sessions.verify=async()=>null;result=await authorizeServerRequest(req(),targets,'read',deps);assert.equal(result.ok,false);assert.equal(result.response.status,401);
});
test('adapter outage after reservation cancels the known-unsent attempt without exposing the exception',async t=>{
 const deps=adapters(),f=await reserved(t);deps.sessions.verify=async()=>{throw Error('INTERNAL_MOCK_DIAGNOSTIC');};
 const recheck=await authorizeServerRequest(request(),targets,'mutation',deps);assert.equal(recheck.ok,false);assert.equal(recheck.response.status,503);assert.doesNotMatch(await recheck.response.text(),/INTERNAL_MOCK_DIAGNOSTIC/);
 const result=await f.store.cancelBeforeSend(f.attempt);assert.equal(result.ok,true);assert.equal(result.attempt.state,'FAILED');assert.equal((await paidApiBlocked().json()).providerAttempted,false);
});
