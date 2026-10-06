import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog} from '../src/lib/catalog.ts';
import {newJourney} from '../src/lib/journey.ts';
import {withDiagnosisSession} from '../src/lib/session-adapter.ts';
import {memoryJourneyStore} from '../src/lib/journey-store.ts';
import {createDiagnosisSession,unknownValue,SPEC_VERSION} from '../src/lib/session-model.ts';
import {validateDiagnosisSession,assertSessionHistory} from '../src/lib/session-validation.ts';
import {effectiveFaceBoneValues} from '../src/lib/effective-face-values.ts';
import {resolveAnalysisInput} from '../src/lib/analysis-contract.ts';
import {photoPredictionResult,commitPhotoAnalysis,correctObservedFace,correctObservedHair} from '../src/lib/photo-analysis-pipeline.ts';
import {PHOTO_ANALYSIS_SCHEMA,ANALYSIS_PROVIDER,HAIR_MODEL,FACE_MODEL} from '../src/lib/photo-analysis-types.ts';
import {planBangFaceFrameDesigns,setCurrentHairContext,setPlannedDesignDraft,confirmPlannedDesignCorrection,selectPlannedDesign} from '../src/lib/design-planning-session.ts';
import {designPlanningInput,generateDesignPlanningRun} from '../src/lib/design-planning-engine.ts';
import {activePlanningRun,selectedPlannedDesign} from '../src/lib/design-planning-projection.ts';
import {generationContract,generationBatchContract} from '../src/lib/generation-contract.ts';
import {FeatureRegistry} from '../src/lib/feature-registry.ts';

// Explicit synthetic provider output for deterministic data fidelity tests.
// This fixture is not evidence of real model accuracy; browser integration runs the real models.
function fixture(){
 let j=newJourney();j.title='Phase 3 デザイン診断';j.target.style='顔周りをやわらかく';j.target.simulationMode='style_only';
 const dataUrl='data:image/png;base64,Zml4dHVyZQ==';
 j.photos=[{id:'phase3-front',view:'front',name:'front.png',createdAt:j.createdAt,dataUrl,width:60,height:90,original:{dataUrl,mimeType:'image/png',byteSize:7,width:320,height:480,representation:'original_file_bytes',colourProcessing:'none_app_applied',profile:'not_parsed'}}];j=withDiagnosisSession(j,catalog);
 const width=60,height=90,pixels=new Uint8ClampedArray(width*height*4),mask=new Float32Array(width*height);
 for(let i=0;i<width*height;i++){pixels.set([93,70,49,255],i*4);mask[i]=i%width>10&&i%width<50?.99:.01;}
 const points=Array.from({length:478},()=>({x:.5,y:.4,z:0}));
 for(const [i,x,y] of [[10,.5,.2],[152,.5,.8],[234,.3,.45],[454,.7,.45],[172,.37,.7],[397,.63,.7],[1,.5,.5],[2,.5,.58],[168,.5,.4],[33,.37,.42],[133,.43,.42],[362,.57,.42],[263,.63,.42],[70,.39,.35],[300,.61,.35]])points[i]={x,y,z:0};
 const input=resolveAnalysisInput(j),id='phase3-synthetic-analysis',photo=photoPredictionResult(input.photos[0],{pixels,width,height,originalWidth:320,originalHeight:480,originalSha256:'c'.repeat(64)},{hairConfidence:mask,maskWidth:width,maskHeight:height,faces:[points],errors:[]},id,j.createdAt);
 return commitPhotoAnalysis(j,{id,parentSessionId:j.diagnosisSession.id,createdAt:j.createdAt,schemaVersion:PHOTO_ANALYSIS_SCHEMA,provider:ANALYSIS_PROVIDER,hairModel:HAIR_MODEL,faceModel:FACE_MODEL,execution:'WORKER_CPU',status:'SUCCEEDED',inputPhotoIds:[j.photos[0].id],skipped:[],photos:[photo],hairEstimateId:`hair-estimate:${id}`,faceEstimateId:`face-estimate:${id}`,representativeColorPhotoId:j.photos[0].id,representativeFacePhotoId:j.photos[0].id});
}
const runOf=j=>activePlanningRun(j.diagnosisSession);

