import test from 'node:test';
import assert from 'node:assert/strict';
import {simulationFixture,fixtureResponse,pngHash} from './helpers/simulation-fixture.mjs';
import {runCounselingCombined} from '../src/lib/counseling-combined-execution.ts';
import {runCounselingComparison,applyCounselingComparison} from '../src/lib/counseling-comparison-pipeline.ts';
import {prepareCounselingGeneration,counselingFinalDesign} from '../src/lib/counseling-generation.ts';
import {editCounseling} from '../src/lib/counseling-session.ts';
import {simulationResponseCounts,effectiveJobParameters,simulationJobStatus,latestSimulationEvent} from '../src/lib/hair-simulation-context.ts';
import {generationContract} from '../src/lib/generation-contract.ts';
import {simulationInstructions} from '../src/lib/hair-simulation-instructions.ts';
import {setPlannedDesignDraft,confirmPlannedDesignCorrection,planBangFaceFrameDesigns,selectPlannedDesign} from '../src/lib/design-planning-session.ts';
import {correctObservedFace} from '../src/lib/photo-analysis-pipeline.ts';
import {SimulationTransportError} from '../src/lib/hair-simulation-client.ts';
import {comparisonRegions} from '../src/lib/image-comparison.ts';
import {queueSimulationBatch,beginSimulationJob,selectSimulationDesign,reviewSimulation} from '../src/lib/hair-simulation-session.ts';
import {ensureProDesign,calculateProDesignRecipes,currentRecipeSet,selectProRecipe,toggleNextColor,editStylistMessage,editProDesign,confirmProDesign} from '../src/lib/pro-design-session.ts';
import {supportView} from '../src/lib/after-support-session.ts';
import {confirmColorModal} from '../src/lib/color-modal-confirmation.ts';
import {targetDraft} from '../src/lib/target-adjustment.ts';
import {catalog} from '../src/lib/catalog.ts';
import {memoryJourneyStore} from '../src/lib/journey-store.ts';

// Synthetic transport, not a REAL API/quality/timing claim.
const output=r=>({result:fixtureResponse(r,'REAL_API'),images:comparisonRegions(5,2304,2048).map((region,i)=>({dataUrl:fixtureResponse(r).image,sha256:pngHash,width:region.width,height:region.height,crop:{version:'comparison-crop-v1',sharedRequestId:r.requestId,sourceSha256:pngHash,sourceWidth:2304,sourceHeight:2048,...region,label:'ABCDE'[i]}}))});
function harness(){let calls=0,analysis=0,last=null;return {get calls(){return calls;},get analysis(){return analysis;},get saved(){return last;},options:{persist:async j=>(last=structuredClone(j)),analyze:async()=>{analysis++;throw Error('existing analysis must be reused');},compare:(j,o)=>runCounselingComparison(j,{...o,request:async r=>{calls++;return output(r);}})}};}

