import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedPortraitVerifier} from '../src/lib/generated-image-quality.ts';

test('five crops remain UNAVAILABLE when WebGL initialization fails, with one initialization attempt',async()=>{
 let calls=0,checks=0;
 const verifier=sharedPortraitVerifier(async()=>{calls++;throw Error('WebGL 2 is unavailable');},async()=>{checks++;});
 const statuses=[];
 try{for(const label of 'ABCDE')statuses.push(await verifier.check(label));}finally{verifier.close();}
 assert.deepEqual(statuses,Array(5).fill('UNAVAILABLE'));assert.equal(calls,1);assert.equal(checks,0);
});
test('shared portrait provider verifies every crop and releases resources',async()=>{
 let starts=0,closes=0;const seen=[];
 const provider={close(){closes++;}};
 const verifier=sharedPortraitVerifier(async()=>{starts++;return provider;},async(image,p)=>{assert.equal(p,provider);seen.push(image);});
 try{for(const label of 'ABCDE')assert.equal(await verifier.check(label),'PASSED');}finally{verifier.close();}
 assert.equal(starts,1);assert.equal(closes,1);assert.deepEqual(seen,[...'ABCDE']);
});
test('non-capability failures and invalid portraits still fail instead of becoming accepted',async()=>{
 const failed=sharedPortraitVerifier(async()=>{throw Error('model integrity failure');});
 await assert.rejects(failed.check('A'),/integrity/);
 const invalid=sharedPortraitVerifier(async()=>({close(){}}),async()=>{throw Error('multiple faces');});
 try{await assert.rejects(invalid.check('A'),/multiple faces/);}finally{invalid.close();}
});
