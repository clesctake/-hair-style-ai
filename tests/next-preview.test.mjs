import test from 'node:test';
import assert from 'node:assert/strict';
import {nextDevArguments} from '../scripts/dev-next.mjs';
test('managed preview flags map to supported Next flags with explicit strict port',()=>{
 assert.deepEqual(nextDevArguments(['--host','0.0.0.0','--port','4173','--strictPort']),['dev','--hostname','0.0.0.0','--port','4173']);
 assert.deepEqual(nextDevArguments(['--host=127.0.0.1','--port=4173','--strictPort']),['dev','--hostname','127.0.0.1','--port=4173']);
});
test('preview adapter refuses silent fallback and malformed host or port',()=>{
 for(const input of [['--strictPort'],['--host'],['--host='],['--port','0'],['--port','70000'],['--port','--strictPort']])assert.throws(()=>nextDevArguments(input));
});
test('ordinary Next development arguments pass through without changed behavior',()=>{
 assert.deepEqual(nextDevArguments([]),['dev']);assert.deepEqual(nextDevArguments(['--hostname','localhost','--port','3000','--webpack']),['dev','--hostname','localhost','--port','3000','--webpack']);
});