test('one combined action reuses measured analysis and sends exactly one five-design request with consultation',async()=>{
 const h=harness(),input=editCounseling(simulationFixture(),{historyNote:'縮毛矯正履歴を確認',requestNote:'扱いやすい、やわらかい雰囲気'}),proposals=structuredClone(input.diagnosisSession.designPlan.planning.runs.at(-1).proposals);
 const result=await runCounselingCombined(input,h.options);assert.equal(h.calls,1);assert.equal(h.analysis,0);
 assert.equal(result.diagnosisSession.hairSimulation.generatedAssets.length,6); assert.deepEqual(simulationResponseCounts(result.diagnosisSession),{real:1,mock:0}); // 6 logical slots, only 1 paid-request equivalent.
 assert.equal(result.diagnosisSession.designPlan.planning.corrections.length,0);
 for(const job of result.diagnosisSession.hairSimulation.jobs.filter(j=>j.label!=='MAIN'))assert.deepEqual(effectiveJobParameters(result.diagnosisSession,job),proposals.find(p=>p.label===job.label).parameters);
 const request=result.diagnosisSession.hairSimulation.events.find(e=>e.status==='GENERATING').request;
 assert.match(simulationInstructions(request),/縮毛矯正履歴を確認/);assert.match(simulationInstructions(request),/扱いやすい/);
});
test('saved result and changed output selection do not cause another analysis or image request',async()=>{
 const h=harness();let j=await runCounselingCombined(simulationFixture(),h.options);
 const c=j.diagnosisSession.hairSimulation.jobs.find(x=>x.label==='C');j=selectSimulationDesign(selectPlannedDesign(j,c.designId),c.id);
 const restored=JSON.parse(JSON.stringify(j)),result=await runCounselingCombined(restored,h.options);
 assert.equal(h.calls,1);assert.equal(h.analysis,0);assert.equal(result.diagnosisSession.hairSimulation.generatedAssets.length,6);assert.equal(result.diagnosisSession.designPlan.planning.selectedSelectionId,j.diagnosisSession.designPlan.planning.selectedSelectionId);
});
test('overlapping button entry points coalesce into a single execution',async()=>{
 const h=harness(),j=simulationFixture(),a=runCounselingCombined(j,h.options),b=runCounselingCombined(j,h.options);
 assert.equal(a,b);await Promise.all([a,b]);assert.equal(h.calls,1);
});
test('changed stylist request invalidates the generated result but reuses source analysis',async()=>{
 const h=harness();let j=await runCounselingCombined(simulationFixture(),h.options),old=j.diagnosisSession.hairSimulation.jobs.find(x=>x.label==='A');
 j=editCounseling(j,{requestNote:'顔周りは軽く、朝のスタイリングを短く'});assert.equal(simulationJobStatus(j.diagnosisSession,old),'STALE');
 const result=await runCounselingCombined(j,h.options);assert.equal(h.calls,2);assert.equal(h.analysis,0);assert.equal(result.diagnosisSession.photoAnalysis.runs.length,1);assert.equal(result.diagnosisSession.hairSimulation.generatedAssets.length,12);
 assert.match(JSON.stringify(generationContract(result.diagnosisSession).consultation),/朝のスタイリング/);
});
test('default generation preserves personalized proposals and actual stylist corrections without injecting presets',()=>{
 let j=simulationFixture(),run=j.diagnosisSession.designPlan.planning.runs.at(-1),d=run.proposals[0];
 j=setPlannedDesignDraft(j,d.id,{...d.parameters,bangDensity:'thick'});j=confirmPlannedDesignCorrection(j,d.id,'美容師の明示確認');
 const original=JSON.stringify(j.diagnosisSession.designPlan.planning);j=prepareCounselingGeneration(j);assert.equal(JSON.stringify(j.diagnosisSession.designPlan.planning),original);
});
test('measurement-driven designs vary with confirmed face proportions and keep measurement provenance',()=>{
 const a=simulationFixture();let b=correctObservedFace(a,'faceHeightWidthRatio',1.05);b=planBangFaceFrameDesigns(b);
 const first=a.diagnosisSession.designPlan.planning.runs.at(-1).proposals,second=b.diagnosisSession.designPlan.planning.runs.at(-1).proposals;
 assert.notDeepEqual(first.map(x=>x.parameters),second.map(x=>x.parameters));assert.equal(new Set(second.map(x=>JSON.stringify(x.parameters))).size,5);assert.ok(second.every(x=>x.usedMetrics.length&&x.sourceAnalysisIds.faceCorrectionIds.length));
 assert.ok(second.every(x=>x.planningMetadata.validation==='UNVALIDATED'));
});
test('unconfirmed COLOR stops before analysis and before provider execution',async()=>{
 const h=harness(),j=simulationFixture();j.target.confirmedAdjustmentId=null;
 await assert.rejects(runCounselingCombined(j,h.options),/COLOR|確定/);assert.equal(h.calls,0);assert.equal(h.analysis,0);
});
test('unknown provider outcome is retained and the combined button never automatically resends',async()=>{
 const h=harness();let attempts=0;const options={...h.options,compare:(j,o)=>runCounselingComparison(j,{...o,request:async()=>{attempts++;throw new SimulationTransportError('接続中断・課金不明','connection_error',true,true);}})};
 const j=await runCounselingCombined(simulationFixture(),options);assert.equal(attempts,1);
 await assert.rejects(runCounselingCombined(j,options),/課金結果|再試行/);assert.equal(attempts,1);
});
test('save failure stops before any image request and retains caller data',async()=>{
 const h=harness(),j=simulationFixture(),before=JSON.stringify(j);
 await assert.rejects(runCounselingCombined(j,{...h.options,persist:async()=>{throw Error('storage failed');}}),/storage failed/);assert.equal(h.calls,0);assert.equal(JSON.stringify(j),before);
});
test('misaligned crop coordinates are rejected instead of adopting a shifted face',()=>{
 let j=queueSimulationBatch(simulationFixture()),main=j.diagnosisSession.hairSimulation.jobs.find(x=>x.label==='MAIN');j=beginSimulationJob(j,main.id);const e=latestSimulationEvent(j.diagnosisSession,main.id),result=output(e.request);result.images[2].crop.x--;
 assert.throws(()=>applyCounselingComparison(j,result),/切り出し/);assert.equal(j.diagnosisSession.hairSimulation.generatedAssets.length,0);
});
test('combined five-image selection and explicit review retain Page2/Page3 handoff after storage reload',async()=>{
 const h=harness(),store=memoryJourneyStore(catalog);let j=await runCounselingCombined(simulationFixture(),h.options);const e=j.diagnosisSession.hairSimulation.jobs.find(x=>x.label==='E');
 j=selectSimulationDesign(selectPlannedDesign(j,e.designId),e.id);assert.equal(counselingFinalDesign(j),null);
 j=reviewSimulation(j,latestSimulationEvent(j.diagnosisSession,e.id).id,{decision:'ACCEPTED',identity:'CONFIRMED',background:'CONFIRMED',color:'CONFIRMED',design:'CONFIRMED',note:'Synthetic transport regression only; not actual image-quality verification'});
 const chosen=counselingFinalDesign(j).dataUrl;
 j=calculateProDesignRecipes(ensureProDesign(j,catalog),catalog);j=selectProRecipe(j,currentRecipeSet(j).recipes[0].id);for(const family of ['BEIGE','GREIGE','BROWN'])j=toggleNextColor(j,family);j=editStylistMessage(j,'架空の回帰テスト');j=editProDesign(j,{message:{...j.diagnosisSession.proDesign.message,reviewedAt:new Date().toISOString()}});j=confirmProDesign(j);j=await store.save(j);
 const restored=await store.load(j.id);assert.equal(supportView(restored).finalImage,chosen);assert.equal(h.calls,1);
});


