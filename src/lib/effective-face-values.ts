import {faceMetricNames,unknownValue,type DiagnosisSession,type FaceMetric,type SourcedValue,type FaceCorrection} from './session-model.ts';
export function currentFaceCorrection(session:DiagnosisSession,c:FaceCorrection){
 if(c.estimateId!==null)return c.estimateId===session.faceBoneAnalysis.activeEstimateId;
 return session.faceBoneAnalysis.activeEstimateId===null&&JSON.stringify(c.inputPhotoIds)===JSON.stringify(session.currentPhotos.map(p=>p.imageId).sort());
}
/** Clear-to-null is an explicit stylist decision and never resurrects the AI value. */
export function effectiveFaceBoneValues(session:DiagnosisSession):Record<FaceMetric,SourcedValue<number>> {
  const analysis=session.faceBoneAnalysis,original=analysis.aiEstimate.find(a=>a.id===analysis.activeEstimateId);
  const result=Object.fromEntries(faceMetricNames.map(key=>[key,structuredClone(original?.metrics[key]??unknownValue<number>())])) as Record<FaceMetric,SourcedValue<number>>;
  for(const correction of analysis.stylistCorrection)if(currentFaceCorrection(session,correction))result[correction.metric]=structuredClone(correction.value);
  return result;
}
export function effectiveFaceCorrectionIds(session:DiagnosisSession):Partial<Record<FaceMetric,string>> {
  const result:Partial<Record<FaceMetric,string>>={};for(const correction of session.faceBoneAnalysis.stylistCorrection)if(currentFaceCorrection(session,correction))result[correction.metric]=correction.id;return result;
}
/** Report available evidence without mistaking a registered photo or stylist value for AI success. */
export function faceAnalysisSummary(session:DiagnosisSession){
 const original=session.faceBoneAnalysis.aiEstimate.find(a=>a.id===session.faceBoneAnalysis.activeEstimateId);
 const aiCount=original?Object.values(original.metrics).filter(v=>v.value!==null).length:0;
 const manualCount=Object.values(effectiveFaceBoneValues(session)).filter(v=>v.value!==null&&v.sourceType==='STYLIST_CORRECTED').length;
 return {title:aiCount?'顔の位置関係を取得しました':manualCount?'美容師確認値を保存しています':original?.landmarks.length?'側面ランドマーク取得 · 比率は未取得':'顔・骨格は未取得',
  detail:original?`AI推定 · ${original.landmarks.length}点／画像上の2D関係${manualCount?` · 美容師確認 ${manualCount}項目`:''}`:
   session.currentPhotos.some(p=>p.direction==='FRONT')?`AI解析は未完了${manualCount?` · 美容師確認 ${manualCount}項目（AI推定と別保存）`:' · 詳細から美容師確認を入力できます'}`:'正面写真をご用意ください'};
}
