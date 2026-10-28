import type {Journey} from './journey.ts';
import type {ImageReference} from './session-model.ts';
import type {SalonProduct,ProductImage,ProductRecommendation} from './takeaway-contract.ts';
import type {NextColorSelection} from './pro-design-types.ts';
import type {SupportView,FinishPhotoRole,SupportFinishReference} from './after-support-types.ts';
import {resolveSessionImage} from './session-adapter.ts';
import {stableJson} from './hair-simulation-context.ts';

export type FinishPhoto={src:string;imageId:string;origin:'REAL_API'|'EMPIRICAL'};
function savedDirection(j:Journey,reference:ImageReference):string|undefined {
  const photoDirection=j.photos.concat(j.analysisPhotoArchive??[]).find(x=>x.id===reference.imageId)?.view.toUpperCase();
  const declared='direction' in reference&&typeof reference.direction==='string'&&['FRONT','RIGHT','LEFT','BACK'].includes(reference.direction)?reference.direction:undefined;
  if(photoDirection&&declared&&photoDirection!==declared)return undefined;
  return declared??photoDirection;
}

/** URLs may point to registered raster assets; internal reference schemes are not image URLs. */
export function registeredImageUrl(image:ProductImage|null|undefined):string|null {
  const url=image?.imageUrl??image?.localReference;
  if(!url)return null;
  if(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(url))return url;
  if(/^\/(?!\/)[^\s\\]+$/.test(url))return url;
  try{const parsed=new URL(url);return parsed.protocol==='https:'&&!parsed.username&&!parsed.password?url:null;}catch{return null;}
}

/** Prove provenance and viewing angle from saved data rather than a filename or slot label. */
export function resolveConfirmedFinishReference(j:Journey,v:SupportView,binding:SupportFinishReference):FinishPhoto|null {
  const s=j.diagnosisSession,st=s?.hairSimulation;
  if(!s||!v.handoff||!v.source||binding.handoffId!==v.handoff.id||binding.designId!==v.source.finalDesignId||binding.targetConfirmationId!==v.handoff.targetConfirmationId||binding.image.parentSessionId!==s.id)return null;
  const image=binding.image;
  let origin:FinishPhoto['origin'],direction:string|undefined;
  if(image.role==='SIMULATION'){
    const asset=st?.generatedAssets.find(x=>x.id===image.imageId&&x.origin==='REAL_API'),event=st?.events.find(x=>x.id===asset?.eventId);
    const final=st?.generatedAssets.find(x=>x.id===v.source!.finalAssetId),parent=st?.events.find(x=>x.id===final?.eventId);
    if(!asset||!event||!parent||event.status!=='COMPLETE'||event.request.designId!==v.source.finalDesignId||(event.request.contract.colorTarget?.confirmedAdjustmentId??null)!==v.handoff.targetConfirmationId||stableJson(event.request.contract.colorTarget)!==stableJson(parent.request.contract.colorTarget)||stableJson(event.request.contract.styleTarget)!==stableJson(parent.request.contract.styleTarget)||st?.reviews.findLast(x=>x.generationId===event.id)?.decision==='REJECTED')return null;
    direction=savedDirection(j,event.request.contract.currentPhoto);
    origin='REAL_API';
  }else if(image.role==='AFTER'){
    const actual=s.treatmentResult.actual;
    if(!actual?.confirmed||actual.originProposalId!==v.handoff.selectedRecipeId||!s.treatmentResult.afterPhotos.some(x=>x.imageId===image.imageId)||image.sourceType!=='EMPIRICAL')return null;
    const after=j.after?.id===image.imageId?j.after:null;
    if(!after)return null;
    direction=after.view.toUpperCase();origin='EMPIRICAL';
  }else return null; // CURRENT and reference images are never final results.
  if(binding.role==='SIDE'&&!['RIGHT','LEFT','SIDE'].includes(direction??''))return null;
  if(binding.role==='BACK'&&direction!=='BACK'||binding.role==='FRONT'&&direction!=='FRONT')return null;
  try{return {src:resolveSessionImage(j,image).dataUrl,imageId:image.imageId,origin};}catch{return null;}
}

/** FRONT is the exact Page 2 handoff; other angles require matching saved evidence. */
export function supportFinishPhotos(j:Journey,v:SupportView):Record<FinishPhotoRole,FinishPhoto|null> {
  const result:Record<FinishPhotoRole,FinishPhoto|null>={FRONT:v.finalImage&&v.source?{src:v.finalImage,imageId:v.source.finalAssetId,origin:'REAL_API'}:null,SIDE:null,BACK:null,FACE_FRAME:null,HAIR_DETAIL:null,COLOR_TEXTURE:null};
  for(const binding of j.diagnosisSession?.afterSupport?.finishReferences??[]){
    if(binding.role==='FRONT')continue; // Additional photos cannot replace the confirmed main image.
    const resolved=resolveConfirmedFinishReference(j,v,binding);
    if(resolved)result[binding.role]=resolved;
  }
  // Existing MAIN/variant histories may already contain an angle-specific result.
  // Only a matching design, STYLE and COLOR can be inferred; detail roles remain explicit.
  const st=j.diagnosisSession?.hairSimulation;
  for(const event of st?.events??[]){
    const direction=savedDirection(j,event.request.contract.currentPhoto);
    const role=direction==='BACK'?'BACK':['RIGHT','LEFT','SIDE'].includes(direction??'')?'SIDE':null;
    if(!role||result[role]||!event.assetId||!v.source||!v.handoff)continue;
    const asset=st!.generatedAssets.find(x=>x.id===event.assetId);
    if(!asset)continue;
    const binding:SupportFinishReference={id:event.id,handoffId:v.handoff.id,designId:v.source.finalDesignId,targetConfirmationId:v.handoff.targetConfirmationId,role,image:asset.reference,confirmedAt:event.createdAt,actor:'saved_generation_reference'};
    result[role]=resolveConfirmedFinishReference(j,v,binding);
  }
  return result;
}

