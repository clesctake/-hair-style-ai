import test from 'node:test';
import assert from 'node:assert/strict';
import {simulationFixture,fixtureResponse,png,pngHash} from './helpers/simulation-fixture.mjs';
import {catalog} from '../src/lib/catalog.ts';
import {withDiagnosisSession} from '../src/lib/session-adapter.ts';
import {memoryJourneyStore} from '../src/lib/journey-store.ts';
import {queueSimulationBatch,beginSimulationJob,completeSimulationJob,failSimulationJob,recoverInterruptedSimulation,selectSimulationDesign,reviewSimulation} from '../src/lib/hair-simulation-session.ts';
import {activeSimulationBatch,latestSimulationEvent,simulationJobStatus,completedJobAsset,selectedSimulationAsset,stableJson} from '../src/lib/hair-simulation-context.ts';
import {validateDiagnosisSession,assertSessionHistory} from '../src/lib/session-validation.ts';
import {validateSimulationRequest} from '../src/lib/hair-simulation-validation.ts';
import {runSimulationJobs,resumeSimulationBatch} from '../src/lib/hair-simulation-pipeline.ts';
import {simulationFormData,simulationClient,SimulationTransportError} from '../src/lib/hair-simulation-client.ts';
import {handleSimulationGenerate,clearSimulationRequestCache,simulationConnection} from '../src/lib/hair-simulation-api.ts';
import {simulationInstructions} from '../src/lib/hair-simulation-instructions.ts';
import {setPlannedDesignDraft,confirmPlannedDesignCorrection,selectPlannedDesign} from '../src/lib/design-planning-session.ts';
import {FeatureRegistry} from '../src/lib/feature-registry.ts';
import {hairImageInput,hairImageProvenance} from '../src/lib/hair-images.ts';
const jobs=j=>j.diagnosisSession.hairSimulation.jobs;
const event=(j,job)=>latestSimulationEvent(j.diagnosisSession,job.id);
function mainComplete(){let j=queueSimulationBatch(simulationFixture()),main=jobs(j)[0];j=beginSimulationJob(j,main.id);return completeSimulationJob(j,main.id,fixtureResponse(event(j,main).request));}
async function allComplete(){const store=memoryJourneyStore(catalog);return {store,j:await runSimulationJobs(simulationFixture(),{persist:j=>store.save(j),transport:async r=>fixtureResponse(r)})};}
const post=form=>new Request('http://localhost/api/generate',{method:'POST',body:form});
async function configured(fn){const key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='unit-test-placeholder';clearSimulationRequestCache();try{return await fn();}finally{if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;clearSimulationRequestCache();}}
const mockProvider=async()=>Response.json({data:[{b64_json:png.split(',')[1]}]},{headers:{'x-request-id':'mock-provider'}});

