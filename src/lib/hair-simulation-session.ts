import type {Journey} from './journey.ts';
import {withDiagnosisSession,resolveSessionImage} from './session-adapter.ts';
import {generationContract,generationBatchContract} from './generation-contract.ts';
import {APP_VERSION,SPEC_VERSION,type DiagnosisSession} from './session-model.ts';
import {featureSnapshot} from './feature-registry.ts';
import {emptyHairSimulation,type SimulationJob,type SimulationSnapshot,type SimulationRequest,type SimulationResponse,type SimulationReview} from './hair-simulation-types.ts';
import {activeSimulationBatch,latestSimulationEvent,simulationCommonSignature,simulationJobStatus,completedJobAsset,effectiveJobParameters,projectHairSimulation,stableJson} from './hair-simulation-context.ts';
import {validateSimulationRequest} from './hair-simulation-validation.ts';
const id=(kind:string)=>`${kind}:${crypto.randomUUID()}`;
function edit(j:Journey){const next=withDiagnosisSession(structuredClone(j)),s=next.diagnosisSession!;s.hairSimulation??=emptyHairSimulation();s.appVersion=APP_VERSION;s.specVersion=SPEC_VERSION;s.featureSnapshot=featureSnapshot();s.updatedAt=next.updatedAt=new Date().toISOString();return {next,s,st:s.hairSimulation};}
function finish(next:Journey){projectHairSimulation(next.diagnosisSession!);return withDiagnosisSession(next);}
export function queueSimulationBatch(j:Journey):Journey {
 const {next,s,st}=edit(j);const current=activeSimulationBatch(s),signature=simulationCommonSignature(s);
 if(current?.commonSignature===signature)throw new Error('同じ条件の生成ジョブは既にあります。失敗した案だけ再試行してください。');
 const main=generationContract(s),batchContract=main.mode==='COLOR_ONLY'?null:generationBatchContract(s);
 if(main.colorTarget&&(!main.colorTarget.confirmedAt||!main.colorTarget.adjustedPreview||!main.colorTarget.confirmedAdjustmentId))throw new Error('COLORの色味を確定してください。');
 const refs=[main.currentPhoto,main.styleTarget?.referenceImage,main.effectiveColorReference].filter(x=>!!x),photos:SimulationSnapshot['photos']={};
 for(const ref of refs){if(!ref)continue;photos[ref.imageId]=resolveSessionImage(next,ref,ref.role==='CURRENT'?'original':'preview');}
 const batch={id:id('simulation-batch'),parentSessionId:s.id,createdAt:s.updatedAt,commonSignature:signature,planningRunId:batchContract?.planningRunId??null,mainDesignId:s.designPlan.mainDesign.designId,snapshot:{contract:main,photos,planningRunId:batchContract?.planningRunId??null},variantContracts:batchContract?.variants??[]};
 st.batches.push(batch);st.activeBatchId=batch.id;
 st.jobs.push({id:id('simulation-job'),batchId:batch.id,parentSessionId:s.id,designId:batch.mainDesignId,parentDesignId:null,variantType:'MAIN',label:'MAIN',name:'MAIN DESIGN',visualEffectDescription:'本人 × STYLE × 確定COLOR',createdAt:s.updatedAt});
 for(const contract of batch.variantContracts){const design=contract.design as import('./session-model.ts').BangFaceFrameDesign;st.jobs.push({id:id('simulation-job'),batchId:batch.id,parentSessionId:s.id,designId:design.id,parentDesignId:batch.mainDesignId,variantType:'BANG_FACE_FRAME',label:design.label,name:design.name??`DESIGN ${design.label}`,visualEffectDescription:design.visualEffectDescription??'',createdAt:s.updatedAt});}
 return finish(next);
}
export function beginSimulationJob(j:Journey,jobId:string):Journey {
 const {next,s,st}=edit(j),job=st.jobs.find(j=>j.id===jobId),batch=st.batches.find(b=>b.id===job?.batchId);if(!job||!batch||batch.id!==st.activeBatchId||batch.commonSignature!==simulationCommonSignature(s))throw new Error('生成条件が変わりました。新しい条件で一括生成してください。');
 const attempts=st.events.filter(e=>e.jobId===jobId&&e.status==='GENERATING').length;if(attempts>=3)throw new Error('再試行は1案につき2回までです。');if(st.events.some(e=>e.status==='GENERATING'&&latestSimulationEvent(s,e.jobId)?.id===e.id))throw new Error('別の画像を生成中です。');
 let contract=structuredClone(job.variantType==='MAIN'?batch.snapshot.contract:batch.variantContracts.find(c=>('id' in c.design)&&c.design.id===job.designId)!);
 let parentGenerationId:string|null=null,parentAsset:SimulationRequest['parentAsset']=null;
 if(job.variantType!=='MAIN'){
  const mainJob=st.jobs.find(j=>j.batchId===batch.id&&j.variantType==='MAIN')!,mainEvent=latestSimulationEvent(s,mainJob.id),asset=completedJobAsset(s,mainJob.id);
  if(!mainEvent||!asset||simulationJobStatus(s,mainJob)!=='COMPLETE')throw new Error('MAIN親画像を生成・保存してから子案を生成してください。');
  parentGenerationId=mainEvent.id;parentAsset={imageId:asset.id,sha256:asset.sha256};
  const latest=generationContract(s,job.designId);
  contract.design=structuredClone(latest.design);contract.planningVariant=structuredClone(latest.planningVariant);
  // Parent STYLE/COLOR remain fixed; only the child bang/face-frame override changes.
  contract.styleTarget=structuredClone(batch.snapshot.contract.styleTarget);contract.colorTarget=structuredClone(batch.snapshot.contract.colorTarget);contract.effectiveColorReference=structuredClone(batch.snapshot.contract.effectiveColorReference);
 }
 const request:SimulationRequest={protocol:'hair-simulation-request-v1',requestId:id('simulation-request'),batchId:batch.id,jobId:job.id,parentSessionId:s.id,designId:job.designId,parentDesignId:job.parentDesignId,parentGenerationId,parentMode:job.variantType==='MAIN'?'NONE':'IMAGE_EDIT',parentAsset,contract};
 validateSimulationRequest(request);const snapshot={...structuredClone(batch.snapshot),contract};
 const queued={id:id('simulation-event'),jobId,batchId:batch.id,parentSessionId:s.id,requestId:request.requestId,status:'QUEUED' as const,createdAt:s.updatedAt,retryCount:attempts,inputSnapshot:snapshot,request,assetId:null,metadata:null,error:null};
 st.events.push(queued,{...structuredClone(queued),id:id('simulation-event'),status:'GENERATING'});return finish(next);
}
export function completeSimulationJob(j:Journey,jobId:string,result:SimulationResponse&{width:number;height:number}):Journey {
 const {next,s,st}=edit(j),event=latestSimulationEvent(s,jobId),job=st.jobs.find(j=>j.id===jobId);
 if(!event||!job||event.status!=='GENERATING'||result.requestId!==event.requestId||result.jobId!==jobId||result.designId!==job.designId||result.parentGenerationId!==event.request.parentGenerationId||result.parentMode!==event.request.parentMode)throw new Error('生成応答・親画像がジョブと一致しません。');
 if(!['REAL_API','MOCK_TRANSPORT_FIXTURE'].includes(result.generation.origin)||result.generation.seed!==null||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(result.image)||!Number.isInteger(result.width)||result.width<1||!Number.isInteger(result.height)||result.height<1)throw new Error('生成画像の形式・出所が不正です。');
 const eventId=id('simulation-event'),assetId=id('simulation-asset'),sourceType=result.generation.origin==='REAL_API'?'AI_ESTIMATE' as const:'MOCK' as const;
 const asset={id:assetId,parentSessionId:s.id,eventId,reference:{imageId:assetId,parentSessionId:s.id,role:'SIMULATION' as const,imageUrl:null,localReference:`simulation-asset:${assetId}`,originalReference:null,width:result.width,height:result.height,sourceType},dataUrl:result.image,sha256:result.generation.sha256,origin:result.generation.origin,createdAt:s.updatedAt};
 st.generatedAssets.push(asset);st.events.push({...structuredClone(event),id:eventId,status:'COMPLETE',createdAt:s.updatedAt,assetId,metadata:structuredClone(result.generation),error:null});
 s.simulations.push({id:eventId,parentSessionId:s.id,designId:job.designId,parentDesignId:job.parentDesignId,kind:job.variantType,sourceCurrentPhotoId:event.request.contract.currentPhoto.imageId,styleReferenceImageId:event.request.contract.styleTarget?.referenceImage?.imageId??null,colorReferenceImageId:event.request.contract.effectiveColorReference?.imageId??null,generatedImage:structuredClone(asset.reference),metadata:{model:result.generation.model,modelVersion:null,promptVersion:result.generation.promptVersion,requestId:result.generation.providerRequestId,createdAt:s.updatedAt,sourceType,inputContext:st.batches.find(b=>b.id===event.batchId)!.commonSignature}});
 return finish(next);
}
export function failSimulationJob(j:Journey,jobId:string,message:string,code='generation_error',outcomeUnknown=false,providerAttempted=true):Journey {const {next,s,st}=edit(j),e=latestSimulationEvent(s,jobId);if(!e||e.status!=='GENERATING')throw new Error('実行中のジョブがありません。');st.events.push({...structuredClone(e),id:id('simulation-event'),status:'FAILED',createdAt:s.updatedAt,error:{code,message,outcomeUnknown,providerAttempted}});return finish(next);}
export function recoverInterruptedSimulation(j:Journey):Journey {let next=j;for(const job of j.diagnosisSession?.hairSimulation?.jobs??[])if(latestSimulationEvent(next.diagnosisSession!,job.id)?.status==='GENERATING')next=failSimulationJob(next,job.id,'待機が中断されました。サーバーの生成・課金結果は不明です。再試行は手動で行ってください。','interrupted',true,true);return next;}
export function selectSimulationDesign(j:Journey,jobId:string,actor='美容師'):Journey {const {next,s,st}=edit(j),job=st.jobs.find(j=>j.id===jobId),e=latestSimulationEvent(s,jobId),a=completedJobAsset(s,jobId);if(!job||!e||!a||simulationJobStatus(s,job)!=='COMPLETE'||st.reviews.findLast(r=>r.generationId===e.id)?.decision==='REJECTED')throw new Error('現在の条件で完了した画像を選択してください。');const selection={id:id('simulation-selection'),parentSessionId:s.id,jobId,designId:job.designId,generationId:e.id,assetId:a.id,actor,createdAt:s.updatedAt};st.selections.push(selection);st.selectedSelectionId=selection.id;return finish(next);}
export function reviewSimulation(j:Journey,generationId:string,review:Omit<SimulationReview,'id'|'parentSessionId'|'generationId'|'createdAt'|'actor'>,actor='美容師'):Journey {const {next,s,st}=edit(j);if(!st.events.some(e=>e.id===generationId&&e.status==='COMPLETE'))throw new Error('生成画像を選択してください。');st.reviews.push({...review,id:id('simulation-review'),parentSessionId:s.id,generationId,createdAt:s.updatedAt,actor});return finish(next);}
