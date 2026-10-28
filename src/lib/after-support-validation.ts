import type {DiagnosisSession} from './session-model.ts';
import {AFTER_SUPPORT_MASTER_ID,supportPurposes,makeupThemes,finishPhotoRoles,type SupportRequest,type AfterSupportState} from './after-support-types.ts';
import {nextColorFamilies,toneValues} from './pro-design-types.ts';
const bad=():never=>{throw new Error('アフターサポートの入力・保存形式を確認してください。原本は保持しています。');};
export function validateSupportRequest(r:SupportRequest){
 if(!r||r.schemaVersion!=='after-support-request-v1'||typeof r.requestId!=='string'||!r.requestId||typeof r.jobId!=='string'||!r.jobId||!supportPurposes.includes(r.purpose)||!r.source||Object.values(r.source).some(v=>typeof v==='string'&&v.length>200)||!r.source.sessionId||!r.source.handoffId||!r.source.finalDesignId||!r.source.finalAssetId||!/^[a-f0-9]{64}$/.test(r.source.sha256)||!r.source.inputFingerprint)bad();
 const p=r.parameters;if(!p||p.targetLevel!==null||p.prediction!=='VISUAL_ESTIMATE_NOT_MEASURED'||typeof p.description!=='string'||p.description.length>1500||!Array.isArray(p.palette)||p.palette.length>5||p.palette.some(c=>!/^#[a-f0-9]{6}$/i.test(c)))bad();
 if(p.targetLab&&(![p.targetLab.L,p.targetLab.a,p.targetLab.b].every(Number.isFinite)||p.targetLab.L<0||p.targetLab.L>100||Math.abs(p.targetLab.a)>128||Math.abs(p.targetLab.b)>128))bad();
 if(r.purpose==='NEXT_COLOR'&&(!p.nextColor||!nextColorFamilies.includes(p.nextColor.family)||!toneValues.includes(p.nextColor.tone)||p.weeks!==null||p.makeupTheme!==null))bad();
 if(r.purpose==='FADE_COLOR'&&(![2,4,6].includes(p.weeks!)||p.nextColor!==null||p.makeupTheme!==null))bad();
 if(r.purpose==='MAKEUP'&&(!makeupThemes.includes(p.makeupTheme!)||p.nextColor!==null||p.weeks!==null||p.palette.length<3))bad();
}
export function validateAfterSupport(s:DiagnosisSession){
 const a=s.afterSupport;if(!a)return;if(a.schemaVersion!=='after-support-v1'||a.visualMasterId!==AFTER_SUPPORT_MASTER_ID||a.parentSessionId!==s.id||!Array.isArray(a.jobs)||!Array.isArray(a.assets)||!Array.isArray(a.plans)||a.generationJobCount!==a.jobs.length)bad();
 for(const items of [a.jobs,a.assets,a.plans])if(new Set(items.map(x=>x.id)).size!==items.length)bad();
 for(const job of a.jobs){validateSupportRequest(job.inputSnapshot);if(job.id!==job.inputSnapshot.jobId||job.requestId!==job.inputSnapshot.requestId||job.source.sessionId!==s.id||JSON.stringify(job.parameters)!==JSON.stringify(job.inputSnapshot.parameters)||JSON.stringify(job.source)!==JSON.stringify(job.inputSnapshot.source)||job.purpose!==job.inputSnapshot.purpose||!['QUEUED','GENERATING','COMPLETE','FAILED','STALE'].includes(job.status)||job.attempts<1||job.attempts>3||!s.proDesign?.handoffs.some(h=>h.id===job.source.handoffId&&h.finalImageReference?.assetId===job.source.finalAssetId))bad();if(['COMPLETE','STALE'].includes(job.status)&&!a.assets.some(x=>x.id===job.assetId&&x.jobId===job.id))bad();}
 for(const asset of a.assets)if(asset.usage!=='DISPLAY_ONLY'||asset.learningImageStorage!==false||!a.jobs.some(j=>j.id===asset.jobId&&j.source.finalAssetId===asset.sourceImageId&&j.source.finalDesignId===asset.confirmedDesignId&&j.purpose===asset.purpose)||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(asset.dataUrl)||asset.dataUrl.length>24_000_100||asset.width<=0||asset.height<=0||!['REAL_API','MOCK_TRANSPORT_FIXTURE'].includes(asset.generation.origin)||asset.generation.seed!==null||!/^[a-f0-9]{64}$/.test(asset.generation.sha256))bad();
 for(const plan of a.plans)if(!['FADE','MAKEUP','PRODUCT'].includes(plan.task)||!['AI_ESTIMATE','MOCK'].includes(plan.sourceType)||!plan.needsStylistReview||!s.proDesign?.handoffs.some(h=>h.id===plan.handoffId))bad();
 for(const key of ['finishReferences','stylistProfiles'] as const)if(a[key]!==undefined&&(!Array.isArray(a[key])||new Set(a[key]!.map(x=>x.id)).size!==a[key]!.length))bad();
 for(const ref of a.finishReferences??[]){const h=s.proDesign?.handoffs.find(h=>h.id===ref.handoffId);if(!ref.id||!h||ref.designId!==h.finalImageReference?.designId||ref.targetConfirmationId!==h.targetConfirmationId||!finishPhotoRoles.includes(ref.role)||!ref.image||ref.image.parentSessionId!==s.id||!['SIMULATION','AFTER'].includes(ref.image.role)||!Number.isFinite(Date.parse(ref.confirmedAt))||typeof ref.actor!=='string')bad();}
 for(const profile of a.stylistProfiles??[])if(!profile.id||!s.proDesign?.handoffs.some(h=>h.id===profile.handoffId)||profile.source!=='SALON_REGISTERED'||typeof profile.name!=='string'||!profile.name.trim()||profile.name.length>80||!Number.isFinite(Date.parse(profile.confirmedAt))||profile.photo&&(!profile.photo.imageId||profile.photo.imageUrl!==null&&typeof profile.photo.imageUrl!=='string'||profile.photo.localReference!==null&&typeof profile.photo.localReference!=='string'))bad();
}
export function assertAfterSupportHistory(previous:AfterSupportState|undefined,next:AfterSupportState|undefined){
 if(!previous)return;if(!next)bad();for(const key of ['assets','plans'] as const)for(let i=0;i<previous[key].length;i++)if(JSON.stringify(previous[key][i])!==JSON.stringify(next![key][i]))bad();
 for(const key of ['finishReferences','stylistProfiles'] as const)for(let i=0;i<(previous[key]?.length??0);i++)if(JSON.stringify(previous[key]![i])!==JSON.stringify(next![key]?.[i]))bad();
 for(const old of previous.jobs){const current=next!.jobs.find(j=>j.id===old.id);if(!current||JSON.stringify(old.inputSnapshot)!==JSON.stringify(current.inputSnapshot)||old.createdAt!==current.createdAt||old.attempts!==current.attempts||old.assetId&&old.assetId!==current.assetId)bad();}
}