test('one MAIN and five distinct native DesignPlan child jobs share the session and parent design',()=>{
 const j=queueSimulationBatch(simulationFixture()),st=j.diagnosisSession.hairSimulation,b=activeSimulationBatch(j.diagnosisSession);
 assert.deepEqual(jobs(j).map(x=>x.label),['MAIN','A','B','C','D','E']);assert.ok(jobs(j).every(x=>x.parentSessionId===j.diagnosisSession.id));
 assert.ok(jobs(j).slice(1).every(x=>x.parentDesignId===b.mainDesignId));assert.equal(new Set(b.variantContracts.map(c=>stableJson(c.planningVariant.designParameters))).size,5);
 assert.equal(st.generatedAssets.length,0);validateDiagnosisSession(j.diagnosisSession);
});
test('COLOR_ONLY preserves current hairstyle and creates only MAIN, not unsolicited bangs',()=>{const j=queueSimulationBatch(simulationFixture('COLOR_ONLY'));assert.equal(jobs(j).length,1);assert.equal(activeSimulationBatch(j.diagnosisSession).snapshot.contract.styleTarget,null);});
test('unconfirmed or pending COLOR cannot reach the generation pipeline',()=>{
 const j=simulationFixture();j.target.adjustmentDraft.controls.target_lightness++;assert.throws(()=>queueSimulationBatch(withDiagnosisSession(j,catalog)),/再確定|確定/);
 const missing=simulationFixture();missing.target.adjustmentDraft=null;missing.target.confirmedAdjustmentId=null;assert.throws(()=>queueSimulationBatch(withDiagnosisSession(missing,catalog)),/確定/);
});
test('same-input bulk regeneration is blocked without erasing the previous batch',()=>{const j=mainComplete();assert.throws(()=>queueSimulationBatch(j),/既に/);assert.equal(j.diagnosisSession.hairSimulation.batches.length,1);});
test('a child cannot start before MAIN is complete and its image is stored',()=>{const j=queueSimulationBatch(simulationFixture());assert.throws(()=>beginSimulationJob(j,jobs(j)[1].id),/MAIN親画像/);});
test('MAIN completion stores the image, input snapshot, null seed and common projection',()=>{
 const j=mainComplete(),st=j.diagnosisSession.hairSimulation,e=event(j,jobs(j)[0]);assert.equal(e.status,'COMPLETE');assert.equal(e.metadata.seed,null);
 assert.equal(st.generatedAssets[0].reference.sourceType,'MOCK');assert.equal(j.diagnosisSession.designPlan.mainDesign.generationStatus,'SUCCEEDED');
 assert.equal(e.inputSnapshot.photos[e.request.contract.currentPhoto.imageId].representation,'original_file_bytes');assert.equal(j.diagnosisSession.simulations.length,1);
});
test('every child uses the saved MAIN image bytes, exact parent event, common STYLE and confirmed COLOR',()=>{
 let j=mainComplete(),main=jobs(j)[0],parent=event(j,main),mainAsset=completedJobAsset(j.diagnosisSession,main.id),base=activeSimulationBatch(j.diagnosisSession).snapshot.contract;
 for(const child of jobs(j).slice(1)){j=beginSimulationJob(j,child.id);const e=event(j,child),r=e.request,form=simulationFormData(r,e.inputSnapshot,mainAsset);
  assert.equal(r.parentMode,'IMAGE_EDIT');assert.equal(r.parentGenerationId,parent.id);assert.equal(r.parentAsset.sha256,pngHash);assert.deepEqual(r.contract.styleTarget,base.styleTarget);assert.deepEqual(r.contract.colorTarget,base.colorTarget);assert.deepEqual(r.contract.currentPhoto,base.currentPhoto);
  assert.equal(form.get('parentImage').size,Buffer.from(png.split(',')[1],'base64').length);assert.equal(r.contract.effectiveColorReference.imageId,base.colorTarget.adjustedPreview.imageId);j=completeSimulationJob(j,child.id,fixtureResponse(r));
 }
 assert.equal(j.diagnosisSession.hairSimulation.generatedAssets.length,6);
});
test('the sequential pipeline persists each result before sending its dependent child',async()=>{
 const store=memoryJourneyStore(catalog),calls=[];let persisted=null;
 const j=await runSimulationJobs(simulationFixture(),{persist:async j=>{persisted=await store.save(j);return persisted;},transport:async(r,_s,parent)=>{calls.push(r);if(r.parentMode==='IMAGE_EDIT'){assert.ok(persisted.diagnosisSession.hairSimulation.generatedAssets.some(x=>x.id===parent.id));assert.equal(parent.sha256,pngHash);}return fixtureResponse(r);}});
 assert.equal(calls.length,6);assert.equal(calls[0].parentMode,'NONE');assert.equal(j.diagnosisSession.hairSimulation.generatedAssets.length,6);
});
test('save failure after MAIN prevents all child requests',async()=>{
 const store=memoryJourneyStore(catalog);let sends=0;
 await assert.rejects(runSimulationJobs(simulationFixture(),{persist:async j=>{if(j.diagnosisSession.hairSimulation.generatedAssets.length)throw new Error('capacity');return store.save(j);},transport:async r=>{sends++;return fixtureResponse(r);}}),/capacity/);assert.equal(sends,1);
});
test('a child failure keeps all other images and an individual retry sends only that child',async()=>{
 const store=memoryJourneyStore(catalog),calls=[];let fail=true;
 const options={persist:j=>store.save(j),transport:async r=>{calls.push(r.designId);if(r.contract.design.label==='D'&&fail)throw new SimulationTransportError('MOCK failure','test_failure');return fixtureResponse(r);}};
 let j=await runSimulationJobs(simulationFixture(),options),d=jobs(j).find(x=>x.label==='D');assert.equal(j.diagnosisSession.hairSimulation.generatedAssets.length,5);assert.equal(event(j,d).status,'FAILED');
 fail=false;const before=calls.length;j=await runSimulationJobs(j,options,d.id);assert.equal(calls.length-before,1);assert.equal(event(j,d).retryCount,1);assert.equal(j.diagnosisSession.hairSimulation.generatedAssets.length,6);
});
test('MAIN failure sends no children and manual resume completes the remaining jobs',async()=>{
 const store=memoryJourneyStore(catalog);let sends=0,fail=true;const options={persist:j=>store.save(j),transport:async r=>{sends++;if(fail)throw new SimulationTransportError('MAIN failed');return fixtureResponse(r);}};
 let j=await runSimulationJobs(simulationFixture(),options);assert.equal(sends,1);assert.ok(jobs(j).slice(1).every(x=>simulationJobStatus(j.diagnosisSession,x)==='NOT_STARTED'));
 fail=false;j=await resumeSimulationBatch(j,options);assert.equal(sends,7);assert.equal(j.diagnosisSession.hairSimulation.generatedAssets.length,6);
});
test('retry limits are real job attempts and never silently resend',()=>{let j=queueSimulationBatch(simulationFixture()),job=jobs(j)[0];for(let i=0;i<3;i++){j=beginSimulationJob(j,job.id);j=failSimulationJob(j,job.id,'failed');}assert.throws(()=>beginSimulationJob(j,job.id),/2回/);assert.equal(j.diagnosisSession.hairSimulation.events.filter(x=>x.status==='GENERATING').length,3);});
test('reload recovers interrupted work as uncertain failure without creating a new request',()=>{let j=queueSimulationBatch(simulationFixture()),job=jobs(j)[0];j=beginSimulationJob(j,job.id);const count=j.diagnosisSession.hairSimulation.events.length;j=recoverInterruptedSimulation(j);assert.equal(event(j,job).status,'FAILED');assert.equal(event(j,job).error.outcomeUnknown,true);assert.equal(j.diagnosisSession.hairSimulation.events.length,count+1);});
test('selecting one result persists an exact image/event reference and leaves AI proposals intact',async()=>{
 let {j,store}=await allComplete();const raw=JSON.stringify(j.diagnosisSession.designPlan.planning.runs),job=jobs(j)[2];j=selectSimulationDesign(j,job.id);j=await store.save(j);const loaded=await store.load(j.id);
 assert.equal(selectedSimulationAsset(loaded.diagnosisSession).eventId,event(loaded,job).id);assert.equal(loaded.diagnosisSession.designPlan.selectedDesignId,job.designId);assert.equal(JSON.stringify(loaded.diagnosisSession.designPlan.planning.runs),raw);
});
test('a saved correction makes only its child stale and regenerates only that child',async()=>{
 let {j,store}=await allComplete();const job=jobs(j)[2],aiRaw=JSON.stringify(j.diagnosisSession.designPlan.planning.runs),design=j.diagnosisSession.designPlan.bangFaceFrameDesigns.find(x=>x.id===job.designId);
 j=selectSimulationDesign(j,job.id);j=setPlannedDesignDraft(j,job.designId,{...design.parameters,bangDensity:design.parameters.bangDensity==='thick'?'thin':'thick'});j=confirmPlannedDesignCorrection(j,job.designId);j=await store.save(j);
 assert.equal(simulationJobStatus(j.diagnosisSession,job),'STALE');assert.equal(selectedSimulationAsset(j.diagnosisSession),null);assert.ok(jobs(j).filter(x=>x.id!==job.id).every(x=>simulationJobStatus(j.diagnosisSession,x)==='COMPLETE'));
 let sends=0;j=await runSimulationJobs(j,{persist:j=>store.save(j),transport:async r=>{sends++;assert.equal(r.jobId,job.id);assert.equal(r.contract.planningVariant.designParameters.bangDensity,design.parameters.bangDensity==='thick'?'thin':'thick');return fixtureResponse(r);}},job.id);
 assert.equal(sends,1);assert.equal(j.diagnosisSession.hairSimulation.generatedAssets.length,7);assert.equal(JSON.stringify(j.diagnosisSession.designPlan.planning.runs),aiRaw);assert.equal(selectedSimulationAsset(j.diagnosisSession),null);
 j=selectSimulationDesign(j,job.id);assert.equal(selectedSimulationAsset(j.diagnosisSession).eventId,event(j,job).id);
});
test('changed COLOR invalidates every old result while preserving its images and snapshots',async()=>{
 const {j}=await allComplete(),raw=JSON.stringify(j.diagnosisSession.hairSimulation.events);const next=withDiagnosisSession({...j,target:{...j.target,text:'別の色へ'}},catalog);
 assert.ok(jobs(next).every(x=>simulationJobStatus(next.diagnosisSession,x)==='STALE'));assert.equal(next.diagnosisSession.hairSimulation.generatedAssets.length,6);assert.equal(JSON.stringify(next.diagnosisSession.hairSimulation.events),raw);
});
test('a changed STYLE creates a fresh batch and retains the complete former generation history',async()=>{
 let {j}=await allComplete();j=withDiagnosisSession({...j,target:{...j.target,style:'新しいレイヤー'}},catalog);j=queueSimulationBatch((await import('../src/lib/design-planning-session.ts')).planBangFaceFrameDesigns(j));
 assert.equal(j.diagnosisSession.hairSimulation.batches.length,2);assert.equal(jobs(j).length,12);assert.equal(j.diagnosisSession.hairSimulation.generatedAssets.length,6);
});
test('history protection rejects modified assets, events and dropped simulation records',()=>{const j=mainComplete();for(const key of ['batches','jobs','events','generatedAssets']){const bad=structuredClone(j.diagnosisSession);bad.hairSimulation[key]=[];assert.throws(()=>assertSessionHistory(j.diagnosisSession,bad),/生成原本/);}});
test('incorrect response IDs or fake seed cannot complete a job',()=>{let j=queueSimulationBatch(simulationFixture()),job=jobs(j)[0];j=beginSimulationJob(j,job.id);const result=fixtureResponse(event(j,job).request);assert.throws(()=>completeSimulationJob(j,job.id,{...result,requestId:'other'}),/一致/);assert.throws(()=>completeSimulationJob(j,job.id,{...result,generation:{...result.generation,seed:12}}),/出所/);});
test('MOCK transport assets stay MOCK and registry generation stays PARTIAL even after success',()=>{const j=mainComplete();assert.equal(j.diagnosisSession.hairSimulation.generatedAssets[0].origin,'MOCK_TRANSPORT_FIXTURE');assert.equal(FeatureRegistry.mainDesignGeneration.state,'PARTIAL');assert.equal(FeatureRegistry.bangFaceFrameGeneration.state,'PARTIAL');assert.equal(FeatureRegistry.simulationJobManagement.state,'REAL');});
test('human rejection is stored separately from API success and prevents adoption',()=>{let j=mainComplete(),job=jobs(j)[0];j=selectSimulationDesign(j,job.id);j=reviewSimulation(j,event(j,job).id,{decision:'REJECTED',identity:'CONCERN',background:'NOT_REVIEWED',color:'NOT_REVIEWED',design:'NOT_REVIEWED',note:'本人維持を再確認'});assert.equal(event(j,job).status,'COMPLETE');assert.equal(selectedSimulationAsset(j.diagnosisSession),null);assert.throws(()=>selectSimulationDesign(j,job.id),/完了した/);});
test('explicit STYLE_ONLY is preserved when a native design is selected',()=>{let j=simulationFixture('STYLE_ONLY'),d=j.diagnosisSession.designPlan.bangFaceFrameDesigns[0];j=selectPlannedDesign(j,d.id);assert.equal(j.diagnosisSession.simulationMode,'STYLE_ONLY');});
test('client sends original bytes and rejects a display-only CURRENT input',()=>{let j=queueSimulationBatch(simulationFixture()),job=jobs(j)[0];j=beginSimulationJob(j,job.id);const e=event(j,job),form=simulationFormData(e.request,e.inputSnapshot,null);assert.equal(form.get('image').size,Buffer.from(png.split(',')[1],'base64').length);const bad=structuredClone(e.inputSnapshot);bad.photos[e.request.contract.currentPhoto.imageId].representation='preview';assert.throws(()=>simulationFormData(e.request,bad,null),/縮小画像/);});
test('API and client verify the stored MAIN parent hash rather than trusting its name',async()=>configured(async()=>{
 let j=mainComplete(),job=jobs(j)[1];j=beginSimulationJob(j,job.id);const e=event(j,job),parent=completedJobAsset(j.diagnosisSession,jobs(j)[0].id),r=structuredClone(e.request);r.parentAsset.sha256='a'.repeat(64);
 assert.throws(()=>simulationFormData(r,e.inputSnapshot,parent),/MAIN親画像/);const form=simulationFormData(e.request,e.inputSnapshot,parent);form.set('generationRequest',JSON.stringify(r));const response=await handleSimulationGenerate(post(form),form,{providerFetch:()=>{throw new Error('must not send');},origin:'MOCK_TRANSPORT_FIXTURE'});assert.equal(response.status,400);
}));
test('DesignPlan parameter/source mismatches and reference role contamination are rejected',()=>{
 let j=mainComplete(),job=jobs(j)[1];j=beginSimulationJob(j,job.id);const r=event(j,job).request;
 for(const mutate of [c=>c.planningVariant.designParameters.bangWidth='wide',c=>c.planningVariant.sourceAnalysisIds.faceEstimateId='other',c=>c.effectiveColorReference.role='STYLE_REFERENCE']){const bad=structuredClone(r);mutate(bad.contract);if(stableJson(bad)!==stableJson(r))assert.throws(()=>validateSimulationRequest(bad),/一致|役割/);}
});
test('prompt uses shape-only STYLE, confirmed color-only COLOR and hair-only preservation without double filtering',()=>{const j=mainComplete(),r=event(j,jobs(j)[0]).request,text=simulationInstructions(r);assert.match(text,/SHAPE ONLY/i);assert.match(text,/COLOR ONLY|HAIR COLOR/i);assert.match(text,/Preserve.*identity/i);assert.match(text,/hair only/i);assert.match(text,/already been applied/i);assert.doesNotMatch(text,/whiten skin|younger face/i);});
test('missing key blocks formal route without external requests and never exposes credentials',async()=>{
 const old=process.env.OPENAI_API_KEY;delete process.env.OPENAI_API_KEY;try{const {GET,POST}=await import('../app/api/generate/route.js');const c=await (await GET()).json();assert.equal(c.configured,false);assert.equal(c.realGenerationVerified,false);const form=new FormData();form.set('generationRequest','{}');const r=await POST(post(form));assert.equal(r.status,503);assert.equal((await r.json()).providerAttempted,false);}finally{if(old!==undefined)process.env.OPENAI_API_KEY=old;}
});
test('formal API orders CURRENT/MAIN/STYLE/COLOR correctly, returns traced MOCK metadata and no synthetic seed',async()=>configured(async()=>{
 let j=mainComplete(),job=jobs(j)[1];j=beginSimulationJob(j,job.id);const e=event(j,job),form=simulationFormData(e.request,e.inputSnapshot,completedJobAsset(j.diagnosisSession,jobs(j)[0].id));let sent=0;
 const r=await handleSimulationGenerate(post(form),form,{origin:'MOCK_TRANSPORT_FIXTURE',providerFetch:async(_url,options)=>{sent++;assert.deepEqual(options.body.getAll('image[]').map(x=>x.name),['current.png','main.png','style.png','color.png']);assert.equal(options.body.get('n'),'1');return mockProvider();}}),value=await r.json();assert.equal(r.status,200);assert.equal(sent,1);assert.equal(value.generation.origin,'MOCK_TRANSPORT_FIXTURE');assert.equal(value.parentGenerationId,e.request.parentGenerationId);assert.equal(value.generation.sha256,pngHash);assert.equal(value.generation.seed,null);assert.equal(value.generation.usage,null);
}));
test('same request and input deduplicate in-process; changing that request input is rejected',async()=>configured(async()=>{
 let j=queueSimulationBatch(simulationFixture()),job=jobs(j)[0];j=beginSimulationJob(j,job.id);const e=event(j,job);let calls=0;const options={origin:'MOCK_TRANSPORT_FIXTURE',providerFetch:async()=>{calls++;return mockProvider();}};
 for(let n=0;n<2;n++){const f=simulationFormData(e.request,e.inputSnapshot,null);assert.equal((await handleSimulationGenerate(post(f),f,options)).status,200);}assert.equal(calls,1);
 const r=structuredClone(e.request);r.contract.styleTarget.requestText='changed';const f=simulationFormData(r,e.inputSnapshot,null);assert.equal((await handleSimulationGenerate(post(f),f,options)).status,409);assert.equal(calls,1);
}));
test('provider failure is sanitized and uncertain network failures remain recorded as uncertain',async()=>configured(async()=>{
 let j=queueSimulationBatch(simulationFixture()),job=jobs(j)[0];j=beginSimulationJob(j,job.id);const e=event(j,job);
 const cases=[{fetcher:async()=>Response.json({error:{message:'sensitive provider details'}},{status:401}),uncertain:false},{fetcher:async()=>{throw new Error('private URL');},uncertain:true}];
 for(const {fetcher,uncertain} of cases){clearSimulationRequestCache();const f=simulationFormData(e.request,e.inputSnapshot,null),r=await handleSimulationGenerate(post(f),f,{providerFetch:fetcher,origin:'MOCK_TRANSPORT_FIXTURE'}),data=await r.json();assert.equal(r.status,502);assert.doesNotMatch(JSON.stringify(data),/sensitive|private URL|unit-test-placeholder/);assert.equal(data.providerAttempted,true);assert.equal(data.outcomeUnknown??false,uncertain);}
}));
test('client response hash and parent/request IDs are checked before persistence',async()=>{
 let j=queueSimulationBatch(simulationFixture()),job=jobs(j)[0];j=beginSimulationJob(j,job.id);const e=event(j,job),response=fixtureResponse(e.request);
 for(const bad of [{...response,parentMode:'IMAGE_EDIT'},{...response,generation:{...response.generation,sha256:'a'.repeat(64)}}]){const transport=simulationClient({fetcher:async()=>Response.json(bad),decoder:async()=>({width:1,height:1})});await assert.rejects(transport(e.request,e.inputSnapshot,null),/契約|bytes/);}
 const client=simulationClient({fetcher:async()=>Response.json(response),decoder:async()=>({width:1,height:1})});assert.equal((await client(e.request,e.inputSnapshot,null)).generation.origin,'MOCK_TRANSPORT_FIXTURE');
});
test('DiagnosisSession revisions preserve legacy generation history and unknown chemistry values',async()=>{
 let initial=simulationFixture();const input=hairImageInput(initial),oldImage={...hairImageProvenance(input),id:'legacy-generation',origin:'openai_images_edit',model:'legacy-test-provider-fixture',promptVersion:'legacy-test-version',createdAt:initial.createdAt,requestId:null,dataUrl:png,width:1,height:1};initial.imageGenerations=[oldImage];
 const store=memoryJourneyStore(catalog),j=await runSimulationJobs(initial,{persist:j=>store.save(j),transport:async r=>fixtureResponse(r)}),loaded=await store.load(j.id);assert.deepEqual(loaded.imageGenerations,[oldImage]);assert.ok(loaded.diagnosisSession.simulations.some(s=>s.kind==='LEGACY_SINGLE'));assert.equal(loaded.diagnosisSession.colorPlan.zones.MID.requiredUnderLevel.value,null);assert.equal(loaded.diagnosisSession.hairAnalysis.aiEstimate.at(-1).zones.MID.damage.value,null);assert.equal(loaded.diagnosisSession.hairSimulation.generatedAssets.length,6);
});
test('persisted child common STYLE/COLOR and label contamination are rejected',()=>{const j=queueSimulationBatch(simulationFixture());for(const mutate of [st=>st.batches[0].variantContracts[0].colorTarget.adjustedColorParameters.beige++,st=>st.jobs[1].label='E']){const s=structuredClone(j.diagnosisSession);mutate(s.hairSimulation);assert.throws(()=>validateDiagnosisSession(s),/共通|対応/);}});
test('asset origin or hash cannot disagree with its completion metadata',()=>{const j=mainComplete();for(const mutate of [a=>a.origin='REAL_API',a=>a.sha256='a'.repeat(64)]){const s=structuredClone(j.diagnosisSession);mutate(s.hairSimulation.generatedAssets[0]);assert.throws(()=>validateDiagnosisSession(s),/出所/);}});
test('an event cannot silently substitute a different CURRENT snapshot',()=>{const j=mainComplete(),s=structuredClone(j.diagnosisSession),e=s.hairSimulation.events[0];e.inputSnapshot.photos[e.request.contract.currentPhoto.imageId].dataUrl='data:image/png;base64,YQ==';assert.throws(()=>validateDiagnosisSession(s),/スナップショット/);});
