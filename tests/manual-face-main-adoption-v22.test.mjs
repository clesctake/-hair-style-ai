import test from 'node:test';
import assert from 'node:assert/strict';
import {newJourney} from '../src/lib/journey.ts';
import {withDiagnosisSession} from '../src/lib/session-adapter.ts';
import {correctObservedFace} from '../src/lib/photo-analysis-pipeline.ts';
import {effectiveFaceBoneValues} from '../src/lib/effective-face-values.ts';
import {planBangFaceFrameDesigns} from '../src/lib/design-planning-session.ts';
import {validateDiagnosisSession} from '../src/lib/session-validation.ts';
import {memoryJourneyStore} from '../src/lib/journey-store.ts';
import {catalog} from '../src/lib/catalog.ts';
import {simulationFixture,fixtureResponse} from './helpers/simulation-fixture.mjs';
import {queueSimulationBatch,beginSimulationJob,completeSimulationJob,reviewMainSimulation} from '../src/lib/hair-simulation-session.ts';
import {counselingFinalDesign} from '../src/lib/counseling-generation.ts';
function manual(){const j=newJourney();j.title='手動確認の架空相談';j.photos=[structuredClone(simulationFixture().photos[0])];return withDiagnosisSession(j);}
test('stylist-only face input creates no AI estimate or landmarks and plans five traceable proposals',()=>{
 const initial=manual();let j=correctObservedFace(initial,'faceHeightWidthRatio',1.5);assert.deepEqual(initial.diagnosisSession.faceBoneAnalysis.stylistCorrection,[]);
 assert.equal(j.diagnosisSession.faceBoneAnalysis.aiEstimate.length,0);assert.equal(j.diagnosisSession.faceBoneAnalysis.activeEstimateId,null);
 assert.equal(effectiveFaceBoneValues(j.diagnosisSession).faceHeightWidthRatio.sourceType,'STYLIST_CORRECTED');
 j=planBangFaceFrameDesigns(j);validateDiagnosisSession(j.diagnosisSession);const run=j.diagnosisSession.designPlan.planning.runs.at(-1);assert.equal(run.input.faceEstimateId,null);assert.equal(run.proposals.length,5);assert.ok(run.proposals.every(p=>p.sourceAnalysisIds.faceCorrectionIds.length>0));
});
test('manual corrections do not follow a replacement photograph and clearing remains unknown',()=>{
 let j=correctObservedFace(manual(),'faceHeightWidthRatio',1.5);const changed=withDiagnosisSession({...j,photos:[{...j.photos[0],id:'different-original'}]});assert.equal(effectiveFaceBoneValues(changed.diagnosisSession).faceHeightWidthRatio.value,null);assert.throws(()=>planBangFaceFrameDesigns(changed));
 j=correctObservedFace(j,'faceHeightWidthRatio',null);assert.equal(effectiveFaceBoneValues(j.diagnosisSession).faceHeightWidthRatio.value,null);assert.throws(()=>planBangFaceFrameDesigns(j));
});
test('manual-only draft survives JSON restoration and adapter reconciliation without an AI estimate',()=>{
 const saved=correctObservedFace(manual(),'faceHeightWidthRatio',1.4);const loaded=withDiagnosisSession(JSON.parse(JSON.stringify(saved)),catalog);validateDiagnosisSession(loaded.diagnosisSession);assert.equal(effectiveFaceBoneValues(loaded.diagnosisSession).faceHeightWidthRatio.value,1.4);assert.equal(loaded.diagnosisSession.faceBoneAnalysis.aiEstimate.length,0);
});
test('manual face input rejects missing front image and forged provenance',()=>{
 assert.throws(()=>correctObservedFace(newJourney(),'faceHeightWidthRatio',1.5),/正面/);
 const j=correctObservedFace(manual(),'faceHeightWidthRatio',1.5);delete j.diagnosisSession.faceBoneAnalysis.stylistCorrection[0].inputPhotoIds;assert.throws(()=>validateDiagnosisSession(j.diagnosisSession),/出所/);
});
// Protocol fixture only. Origin value exercises production gates; no API or real generation is claimed by this test.
function completed(){let j=queueSimulationBatch(simulationFixture('COLOR_ONLY'));const main=j.diagnosisSession.hairSimulation.jobs[0];j=beginSimulationJob(j,main.id);const event=j.diagnosisSession.hairSimulation.events.at(-1),r=fixtureResponse(event.request,'REAL_API');r.generation.requiresStylistReview=true;r.generation.portraitVerification='UNAVAILABLE';return completeSimulationJob(j,main.id,r);}
const accept={decision:'ACCEPTED',identity:'CONFIRMED',background:'CONFIRMED',color:'CONFIRMED',design:'CONFIRMED',note:'UNIT TEST ONLY'};
test('MAIN remains unadopted until explicit review; accepted pixels survive save/load',async()=>{
 const store=memoryJourneyStore(catalog);let j=completed();assert.equal(counselingFinalDesign(j),null);const bytes=j.diagnosisSession.hairSimulation.generatedAssets[0].dataUrl;j=reviewMainSimulation(j,accept);assert.equal(counselingFinalDesign(j).dataUrl,bytes);j=await store.save(j);assert.equal(counselingFinalDesign(await store.load(j.id)).dataUrl,bytes);
});
test('rejected or stale MAIN cannot become a final design',()=>{
 let j=completed();j=reviewMainSimulation(j,{...accept,decision:'REJECTED',identity:'CONCERN'});assert.equal(counselingFinalDesign(j),null);j=reviewMainSimulation(j,accept);assert.ok(counselingFinalDesign(j));j=withDiagnosisSession({...j,target:{...j.target,text:'changed'}});assert.throws(()=>reviewMainSimulation(j,accept),/現在/);assert.equal(counselingFinalDesign(j),null);
});
