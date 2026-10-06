import {faceMetricNames,unknownValue,type DiagnosisSession,type FaceMetric,type SourcedValue} from './session-model.ts';
/** Clear-to-null is an explicit stylist decision and never resurrects the AI value. */
export function effectiveFaceBoneValues(session:DiagnosisSession):Record<FaceMetric,SourcedValue<number>> {
  const analysis=session.faceBoneAnalysis,original=analysis.aiEstimate.find(a=>a.id===analysis.activeEstimateId);
  const result=Object.fromEntries(faceMetricNames.map(key=>[key,structuredClone(original?.metrics[key]??unknownValue<number>())])) as Record<FaceMetric,SourcedValue<number>>;
  for(const correction of analysis.stylistCorrection)if(correction.estimateId===analysis.activeEstimateId)result[correction.metric]=structuredClone(correction.value);
  return result;
}
export function effectiveFaceCorrectionIds(session:DiagnosisSession):Partial<Record<FaceMetric,string>> {
  const result:Partial<Record<FaceMetric,string>>={};for(const correction of session.faceBoneAnalysis.stylistCorrection)if(correction.estimateId===session.faceBoneAnalysis.activeEstimateId)result[correction.metric]=correction.id;return result;
}
