import type {Journey} from './journey.ts';
import {withDiagnosisSession} from './session-adapter.ts';
import {proDesignFingerprint} from './pro-design-session.ts';
import {effectiveFaceBoneValues} from './effective-face-values.ts';
import {stableJson} from './hair-simulation-context.ts';
import {AFTER_SUPPORT_MASTER_ID,makeupThemes,type SupportView,type SupportPurpose,type SupportRequest,type SupportImageResult,type SupportParameters,type SupportPlan,type FinishPhotoRole,type SupportStylistProfile} from './after-support-types.ts';
import type {ImageReference} from './session-model.ts';
import {finishReference,resolveConfirmedFinishReference} from './after-support-presentation.ts';
const at=()=>new Date().toISOString();
/** Only the Page 2 snapshot matching this confirmed handoff may override older generation inputs. */
export function supportConfirmedInputs(j:Journey){
 const s=j.diagnosisSession,p=s?.proDesign,h=p?.handoffs.at(-1);
 return h&&p?.inputFingerprint===h.sourceInputFingerprint&&p.inputSnapshot.sessionId===s?.id?p.inputSnapshot:null;
}
export function ensureAfterSupport(j:Journey):Journey{
 const next=withDiagnosisSession(j),s=next.diagnosisSession!;
 if(!s.afterSupport)s.afterSupport={schemaVersion:'after-support-v1',visualMasterId:AFTER_SUPPORT_MASTER_ID,parentSessionId:s.id,sourceHandoffId:s.proDesign?.handoffs.at(-1)?.id??null,createdAt:at(),updatedAt:at(),jobs:[],assets:[],plans:[],generationJobCount:0};
 return next;
}
/** Read confirmed references. Never substitute a draft, another person's photo, or mock measurement. */
export function supportView(j:Journey):SupportView{
 const s=j.diagnosisSession!,p=s.proDesign,h=p?.handoffs.at(-1)??null;
 const candidate=h?.finalImageReference?s.hairSimulation?.generatedAssets.find(a=>a.id===h.finalImageReference!.assetId&&a.origin==='REAL_API'):null;
 const savedEvent=candidate?s.hairSimulation?.events.find(e=>e.id===candidate.eventId):null;
 const asset=candidate&&savedEvent?.status==='COMPLETE'&&savedEvent.assetId===candidate.id&&savedEvent.id===h?.finalImageReference?.generationId&&savedEvent.request.designId===h.finalImageReference.designId&&(savedEvent.request.contract.colorTarget?.confirmedAdjustmentId??null)===h.targetConfirmationId&&s.hairSimulation?.reviews.findLast(r=>r.generationId===savedEvent.id)?.decision!=='REJECTED'?candidate:null;
 const confirmation=h?.targetConfirmationId?j.targetAdjustments?.find(c=>c.id===h.targetConfirmationId):null;
 const event=asset?s.hairSimulation?.events.find(e=>e.id===asset.eventId):null;
 const confirmedInputs=supportConfirmedInputs(j),level=(confirmedInputs?.colorTarget??event?.request.contract.colorTarget)?.targetFinishLevel;
 const targetLevel=level?.sourceType!=='MOCK'?level?.value??null:null;
 const source=asset&&h?{sessionId:s.id,handoffId:h.id,finalAssetId:asset.id,finalDesignId:h.finalImageReference!.designId,targetConfirmationId:h.targetConfirmationId,selectedDesignId:h.selectedDesignId,sha256:asset.sha256,inputFingerprint:h.sourceInputFingerprint}:null;
 const selected=s.designPlan.planning?.runs.flatMap(r=>r.proposals).find(d=>d.id===h?.selectedDesignId);
 const faceSnapshot=confirmedInputs?.faceBoneSnapshot??event?.request.contract.faceBoneAnalysis,face=faceSnapshot??s.faceBoneAnalysis,estimate=face.aiEstimate.find(x=>x.id===face.activeEstimateId);
 return {handoff:h,sourceStale:Boolean(h&&p&&h.sourceInputFingerprint!==proDesignFingerprint(j,p.settings)),source,finalImage:asset?.dataUrl??null,nextColors:h?.nextColors??[],aftercare:h?.aftercare??null,message:h?.message??'',faceValues:effectiveFaceBoneValues({...s,faceBoneAnalysis:face}),faceAdditionalValues:structuredClone(estimate?.additionalMeasurements??{}),faceEstimateId:face.activeEstimateId,targetLab:confirmation?.color.value??null,targetLevel:typeof targetLevel==='number'?targetLevel:null,colorText:confirmedInputs?.colorTarget.requestText??event?.request.contract.colorTarget?.requestText??(h?'確定カラー':'未確定'),designPoints:selected?.visualEffectDescription?[selected.visualEffectDescription]:[]};
}
export function supportSlot(purpose:SupportPurpose,index:number){return purpose+':'+index;}
export function supportParameters(j:Journey,purpose:SupportPurpose,index:number):SupportParameters{
 const v=supportView(j),a=j.diagnosisSession!.afterSupport,task=purpose==='MAKEUP'?'MAKEUP':purpose==='FADE_COLOR'?'FADE':null;
 const key=purpose==='MAKEUP'?makeupThemes[index]:String(index*2),plan=task?a?.plans.findLast(p=>p.task===task&&p.handoffId===v.handoff?.id&&p.sourceType==='AI_ESTIMATE'):null,item=plan?.items.find(x=>x.key===key);
 if(purpose==='NEXT_COLOR'&&!v.nextColors[index])throw new Error('Page 2で確定した次回カラーが必要です。');
 if(purpose==='FADE_COLOR'&&![1,2,3].includes(index)||purpose==='MAKEUP'&&!makeupThemes[index])throw new Error('表示枠を確認してください。');
 if(task&&!item)throw new Error('この提案は未取得です。AI提案を取得してから画像を生成してください。');
 return {nextColor:purpose==='NEXT_COLOR'?structuredClone(v.nextColors[index]):null,weeks:purpose==='FADE_COLOR'?index*2 as 2|4|6:null,makeupTheme:purpose==='MAKEUP'?makeupThemes[index]:null,description:item?.description??v.nextColors[index]?.reason??'',palette:item?.palette??[],targetLab:v.targetLab,targetLevel:null,prediction:'VISUAL_ESTIMATE_NOT_MEASURED'};
}
export function supportSignature(r:SupportRequest){return stableJson({purpose:r.purpose,source:r.source,parameters:r.parameters});}
export function visibleSupportAsset(j:Journey,purpose:SupportPurpose,index:number){
 const v=supportView(j),a=j.diagnosisSession?.afterSupport;if(!a||!v.source||v.sourceStale)return null;
 let parameters:SupportParameters;try{parameters=supportParameters(j,purpose,index);}catch{return null;}
 const sig=stableJson({purpose,source:v.source,parameters});
 const job=a.jobs.findLast(x=>x.slot===supportSlot(purpose,index)&&x.status==='COMPLETE'&&supportSignature(x.inputSnapshot)===sig);
 return job?a.assets.find(x=>x.id===job.assetId&&x.generation.origin==='REAL_API')??null:null;
}
export function queueSupportImage(j:Journey,purpose:SupportPurpose,index:number,force=false):{journey:Journey;request:SupportRequest;cached:boolean}{
 const next=ensureAfterSupport(j),v=supportView(next),a=next.diagnosisSession!.afterSupport!;
 if(!v.source||!v.finalImage)throw new Error('Page 1で本人の最終デザインを実生成し、Page 2で確定してください。');
 if(v.sourceStale)throw new Error('確定後にカウンセリング条件が変わっています。Page 2で内容を再確認してください。');
 const parameters=supportParameters(next,purpose,index),slot=supportSlot(purpose,index),signature=stableJson({purpose,source:v.source,parameters});
 const existing=a.jobs.findLast(x=>x.slot===slot&&supportSignature(x.inputSnapshot)===signature);
 if(existing&&['QUEUED','GENERATING','COMPLETE'].includes(existing.status)&&!force)return {journey:next,request:existing.inputSnapshot,cached:true};
 if(existing&&existing.attempts>=3)throw new Error('この条件の再試行は3回までです。結果を確認してください。');
 const id='support-job:'+crypto.randomUUID(),request:SupportRequest={schemaVersion:'after-support-request-v1',requestId:'support-request:'+crypto.randomUUID(),jobId:id,purpose,source:structuredClone(v.source),parameters};
 a.jobs.push({id,requestId:request.requestId,purpose,slot,source:request.source,parameters,inputSnapshot:structuredClone(request),status:'QUEUED',assetId:null,attempts:(existing?.attempts??0)+1,createdAt:at(),updatedAt:at(),error:null});a.sourceHandoffId=v.handoff!.id;a.generationJobCount++;return {journey:touch(next),request,cached:false};
}
function touch(j:Journey){const time=at();j.updatedAt=time;j.diagnosisSession!.updatedAt=time;j.diagnosisSession!.afterSupport!.updatedAt=time;return j;}
export function startSupportImage(j:Journey,id:string){const next=ensureAfterSupport(j),job=next.diagnosisSession!.afterSupport!.jobs.find(x=>x.id===id);if(!job||job.status!=='QUEUED')throw new Error('生成ジョブを確認してください。');job.status='GENERATING';job.updatedAt=at();return touch(next);}
export function finishSupportImage(j:Journey,r:SupportRequest,result:SupportImageResult,width:number,height:number){
 const next=ensureAfterSupport(j),a=next.diagnosisSession!.afterSupport!,job=a.jobs.find(x=>x.id===r.jobId);
 if(!job||job.status!=='GENERATING'||result.jobId!==r.jobId||result.requestId!==r.requestId)throw new Error('生成結果と入力が一致しません。');
 const asset={id:'support-asset:'+crypto.randomUUID(),jobId:job.id,sourceImageId:r.source.finalAssetId,confirmedDesignId:r.source.finalDesignId,purpose:r.purpose,dataUrl:result.image,width,height,generation:structuredClone(result.generation),createdAt:at(),usage:'DISPLAY_ONLY' as const,learningImageStorage:false as const};
 a.assets.push(asset);job.assetId=asset.id;job.status=supportView(next).source?.handoffId===r.source.handoffId&&!supportView(next).sourceStale?'COMPLETE':'STALE';job.updatedAt=at();return touch(next);
}
export function failSupportImage(j:Journey,id:string,error:{code:string;message:string;providerAttempted:boolean;outcomeUnknown:boolean}){const next=ensureAfterSupport(j),job=next.diagnosisSession!.afterSupport!.jobs.find(x=>x.id===id);if(!job)throw new Error('生成ジョブがありません。');if(['COMPLETE','STALE'].includes(job.status))return next;job.status='FAILED';job.error=error;job.updatedAt=at();return touch(next);}
export function appendSupportPlan(j:Journey,plan:SupportPlan){const next=ensureAfterSupport(j),v=supportView(next);if(plan.handoffId!==v.handoff?.id||plan.inputFingerprint!==v.handoff.sourceInputFingerprint||v.sourceStale)throw new Error('提案取得中に確定条件が変わりました。原本は保持しています。');next.diagnosisSession!.afterSupport!.plans.push(structuredClone(plan));return touch(next);}
export function reconcileSupport(j:Journey){const next=ensureAfterSupport(j),v=supportView(next);for(const job of next.diagnosisSession!.afterSupport!.jobs){if(job.status==='COMPLETE'&&(job.source.handoffId!==v.handoff?.id||v.sourceStale))job.status='STALE';if(['QUEUED','GENERATING'].includes(job.status)){job.status='FAILED';job.error={code:'interrupted',message:'待機が中断されました。生成・課金結果は不明です。再試行は手動です。',providerAttempted:true,outcomeUnknown:true};}}return touch(next);}
export function supportBangImage(j:Journey,label:'A'|'B'|'C'|'D'|'E'){
 const v=supportView(j),st=j.diagnosisSession?.hairSimulation;if(!v.source||!st)return null;
 const final=st.generatedAssets.find(x=>x.id===v.source!.finalAssetId),parent=st.events.find(x=>x.id===final?.eventId),job=st.jobs.find(x=>x.batchId===parent?.batchId&&x.label===label),event=job?st.events.findLast(x=>x.jobId===job.id):null;
 if(event?.status!=='COMPLETE'||(event.request.contract.colorTarget?.confirmedAdjustmentId??null)!==v.handoff!.targetConfirmationId||st.reviews.findLast(r=>r.generationId===event.id)?.decision==='REJECTED')return null;
 return st.generatedAssets.find(x=>x.id===event.assetId&&x.origin==='REAL_API')??null;
}

/** Add verified references without copying pixels or rewriting a Page 1/2 record. */
export function appendSupportFinishImage(j:Journey,role:FinishPhotoRole,image:ImageReference,actor:string){
 const next=ensureAfterSupport(j),v=supportView(next),binding=finishReference(image,role,v,actor);
 if(!resolveConfirmedFinishReference(next,v,binding))throw new Error('確定デザイン・色・撮影方向に対応した保存画像が必要です。');
 const a=next.diagnosisSession!.afterSupport!;a.finishReferences=[...(a.finishReferences??[]),binding];return touch(next);
}
export function appendSupportStylistProfile(j:Journey,profile:Omit<SupportStylistProfile,'id'|'handoffId'|'confirmedAt'>){
 const next=ensureAfterSupport(j),v=supportView(next);
 if(!v.handoff||profile.source!=='SALON_REGISTERED'||!profile.name.trim()||profile.name.length>80)throw new Error('登録済み担当者情報と確定セッションが必要です。');
 const a=next.diagnosisSession!.afterSupport!;a.stylistProfiles=[...(a.stylistProfiles??[]),{...structuredClone(profile),id:'support-stylist:'+crypto.randomUUID(),handoffId:v.handoff.id,confirmedAt:at()}];return touch(next);
}