/** Keep the approved five palette slots; unknown colors stay empty, not invented HEX values. */
export function supportPaletteSlots(palette:readonly string[]):(string|null)[] {
  return Array.from({length:5},(_,index)=>palette[index]??null);
}

/** Mirror existing Page 1 values; never infer a new face classification or physical skeleton. */
export function supportFaceRows(v:SupportView,hasGuide:boolean){
 const value=(key:keyof typeof v.faceValues)=>{const item=v.faceValues[key];return item?.sourceType!=='MOCK'&&typeof item?.value==='number'?item.value:null;};
 const ratio=value('faceHeightWidthRatio'),nose=v.faceAdditionalValues?.nosePosition;
 return [['顔型','未判定'],['縦横比',ratio!==null?'1 : '+ratio.toFixed(2):'未取得'],['額の比率',value('foreheadHeightRatio')?.toFixed(2)??'未取得'],['鼻の位置',nose?.sourceType!=='MOCK'&&typeof nose?.value==='number'?nose.value.toFixed(2):'未取得'],['口の位置',hasGuide?'ガイドを参照':'未取得'],['顎の比率',value('lowerFaceRatio')?.toFixed(2)??'未取得'],['フェイスライン','美容師確認'],['骨格タイプ','物理骨格は未実装']];
}

export function supportNextToneLabel(option:NextColorSelection|undefined,level:number|null){
 if(!option)return '明るさ 未算出';
 const label={DOWN:'トーンダウン',BASE:'確定カラーを基準',UP:'トーンアップ'}[option.tone];
 return level===null?label:option.tone==='BASE'?level+' Lv（確定色）':label+'（基準 '+level+' Lv）';
}

function confirmedProductRecommendation(j:Journey,v:SupportView,product:SalonProduct):ProductRecommendation|null {
  const takeaway=j.diagnosisSession?.customerTakeaway,layers=takeaway?.productRecommendations;
  if(!takeaway||!layers||takeaway.parentSessionId!==j.diagnosisSession?.id||!v.handoff)return null;
  const selected=layers.stylistSelected.find(x=>x.id===layers.activeSelectionId);
  if(!selected||selected.state!=='STYLIST_SELECTED'||!selected.actor.trim()||!Number.isFinite(Date.parse(selected.createdAt)))return null;
  const edited=layers.stylistEdited.find(x=>x.id===layers.activeEditId&&x.selectionId===selected.id&&x.state==='STYLIST_EDITED'&&x.actor.trim()&&Number.isFinite(Date.parse(x.createdAt)));
  const recommendation=(edited?.value??selected.value).find(x=>x.productId===product.productId);
  if(!recommendation||recommendation.selectedProductSnapshot.productName!==product.productName||recommendation.selectedProductSnapshot.brand!==product.brand||recommendation.sourceFinalDesignId!==v.handoff.finalImageReference?.designId)return null;
  return recommendation;
}
export function supportProductCopy(j:Journey,v:SupportView,product:SalonProduct){
  if(!v.aftercare?.productIds.includes(product.productId))return null;
  const confirmed=confirmedProductRecommendation(j,v,product);
  return {image:registeredImageUrl(product.image),reason:confirmed?.recommendationReason??product.features.join('、'),usageAdvice:confirmed?.usageAdvice??product.usageMethod,usageTiming:confirmed?.usageTiming??product.usageTiming,source:confirmed?'STYLIST_CORRECTED' as const:'REGISTERED_PRODUCT' as const};
}

export function supportStylist(j:Journey,v:SupportView){
  const profile=j.diagnosisSession?.afterSupport?.stylistProfiles?.findLast(x=>x.handoffId===v.handoff?.id&&x.source==='SALON_REGISTERED');
  return {name:profile?.name??j.stylist.trim(),photo:registeredImageUrl(profile?.photo)};
}

/** The confirmed explanation is reused verbatim. No new face diagnosis is inferred here. */
export function supportDesignPoints(j:Journey,v:SupportView):string[] {
  const result=j.diagnosisSession?.customerTakeaway?.currentResult;
  if(result?.designId&&[v.handoff?.selectedDesignId,v.handoff?.finalImageReference?.designId].includes(result.designId)&&result.finishPoints.length)return [...result.finishPoints];
  return [...v.designPoints];
}

export function finishReference(image:ImageReference,role:FinishPhotoRole,v:SupportView,actor:string):SupportFinishReference {
  if(!v.handoff||!v.source)throw new Error('本人の確定デザインが必要です。');
  return {id:'support-finish:'+crypto.randomUUID(),handoffId:v.handoff.id,designId:v.source.finalDesignId,targetConfirmationId:v.handoff.targetConfirmationId,role,image:structuredClone(image),confirmedAt:new Date().toISOString(),actor};
}
