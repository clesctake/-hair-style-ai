import test from 'node:test';
import assert from 'node:assert/strict';
import {verificationDigest} from '../scripts/verification-digest.mjs';

test('verification digest hashes exact binary bytes using the SHA256 abc known vector',()=>{
 const expected='ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
 const bytes=new Uint8Array([0,97,98,99,0]).subarray(1,4);
 for(const value of ['abc',Buffer.from('abc'),bytes,new DataView(bytes.buffer,1,3),new Uint8Array([97,98,99]).buffer])assert.equal(verificationDigest(value),expected);
 assert.notEqual(verificationDigest(Buffer.from('abc')),verificationDigest({type:'Buffer',data:[97,98,99]}));
});
test('structured consultation fingerprints retain the existing JSON digest',()=>{
 const expected='015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862';
 assert.equal(verificationDigest({a:1}),expected);assert.equal(verificationDigest('{"a":1}'),expected);
});
