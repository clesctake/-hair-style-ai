import test from 'node:test';
import assert from 'node:assert/strict';
import {completedMainWithRetainedPlan,testReview} from './helpers/main-handoff-fixture.mjs';
import {simulationFixture,fixtureResponse} from './helpers/simulation-fixture.mjs';
import {withDiagnosisSession} from '../src/lib/session-adapter.ts';
import {currentSimulationReviewTarget,latestSimulationEvent} from '../src/lib/hair-simulation-context.ts';
import {queueSimulationBatch,beginSimulationJob,completeSimulationJob,reviewMainSimulation,reviewCurrentSimulation,selectSimulationDesign} from '../src/lib/hair-simulation-session.ts';
import {runSimulationJobs} from '../src/lib/hair-simulation-pipeline.ts';
import {selectPlannedDesign} from '../src/lib/design-planning-session.ts';
import {counselingFinalDesign} from '../src/lib/counseling-generation.ts';
// All provider responses are explicit synthetic protocol fixtures. No API requests.
function replaceInput(j){return withDiagnosisSession({...j,target:{...j.target,text:'TEST ONLY: changed color context'}});}
function completeNewMain(j,origin='REAL_API'){
 j=queueSimulationBatch(j);const s=j.diagnosisSession,job=s.hairSimulation.jobs.find(x=>x.batchId===s.hairSimulation.activeBatchId&&x.variantType==='MAIN');
 j=beginSimulationJob(j,job.id);const response=fixtureResponse(latestSimulationEvent(j.diagnosisSession,job.id).request,origin);response.generation.requiresStylistReview=true;
 return completeSimulationJob(j,job.id,response);
}
test('retained previous selection cannot receive review intended for a new current MAIN',()=>{
 let j=reviewMainSimulation(completedMainWithRetainedPlan(),testReview),old=structuredClone(j.diagnosisSession.hairSimulation);
 j=completeNewMain(replaceInput(j));const target=currentSimulationReviewTarget(j.diagnosisSession);
 assert.equal(target.isMain,true);assert.notEqual(target.generationId,old.selections.at(-1).generationId);
 j=reviewCurrentSimulation(j,testReview);const st=j.diagnosisSession.hairSimulation;
 assert.equal(st.reviews.at(-1).generationId,target.generationId);assert.equal(counselingFinalDesign(j).id,target.assetId);
 assert.deepEqual(st.reviews.slice(0,old.reviews.length),old.reviews);assert.deepEqual(st.generatedAssets[0],old.generatedAssets[0]);
});
test('stale-only history offers no review target and rejects a click without altering history',()=>{
 const j=replaceInput(reviewMainSimulation(completedMainWithRetainedPlan(),testReview)),before=structuredClone(j);
 assert.equal(currentSimulationReviewTarget(j.diagnosisSession),null);assert.throws(()=>reviewCurrentSimulation(j,testReview),/現在の条件/);assert.deepEqual(j,before);
});
test('current rejected MAIN can be deliberately reconsidered without creating a second generation',()=>{
 let j=reviewCurrentSimulation(completedMainWithRetainedPlan(),{...testReview,decision:'REJECTED',identity:'CONCERN'});
 assert.equal(counselingFinalDesign(j),null);const target=currentSimulationReviewTarget(j.diagnosisSession);assert.ok(target);
 j=reviewCurrentSimulation(j,testReview);assert.equal(counselingFinalDesign(j).id,target.assetId);assert.equal(j.diagnosisSession.hairSimulation.generatedAssets.length,1);
});
test('MOCK provider output cannot become a real-image review target',()=>{
 const j=completeNewMain(simulationFixture('COLOR_ONLY'),'MOCK_TRANSPORT_FIXTURE');
 assert.equal(currentSimulationReviewTarget(j.diagnosisSession),null);assert.throws(()=>reviewCurrentSimulation(j,testReview),/現在の条件/);
});
test('current selected child is reviewed without redirecting its confirmation to MAIN',async()=>{
 let j=await runSimulationJobs(simulationFixture(),{persist:async x=>x,transport:async r=>fixtureResponse(r,'REAL_API')});
 const child=j.diagnosisSession.hairSimulation.jobs.find(x=>x.label==='B');j=selectSimulationDesign(selectPlannedDesign(j,child.designId),child.id);
 const target=currentSimulationReviewTarget(j.diagnosisSession);assert.equal(target.isMain,false);assert.equal(target.jobId,child.id);
 j=reviewCurrentSimulation(j,testReview);assert.equal(j.diagnosisSession.hairSimulation.reviews.at(-1).generationId,target.generationId);
});
