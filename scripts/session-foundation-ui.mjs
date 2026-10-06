// Optional browser integration check. Requires Playwright + an installed Chromium.
// npm run build && npm run start -- --port 3141
// PHASE1_PLAYWRIGHT_MODULE and PHASE1_TEST_CHROMIUM may select existing test tools.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { catalog } from '../src/lib/catalog.ts';
import assets from '../src/data/journey_sample_assets.json' with { type: 'json' };
import { createJourneySample } from '../src/lib/journey-sample.ts';

const { chromium } = await import(process.env.PHASE1_PLAYWRIGHT_MODULE || 'playwright');
const baseUrl = process.env.PHASE1_BASE_URL || 'http://127.0.0.1:3141';
const output = path.resolve(process.env.PHASE1_TEST_OUTPUT || 'test-artifacts/session-foundation');
await mkdir(output, { recursive: true });
const server = process.env.PHASE1_START_SERVER === '1' ? spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', new URL(baseUrl).port || '3141'], { stdio: ['ignore', 'pipe', 'pipe'] }) : null;
let serverLog = '';
if (server) {
  server.stdout.on('data', b => { serverLog += b.toString(); }); server.stderr.on('data', b => { serverLog += b.toString(); });
  process.on('exit', () => { server.kill('SIGTERM'); });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { ready = (await fetch(`${baseUrl}/fiole/demo`)).ok; } catch { /* Wait for this test's local server. */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) { server.kill('SIGTERM'); throw new Error(`テスト用サーバーを起動できませんでした。${serverLog}`); }
}
const legacy = (await createJourneySample(catalog, assets)).session;
delete legacy.diagnosisSession;
legacy.id = 'phase1-test-legacy-record'; legacy.version = 1; legacy.title = 'Phase 1 互換テスト';
legacy.proposals = []; legacy.selectedProposalId = null;
legacy.legacyExtension = { retained: 'original-legacy-extension' };
const original = JSON.stringify(legacy);
const browser = await chromium.launch({ executablePath: process.env.PHASE1_TEST_CHROMIUM || undefined,
  headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--no-zygote', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1194, height: 834 }, isMobile: true, hasTouch: true });
let generationRequests = 0, capabilityRequests = 0;
await context.route('**/api/generate', async route => {
  if (route.request().method() === 'POST') { generationRequests++; await route.abort(); }
  else { capabilityRequests++; await route.continue(); }
});
const page = await context.newPage(), pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
page.on('dialog', dialog => { void dialog.accept(); });
const readRecord = () => page.evaluate(async id => {
  const db = await new Promise((resolve, reject) => { const r = indexedDB.open('hair-mirror-color-journey-v1', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  try { return await new Promise((resolve, reject) => { const r = db.transaction('records', 'readonly').objectStore('records').get(id); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
  finally { db.close(); }
}, legacy.id);
try {
  await page.goto(`${baseUrl}/fiole/demo`);
  await page.getByRole('region', { name: 'カウンセリングホーム' }).waitFor();
  assert.equal(await page.locator('.salon-four-steps > button').count(), 4);
  assert.equal(await page.locator('.reference-upper > .reference-card').count(), 3);
  assert.equal(await page.locator('.salon-feature-state').count(), 0);
  await page.screenshot({ path: path.join(output, 'home-1194.png'), fullPage: true });
  await page.setViewportSize({ width: 1024, height: 768 });
  assert.ok(await page.getByRole('button', { name: /新しいカラー診断を始める/ }).isVisible());
  await page.screenshot({ path: path.join(output, 'home-1024.png'), fullPage: true });
  await page.evaluate(async value => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('hair-mirror-color-journey-v1', 1); r.onupgradeneeded = () => r.result.createObjectStore('records', { keyPath: 'id' }); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    try { await new Promise((resolve, reject) => { const t = db.transaction('records', 'readwrite'); t.objectStore('records').put({ id: value.id, revisions: [value] }); t.oncomplete = resolve; t.onerror = () => reject(t.error); }); }
    finally { db.close(); }
  }, legacy);
  await page.reload();
  await page.getByRole('region', { name: 'カウンセリングホーム' }).waitFor();
  await page.getByRole('button', { name: /過去の診断/ }).first().click();
  await page.getByRole('button', { name: /Phase 1 互換テスト/ }).click();
  await page.getByText('保存した相談を開きました。', { exact: true }).waitFor();
  assert.equal(JSON.stringify((await readRecord()).revisions[0]), original);
  await page.getByRole('button', { name: '出典 / データ ↗', exact: true }).click();
  const details = page.locator('.salon-feature-state details');
  assert.equal(await details.getAttribute('open'), null);
  await details.locator('summary').click();
  const states = await details.locator('[data-feature-id]').evaluateAll(rows => Object.fromEntries(rows.map(r => [r.dataset.featureId, r.dataset.featureState])));
  assert.equal(states.commonDataArchitecture, 'REAL'); assert.equal(states.hairAnalysis, 'PARTIAL');
  assert.equal(states.faceBoneAnalysis, 'PARTIAL'); assert.equal(states.mainDesignGeneration, 'PARTIAL');
  assert.equal(states.requiredUnderCalculator, 'UNIMPLEMENTED');
  assert.ok((await details.locator('dd').first().innerText()).includes(legacy.id));
  await page.screenshot({ path: path.join(output, 'feature-state.png'), fullPage: true });
  await page.getByRole('button', { name: /COLOR FUTURE AI.*HAIR DESIGN LAB/ }).click();
  const slider = page.getByRole('slider', { name: 'ホーム ダメージ', exact: true });
  const before = Number(await slider.inputValue()); await slider.focus(); await slider.press('ArrowLeft');
  const after = Number(await slider.inputValue()); assert.equal(after, before - 1);
  await page.getByRole('button', { name: 'この相談を保存する →', exact: true }).click();
  await page.getByText('相談を保存しました · 第2版', { exact: true }).waitFor();
  const stored = await readRecord(); assert.equal(stored.revisions.length, 2);
  assert.equal(JSON.stringify(stored.revisions[0]), original);
  const latest = stored.revisions[1], session = latest.diagnosisSession;
  assert.equal(session.id, legacy.id); assert.equal(session.revision, 2); assert.equal(session.specVersion, '1.1');
  assert.deepEqual(latest.analyses, legacy.analyses); assert.deepEqual(latest.photos, legacy.photos);
  assert.deepEqual(latest.legacyExtension, legacy.legacyExtension);
  assert.equal(session.hairAnalysis.stylistCorrection.length, legacy.corrections.length + 1);
  assert.equal(session.styleTarget.referenceImage.role, 'STYLE_REFERENCE'); assert.equal(session.colorTarget.referenceImage.role, 'COLOR_REFERENCE');
  for (const child of session.designPlan.bangFaceFrameDesigns) assert.equal(child.parentDesignId, session.designPlan.mainDesign.designId);
  await page.reload(); await page.getByRole('region', { name: 'カウンセリングホーム' }).waitFor();
  await page.getByRole('button', { name: /過去の診断/ }).first().click();
  await page.getByRole('button', { name: /Phase 1 互換テスト/ }).click();
  await page.getByText('保存した相談を開きました。', { exact: true }).waitFor();
  assert.equal(Number(await page.getByRole('slider', { name: 'ホーム ダメージ', exact: true }).inputValue()), after);
  assert.equal((await readRecord()).revisions.length, 2);
  assert.equal(generationRequests, 0); assert.deepEqual(pageErrors, []);
  const result = { status: 'PASS', viewportWidths: [1194, 1024], physicalIOSDevice: false, realIndexedDB: true,
    preservedLegacyRevision: true, commonSessionIdMatchesRecordId: true, persistedStylistCorrection: true,
    collapsedFeatureRegistry: true, generationRequests, capabilityRequests, pageErrors, revisions: 2 };
  await writeFile(path.join(output, 'browser-results.json'), JSON.stringify(result, null, 2));
  process.stdout.write(JSON.stringify(result) + '\n');
} finally {
  await context.close(); await browser.close();
  if (server) { server.kill('SIGTERM'); await writeFile(path.join(output, 'server.log'), serverLog); }
}
