import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile,readdir,chmod,symlink,link} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {DatabaseSync} from 'node:sqlite';
import {SqliteTestUsageStore} from '../src/lib/testing/sqlite-usage-store.ts';
import {hasProductionUsageStore} from '../src/lib/server-usage.ts';
import {paidApiBlocked} from '../src/lib/local-api-security.ts';

const policy={maxAttemptsTotal:100,maxAttemptsPerUser:100,maxAttemptsPerSession:100,maxAttemptsPerGrant:100,maxConcurrentTotal:100,maxConcurrentPerUser:100,maxConcurrentPerSession:100,maxRetriesPerJob:2,maxGrantTtlMs:60000,reservationTtlMs:1000,sentTtlMs:5000};
const owner={userId:'MOCK_VERIFIED_USER',sessionId:'MOCK_CONSULTATION'},other={userId:'OTHER',sessionId:'MOCK_CONSULTATION'};
const hash=value=>createHash('sha256').update(value).digest('hex');
const ok=result=>{assert.equal(result.ok,true,JSON.stringify(result));return result;};
const identity=result=>({owner,jobId:result.job.jobId,attemptId:result.attempt.attemptId});
async function fixture(t,overrides={}){
 const directory=await mkdtemp(join(tmpdir(),'dev01-test-usage-'));const stores=[];let now=1700000000000;
 const configured={...policy,...overrides};
 const open=(options={})=>{const store=new SqliteTestUsageStore(configured,{directory,testOnly:true,clock:()=>now,...options});stores.push(store);return store;};
 t.after(async()=>{await Promise.all(stores.map(store=>store.close()));await rm(directory,{recursive:true,force:true});});
 const store=open(),grant=ok(await store.issueGrant({owner,approvalId:'SERVER_APPROVED_TEST_GRANT',expiresAt:now+60000,maxAttempts:configured.maxAttemptsPerGrant,operations:['MAIN','FRINGE_A_TO_E']})).grant;
 const reserve=(key,selected=store,changes={})=>selected.reserve({owner,grantId:grant.grantId,operation:'MAIN',requestKey:key,inputSha256:hash(key),...changes});
 return {directory,open,store,grant,reserve,policy:configured,now:()=>now,advance:delta=>{now+=delta;}};
}