test('effective face values prefer current stylist correction and leave the AI raw measurements unchanged',()=>{
 let j=fixture(),raw=JSON.stringify(j.diagnosisSession.faceBoneAnalysis.aiEstimate),a=effectiveFaceBoneValues(j.diagnosisSession).faceHeightWidthRatio.value;
 j=correctObservedFace(j,'faceHeightWidthRatio',1.5);assert.notEqual(a,1.5);assert.equal(effectiveFaceBoneValues(j.diagnosisSession).faceHeightWidthRatio.value,1.5);
 assert.equal(effectiveFaceBoneValues(j.diagnosisSession).faceHeightWidthRatio.sourceType,'STYLIST_CORRECTED');assert.equal(JSON.stringify(j.diagnosisSession.faceBoneAnalysis.aiEstimate),raw);
});
test('clearing a face correction preserves unknown instead of reviving the AI value',()=>{let j=correctObservedFace(fixture(),'faceHeightWidthRatio',1.5);j=correctObservedFace(j,'faceHeightWidthRatio',null);assert.equal(effectiveFaceBoneValues(j.diagnosisSession).faceHeightWidthRatio.value,null);assert.throws(()=>planBangFaceFrameDesigns(j),/取得済み/);});
test('no analysis or fixed MOCK proportions cannot generate official A-E',()=>{assert.throws(()=>planBangFaceFrameDesigns(withDiagnosisSession(newJourney())),/取得済み/);const input=designPlanningInput(fixture().diagnosisSession);input.faceValues.faceHeightWidthRatio.sourceType='MOCK';assert.throws(()=>generateDesignPlanningRun(input),/固定MOCK/);});
test('real analysis IDs and actual effective values pass into an immutable five-direction DesignPlan',()=>{
 const j=planBangFaceFrameDesigns(fixture()),s=j.diagnosisSession,run=runOf(j);
 assert.equal(run.input.faceEstimateId,s.faceBoneAnalysis.activeEstimateId);assert.deepEqual(run.input.faceValues,effectiveFaceBoneValues(s));assert.equal(run.input.hairEstimateId,s.hairAnalysis.activeEstimateId);
 assert.equal(run.proposals.length,5);assert.deepEqual(run.proposals.map(d=>d.label),['A','B','C','D','E']);assert.equal(new Set(run.proposals.map(d=>JSON.stringify(d.parameters))).size,5);
 for(const d of run.proposals){assert.equal(d.parentDesignId,s.designPlan.mainDesign.designId);assert.equal(d.generatedImage,null);assert.equal(d.sourceType,'AI_ESTIMATE');assert.equal(d.needsStylistConfirmation,true);assert.ok(d.visualEffectDescription.length>15);}
 validateDiagnosisSession(s);
});
test('A-E differ when the person proportions differ; labels do not always select the same fixed goals',()=>{
 const low=runOf(planBangFaceFrameDesigns(correctObservedFace(fixture(),'faceHeightWidthRatio',1.1))),high=runOf(planBangFaceFrameDesigns(correctObservedFace(fixture(),'faceHeightWidthRatio',1.9)));
 assert.notDeepEqual(low.proposals.map(d=>d.parameters),high.proposals.map(d=>d.parameters));assert.notDeepEqual(low.proposals.map(d=>d.planningMetadata.goal),high.proposals.map(d=>d.planningMetadata.goal));
});
test('every basedOnMetrics key is traced to the exact observation and rule that used it',()=>{
 const run=runOf(planBangFaceFrameDesigns(fixture()));for(const d of run.proposals){assert.deepEqual(d.basedOnFaceBoneAnalysis.metricKeys,d.usedMetrics.map(m=>m.key));assert.equal(d.basedOnFaceBoneAnalysis.valuesWereUsed,d.usedMetrics.length>0);for(const m of d.usedMetrics){assert.deepEqual(m.observation,run.input.faceValues[m.key]);assert.notEqual(m.observation.value,null);assert.ok(m.rules.every(r=>d.ruleIds.includes(r)));}}
});
test('stylist corrected proportions are explicitly referenced in rationale and source IDs',()=>{
 const j=planBangFaceFrameDesigns(correctObservedFace(fixture(),'faceHeightWidthRatio',1.5)),run=runOf(j),id=j.diagnosisSession.faceBoneAnalysis.stylistCorrection[0].id;
 for(const d of run.proposals){const m=d.usedMetrics.find(m=>m.key==='faceHeightWidthRatio');assert.equal(m.correctionId,id);assert.equal(m.observation.value,1.5);assert.ok(d.sourceAnalysisIds.faceCorrectionIds.includes(id));assert.match(d.rationale,/STYLIST_CORRECTED/);}
});
test('unknown hairline/skull/forehead stay null in planning and never appear as measured design evidence',()=>{
 const run=runOf(planBangFaceFrameDesigns(fixture()));for(const key of ['hairlinePosition','foreheadHeightRatio','crown','parietal','occipital','headDepthRatio']){assert.equal(run.input.faceValues[key].value,null);assert.ok(run.proposals.every(d=>!d.basedOnFaceBoneAnalysis.metricKeys.includes(key)));}
});
test('missing optional values reduce coverage and are listed, not filled with guessed face values',()=>{
 const j=fixture(),input=designPlanningInput(j.diagnosisSession),full=generateDesignPlanningRun(input);
 for(const key of Object.keys(input.faceValues))if(key!=='faceHeightWidthRatio')input.faceValues[key]=unknownValue();
 const missing=generateDesignPlanningRun(input);assert.equal(missing.proposals.length,5);assert.ok(missing.proposals.some(d=>d.missingInputs.some(k=>k.startsWith('faceBoneAnalysis.'))));assert.ok(missing.proposals.every(d=>d.usedMetrics.every(m=>m.key==='faceHeightWidthRatio')));
 assert.ok(missing.proposals.reduce((s,d)=>s+d.confidence,0)<full.proposals.reduce((s,d)=>s+d.confidence,0));assert.ok(missing.proposals.every(d=>d.confidence<=.7&&d.confidenceMethod==='UNVALIDATED_INPUT_COVERAGE_NOT_PROBABILITY'));
});
test('valuesWereUsed cannot claim a NULL or MOCK observation or an unused metric',()=>{
 const j=planBangFaceFrameDesigns(fixture()),bad=structuredClone(j.diagnosisSession);bad.designPlan.planning.runs[0].proposals[0].basedOnFaceBoneAnalysis.valuesWereUsed=false;assert.throws(()=>validateDiagnosisSession(bad),/valuesWereUsed/);
 const fake=structuredClone(j.diagnosisSession);fake.designPlan.planning.runs[0].proposals[0].usedMetrics[0].observation.value=null;assert.throws(()=>validateDiagnosisSession(fake),/出所/);
});
test('confirmed hair context changes the designs while unknown context remains NULL',()=>{
 let j=fixture();j=setCurrentHairContext(j,'density','LOW');j=setCurrentHairContext(j,'lengthBand','BOB');j=setCurrentHairContext(j,'hasBang',false);j=setCurrentHairContext(j,'stylingDirection','MOVEMENT');j=planBangFaceFrameDesigns(j);
 const run=runOf(j);assert.ok(run.proposals.every(d=>d.parameters.bangDensity==='thin'));assert.equal(run.input.currentHair.part.value,null);assert.ok(run.proposals.some(d=>d.missingInputs.some(k=>k.startsWith('feasibility.'))));assert.ok(run.proposals.every(d=>d.usedInputs.includes('currentHair.density')));
});
test('unrecognized current hairstyle categories are rejected, not silently interpreted as known context',()=>{
 assert.throws(()=>setCurrentHairContext(fixture(),'lengthBand','invented-length'),/確認項目/);
});
test('hair condition from a confirmed stylist value can affect density without guessing damage',()=>{
 const j=planBangFaceFrameDesigns(correctObservedHair(fixture(),'MID','hairThickness',4)),run=runOf(j);assert.ok(run.proposals.every(d=>d.parameters.bangDensity==='thin'));assert.ok(run.proposals.every(d=>d.usedInputs.includes('hairAnalysis.MID.hairThickness')));assert.equal(run.input.hairZones.MID.damage.value,null);
});
test('structured STYLE layer/volume constrain A-E while the image shape stays explicitly unparsed',()=>{
 let j=fixture();j.target.styleParameters={lengthOffsetCm:0,layerAmount:'more',layerStart:'chin',volumePosition:'lower',endsLightness:'light'};
 j.target.styleReference={...j.photos[0],id:'style-reference',view:'style_reference'};j=withDiagnosisSession(j,catalog);j=planBangFaceFrameDesigns(j);
 const run=runOf(j);assert.equal(run.input.styleTarget.referenceImage.role,'STYLE_REFERENCE');assert.ok(run.proposals.every(d=>d.parameters.faceFrameStart==='chin'&&d.parameters.faceFrameVolumePosition==='jaw'));assert.ok(run.proposals.every(d=>d.missingInputs.includes('styleTarget.referenceShapeAnalysis')));
});
test('changing only COLOR cannot mix colour into shape planning or invalidate the planning run',()=>{
 const j=planBangFaceFrameDesigns(fixture()),id=runOf(j).id,shape=JSON.stringify(runOf(j).input.styleTarget);const next=withDiagnosisSession({...j,target:{...j.target,text:'カラーの希望だけ変更'}},catalog);
 assert.equal(runOf(next).id,id);assert.equal(JSON.stringify(runOf(next).input.styleTarget),shape);assert.equal(next.diagnosisSession.colorTarget.requestText,'カラーの希望だけ変更');
});
test('stylist edits and adoption preserve the AI proposal and persist as separate records',async()=>{
 let j=planBangFaceFrameDesigns(fixture()),run=runOf(j),d=run.proposals[0],raw=JSON.stringify(run),p={...d.parameters,bangWidth:d.parameters.bangWidth==='narrow'?'wide':'narrow'};
 j=setPlannedDesignDraft(j,d.id,p);assert.throws(()=>selectPlannedDesign(j,d.id),/変更を保存/);j=confirmPlannedDesignCorrection(j,d.id);j=selectPlannedDesign(j,d.id);
 assert.equal(JSON.stringify(runOf(j)),raw);assert.deepEqual(selectedPlannedDesign(j.diagnosisSession).parameters,p);assert.equal(j.diagnosisSession.designPlan.selectedDesignId,d.id);assert.deepEqual(j.diagnosisSession.styleTarget.bang,p);
 const store=memoryJourneyStore(catalog),saved=await store.save(j),loaded=await store.load(saved.id);assert.equal(JSON.stringify(runOf(loaded)),raw);assert.equal(loaded.diagnosisSession.designPlan.planning.corrections.length,1);assert.equal(loaded.diagnosisSession.designPlan.planning.selections.length,1);assert.deepEqual(selectedPlannedDesign(loaded.diagnosisSession).parameters,p);
});
test('changing the selected design appends selections without deleting other AI proposals',()=>{
 let j=planBangFaceFrameDesigns(fixture()),run=runOf(j);j=selectPlannedDesign(j,run.proposals[0].id);j=selectPlannedDesign(j,run.proposals[1].id);
 assert.equal(j.diagnosisSession.designPlan.planning.selections.length,2);assert.equal(j.diagnosisSession.designPlan.bangFaceFrameDesigns.length,5);assert.equal(selectedPlannedDesign(j.diagnosisSession).design.id,run.proposals[1].id);
});
test('regenerating the same inputs clears the active selection and retains the previous selected design in history',()=>{
 let j=planBangFaceFrameDesigns(fixture());j=selectPlannedDesign(j,runOf(j).proposals[0].id);j=planBangFaceFrameDesigns(j);
 assert.equal(j.diagnosisSession.designPlan.planning.runs.length,2);assert.equal(j.diagnosisSession.designPlan.planning.selections.length,1);assert.equal(selectedPlannedDesign(j.diagnosisSession),null);assert.equal(j.diagnosisSession.styleTarget.bang,null);assert.equal(j.diagnosisSession.designPlan.mainDesign.styleParameters.bang,null);
});
test('new face correction invalidates old proposals/selection but preserves their history',()=>{
 let j=planBangFaceFrameDesigns(fixture()),run=runOf(j);j=selectPlannedDesign(j,run.proposals[0].id);j=correctObservedFace(j,'faceHeightWidthRatio',1.3);
 assert.equal(runOf(j),null);assert.equal(selectedPlannedDesign(j.diagnosisSession),null);assert.equal(j.diagnosisSession.styleTarget.bang,null);assert.equal(j.diagnosisSession.designPlan.planning.runs.length,1);assert.equal(j.diagnosisSession.designPlan.planning.selections.length,1);
 j=planBangFaceFrameDesigns(j);assert.equal(j.diagnosisSession.designPlan.planning.runs.length,2);assert.equal(runOf(j).input.faceValues.faceHeightWidthRatio.value,1.3);
});
test('STYLE or current hair changes invalidate active planning; edits cannot adopt stale children',()=>{
 const j=planBangFaceFrameDesigns(fixture()),d=runOf(j).proposals[0];const next=withDiagnosisSession({...j,target:{...j.target,style:'別のSTYLE希望'}},catalog);assert.equal(runOf(next),null);assert.throws(()=>selectPlannedDesign(next,d.id),/再設計/);
 const hairChanged=setCurrentHairContext(j,'density','HIGH');assert.equal(runOf(hairChanged),null);assert.equal(hairChanged.diagnosisSession.designPlan.planning.runs.length,1);
});
test('MAIN/child generation preparation carries the chosen corrected shape and independent adjusted COLOR',()=>{
 let j=fixture();j.target.simulationMode='style_color';j.target.text='透明感のあるベージュ';j=withDiagnosisSession(j,catalog);j=planBangFaceFrameDesigns(j);const d=runOf(j).proposals[0];j=selectPlannedDesign(j,d.id);
 const s=j.diagnosisSession,c=generationContract(s),batch=generationBatchContract(s);assert.equal(c.selectedDesign.designId,d.id);assert.equal(c.mode,'STYLE_COLOR');assert.equal(c.styleTarget.id,s.styleTarget.id);assert.equal(c.colorTarget.id,s.colorTarget.id);assert.deepEqual(c.effectiveFaceBoneValues,effectiveFaceBoneValues(s));
 assert.equal(batch.variants.length,5);for(const child of batch.variants){assert.equal(child.parentDesignId,s.designPlan.mainDesign.designId);assert.equal(child.referenceRoles.style,'SHAPE_ONLY');assert.equal(child.referenceRoles.color,'HAIR_COLOR_ONLY');assert.equal(child.planningVariant.generationSeedMetadata.seed,null);assert.deepEqual(child.colorTarget,c.colorTarget);assert.deepEqual(child.currentPhoto,c.currentPhoto);assert.equal(child.planningVariant.sourceAnalysisIds.faceEstimateId,s.faceBoneAnalysis.activeEstimateId);}
 assert.equal(batch.state,'API_READY_REAL_UNVERIFIED');assert.equal(batch.dependency,'GENERATE_MAIN_THEN_VARIANTS');
});
test('a stale native variant cannot reach the prepared generation contract',()=>{const j=planBangFaceFrameDesigns(fixture()),d=runOf(j).proposals[0];const next=correctObservedFace(j,'faceHeightWidthRatio',1.2);assert.throws(()=>generationContract(next.diagnosisSession,d.id),/再設計/);assert.throws(()=>generationBatchContract(next.diagnosisSession),/設計/);});
test('prepared child uses saved correction without editing the raw proposal or conflating selected value',()=>{
 let j=planBangFaceFrameDesigns(fixture()),d=runOf(j).proposals[0],p={...d.parameters,bangDensity:'thick'};j=setPlannedDesignDraft(j,d.id,p);j=confirmPlannedDesignCorrection(j,d.id);j=selectPlannedDesign(j,d.id);const c=generationContract(j.diagnosisSession,d.id);
 assert.deepEqual(c.planningVariant.designParameters,p);assert.deepEqual(c.planningVariant.aiProposal,d.parameters);assert.deepEqual(c.selectedDesign.parameters,p);
});
test('history protection rejects mutation/deletion of AI planning, corrections and selections',()=>{
 let j=planBangFaceFrameDesigns(fixture()),d=runOf(j).proposals[0];j=setPlannedDesignDraft(j,d.id,{...d.parameters,bangDensity:'thick'});j=confirmPlannedDesignCorrection(j,d.id);j=selectPlannedDesign(j,d.id);
 for(const key of ['runs','corrections','selections']){const bad=structuredClone(j.diagnosisSession);bad.designPlan.planning[key]=[];assert.throws(()=>assertSessionHistory(j.diagnosisSession,bad),/原本/);}
 const bad=structuredClone(j.diagnosisSession);bad.designPlan.planning.runs[0].proposals[0].name='原本を書換え';assert.throws(()=>assertSessionHistory(j.diagnosisSession,bad),/原本/);
});
test('v1.0 sessions load without destructive version upgrade, new saves/Phase3 data use v1.1',async()=>{
 const old=fixture();old.diagnosisSession.specVersion='1.0';const raw=JSON.stringify(old),read=withDiagnosisSession(old,catalog);assert.equal(read.diagnosisSession.specVersion,'1.0');assert.equal(JSON.stringify(old),raw);validateDiagnosisSession(read.diagnosisSession);
 const j=planBangFaceFrameDesigns(read),store=memoryJourneyStore(catalog),saved=await store.save(j);assert.equal(saved.diagnosisSession.specVersion,SPEC_VERSION);assert.equal(saved.diagnosisSession.schemaVersion,'diagnosis-session-v1');assert.equal(old.diagnosisSession.specVersion,'1.0');
 const future=createDiagnosisSession();future.specVersion='9.0';assert.throws(()=>validateDiagnosisSession(future),/未対応/);
});
test('Phase3 mutations stamp the current feature registry/version/time without changing old read-only session metadata',()=>{
 const old=fixture();old.updatedAt='2026-10-03T00:00:00.000Z';old.diagnosisSession.specVersion='1.0';old.diagnosisSession.featureSnapshot.registryVersion='phase2-features-v1';
 const next=planBangFaceFrameDesigns(old);assert.equal(next.diagnosisSession.featureSnapshot.registryVersion,'phase4-features-v1');assert.equal(next.updatedAt,next.diagnosisSession.updatedAt);assert.ok(next.updatedAt>old.updatedAt);assert.equal(old.diagnosisSession.specVersion,'1.0');assert.equal(old.diagnosisSession.featureSnapshot.registryVersion,'phase2-features-v1');
});
test('registry distinguishes measured connection, estimate parameters, legacy MOCK and future unimplemented modules',()=>{
 assert.equal(FeatureRegistry.boneDesignConnection.state,'REAL');assert.equal(FeatureRegistry.designPlanning.state,'PARTIAL');assert.equal(FeatureRegistry.bangParameterGeneration.state,'ESTIMATE');assert.equal(FeatureRegistry.legacyBangTemplates.state,'MOCK');
 assert.equal(FeatureRegistry.bangFaceFrameGeneration.state,'PARTIAL');
 for(const key of ['requiredUnderCalculator','fioleRecipeOptimization','customerTakeaway','productCatalog','nextColorOptions','makeupSuggestions','productRecommendation'])assert.equal(FeatureRegistry[key].state,'UNIMPLEMENTED');
});
