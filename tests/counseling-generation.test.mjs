import test from 'node:test';
import assert from 'node:assert/strict';
import {simulationFixture,fixtureResponse,png,pngHash} from './helpers/simulation-fixture.mjs';
import {catalog} from '../src/lib/catalog.ts';
import {withDiagnosisSession} from '../src/lib/session-adapter.ts';
import {memoryJourneyStore} from '../src/lib/journey-store.ts';
import {prepareCounselingGeneration,prepareCounselingSimulation,counselingGeneratedDesign,counselingFinalDesign,counselingGenerationJob,counselingPreferredDesignLabels,alignCounselingSelection} from '../src/lib/counseling-generation.ts';
import {activePlanningRun} from '../src/lib/design-planning-projection.ts';
import {selectPlannedDesign,setPlannedDesignDraft,confirmPlannedDesignCorrection} from '../src/lib/design-planning-session.ts';
import {queueSimulationBatch,beginSimulationJob,completeSimulationJob,selectSimulationDesign} from '../src/lib/hair-simulation-session.ts';
import {runSimulationJobs} from '../src/lib/hair-simulation-pipeline.ts';
import {activeSimulationBatch,latestSimulationEvent,simulationJobStatus} from '../src/lib/hair-simulation-context.ts';
import {simulationInstructions} from '../src/lib/hair-simulation-instructions.ts';
import {simulationFormData,simulationClient,SimulationTransportError} from '../src/lib/hair-simulation-client.ts';
import {protectGeneratedHair,confidenceHairMask,protectedFaceMask} from '../src/lib/counseling-generation-protection.ts';
import {validateDiagnosisSession} from '../src/lib/session-validation.ts';
import {handleSimulationGenerate,clearSimulationRequestCache,MAX_SIMULATION_TOTAL_BYTES} from '../src/lib/hair-simulation-api.ts';
import worker from '../site-worker/index.ts';
const jobs=j=>j.diagnosisSession.hairSimulation.jobs;
const latest=(j,job)=>latestSimulationEvent(j.diagnosisSession,job.id);

