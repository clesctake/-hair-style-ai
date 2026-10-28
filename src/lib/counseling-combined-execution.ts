import type {Journey} from './journey.ts';
import {withDiagnosisSession} from './session-adapter.ts';
import {currentAnalysisRun,analyzeCurrentPhotos,commitPhotoAnalysis} from './photo-analysis-pipeline.ts';
import {effectiveFaceBoneValues} from './effective-face-values.ts';
import {activePlanningRun} from './design-planning-projection.ts';
import {planBangFaceFrameDesigns} from './design-planning-session.ts';
import {prepareCounselingGeneration} from './counseling-generation.ts';
import {counselingState,editCounseling,reapplyCounselingHairInputs} from './counseling-session.ts';
import {commonCounselingColor} from './counseling-color-preview.ts';
import {activeSimulationBatch,simulationCommonSignature,simulationJobStatus,latestSimulationEvent,stableJson} from './hair-simulation-context.ts';
import {runCounselingComparison} from './counseling-comparison-pipeline.ts';
import {counselingSimulationTransport} from './counseling-generation-protection.ts';
import {runSimulationJobs} from './hair-simulation-pipeline.ts';

const consultation=(j:Journey)=>{const c=counselingState(j);return {inputs:structuredClone(c.inputs),historyNote:c.historyNote,requestNote:c.requestNote};};
/** Coalesce overlapping UI entry points within this tab. No persistent image cache. */
const pending=new Map<string,Promise<Journey>>();
export type CombinedExecutionOptions={
 retryComparison?:boolean;persist:(j:Journey)=>Promise<Journey>;onProgress?:(text:string)=>void;signal?:AbortSignal;
 analyze?:typeof analyzeCurrentPhotos;compare?:typeof runCounselingComparison;
 colorOnly?:typeof runSimulationJobs;
};
export function runCounselingCombined(initial:Journey,options:CombinedExecutionOptions):Promise<Journey>{
 const session=withDiagnosisSession(initial),s=session.diagnosisSession!;
 const key=stableJson({session:s.id,input:simulationCommonSignature(s),consultation:consultation(session)});
 const existing=pending.get(key);if(existing)return existing;
 const promise=execute(session,options).finally(()=>{pending.delete(key);});pending.set(key,promise);return promise;
}
async function execute(initial:Journey,options:CombinedExecutionOptions){
 let current=initial;
 const save=async(j:Journey)=>{options.signal?.throwIfAborted();current=await options.persist(j);return current;};
 if(!current.photos.some(p=>p.view==='front'))throw new Error('CURRENTに本人の正面写真を追加してください。');
 if(current.diagnosisSession!.simulationMode!=='STYLE_ONLY'&&!commonCounselingColor(current))throw new Error('COLOR写真の色味を確定してください。色味確定では画像生成APIを呼びません。');
 const c=counselingState(current),batch=activeSimulationBatch(current.diagnosisSession!);
 // Legacy successful images stay usable. Only known changes invalidate them.
 const legacyContext=c.analysisContext&&{inputs:c.analysisContext.stylistInputs,historyNote:c.analysisContext.historyNote,requestNote:c.analysisContext.requestNote};
 const sameConsultation=c.combinedInputs||legacyContext?stableJson(c.combinedInputs??legacyContext)===stableJson(consultation(current)):!c.historyNote&&!c.requestNote&&Object.values(c.inputs).every(v=>v===null);
 if(batch?.commonSignature===simulationCommonSignature(current.diagnosisSession!)&&sameConsultation){
  const jobs=current.diagnosisSession!.hairSimulation!.jobs.filter(j=>j.batchId===batch.id&&(current.diagnosisSession!.simulationMode==='COLOR_ONLY'?j.label==='MAIN':j.label!=='MAIN'));
  if(jobs.length&&(jobs.length===5||current.diagnosisSession!.simulationMode==='COLOR_ONLY')&&jobs.every(j=>simulationJobStatus(current.diagnosisSession!,j)==='COMPLETE')){options.onProgress?.('同じ条件の保存済み画像を使用します。再生成しません。');return current;}
 }
 await save(editCounseling(current,{combinedInputs:consultation(current),analysisContext:{currentPhotoIds:current.photos.map(p=>p.id),styleReferenceId:current.target.styleReference?.id??null,colorReferenceId:current.target.reference?.id??null,stylistInputs:c.inputs,historyNote:c.historyNote,requestNote:c.requestNote,createdAt:new Date().toISOString()}}));
 const run=currentAnalysisRun(current),face=effectiveFaceBoneValues(current.diagnosisSession!);
 // A failed local model is not retried on every click. A stylist-confirmed
 // surface ratio is a valid alternative; it is never relabelled as AI analysis.
 if(!run&&face.faceHeightWidthRatio.value===null){
  options.onProgress?.('本人の髪と顔を解析しています。');
  const result=await (options.analyze??analyzeCurrentPhotos)(current,{signal:options.signal,onProgress:options.onProgress});
  await save(reapplyCounselingHairInputs(commitPhotoAnalysis(current,result)));
 }else options.onProgress?.('取得済みの解析・美容師確認値を使用します。');
 if(current.diagnosisSession!.simulationMode!=='COLOR_ONLY'&&!activePlanningRun(current.diagnosisSession!)){
  try{await save(planBangFaceFrameDesigns(current));}catch{throw new Error('顔の比率が未解析です。顔解析または美容師手動確認を完了してから再実行してください。写真・色味・履歴は保存されています。');}
 }
 current=prepareCounselingGeneration(current,{requireCombined:false});
 const b=activeSimulationBatch(current.diagnosisSession!);
 if(b?.commonSignature===simulationCommonSignature(current.diagnosisSession!)){
  const main=current.diagnosisSession!.hairSimulation!.jobs.find(j=>j.batchId===b.id&&j.label==='MAIN');
  const event=main?latestSimulationEvent(current.diagnosisSession!,main.id):null;
  if(event?.status==='FAILED'&&!options.retryComparison)throw new Error('前回の生成は失敗または中断しています。課金結果を確認し、既存の再試行操作を使用してください。自動再生成は行いません。');
 }
 options.signal?.throwIfAborted();
 return current.diagnosisSession!.simulationMode==='COLOR_ONLY'
  ?(options.colorOnly??runSimulationJobs)(current,{persist:save,onProgress:options.onProgress,signal:options.signal,transport:counselingSimulationTransport()})
  :(options.compare??runCounselingComparison)(current,{persist:save,onProgress:options.onProgress,signal:options.signal});
}
