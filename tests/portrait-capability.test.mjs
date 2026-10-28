import test from 'node:test';import assert from 'node:assert/strict';
import {portraitVerification} from '../src/lib/generated-image-quality.ts';
test('人物検証成功を記録',async()=>assert.equal(await portraitVerification('test',async()=>{}),'PASSED'));
test('WebGL 2未対応は生成済み原本を破棄しない',async()=>assert.equal(await portraitVerification('test',async()=>{throw Error('このブラウザではWebGL 2を利用できません')}),'UNAVAILABLE'));
test('複数人物など実際の品質不合格は見逃さない',async()=>assert.rejects(()=>portraitVerification('test',async()=>{throw Error('multiple faces')}),/multiple faces/));
