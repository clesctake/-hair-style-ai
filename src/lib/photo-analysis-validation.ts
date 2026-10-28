import type { DiagnosisSession } from './session-model.ts';
import { PHOTO_ANALYSIS_SCHEMA, ANALYSIS_PROVIDER, HAIR_MODEL, FACE_MODEL } from './photo-analysis-types.ts';
import { decodeMask, validateBands } from './photo-analysis-math.ts';
const fail=(m:string):never=>{throw new Error(`写真解析: ${m}`);};
export function validatePhotoAnalysis(s:DiagnosisSession){
  const state=s.photoAnalysis;if(!state)return;
  if(state.schemaVersion!==PHOTO_ANALYSIS_SCHEMA)fail('未対応の解析schemaです。原データを保持してください。');
  if(new Set(state.runs.map(r=>r.id)).size!==state.runs.length||new Set(state.regionCorrections.map(c=>c.id)).size!==state.regionCorrections.length)fail('履歴IDが重複しています。');
  for(const r of state.runs){
    if(!r.id||r.parentSessionId!==s.id||r.schemaVersion!==PHOTO_ANALYSIS_SCHEMA||r.provider!==ANALYSIS_PROVIDER||r.hairModel!==HAIR_MODEL||r.faceModel!==FACE_MODEL||!['WORKER_CPU','MAIN_THREAD_CPU'].includes(r.execution)||!['SUCCEEDED','PARTIAL','FAILED'].includes(r.status)||!Number.isFinite(Date.parse(r.createdAt)))fail('解析provider・親セッション・版が不正です。');
    if(new Set(r.inputPhotoIds).size!==r.inputPhotoIds.length||new Set(r.photos.map(p=>p.imageId)).size!==r.photos.length)fail('解析入力が重複しています。');
    for(const p of r.photos){
      if(!r.inputPhotoIds.includes(p.imageId)||p.inputRepresentation!=='ORIGINAL'||p.originalReference!==`journey-original:${p.imageId}`||!p.originalSha256.match(/^[a-f0-9]{64}$/)||![p.analysisWidth,p.analysisHeight,p.originalWidth,p.originalHeight].every(n=>Number.isInteger(n)&&n>0))fail('元画像と解析入力の参照が不正です。');
      if(p.hairRegion){const region=p.hairRegion;if(region.sourceType!=='AI_ESTIMATE'||region.imageId!==p.imageId||region.modelVersion!==HAIR_MODEL||region.mask.width!==p.analysisWidth||region.mask.height!==p.analysisHeight||region.confidenceThreshold<0||region.confidenceThreshold>1)fail('AI髪領域の出所・座標が不正です。');decodeMask(region.mask);if(region.zoneBands)validateBands(region.zoneBands);}
      for(const point of p.faceLandmarks)if(![point.x,point.y].every(Number.isFinite)||point.z!==null&&!Number.isFinite(point.z))fail('ランドマークの座標が不正です。');
      if(p.faceStatus==='MULTIPLE_FACES'&&p.faceLandmarks.length)fail('複数人物のランドマークを合成しないでください。');
    }
    const hair=s.hairAnalysis.aiEstimate.find(a=>a.id===r.hairEstimateId),face=s.faceBoneAnalysis.aiEstimate.find(a=>a.id===r.faceEstimateId);
    if(r.hairEstimateId&&!hair||r.faceEstimateId&&!face)fail('解析runと診断原本の参照が不正です。');
    if(hair)for(const zone of Object.values(hair.zones)){
      for(const key of ['baseLevel','underLevel','underTone','residualRed','residualOrange','residualYellow','naturalMelanin','artificialPigment','damage','porosity','hairThickness','grayPercentage'] as const)if(zone[key].value!==null)fail('このproviderで取得できない毛髪値をAI原本に埋めないでください。');
      for(const key of ['lightness','hue','chroma','unevenness'] as const)if(zone[key].value!==null&&zone[key].sourceType!=='AI_ESTIMATE')fail('写真解析AI原本の出所を保持してください。');
    }
    if(face&&Object.values(face.metrics).some(m=>m.value!==null&&m.sourceType!=='AI_ESTIMATE'))fail('顔解析の実値はAI_ESTIMATEとして保存してください。');
  }
  for(const c of state.regionCorrections){const r=state.runs.find(r=>r.id===c.runId),p=r?.photos.find(p=>p.imageId===c.imageId);if(!p||!p.hairRegion||c.hairRegionId!==p.hairRegion.id||c.sourceType!=='STYLIST_CORRECTED')fail('髪領域修正の原本参照が不正です。');decodeMask(c.mask);validateBands(c.zoneBands);if(c.mask.width!==p!.analysisWidth||c.mask.height!==p!.analysisHeight)fail('修正マスクの座標が不正です。');}
  if(state.activeRunId){const active=state.runs.find(r=>r.id===state.activeRunId);if(!active||active.inputPhotoIds.join('|')!==s.currentPhotos.map(p=>p.imageId).join('|'))fail('現在写真と解析runが一致しません。');}
}
