import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewPhotoUploadGate} from '../src/lib/after-review-upload-gate.ts';
const deferred=()=>{let resolve,reject;const promise=new Promise((ok,no)=>{resolve=ok;reject=no;});return {promise,resolve,reject};};

test('six concurrent AFTER/reference direction decodes all publish even in reverse completion order',async()=>{
 const counts=[],gate=reviewPhotoUploadGate(n=>counts.push(n)),slots=['AFTER:FRONT','TARGET:FRONT','AFTER:SIDE','TARGET:SIDE','AFTER:BACK','TARGET:BACK'],reads=slots.map(()=>deferred()),published=new Map(),errors=[];
 const work=slots.map((slot,i)=>gate.read(slot,()=>reads[i].promise,value=>published.set(slot,value),error=>errors.push(error)));
 assert.equal(gate.pendingCount,6);for(let i=5;i>=0;i--)reads[i].resolve('photo-'+i);await Promise.all(work);
 assert.equal(published.size,6);for(let i=0;i<6;i++)assert.equal(published.get(slots[i]),'photo-'+i);assert.deepEqual(errors,[]);assert.equal(gate.pendingCount,0);assert.equal(counts.at(-1),0);
});
test('newest decode wins only within the same direction and role, while the opposite role is independent',async()=>{
 const gate=reviewPhotoUploadGate(),old=deferred(),latest=deferred(),target=deferred(),published=[],errors=[];
 const tasks=[gate.read('AFTER:FRONT',()=>old.promise,v=>published.push(v),e=>errors.push(e)),gate.read('AFTER:FRONT',()=>latest.promise,v=>published.push(v),e=>errors.push(e)),gate.read('TARGET:FRONT',()=>target.promise,v=>published.push(v),e=>errors.push(e))];
 assert.equal(gate.pendingCount,2);latest.resolve('latest AFTER');target.resolve('independent TARGET');await tasks[1];await tasks[2];old.resolve('superseded AFTER');await tasks[0];assert.deepEqual(published,['latest AFTER','independent TARGET']);assert.deepEqual(errors,[]);assert.equal(gate.pendingCount,0);
});
test('an old completion cannot unblock analysis while its latest replacement is still decoding',async()=>{
 const gate=reviewPhotoUploadGate(),old=deferred(),latest=deferred(),published=[];
 const first=gate.read('TARGET:SIDE',()=>old.promise,v=>published.push(v),()=>{}),second=gate.read('TARGET:SIDE',()=>latest.promise,v=>published.push(v),()=>{});
 old.resolve('old');await first;assert.equal(gate.pendingCount,1);assert.deepEqual(published,[]);latest.resolve('new');await second;assert.equal(gate.pendingCount,0);assert.deepEqual(published,['new']);
});
test('clearing invalidates all pending success/error callbacks and allows a fresh same-slot upload',async()=>{
 const gate=reviewPhotoUploadGate(),old=deferred(),bad=deferred(),fresh=deferred(),published=[],errors=[];
 const tasks=[gate.read('AFTER:BACK',()=>old.promise,v=>published.push(v),e=>errors.push(e)),gate.read('TARGET:BACK',()=>bad.promise,v=>published.push(v),e=>errors.push(e))];gate.clear();assert.equal(gate.pendingCount,0);
 const next=gate.read('AFTER:BACK',()=>fresh.promise,v=>published.push(v),e=>errors.push(e));old.resolve('cleared photo');bad.reject(Error('cleared error'));await Promise.all(tasks);assert.equal(gate.pendingCount,1);assert.deepEqual(published,[]);assert.deepEqual(errors,[]);fresh.resolve('fresh');await next;assert.deepEqual(published,['fresh']);assert.equal(gate.pendingCount,0);
});
test('a superseded decode error cannot replace a newer photo with a stale error message',async()=>{
 const gate=reviewPhotoUploadGate(),old=deferred(),latest=deferred(),published=[],errors=[];
 const first=gate.read('AFTER:SIDE',()=>old.promise,v=>published.push(v),e=>errors.push(e)),second=gate.read('AFTER:SIDE',()=>latest.promise,v=>published.push(v),e=>errors.push(e));latest.resolve('new valid');await second;old.reject(Error('old invalid'));await first;
 assert.deepEqual(published,['new valid']);assert.deepEqual(errors,[]);assert.equal(gate.pendingCount,0);
});
test('current decode failure preserves the prior accepted photo and releases pending state',async()=>{
 const gate=reviewPhotoUploadGate(),photos={front:'previous original'},errors=[];
 await gate.read('AFTER:FRONT',async()=>{throw Error('invalid file');},v=>{photos.front=v;},e=>errors.push(e.message));
 assert.equal(photos.front,'previous original');assert.deepEqual(errors,['invalid file']);assert.equal(gate.pendingCount,0);
});
