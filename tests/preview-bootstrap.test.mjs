import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {buildSync} from 'esbuild';

// Execute the actual Next pre-hydration entry, without browser security overrides.
const code = buildSync({entryPoints:['instrumentation-client.ts'],bundle:true,write:false,format:'iife',platform:'neutral'}).outputFiles[0].text;
function boot(mode,hostname,native) {
  const source = {getRandomValues: bytes => crypto.getRandomValues(bytes)};
  if(native) source.randomUUID = native;
  runInNewContext(code,{process:{env:{NODE_ENV:mode}},window:{location:{hostname}},crypto:source});
  return source;
}
test('actual preview entry supplies UUID before application initialization', () => {
  const source = boot('development','terminal.local');
  assert.match(source.randomUUID(),/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
});
test('preview entry never modifies production or other host crypto', () => {
  assert.equal(boot('production','terminal.local').randomUUID,undefined);
  assert.equal(boot('development','example.test').randomUUID,undefined);
});
test('preview entry preserves an existing native UUID function', () => {
  const native = () => 'native';
  assert.equal(boot('development','terminal.local',native).randomUUID,native);
});