test('COLOR confirmation performs local rendering and zero network/image-generation calls',async()=>{
 const j=simulationFixture(),draft=targetDraft(j),previous=globalThis.fetch;let calls=0,renders=0;
 globalThis.fetch=async()=>{calls++;throw Error('COLOR confirm must stay local');};
 try{const result=await confirmColorModal(j,j.photos[0],draft,{width:60,height:90},{width:60,height:90},false,new AbortController().signal,async()=>{renders++;return {dataUrl:j.target.reference.dataUrl,width:60,height:90,sourceLab:{L:48,a:11,b:22},adjustedLab:{L:58,a:3,b:18},clippedPixelFraction:0};});
 assert.ok(result.journey.target.confirmedAdjustmentId);assert.equal(calls,0);assert.equal(renders,1);
 }finally{globalThis.fetch=previous;}
});


test('explicit retry after failure sends just one new comparison request',async()=>{
 const h=harness();let attempts=0,fail=true;
 const opts={...h.options,compare:(j,o)=>runCounselingComparison(j,{...o,request:async r=>{attempts++;if(fail)throw new SimulationTransportError('provider failure','provider_error',false,true);return output(r);}})};
 let j=await runCounselingCombined(simulationFixture(),opts);fail=false;
 j=await runCounselingCombined(j,{...opts,retryComparison:true});assert.equal(attempts,2);assert.equal(j.diagnosisSession.hairSimulation.generatedAssets.length,6);
});

test('failed face analysis is saved, not re-run or invented; manual ratio enables the same workflow',async()=>{
 const base=simulationFixture(),{withDiagnosisSession}=await import('../src/lib/session-adapter.ts');let j=withDiagnosisSession({...base,diagnosisSession:undefined});
 const h=harness();let analysis=0;
 const opts={...h.options,analyze:async current=>{analysis++;return {...structuredClone(base.diagnosisSession.photoAnalysis.runs[0]),id:'failed-local-vision',parentSessionId:current.diagnosisSession.id,status:'FAILED',photos:[],hairEstimateId:null,faceEstimateId:null,representativeColorPhotoId:null,representativeFacePhotoId:null};}};
 await assert.rejects(runCounselingCombined(j,opts),/未解析|手動確認/);assert.equal(analysis,1);assert.equal(h.calls,0);j=h.saved;
 await assert.rejects(runCounselingCombined(j,opts),/未解析|手動確認/);assert.equal(analysis,1);
 j=correctObservedFace(h.saved,'faceHeightWidthRatio',1.3);j=await runCounselingCombined(j,opts);assert.equal(h.calls,1);assert.equal(analysis,1);
 assert.equal(j.diagnosisSession.faceBoneAnalysis.activeEstimateId,null);assert.equal(j.diagnosisSession.faceBoneAnalysis.stylistCorrection.at(-1).value.sourceType,'STYLIST_CORRECTED');
});