test('Page 1 explicit A–E are distinct stylist corrections; AI proposals and unknown measurements remain unchanged',()=>{
 const input=simulationFixture(),ai=JSON.stringify(input.diagnosisSession.designPlan.planning.runs),j=prepareCounselingGeneration(input,{legacyFixedDirections:true});
 assert.equal(JSON.stringify(j.diagnosisSession.designPlan.planning.runs),ai);
 const edits=j.diagnosisSession.designPlan.planning.corrections;assert.equal(edits.length,5);assert.ok(edits.every(e=>e.sourceType==='STYLIST_CORRECTED'));
 assert.deepEqual(edits.map(e=>e.parameters.bangPart),['none','none','center','left','none']);assert.equal(new Set(edits.map(e=>JSON.stringify(e.parameters))).size,5);
 assert.equal(j.diagnosisSession.faceBoneAnalysis.aiEstimate.at(-1).metrics.hairlinePosition.value,null);validateDiagnosisSession(j.diagnosisSession);
});
test('applying approved directions only once preserves subsequent stylist edits',()=>{
 let j=prepareCounselingGeneration(simulationFixture(),{legacyFixedDirections:true}),d=activePlanningRun(j.diagnosisSession).proposals[0];
 j=setPlannedDesignDraft(j,d.id,{...j.diagnosisSession.designPlan.planning.corrections[0].parameters,bangLength:'eye'});j=confirmPlannedDesignCorrection(j,d.id);
 assert.deepEqual(prepareCounselingGeneration(j),j);
});
test('Page 1 combined generation refuses missing person, STYLE and unconfirmed COLOR',()=>{
 const j=simulationFixture();const missing=[{...j,photos:[]},{...j,target:{...j.target,styleReference:null}},{...j,target:{...j.target,confirmedAdjustmentId:null}}];
 for(const x of missing)assert.throws(()=>prepareCounselingGeneration(x),/CURRENT|STYLE|COLOR|写真|確定/);
});
test('combined Page 1 requires both axes while legacy STYLE-only and COLOR-only generation stay separate',()=>{
 assert.throws(()=>prepareCounselingGeneration(simulationFixture('STYLE_ONLY')),/髪型＋カラー/);
 const style=queueSimulationBatch(prepareCounselingSimulation(simulationFixture('STYLE_ONLY')));assert.equal(jobs(style).length,6);assert.equal(activeSimulationBatch(style.diagnosisSession).snapshot.contract.colorTarget,null);
 const color=queueSimulationBatch(prepareCounselingSimulation(simulationFixture('COLOR_ONLY')));assert.equal(jobs(color).length,1);assert.equal(activeSimulationBatch(color.diagnosisSession).snapshot.contract.styleTarget,null);
});
test('MAIN + five transport-fixture children share STYLE/COLOR and use persisted parent bytes with explicit fringe differences',async()=>{
 const store=memoryJourneyStore(catalog);let main=null;const seen=[];
 const j=await runSimulationJobs(prepareCounselingGeneration(simulationFixture(),{legacyFixedDirections:true}),{persist:j=>store.save(j),transport:async(r,snapshot,parent)=>{seen.push(r);if(r.parentMode==='IMAGE_EDIT'){assert.equal(parent.sha256,pngHash);assert.deepEqual(r.contract.colorTarget,main.contract.colorTarget);assert.deepEqual(r.contract.styleTarget,main.contract.styleTarget);assert.equal(simulationFormData(r,snapshot,parent).get('parentImage').type,'image/png');}else main=r;return fixtureResponse(r);}});
 assert.equal(seen.length,6);assert.equal(new Set(seen.slice(1).map(r=>JSON.stringify(r.contract.planningVariant.designParameters))).size,5);
 assert.match(simulationInstructions(seen[3]),/center-parted/);assert.match(simulationInstructions(seen[5]),/wide fringe|full dense fringe/);assert.match(simulationInstructions(seen[1]),/Do not simply repeat/);
 assert.equal(counselingGeneratedDesign(j,'A'),null);assert.equal(counselingFinalDesign(j),null);
});
test('one failed child retains the other five assets and sends only that child on manual retry',async()=>{
 const store=memoryJourneyStore(catalog);let fail=true,calls=0;const opts={persist:j=>store.save(j),transport:async r=>{calls++;if(r.contract.design.label==='D'&&fail)throw new SimulationTransportError('fixture failure');return fixtureResponse(r);}};
 let j=await runSimulationJobs(prepareCounselingGeneration(simulationFixture()),opts);assert.equal(j.diagnosisSession.hairSimulation.generatedAssets.length,5);
 const d=counselingGenerationJob(j,'D');assert.equal(simulationJobStatus(j.diagnosisSession,d),'FAILED');fail=false;const before=calls;j=await runSimulationJobs(j,opts,d.id);assert.equal(calls-before,1);assert.equal(j.diagnosisSession.hairSimulation.generatedAssets.length,6);
});
test('synthetic origin branch: selection and final asset agree; changed COLOR never exposes stale result as current',async()=>{
 // No API call. REAL_API metadata is synthetic only to exercise the display selector branch.
 const store=memoryJourneyStore(catalog);let j=await runSimulationJobs(prepareCounselingGeneration(simulationFixture()),{persist:j=>store.save(j),transport:async r=>fixtureResponse(r,'REAL_API')});
 assert.deepEqual(counselingPreferredDesignLabels(j),['A','B','C','D','E']);const c=counselingGenerationJob(j,'C');j=selectPlannedDesign(j,c.designId);j=selectSimulationDesign(j,c.id);
 assert.deepEqual(counselingPreferredDesignLabels(j),['C']);assert.equal(counselingFinalDesign(j).id,counselingGeneratedDesign(j,'C').id);
 const e=counselingGenerationJob(j,'E');j=alignCounselingSelection(selectPlannedDesign(j,e.designId));const selection=j.diagnosisSession.hairSimulation.selections.at(-1);assert.equal(selection.assetId,counselingFinalDesign(j).id);assert.equal(selection.designId,e.designId);assert.deepEqual(alignCounselingSelection(j),j);
 const changed=withDiagnosisSession({...j,target:{...j.target,text:'different target'}},catalog);assert.equal(counselingFinalDesign(changed),null);assert.equal(changed.diagnosisSession.hairSimulation.generatedAssets.length,6);
});
test('hair compositing preserves all face, skin, background and alpha bytes outside estimated hair',()=>{
 const w=6,h=6,n=w*h,original=new Uint8ClampedArray(n*4),generated=new Uint8ClampedArray(n*4),hair=new Uint8Array(n),face=new Uint8Array(n);
 for(let i=0;i<n;i++){original.set([50+i,80,120,100+i],i*4);generated.set([200,130,90,255],i*4);if(i%w<3)hair[i]=255;if(i===14)face[i]=255;}
 const out=protectGeneratedHair(original,generated,w,h,hair,hair,face,null);
 for(let i=0;i<n;i++){assert.equal(out[i*4+3],original[i*4+3]);if(!hair[i]||face[i])assert.deepEqual(out.slice(i*4,i*4+4),original.slice(i*4,i*4+4));else assert.equal(out[i*4],200);}
});
test('missing hair or face detection fails closed and does not fall back to a whole-image filter',()=>{
 const a=new Uint8ClampedArray(4*4*4),m=new Uint8Array(16);assert.throws(()=>protectGeneratedHair(a,a,4,4,m,m,m,null),/検証/);
 assert.throws(()=>confidenceHairMask({hairConfidence:null},4,4),/取得/);assert.throws(()=>protectedFaceMask([],4,4),/不足/);
 const hair=confidenceHairMask({hairConfidence:new Float32Array(16).fill(.99),maskWidth:4,maskHeight:4},4,4);assert.equal([...hair].filter(Boolean).length,4);
});
test('client verifies returned contract and SHA before optional hair-protection postprocessing',async()=>{
 let j=queueSimulationBatch(simulationFixture()),job=jobs(j)[0];j=beginSimulationJob(j,job.id);const e=latest(j,job),response=fixtureResponse(e.request);let called=0;
 const opts={decoder:async()=>({width:1,height:1}),postprocess:async x=>{called++;return x;}};
 await simulationClient({...opts,fetcher:async()=>Response.json(response)})(e.request,e.inputSnapshot,null);assert.equal(called,1);
 await assert.rejects(simulationClient({...opts,fetcher:async()=>Response.json({...response,generation:{...response.generation,sha256:'a'.repeat(64)}})})(e.request,e.inputSnapshot,null),/bytes/);assert.equal(called,1);
});
test('synthetic protected result stores provider original separately and validates its target/hash provenance',()=>{
 let j=queueSimulationBatch(simulationFixture()),job=jobs(j)[0];j=beginSimulationJob(j,job.id);const e=latest(j,job),result=fixtureResponse(e.request,'REAL_API');
 result.providerOriginalImage={dataUrl:png,sha256:pngHash,width:1,height:1};result.generation.postprocessing={version:'hair-only-protection-v1',providerSha256:pngHash,currentOriginalSha256:pngHash,maskSource:'AI_ESTIMATE',facePixelsPreserved:true,nonHairPixelsPreserved:true,targetColorId:e.request.contract.colorTarget.id,targetConfirmationId:e.request.contract.colorTarget.confirmedAdjustmentId,quality:'NEEDS_STYLIST_REVIEW'};
 j=completeSimulationJob(j,job.id,result);validateDiagnosisSession(j.diagnosisSession);assert.deepEqual(j.diagnosisSession.hairSimulation.generatedAssets[0].providerOriginalImage,result.providerOriginalImage);
 const bad=structuredClone(j.diagnosisSession);bad.hairSimulation.generatedAssets[0].providerOriginalImage.sha256='a'.repeat(64);assert.throws(()=>validateDiagnosisSession(bad),/原本/);
});
test('Worker connection GET contains configuration status but never its key',async()=>{
 const r=await worker.fetch(new Request('https://unit.test/api/generate'),{OPENAI_API_KEY:'UNIT_TEST_NOT_A_SECRET'}),body=await r.text();assert.equal(r.status,200);assert.equal(JSON.parse(body).configured,true);assert.doesNotMatch(body,/UNIT_TEST_NOT_A_SECRET/);
});
test('Worker blocks unauthenticated and cross-origin writes before reading the body or requesting the provider',async()=>{
 const request=headers=>new Request('https://unit.test/api/generate',{method:'POST',headers,body:'invalid'});
 assert.equal((await worker.fetch(request({}),{OPENAI_API_KEY:'UNIT_TEST'})).status,401);
 assert.equal((await worker.fetch(request({'oai-authenticated-user-id':'fixture','origin':'https://other.test'}),{OPENAI_API_KEY:'UNIT_TEST'})).status,403);
});
test('Worker no-key mode returns explicit 503 without external generation',async()=>{
 const r=await worker.fetch(new Request('https://unit.test/api/generate',{method:'POST',headers:{'oai-authenticated-user-id':'fixture'},body:'invalid'}),{}),b=await r.json();assert.equal(r.status,503);assert.equal(b.providerAttempted,false);assert.match(b.error,/未設定/);
});
test('Worker preserves asset routing and rejects unsupported or oversized generation requests',async()=>{
 assert.equal(await (await worker.fetch(new Request('https://unit.test/'),{ASSETS:{fetch:async()=>new Response('assets')}})).text(),'assets');
 assert.equal((await worker.fetch(new Request('https://unit.test/api/generate',{method:'DELETE'}),{})).status,405);
 const r=await worker.fetch(new Request('https://unit.test/api/generate',{method:'POST',headers:{'oai-authenticated-user-id':'fixture','content-length':String(MAX_SIMULATION_TOTAL_BYTES+3*1024*1024)}}),{OPENAI_API_KEY:'UNIT_TEST'});assert.equal(r.status,413);
});
test('formal runtime adapter uses server environment and provider fixture; multi-image roles/model omit unsupported input_fidelity',async()=>{
 clearSimulationRequestCache();let j=queueSimulationBatch(simulationFixture()),job=jobs(j)[0];j=beginSimulationJob(j,job.id);const e=latest(j,job),form=simulationFormData(e.request,e.inputSnapshot,null);let calls=0;
 const r=await handleSimulationGenerate(new Request('https://unit.test/api/generate',{method:'POST',body:form}),form,{runtime:{apiKey:'UNIT_TEST_NOT_A_SECRET'},origin:'MOCK_TRANSPORT_FIXTURE',providerFetch:async(_url,opt)=>{calls++;assert.equal(opt.body.get('model'),'gpt-image-2');assert.equal(opt.body.has('input_fidelity'),false);assert.deepEqual(opt.body.getAll('image[]').map(i=>i.name),['current.png','style.png','color.png']);return Response.json({data:[{b64_json:png.split(',')[1]}]});}});
 assert.equal(r.status,200);assert.equal(calls,1);assert.equal((await r.json()).generation.origin,'MOCK_TRANSPORT_FIXTURE');clearSimulationRequestCache();
});
