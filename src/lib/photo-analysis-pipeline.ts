import type { Journey } from './journey.ts';
import { withDiagnosisSession } from './session-adapter.ts';
import { resolveAnalysisInput, type ResolvedAnalysisPhoto } from './analysis-contract.ts';
import { emptyPhotoAnalysis, PHOTO_ANALYSIS_SCHEMA, ANALYSIS_PROVIDER, HAIR_MODEL, FACE_MODEL,
  type PhotoAnalysisRun, type AnalysisPhotoResult, type RegionCorrection, type ZoneBands, type BinaryMask } from './photo-analysis-types.ts';
import { encodeMask, maskBounds, candidateBands, observeHairZones, observeFace, validateBands, decodeMask } from './photo-analysis-math.ts';
import { segmentedPhotoQuality } from './segmented-photo-quality.ts';
import { createVisionProvider, type PhotoVisionProvider, type VisionPrediction } from './photo-analysis-provider.ts';
import { emptyHairZone, hairZones, sourcedValue, type HairEstimate, type HairZone, type HairMetric, type UnderTone, type FaceMetric } from './session-model.ts';

export const currentAnalysisRun = (journey: Journey) => {
  const state=journey.diagnosisSession?.photoAnalysis,run=state?.runs.find(r=>r.id===state.activeRunId);
  return run && run.inputPhotoIds.join('|')===journey.photos.map(p=>p.id).join('|') ? run : null;
};
export function resampleConfidence(values: Float32Array, fromW: number, fromH: number, width: number, height: number, threshold=.8) {
  if(values.length!==fromW*fromH || fromW<1||fromH<1)throw new Error('モデルの髪領域出力が不正です。');
  const mask=new Uint8Array(width*height);let total=0,count=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const v=values[Math.min(fromH-1,Math.floor((y+.5)*fromH/height))*fromW+Math.min(fromW-1,Math.floor((x+.5)*fromW/width))];if(Number.isFinite(v)&&v>=threshold){mask[y*width+x]=1;total+=v;count++;}}
  return {mask,meanSelectedConfidence:count?total/count:null};
}
/** Derive a processing buffer from ORIGINAL bytes. The resize is explicitly recorded, never substituted into storage. */
export async function decodeAnalysisOriginal(photo: ResolvedAnalysisPhoto, maxSize=1024) {
  if(!photo.original)throw new Error(photo.unavailableReason??'元画像がありません。');
  const image=new Image();image.src=photo.original.dataUrl;await image.decode();
  const w=image.naturalWidth,h=image.naturalHeight;
  if(!w||!h||w*h>80_000_000)throw new Error('画像が大きすぎます。80MP以下の写真を選んでください。');
  const scale=Math.min(1,maxSize/Math.max(w,h)),canvas=document.createElement('canvas');canvas.width=Math.max(8,Math.round(w*scale));canvas.height=Math.max(8,Math.round(h*scale));
  const ctx=canvas.getContext('2d',{willReadFrequently:true,colorSpace:'srgb'});if(!ctx)throw new Error('元画像を解析用に展開できません。');
  ctx.drawImage(image,0,0,canvas.width,canvas.height);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
  const bytes=Uint8Array.from(atob(photo.original.dataUrl.split(',')[1]),c=>c.charCodeAt(0));
  if(!crypto.subtle)throw new Error('画像解析はHTTPSのWeb画面で開いてください。');
  const originalSha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  image.src='';const width=canvas.width,height=canvas.height;canvas.width=canvas.height=1;
  return {pixels,width,height,originalWidth:w,originalHeight:h,originalSha256};
}
export function photoPredictionResult(photo: ResolvedAnalysisPhoto, decoded: Awaited<ReturnType<typeof decodeAnalysisOriginal>>, prediction: VisionPrediction, runId: string, createdAt: string): AnalysisPhotoResult {
  const {pixels,width,height}=decoded,detectFace=photo.photo.direction!=='BACK';
  const selected=prediction.hairConfidence&&prediction.maskWidth&&prediction.maskHeight?resampleConfidence(prediction.hairConfidence,prediction.maskWidth,prediction.maskHeight,width,height):null;
  const hairPixels=selected?.mask.reduce((n,v)=>n+v,0)??0,bounds=selected?maskBounds(selected.mask,width,height):null;
  const hairRegion=selected&&hairPixels>=32?{id:`region:${runId}:${photo.photo.imageId}`,imageId:photo.photo.imageId,modelVersion:HAIR_MODEL,sourceType:'AI_ESTIMATE' as const,
    mask:encodeMask(selected.mask,width,height),confidenceThreshold:.8,meanSelectedConfidence:selected.meanSelectedConfidence,bounds,zoneBands:candidateBands(selected.mask,width,height),zoneMethod:'IMAGE_VERTICAL_BANDS_NOT_ANATOMICAL_ROOTS' as const,needsStylistConfirmation:true as const}:null;
  const multiple=prediction.faces.length>1,landmarks=multiple?[]:prediction.faces[0]??[],faceFailed=prediction.errors.some(e=>e.startsWith('FACE_')),hairFailed=prediction.errors.some(e=>e.startsWith('HAIR_'));
  return {imageId:photo.photo.imageId,direction:photo.photo.direction,source:photo.photo.source,inputRepresentation:'ORIGINAL',originalReference:photo.photo.originalReference!,originalWidth:decoded.originalWidth,originalHeight:decoded.originalHeight,
    analysisWidth:width,analysisHeight:height,orientation:'BROWSER_EXIF_ORIENTED',calibration:'UNCALIBRATED',originalSha256:decoded.originalSha256,
    hairStatus:hairRegion?'SUCCEEDED':hairFailed?'FAILED':'NO_HAIR',faceStatus:!detectFace?'NOT_APPLICABLE':faceFailed?'FAILED':multiple?'MULTIPLE_FACES':landmarks.length?'SUCCEEDED':'NO_FACE',hairRegion,
    hairZones:hairRegion?observeHairZones(pixels,width,height,hairRegion.mask,hairRegion.zoneBands,hairRegion.id,createdAt):{ROOT:null,MID:null,END:null},faceLandmarks:landmarks,
    quality:segmentedPhotoQuality(photo.photo.imageId,pixels,width,height,hairRegion?.mask??null,landmarks,createdAt,photo.quality),errors:prediction.errors};
}
export async function analyzeCurrentPhotos(journey: Journey, options: { provider?: PhotoVisionProvider; onProgress?: (message:string)=>void; signal?: AbortSignal } = {}): Promise<PhotoAnalysisRun> {
  const input=resolveAnalysisInput(journey); if(!input.photos.length)throw new Error('現在の写真を追加してください。');
  const eligible=input.photos.filter(p=>p.original);if(!eligible.length)throw new Error('解析用元画像がありません。カメラか写真ライブラリから登録してください。縮小サンプルは解析に使いません。');
  options.onProgress?.('解析モデルを準備しています。');const provider=options.provider??await createVisionProvider(),id=crypto.randomUUID(),createdAt=new Date().toISOString();
  const run:PhotoAnalysisRun={id,parentSessionId:input.parentSessionId,createdAt,schemaVersion:PHOTO_ANALYSIS_SCHEMA,provider:ANALYSIS_PROVIDER,hairModel:HAIR_MODEL,faceModel:FACE_MODEL,execution:provider.execution,status:'FAILED',inputPhotoIds:input.currentPhotos.map(p=>p.imageId),skipped:input.photos.filter(p=>!p.original).map(p=>({imageId:p.photo.imageId,reason:p.unavailableReason??'元画像がありません。'})),photos:[],hairEstimateId:null,faceEstimateId:null,representativeColorPhotoId:null,representativeFacePhotoId:null};
  const abort=()=>provider.close();options.signal?.addEventListener('abort',abort,{once:true});
  try{for(const [i,photo] of eligible.entries()){
    if(options.signal?.aborted)throw new Error('解析を中止しました。');options.onProgress?.(`${i+1} / ${eligible.length} · 髪と顔の位置を解析しています。`);
    try{const decoded=await decodeAnalysisOriginal(photo);const prediction=await provider.predict(decoded.pixels,decoded.width,decoded.height,photo.photo.direction!=='BACK');
      if(options.signal?.aborted)throw new Error('解析を中止しました。');run.execution=provider.execution;run.photos.push(photoPredictionResult(photo,decoded,prediction,id,createdAt));
    }catch(e){if(options.signal?.aborted)throw e;run.skipped.push({imageId:photo.photo.imageId,reason:e instanceof Error?e.message:'解析に失敗しました。'});}
  }}finally{options.signal?.removeEventListener('abort',abort);provider.close();}
  // Do not average different directions, illumination or cropped views into one pseudo-measurement.
  const colorPhoto=run.photos.find(p=>p.direction==='FRONT'&&p.hairStatus==='SUCCEEDED')??run.photos.find(p=>p.hairStatus==='SUCCEEDED');
  const facePhoto=run.photos.find(p=>p.direction==='FRONT'&&p.faceStatus==='SUCCEEDED')??run.photos.find(p=>p.faceStatus==='SUCCEEDED');
  run.representativeColorPhotoId=colorPhoto?.imageId??null;run.representativeFacePhotoId=facePhoto?.imageId??null;
  run.hairEstimateId=colorPhoto?`hair-estimate:${id}`:null;run.faceEstimateId=facePhoto?`face-estimate:${id}`:null;
  run.status=run.hairEstimateId||run.faceEstimateId ? (run.skipped.length||run.photos.some(p=>p.hairStatus!=='SUCCEEDED'||!['SUCCEEDED','NOT_APPLICABLE'].includes(p.faceStatus))?'PARTIAL':'SUCCEEDED'):'FAILED';
  return run;
}
export function commitPhotoAnalysis(journey: Journey, run: PhotoAnalysisRun): Journey {
  const next=withDiagnosisSession(journey),s=next.diagnosisSession!;
  if(run.parentSessionId!==s.id||run.inputPhotoIds.join('|')!==s.currentPhotos.map(p=>p.imageId).join('|'))throw new Error('写真が変更されたため解析結果を採用できません。再解析してください。');
  if((s.photoAnalysis?.runs??[]).some(r=>r.id===run.id))throw new Error('同じ解析結果は二重保存できません。');
  s.photoAnalysis??=emptyPhotoAnalysis();s.photoAnalysis.runs.push(structuredClone(run));s.photoAnalysis.activeRunId=run.id;
  const colorPhoto=run.photos.find(p=>p.imageId===run.representativeColorPhotoId);
  if(colorPhoto&&run.hairEstimateId){const zones=Object.fromEntries(hairZones.map(zone=>{const v=emptyHairZone(),observed=colorPhoto.hairZones[zone];if(observed){v.color=structuredClone(observed.color);for(const key of ['lightness','hue','chroma','unevenness'] as const)v[key]=structuredClone(observed[key]);}return [zone,v];})) as HairEstimate['zones'];
    s.hairAnalysis.aiEstimate.push({id:run.hairEstimateId,inputPhotoIds:run.photos.map(p=>p.imageId),createdAt:run.createdAt,featureState:'PARTIAL',modelVersion:HAIR_MODEL,zones});
  }
  s.hairAnalysis.activeEstimateId=run.hairEstimateId;
  const facePhoto=run.photos.find(p=>p.imageId===run.representativeFacePhotoId);
  if(facePhoto&&run.faceEstimateId){const estimate=observeFace(facePhoto.faceLandmarks,facePhoto.analysisWidth,facePhoto.analysisHeight,facePhoto.imageId,run.faceEstimateId,run.createdAt,facePhoto.direction);
    estimate.inputPhotoIds=run.photos.filter(p=>p.faceStatus!=='NOT_APPLICABLE').map(p=>p.imageId);estimate.landmarks=run.photos.flatMap(p=>p.faceLandmarks.map((l,i)=>({imageId:p.imageId,key:`mediapipe:${i}`,x:l.x,y:l.y,sourceType:'AI_ESTIMATE' as const})));
    s.faceBoneAnalysis.aiEstimate.push(estimate);
  }
  s.faceBoneAnalysis.activeEstimateId=run.faceEstimateId;
  for(const photo of run.photos){const q=s.photoQuality.find(p=>p.imageId===photo.imageId),p=s.currentPhotos.find(p=>p.imageId===photo.imageId);if(q)Object.assign(q,structuredClone(photo.quality));if(p){p.qualityStatus=photo.quality.status;p.qualityScore=photo.quality.score;p.qualityFlags=structuredClone(photo.quality.flags);}}
  s.designPlan.inputs.hairEstimateId=s.hairAnalysis.activeEstimateId;s.designPlan.inputs.faceEstimateId=s.faceBoneAnalysis.activeEstimateId;if(s.designPlan.mainDesign.generationStatus==='NOT_REQUESTED')s.designPlan.mainDesign.faceBoneAnalysisReference=s.faceBoneAnalysis.activeEstimateId;
  if(colorPhoto)for(const zone of hairZones)s.colorPlan.zones[zone].currentColor=structuredClone(colorPhoto.hairZones[zone]?.color??null);
  return withDiagnosisSession(next);
}
export function correctObservedHair(journey:Journey,zone:HairZone,metric:HairMetric,value:number|UnderTone|null):Journey {
  const next=withDiagnosisSession(journey),s=next.diagnosisSession!,estimateId=s.hairAnalysis.activeEstimateId;
  if(!estimateId)throw new Error('先に写真を解析してください。');
  if(value!==null&&typeof value==='number'&&!Number.isFinite(value))throw new Error('補正値を確認してください。');
  const id=crypto.randomUUID(),createdAt=new Date().toISOString(),previous=s.hairAnalysis.stylistCorrection.findLast(c=>c.estimateId===estimateId&&c.zone===zone&&c.metric===metric);
  s.hairAnalysis.stylistCorrection.push({id,estimateId,overridesId:previous?.id??null,zone,metric,value:sourcedValue(value,'STYLIST_CORRECTED',id,createdAt,value===null?'stylist_clear_to_unknown':'stylist_photo_analysis_confirmation'),actor:journey.stylist||'担当美容師',createdAt});return withDiagnosisSession(next);
}
export function correctObservedFace(journey:Journey,metric:FaceMetric,value:number|null):Journey {
  const next=withDiagnosisSession(journey),s=next.diagnosisSession!,estimateId=s.faceBoneAnalysis.activeEstimateId;
  if(!estimateId)throw new Error('先にお顔の位置関係を取得してください。');
  if(value!==null&&(!Number.isFinite(value)||value<0||value>10))throw new Error('画像上の比率・位置の確認値を入力してください。');
  const id=crypto.randomUUID(),createdAt=new Date().toISOString();s.faceBoneAnalysis.stylistCorrection.push({id,estimateId,metric,value:sourcedValue(value,'STYLIST_CORRECTED',id,createdAt,value===null?'stylist_clear_to_unknown':'stylist_face_surface_confirmation'),actor:journey.stylist||'担当美容師',createdAt});return withDiagnosisSession(next);
}
export async function correctHairRegion(journey:Journey,photo:AnalysisPhotoResult,mask:BinaryMask,bands:ZoneBands):Promise<Journey>{
  validateBands(bands);decodeMask(mask);const run=currentAnalysisRun(journey);if(!run||!photo.hairRegion)throw new Error('髪領域の解析結果がありません。');
  const input=resolveAnalysisInput(journey),resolved=input.photos.find(p=>p.photo.imageId===photo.imageId);if(!resolved)throw new Error('元画像がありません。');
  const decoded=await decodeAnalysisOriginal(resolved);if(decoded.width!==mask.width||decoded.height!==mask.height||decoded.originalSha256!==photo.originalSha256)throw new Error('髪領域の元画像が一致しません。');
  const id=crypto.randomUUID(),createdAt=new Date().toISOString(),zoneValues=observeHairZones(decoded.pixels,decoded.width,decoded.height,mask,bands,id,createdAt,'STYLIST_CORRECTED');
  const next=withDiagnosisSession(journey),s=next.diagnosisSession!,correction:RegionCorrection={id,runId:run.id,hairRegionId:photo.hairRegion.id,imageId:photo.imageId,createdAt,sourceType:'STYLIST_CORRECTED',actor:journey.stylist||'担当美容師',zoneBands:bands,mask,zoneValues};
  s.photoAnalysis!.regionCorrections.push(correction);
  if(photo.imageId===run.representativeColorPhotoId)for(const zone of hairZones)for(const metric of ['lightness','hue','chroma','unevenness'] as const){const previous=s.hairAnalysis.stylistCorrection.findLast(c=>c.estimateId===run.hairEstimateId&&c.zone===zone&&c.metric===metric);
    s.hairAnalysis.stylistCorrection.push({id:`${id}:${zone}:${metric}`,estimateId:run.hairEstimateId,overridesId:previous?.id??null,zone,metric,value:zoneValues[zone]?.[metric]??sourcedValue<number>(null,null,id,createdAt,'stylist_clear_to_unknown'),actor:correction.actor,createdAt});}
  return withDiagnosisSession(next);
}
