import test from 'node:test';
import assert from 'node:assert/strict';
import {previewUuid} from '../src/lib/preview-uuid.ts';

test('HTTP preview UUID preserves random bytes and sets v4/variant bits', () => {
  const source = {getRandomValues(bytes) {bytes.fill(255); return bytes;}};
  assert.equal(previewUuid(source), 'ffffffff-ffff-4fff-bfff-ffffffffffff');
});
test('HTTP preview UUID uses secure entropy and propagates entropy failures', () => {
  const ids = new Set(Array.from({length:100}, () => previewUuid(crypto)));
  assert.equal(ids.size,100);
  for(const id of ids) assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.throws(() => previewUuid({getRandomValues(){throw Error('unavailable');}}),/unavailable/);
});
