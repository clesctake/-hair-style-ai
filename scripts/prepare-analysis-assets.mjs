import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const installed = join(root, 'node_modules/@mediapipe/tasks-vision');
const target = join(root, 'public/analysis');
const digest = buffer => createHash('sha256').update(buffer).digest('hex');
const upstreamSha256 = 'd885630c297c0b20b1fe86096cb06291c4c8080876f27852e724f24ac603713f';
const loggerInitializer = 'function(t,e){e=e.runningMode??"";var r=t.g.Sa();t.m=new Dh(t.C(),e,r)}(t,n),';
const pkg = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
const upstream = await readFile(join(installed, 'vision_bundle.mjs'));
if (pkg.version !== '1.0.1' || digest(upstream) !== upstreamSha256) throw new Error('MediaPipe SDK version/hash changed. Review the telemetry patch before updating assets.');
const original = upstream.toString('utf8');
if (original.split(loggerInitializer).length !== 2) throw new Error('Expected exactly one task logger initializer; refusing an unreviewed patch.');
// Apache-2.0 modification: disable only the default task-usage logger creation.
// Inference/model code and global browser networking remain unchanged.
const patched = '/* COLOR FUTURE AI modification: default task-usage logging disabled. See NOTICE.md. */\n' + original.replace(loggerInitializer, '');
await mkdir(join(target, 'wasm'), { recursive: true });
await writeFile(join(target, 'vision_bundle.mjs'), patched);
for (const file of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm']) await copyFile(join(installed, 'wasm', file), join(target, 'wasm', file));
const models = [
  { path: 'models/hair_segmenter.tflite', sha256: '2628cf3ce5f695f604cbea2841e00befcaa3624bf80caf3664bef2656d59bf84', url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/1/hair_segmenter.tflite' },
  { path: 'models/face_landmarker.task', sha256: '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff', url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task' }
];
for (const model of models) if (digest(await readFile(join(target, model.path))) !== model.sha256) throw new Error(`Model hash mismatch: ${model.path}`);
const paths = [];
async function walk(dir, prefix = '') {
  for (const file of (await readdir(dir, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
    const rel = prefix + file.name;
    if (file.isDirectory()) await walk(join(dir, file.name), rel + '/');
    else if (rel !== 'asset-manifest.json') paths.push(rel);
  }
}
await walk(target);
const assets = [];
for (const path of paths) { const bytes = await readFile(join(target, path)); assets.push({ path, bytes: bytes.length, sha256: digest(bytes) }); }
await writeFile(join(target, 'asset-manifest.json'), JSON.stringify({ provider: 'mediapipe-tasks-vision', packageVersion: '1.0.1', telemetry: 'DISABLED_BY_AUDITED_LOCAL_PATCH', upstreamBundleSha256: upstreamSha256, modelVersions: { hair: 'hair_segmenter/float32/1', face: 'face_landmarker/float16/1' }, models, assets }, null, 2) + '\n');
console.log(`Prepared ${assets.length} pinned analysis assets; usage telemetry disabled.`);