test('durable fixture has no production fallback or provider traffic and preserves history after restart',async t=>{
 const original=globalThis.fetch;let sends=0;globalThis.fetch=async()=>{sends++;throw Error('provider forbidden');};t.after(()=>{globalThis.fetch=original;});
 const f=await fixture(t),r=ok(await f.reserve('saved'));
 ok(await f.store.markSent(identity(r)));ok(await f.store.settle({...identity(r),outcome:'SUCCEEDED'}));
 await f.store.close();const reopened=f.open(),job=ok(await reopened.readJob({owner,jobId:r.job.jobId})).job;
 assert.deepEqual(job.history.map(x=>x.state),['RESERVED','SENT','SUCCEEDED']);assert.equal(job.attempts.length,1);assert.equal(reopened.mode,'TEST_ONLY');assert.equal(hasProductionUsageStore(reopened),false);assert.equal(sends,0);assert.equal(paidApiBlocked().status,503);
 assert.deepEqual(ok(await f.reserve('saved',reopened)).job,job);
});
test('independent instances opened during a live transaction atomically cap100 calls at seven attempts',async t=>{
 const f=await fixture(t,{maxAttemptsPerGrant:7});let otherStore;
 const writer=f.open({clock:()=>{otherStore??=f.open();return f.now();}});
 const first=ok(await f.reserve('during-construction',writer));
 const results=await Promise.all([Promise.resolve(first),...Array.from({length:99},(_,i)=>f.reserve('req-'+i,i%2?otherStore:f.store))]);
 assert.equal(results.filter(x=>x.ok).length,7);assert.equal(results.filter(x=>!x.ok&&x.code==='LIMIT_REACHED').length,93);
 await f.store.close();await otherStore.close();const reopened=f.open();assert.equal((await f.reserve('eighth',reopened)).code,'LIMIT_REACHED');
});
test('separate worker threads share durable SQLite reservations without exceeding the cap',async t=>{
 const f=await fixture(t,{maxAttemptsPerGrant:7});const barrier=new SharedArrayBuffer(4),state=new Int32Array(barrier),moduleUrl=new URL('../src/lib/testing/sqlite-usage-store.ts',import.meta.url).href;
 const source=`const {parentPort,workerData}=require('node:worker_threads');(async()=>{const {SqliteTestUsageStore}=await import(workerData.moduleUrl);const store=new SqliteTestUsageStore(workerData.policy,{directory:workerData.directory,testOnly:true,clock:()=>1700000000000});parentPort.postMessage({ready:true});Atomics.wait(new Int32Array(workerData.barrier),0,0);const results=[];for(let i=0;i<25;i++)results.push(await store.reserve({owner:workerData.owner,grantId:workerData.grantId,operation:'MAIN',requestKey:'thread-'+workerData.number+'-'+i,inputSha256:require('node:crypto').createHash('sha256').update('thread-'+workerData.number+'-'+i).digest('hex')}));await store.close();parentPort.postMessage({results});})().catch(()=>parentPort.postMessage({error:'WORKER_FIXTURE_FAILED'}));`;
 const workers=Array.from({length:4},(_,number)=>new Worker(source,{eval:true,execArgv:['--experimental-strip-types'],workerData:{moduleUrl,policy:f.policy,directory:f.directory,owner,grantId:f.grant.grantId,number,barrier}}));
 t.after(async()=>{await Promise.all(workers.map(w=>w.terminate()));});
 let ready=0;const results=await Promise.all(workers.map(w=>new Promise((resolve,reject)=>{w.on('error',reject);w.on('message',m=>{if(m.ready){if(++ready===4){Atomics.store(state,0,1);Atomics.notify(state,0,4);}}else if(m.error)reject(Error(m.error));else resolve(m.results);});})));
 const all=results.flat();assert.equal(all.filter(x=>x.ok).length,7);assert.equal(all.filter(x=>x.code==='LIMIT_REACHED').length,93);
});
test('persistent deduplication and one SENT transition survive instance and process-style restart',async t=>{
 const f=await fixture(t),s=f.open();const results=await Promise.all(Array.from({length:100},(_,i)=>f.reserve('same',i%2?s:f.store)));
 assert.equal(results.filter(x=>x.ok&&!x.deduplicated).length,1);assert.equal(new Set(results.map(x=>x.job.jobId)).size,1);
 const r=results[0],sent=await Promise.all([f.store.markSent(identity(r)),s.markSent(identity(r))]);assert.equal(sent.filter(x=>x.ok).length,1);assert.equal(sent.filter(x=>x.code==='INVALID_TRANSITION').length,1);
 await f.store.close();await s.close();const next=f.open();assert.equal((await next.markSent(identity(r))).code,'INVALID_TRANSITION');
 assert.equal(ok(await f.reserve('same',next)).deduplicated,true);assert.equal((await f.reserve('same',next,{inputSha256:hash('changed')})).code,'IDEMPOTENCY_CONFLICT');
});
test('cross-owner jobs and grants reveal no resource details before or after restart',async t=>{
 const f=await fixture(t),r=ok(await f.reserve('owned'));await f.store.close();const next=f.open();
 for(const intruder of [other,{...owner,sessionId:'ANOTHER_CONSULTATION'}]){
  assert.deepEqual(await next.readJob({owner:intruder,jobId:r.job.jobId}),{ok:false,code:'NOT_FOUND'});
  assert.deepEqual(await next.markSent({...identity(r),owner:intruder}),{ok:false,code:'NOT_FOUND'});
  assert.deepEqual(await f.reserve('intruder',next,{owner:intruder}),{ok:false,code:'NOT_AUTHORIZED'});
 }
});
test('timeout and grant expiry retain uncertain capacity, with no automatic refund or retry',async t=>{
 const f=await fixture(t,{maxConcurrentTotal:1,maxConcurrentPerUser:1,maxConcurrentPerSession:1}),r=ok(await f.reserve('timeout'));
 ok(await f.store.markSent(identity(r)));await f.store.close();f.advance(5001);const next=f.open();
 assert.equal(ok(await next.readJob({owner,jobId:r.job.jobId})).job.attempts[0].state,'UNKNOWN');
 assert.equal((await f.reserve('blocked',next)).code,'CONCURRENCY_LIMIT');assert.equal((await next.retry({...identity(r),retryKey:'forbidden'})).code,'OUTCOME_UNCERTAIN');
 ok(await next.settle({...identity(r),outcome:'FAILED'}));const retried=ok(await next.retry({...identity(r),retryKey:'manual'}));assert.equal(retried.attempt.ordinal,2);assert.notEqual(retried.attempt.attemptId,r.attempt.attemptId);
 assert.equal(ok(await next.retry({...identity(r),retryKey:'manual'})).deduplicated,true);f.advance(60000);assert.equal((await next.markSent(identity(retried))).code,'INVALID_TRANSITION');assert.equal((await f.reserve('expired',next)).code,'GRANT_EXPIRED');
});
test('failed commit rolls back reservation counters, IDs, dedup keys and history',async t=>{
 const f=await fixture(t,{maxAttemptsPerGrant:1});let fail=true;
 const faulty=f.open({beforeCommit:()=>{if(fail)throw Error('INJECTED_DISK_FAILURE');}});
 assert.deepEqual(await f.reserve('rollback',faulty),{ok:false,code:'STORE_UNAVAILABLE'});fail=false;
 const r=ok(await f.reserve('rollback',faulty));assert.equal(r.deduplicated,false);assert.equal(r.attempt.ordinal,1);assert.equal(r.job.history.length,1);assert.equal((await f.reserve('second',faulty)).code,'LIMIT_REACHED');
});
test('journal corruption, policy replacement and backwards clocks all fail closed',async t=>{
 const f=await fixture(t);const r=ok(await f.reserve('stable'));const incompatible=new SqliteTestUsageStore({...policy,maxAttemptsPerGrant:99},{directory:f.directory,testOnly:true,clock:f.now});t.after(()=>incompatible.close());
 assert.deepEqual(await f.reserve('reconfigured',incompatible),{ok:false,code:'STORE_UNAVAILABLE'});
 f.advance(-1);assert.deepEqual(await f.reserve('backwards'),{ok:false,code:'CONFIGURATION_UNAVAILABLE'});f.advance(1);
 const normalTime=f.now();f.advance(Number.MAX_SAFE_INTEGER-normalTime);assert.deepEqual(await f.reserve('unsafe-clock-overflow'),{ok:false,code:'CONFIGURATION_UNAVAILABLE'});f.advance(normalTime-Number.MAX_SAFE_INTEGER);assert.equal((await f.store.readJob({owner,jobId:r.job.jobId})).ok,true,'invalid clock is not committed into the replay journal');await f.store.close();
 const db=new DatabaseSync(join(f.directory,'usage-test.sqlite'));db.prepare('UPDATE fixture_journal SET digest=? WHERE seq=1').run('0'.repeat(64));db.close();
 const corrupt=f.open();assert.deepEqual(await corrupt.readJob({owner,jobId:r.job.jobId}),{ok:false,code:'STORE_UNAVAILABLE'});
});
test('fixture refuses unrelated/nonprivate directories and never changes their files',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'dev01-unrelated-'));t.after(()=>rm(directory,{recursive:true,force:true}));await writeFile(join(directory,'customer-data.txt'),'UNCHANGED');
 const store=new SqliteTestUsageStore(policy,{directory,testOnly:true});t.after(()=>store.close());assert.deepEqual(await store.readJob({owner,jobId:'none'}),{ok:false,code:'STORE_UNAVAILABLE'});assert.deepEqual(await readdir(directory),['customer-data.txt']);assert.equal(await readFile(join(directory,'customer-data.txt'),'utf8'),'UNCHANGED');
 const unsafe=await mkdtemp(join(tmpdir(),'dev01-world-readable-'));t.after(()=>rm(unsafe,{recursive:true,force:true}));await chmod(unsafe,0o755);const denied=new SqliteTestUsageStore(policy,{directory:unsafe,testOnly:true});t.after(()=>denied.close());assert.deepEqual(await denied.readJob({owner,jobId:'none'}),{ok:false,code:'STORE_UNAVAILABLE'});assert.deepEqual(await readdir(unsafe),[]);
 const f=await fixture(t);await f.store.close();const alias=join(f.directory,'usage-test.sqlite-wal');await symlink(join(directory,'customer-data.txt'),alias);const linked=f.open();assert.deepEqual(await linked.readJob({owner,jobId:'none'}),{ok:false,code:'STORE_UNAVAILABLE'});assert.equal(await readFile(join(directory,'customer-data.txt'),'utf8'),'UNCHANGED');await rm(alias);await link(join(directory,'customer-data.txt'),alias);const hardlinked=f.open();assert.deepEqual(await hardlinked.readJob({owner,jobId:'none'}),{ok:false,code:'STORE_UNAVAILABLE'});assert.equal(await readFile(join(directory,'customer-data.txt'),'utf8'),'UNCHANGED');
});
test('journal strips extra auth/body fields and replays detached commands rather than caller mutations',async t=>{
 const f=await fixture(t),input={owner:{...owner,Authorization:'NOT_A_REAL_CREDENTIAL'},grantId:f.grant.grantId,operation:'MAIN',requestKey:'allowlisted',inputSha256:hash('allowed'),headers:{Authorization:'NOT_A_REAL_CREDENTIAL'},body:{image:'data:image/png;not-storable'}};
 const pending=f.store.reserve(input);input.owner.userId='CHANGED';input.inputSha256=hash('changed');const result=ok(await pending);assert.equal(result.job.owner.userId,owner.userId);assert.equal(result.job.inputSha256,hash('allowed'));
 const db=new DatabaseSync(join(f.directory,'usage-test.sqlite'));const text=JSON.stringify(db.prepare('SELECT command FROM fixture_journal').all());db.close();assert.doesNotMatch(text,/NOT_A_REAL_CREDENTIAL|data:image|Authorization|headers/);
});
