import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {page3FinalFlow} from './helpers/page3-final-flow-fixture.mjs';
import {supportView,supportBangImage,reconcileSupport,ensureAfterSupport} from '../src/lib/after-support-session.ts';
import {supportFaceRows,supportNextToneLabel,supportProductCopy,supportFinishPhotos,supportStylist} from '../src/lib/after-support-presentation.ts';
import {supportPlanRequest} from '../src/lib/after-support-plan.ts';
import {validateDiagnosisSession} from '../src/lib/session-validation.ts';
import {memoryJourneyStore} from '../src/lib/journey-store.ts';
import {catalog} from '../src/lib/catalog.ts';
import {encodeJourneyRevision,decodeJourneyRevision} from '../src/lib/journey-storage-codec.ts';
import {simulationFixture,fixtureResponse} from './helpers/simulation-fixture.mjs';
import {runSimulationJobs} from '../src/lib/hair-simulation-pipeline.ts';
import {selectSimulationDesign} from '../src/lib/hair-simulation-session.ts';
import {ensureProDesign,calculateProDesignRecipes,currentRecipeSet,selectProRecipe,toggleNextColor,editProDesign,editStylistMessage,confirmProDesign} from '../src/lib/pro-design-session.ts';

test('Fictional manually entered Page 1/2 records reach Page 3 without any simulated REAL_API output',()=>{
 const j=page3FinalFlow();validateDiagnosisSession(j.diagnosisSession);const before=structuredClone(j),v=supportView(j);
 assert.ok(j.photos[0].dataUrl.startsWith('data:image/jpeg;'));assert.equal(j.photos[0].width,180);assert.equal(j.diagnosisSession.hairHistory.find(x=>x.type==='BLEACH').count,1);
 assert.equal(v.source,null);assert.equal(v.finalImage,null);assert.equal(v.targetLevel,8);assert.deepEqual(v.targetLab,{L:58,a:3,b:18});
 assert.deepEqual(v.nextColors.map(x=>[x.family,x.tone]),[['BEIGE','BASE'],['PINK','DOWN'],['MATTE','UP']]);assert.equal(v.aftercare.visitWeeks,6);assert.deepEqual(v.aftercare.homeCare,['COLOR_RETENTION','UV']);assert.equal(v.aftercare.menuSnapshot.name,'TEST ONLY：カット＋カラー');
 assert.equal(v.message,'TEST ONLY：架空美容師の確定メッセージ。\n改行と全文を保持します。');assert.equal(supportStylist(j,v).name,j.stylist);
 const product=v.aftercare.productSnapshots[0],copy=supportProductCopy(j,v,product);assert.equal(copy.reason,product.features[0]);assert.equal(copy.usageAdvice,product.usageMethod);assert.equal(copy.image,product.image.localReference);
 assert.ok(Object.values(supportFinishPhotos(j,v)).every(x=>x===null));assert.ok(['A','B','C','D','E'].every(label=>supportBangImage(j,label)===null));assert.deepEqual(j,before);
});
test('Page 1 corrected face values and the saved nose value are displayed from the confirmed snapshot',()=>{
 const j=page3FinalFlow(),v=supportView(j),rows=Object.fromEntries(supportFaceRows(v,false));
 assert.equal(rows['縦横比'],'1 : 1.25');assert.equal(rows['額の比率'],'0.31');assert.equal(rows['鼻の位置'],'0.59');assert.equal(rows['顎の比率'],'0.38');assert.match(rows['骨格タイプ'],/未実装/);
 j.diagnosisSession.faceBoneAnalysis.stylistCorrection.at(-1).value.value=.9;assert.equal(Object.fromEntries(supportFaceRows(supportView(j),false))['顎の比率'],'0.38');assert.equal(supportView(j).sourceStale,true);
});
test('Cleared or MOCK face values remain unknown and never recreate the previous estimate',()=>{
 const j=page3FinalFlow(),p=j.diagnosisSession.proDesign,face=p.inputSnapshot.faceBoneSnapshot;
 face.stylistCorrection.find(x=>x.metric==='foreheadHeightRatio').value.value=null;face.aiEstimate[0].additionalMeasurements.nosePosition.sourceType='MOCK';
 const rows=Object.fromEntries(supportFaceRows(supportView(j),false));assert.equal(rows['額の比率'],'未取得');assert.equal(rows['鼻の位置'],'未取得');
});
test('Next color uses a known confirmed base level without inventing a numeric UP or DOWN result',()=>{
 const v=supportView(page3FinalFlow());assert.equal(supportNextToneLabel(v.nextColors[0],v.targetLevel),'8 Lv（確定色）');assert.equal(supportNextToneLabel(v.nextColors[1],8),'トーンダウン（基準 8 Lv）');assert.equal(supportNextToneLabel(v.nextColors[2],8),'トーンアップ（基準 8 Lv）');assert.equal(supportNextToneLabel(undefined,null),'明るさ 未算出');
});
test('Opening/reconciling Page 3 does not generate images and care, menu, values and multiline message survive storage',async()=>{
 const j=page3FinalFlow(),before=structuredClone(j),store=memoryJourneyStore(catalog),saved=await store.save(j),loaded=await store.load(saved.id),restored=await decodeJourneyRevision(await encodeJourneyRevision(saved));
 for(const record of [loaded,restored,reconcileSupport(loaded),ensureAfterSupport(loaded)]){
  const v=supportView(record);assert.equal(v.targetLevel,8);assert.equal(v.message,supportView(before).message);assert.deepEqual(v.aftercare,supportView(before).aftercare);assert.deepEqual(v.nextColors,supportView(before).nextColors);assert.equal(record.diagnosisSession.afterSupport.generationJobCount,0);
 }
 assert.deepEqual(j,before);
});
test('Qualitative fade and makeup inputs use confirmed values; stale data is stopped before any provider request',()=>{
 const j=page3FinalFlow();for(const task of ['FADE','MAKEUP','PRODUCT']){const input=supportPlanRequest(j,task);assert.equal(input.context.confirmedColor.finishLevel,8);assert.equal(input.context.face.faceHeightWidthRatio,1.25);assert.equal(input.context.nextVisitWeeks,6);assert.match(input.context.history.find(x=>x.type==='BLEACH').note,/1回/);assert.equal(input.context.selectedProducts[0].productName,'TEST ONLY：架空ケアミルク');}
 j.diagnosisSession.styleTarget.requestText='未確定の変更';assert.throws(()=>supportPlanRequest(j,'FADE'),/再確認/);
});
test('STYLE_ONLY confirmed A-E records normalize an absent color ID to null instead of hiding matching history',async()=>{
 // Separate, explicit synthetic transport test; not a real API or the manual flow above.
 let j=await runSimulationJobs(simulationFixture('STYLE_ONLY'),{transport:async r=>fixtureResponse(r,'REAL_API'),persist:async x=>x});j=selectSimulationDesign(j,j.diagnosisSession.hairSimulation.jobs.find(x=>x.label==='A').id);
 j=calculateProDesignRecipes(ensureProDesign(j,catalog),catalog);j=selectProRecipe(j,currentRecipeSet(j).recipes[0].id);for(const f of ['BEIGE','PINK','MATTE'])j=toggleNextColor(j,f);j=editStylistMessage(j,'STYLE ONLY TEST');j=editProDesign(j,{message:{...j.diagnosisSession.proDesign.message,reviewedAt:j.createdAt}});j=ensureAfterSupport(confirmProDesign(j));
 assert.equal(supportView(j).handoff.targetConfirmationId,null);for(const label of ['A','B','C','D','E'])assert.ok(supportBangImage(j,label));
});
test('Approved geometry and working PNG/session modules remain byte-identical to v10',()=>{
 const protectedHashes={
  'src/lib/after-support-sheet.ts':'2bde80ff0e4fdb553fd4f3eae9081a8c89d8b770b387490d3d1e1fe3b1e56ae1',
  'src/components/after-support-sheet.tsx':'504975a4c6be29ef1fe3868bf8559da7e837a7b680d76f1442b165c2ed94d65b',
  'src/lib/after-support-restore.ts':'7fa5cb9a25c7f13139dc0568b9fd43c674bb2cc9059b9ad4183ca6de59d6d8fa',
 };
 for(const [name,hash]of Object.entries(protectedHashes))assert.equal(createHash('sha256').update(readFileSync(new URL('../'+name,import.meta.url))).digest('hex'),hash);
 const page=readFileSync(new URL('../src/components/after-support-page.tsx',import.meta.url),'utf8'),css=readFileSync(new URL('../app/fiole/after-support/after-support.css',import.meta.url),'utf8');assert.match(page,/counseling-final\/brand-mark.png/);assert.match(page,/className="as-current-step"/);assert.match(css,/\.as-header \.as-current-step b/);assert.match(css,/-webkit-text-fill-color:white/);assert.match(css,/\.as-analysis-table th\{width:48%;white-space:nowrap/);
});
