import type {DiagnosisSession,GenerationStatus} from './session-model.ts';
import type {SimulationJob,SimulationEvent,SimulationBatch,SimulationAsset} from './hair-simulation-types.ts';
import {activePlanningRun} from './design-planning-projection.ts';
/** Exact deterministic input comparison, not a chemical prediction or cryptographic hash. */
export function stableJson(value:unknown):string {if(Array.isArray(value))return '['+value.map(stableJson).join(',')+']';if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stableJson(v)).join(',')+'}';return JSON.stringify(value)??'null';}
export function simulationCommonSignature(s:DiagnosisSession):string {
 const {bang:_b,faceFrame:_f,selectedBangDecisionId:_id,...style}=s.styleTarget;
 return stableJson({current:s.currentPhotos,mode:s.simulationMode,style:s.simulationMode==='COLOR_ONLY'?null:style,color:s.simulationMode==='STYLE_ONLY'?null:s.colorTarget,hair:s.hairAnalysis,face:s.faceBoneAnalysis,planningRunId:s.simulationMode==='COLOR_ONLY'?null:activePlanningRun(s)?.id??null,...(s.counseling?.combinedInputs?{consultation:s.counseling.combinedInputs}:{})});
}
export const activeSimulationBatch=(s:DiagnosisSession):SimulationBatch|null=>s.hairSimulation?.batches.find(b=>b.id===s.hairSimulation?.activeBatchId)??null;
export const latestSimulationEvent=(s:DiagnosisSession,jobId:string):SimulationEvent|null=>s.hairSimulation?.events.findLast(e=>e.jobId===jobId)??null;
/** Six logical slots from a single comparison response are not six paid calls. */
export function simulationResponseCounts(s:DiagnosisSession){
 const real=new Set<string>(),mock=new Set<string>();
 for(const event of s.hairSimulation?.events??[]){
  if(event.status!=='COMPLETE'||!event.metadata?.providerAttempted)continue;
  const requestId=event.metadata.comparisonCrop?.sharedRequestId??event.requestId;
  (event.metadata.origin==='REAL_API'?real:mock).add(requestId);
 }
 return {real:real.size,mock:mock.size};
}
export function effectiveJobParameters(s:DiagnosisSession,job:SimulationJob){const batch=s.hairSimulation?.batches.find(b=>b.id===job.batchId),run=s.designPlan.planning?.runs.find(r=>r.id===batch?.planningRunId),d=run?.proposals.find(p=>p.id===job.designId);return s.designPlan.planning?.corrections.findLast(c=>c.runId===run?.id&&c.designId===job.designId)?.parameters??d?.parameters??null;}
export function simulationJobStatus(s:DiagnosisSession,job:SimulationJob){
 const batch=s.hairSimulation?.batches.find(b=>b.id===job.batchId);if(!batch||batch.commonSignature!==simulationCommonSignature(s))return 'STALE' as const;
 const e=latestSimulationEvent(s,job.id);if(!e)return 'NOT_STARTED' as const;
 if(job.variantType!=='MAIN'&&stableJson(e.request.contract.planningVariant?.designParameters??null)!==stableJson(effectiveJobParameters(s,job)))return 'STALE' as const;
 if(job.variantType!=='MAIN'){
  const main=s.hairSimulation?.jobs.find(j=>j.batchId===job.batchId&&j.variantType==='MAIN');
  if(!main||e.request.parentGenerationId!==latestSimulationEvent(s,main.id)?.id)return 'STALE' as const;
 }
 return e.status;
}
export function completedJobAsset(s:DiagnosisSession,jobId:string):SimulationAsset|null {const event=latestSimulationEvent(s,jobId);return event?.status==='COMPLETE'?s.hairSimulation?.generatedAssets.find(a=>a.id===event.assetId)??null:null;}
export function selectedSimulationAsset(s:DiagnosisSession):SimulationAsset|null {const st=s.hairSimulation,selection=st?.selections.find(x=>x.id===st.selectedSelectionId),job=st?.jobs.find(j=>j.id===selection?.jobId);if(!selection||!job||simulationJobStatus(s,job)!=='COMPLETE'||latestSimulationEvent(s,job.id)?.id!==selection.generationId||st?.reviews.findLast(r=>r.generationId===selection.generationId)?.decision==='REJECTED')return null;return st?.generatedAssets.find(a=>a.id===selection.assetId)??null;}
/** A retained selection is history, not necessarily the image currently being reviewed.
 * Rejected current images remain reviewable; stale/fixture images never become the target. */
export function currentSimulationReviewTarget(s:DiagnosisSession){
 const st=s.hairSimulation,batch=activeSimulationBatch(s);if(!st||!batch)return null;
 const selection=st.selections.find(x=>x.id===st.selectedSelectionId),selectedJob=st.jobs.find(x=>x.id===selection?.jobId);
 const current=(job:SimulationJob|undefined)=>{
  if(!job||job.batchId!==batch.id||simulationJobStatus(s,job)!=='COMPLETE')return null;
  const event=latestSimulationEvent(s,job.id),asset=completedJobAsset(s,job.id);
  return event&&asset?.origin==='REAL_API'?{jobId:job.id,generationId:event.id,assetId:asset.id,isMain:job.variantType==='MAIN'}:null;
 };
 const selected=current(selectedJob);
 if(selected&&selected.generationId===selection?.generationId&&selected.assetId===selection.assetId)return selected;
 return current(st.jobs.find(x=>x.batchId===batch.id&&x.variantType==='MAIN'));
}
export function projectHairSimulation(s:DiagnosisSession):void {
 const state=s.hairSimulation,batch=activeSimulationBatch(s);if(!state||!batch)return;
 const convert={NOT_STARTED:'NOT_REQUESTED',QUEUED:'QUEUED',GENERATING:'RUNNING',COMPLETE:'SUCCEEDED',FAILED:'FAILED',STALE:'STALE'} satisfies Record<string,GenerationStatus>;
 for(const job of state.jobs.filter(j=>j.batchId===batch.id)){
  const target=job.variantType==='MAIN'?s.designPlan.mainDesign:s.designPlan.bangFaceFrameDesigns.find(d=>d.id===job.designId);if(!target)continue;
  const asset=completedJobAsset(s,job.id),event=latestSimulationEvent(s,job.id),status=simulationJobStatus(s,job);
  target.generatedImage=asset?structuredClone(asset.reference):null;target.generationStatus=convert[status];
  target.generationMetadata=event?.metadata?{model:event.metadata.model,modelVersion:null,promptVersion:event.metadata.promptVersion,requestId:event.metadata.providerRequestId,createdAt:event.createdAt,sourceType:event.metadata.origin==='REAL_API'?'AI_ESTIMATE':'MOCK',inputContext:batch.commonSignature}:null;
 }
 const selection=state.selections.find(x=>x.id===state.selectedSelectionId);if(selection&&selectedSimulationAsset(s))s.designPlan.selectedDesignId=selection.designId;
}
