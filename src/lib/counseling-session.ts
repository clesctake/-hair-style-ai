import type {Journey,Photo} from './journey.ts';
import {withDiagnosisSession} from './session-adapter.ts';
import {sourcedValue,hairZones,type HairMetric,type HairHistory} from './session-model.ts';
import {selectedSimulationAsset} from './hair-simulation-context.ts';
import type {HairMask} from './hair-mask.ts';

export const COUNSELING_MASTER_ID='file_0000000039ec81fd894d833f5e3b914b' as const;
/** The previous identity is retained for old records; only this latest master renders Page 1. */
export const COUNSELING_FINAL_MASTER_ID='file_00000000959c8206b6431a850bae77ca' as const;
export const counselingRows = [
 {key:'colorHistory',label:'カラー履歴',options:['なし','あり','不明'],preview:'なし',historyType:'COLOR'},
 {key:'bleachHistory',label:'ブリーチ履歴',options:['なし','1回','複数回'],preview:'なし',historyType:'BLEACH'},
 {key:'straighteningHistory',label:'縮毛矯正',options:['なし','あり'],preview:'なし',historyType:'STRAIGHTENING'},
 {key:'permHistory',label:'パーマ',options:['なし','あり'],preview:'なし',historyType:'PERM'},
 {key:'grayPercentage',label:'白髪率',options:['なし','～10%','10～30%','30%以上'],preview:null,metric:'grayPercentage'},
 {key:'damage',label:'ダメージレベル',options:['低','中','高'],preview:'中',metric:'damage'},
 {key:'porosity',label:'ポロシティ',options:['低','中','高'],preview:'中',metric:'porosity'},
 {key:'hairThickness',label:'毛髪の太さ',options:['細い','普通','太い'],preview:'普通',metric:'hairThickness'},
] as const;
export type CounselingField=typeof counselingRows[number]['key'];
export type CounselingState={
 schemaVersion:'counseling-page1-v1';visualMasterId:typeof COUNSELING_MASTER_ID;
 inputs:Record<CounselingField,string|null>;historyNote:string;requestNote:string;
 selectedMockPreview:string|null;selectedColorFamily:string|null;
 renderMasterId?:typeof COUNSELING_FINAL_MASTER_ID;
 styleReferenceViews?:Partial<Record<'FRONT'|'RIGHT'|'LEFT'|'BACK',Photo>>;
 colorReferenceViews?:Partial<Record<'FRONT'|'RIGHT'|'LEFT'|'BACK',Photo>>;
 personHairMasks?:Record<string,HairMask>;
 personColorPreviews?:{id:string;sourceCurrentPhotoId:string;targetConfirmationId:string;referencePhotoId:string;previewPhoto:Photo;maskSource:'AI_ESTIMATE'|'STYLIST_CORRECTED'|'MOCK';createdAt:string;kind:'LIGHTWEIGHT_HAIR_ONLY_NOT_GENERATED'}[];
 analysisContext?:{currentPhotoIds:string[];styleReferenceId:string|null;colorReferenceId:string|null;stylistInputs:CounselingState['inputs'];historyNote:string;requestNote:string;createdAt:string};
 generationDesignRequests?:{runId:string;version:'page1-design-directions-v1';createdAt:string};
 combinedInputs?:{inputs:CounselingState['inputs'];historyNote:string;requestNote:string};
 confirmation:{id:string;at:string;sourceType:'STYLIST_CORRECTED';selectedDesignId:string|null;mockPreview:string|null;targetConfirmationId:string|null;generationState:'PARTIAL'|'REAL';page2Status:'AWAITING_USER_APPROVAL'}|null;
};
export function emptyCounselingState():CounselingState{return {schemaVersion:'counseling-page1-v1',visualMasterId:COUNSELING_MASTER_ID,inputs:Object.fromEntries(counselingRows.map(r=>[r.key,null])) as CounselingState['inputs'],historyNote:'',requestNote:'',selectedMockPreview:null,selectedColorFamily:null,confirmation:null};}
export function counselingState(j:Journey):CounselingState{return j.diagnosisSession?.counseling??emptyCounselingState();}
export function editCounseling(j:Journey,update:Partial<CounselingState>):Journey {
 const next=withDiagnosisSession(j),state={...counselingState(next),...structuredClone(update)};
 if(state.combinedInputs)state.combinedInputs={inputs:structuredClone(state.inputs),historyNote:state.historyNote,requestNote:state.requestNote};
 next.diagnosisSession!.counseling=state;return next;
}
function appendHairInput(j:Journey,metric:HairMetric,value:number|null,method:string):Journey {
 const s=j.diagnosisSession!,estimateId=s.hairAnalysis.activeEstimateId,at=new Date().toISOString();
 for(const zone of hairZones){
  const prior=s.hairAnalysis.stylistCorrection.findLast(c=>c.estimateId===estimateId&&c.zone===zone&&c.metric===metric);
  const id=`counseling-hair:${crypto.randomUUID()}`;
  s.hairAnalysis.stylistCorrection.push({id,estimateId,overridesId:prior?.id??null,zone,metric,value:sourcedValue(value,value===null?null:'STYLIST_CORRECTED',id,at,value===null?'stylist_clear_to_unknown':method),actor:j.stylist||'担当美容師',createdAt:at});
 }return j;
}
export function setCounselingInput(j:Journey,key:CounselingField,choice:string|null):Journey {
 const row=counselingRows.find(r=>r.key===key)!;
 if(choice!==null&&!(row.options as readonly string[]).includes(choice))throw new Error('選択項目が不正です。');
 let next=editCounseling(j,{inputs:{...counselingState(j).inputs,[key]:choice},confirmation:null});
 const s=next.diagnosisSession!,at=new Date().toISOString();
 if('historyType' in row){const id=`counseling-history:${crypto.randomUUID()}`;
  s.hairHistory.push({id,parentSessionId:s.id,type:row.historyType as HairHistory['type'],legacyType:null,date:null,area:'ALL',count:choice==='なし'?0:choice==='1回'?1:null,note:`${row.label}: ${choice??'未確認'}（今回の問診。施術日・回数の不明値はnull）`,source:sourcedValue(choice,choice===null?null:'STYLIST_CORRECTED',id,at,'counseling_history_assessment'),ambiguity:choice==='複数回'?'正確な回数は未確認':null});
 }else if(row.metric==='grayPercentage'){
  // Bands are observations, not invented exact percentages. Only explicit zero is numeric.
  next=appendHairInput(next,'grayPercentage',choice==='なし'?0:null,'stylist_reported_zero_gray');
 }else {const n=choice===null?null:row.options.indexOf(choice as never)*2+1;next=appendHairInput(next,row.metric,n,'stylist_ordinal_global_assessment');}
 return next;
}
/** Rebind confirmed stylist inputs to the new AI estimate without overwriting either history. */
export function reapplyCounselingHairInputs(j:Journey):Journey {
 let next=j;for(const row of counselingRows){const value=counselingState(j).inputs[row.key];if('metric' in row&&value!==null){const n=row.metric==='grayPercentage'?(value==='なし'?0:null):row.options.indexOf(value as never)*2+1;next=appendHairInput(next,row.metric,n,'stylist_ordinal_global_assessment');}}return next;
}
export function resetCounselingInputs(j:Journey):Journey {let next=j;for(const r of counselingRows)next=setCounselingInput(next,r.key,null);return editCounseling(next,{historyNote:'',requestNote:'',confirmation:null});}
export function confirmCounseling(j:Journey,selectedDesignId:string|null):Journey {
 const candidate=j.diagnosisSession?selectedSimulationAsset(j.diagnosisSession):null;
 const event=j.diagnosisSession?.hairSimulation?.events.find(e=>e.id===candidate?.eventId);
 const review=j.diagnosisSession?.hairSimulation?.reviews.findLast(r=>r.generationId===candidate?.eventId);
 const active=event?.metadata?.postprocessing?.version==='hair-only-protection-v1'||((event?.metadata?.comparisonCrop||event?.metadata?.requiresStylistReview)&&review?.decision!=='ACCEPTED')?null:candidate;
 const next=editCounseling(j,{confirmation:{id:`counseling-confirmation:${crypto.randomUUID()}`,at:new Date().toISOString(),sourceType:'STYLIST_CORRECTED',selectedDesignId,mockPreview:counselingState(j).selectedMockPreview,targetConfirmationId:j.target.confirmedAdjustmentId??null,generationState:active?.origin==='REAL_API'?'REAL':'PARTIAL',page2Status:'AWAITING_USER_APPROVAL'}});
 next.diagnosisSession!.status='DESIGN_CONFIRMED';return next;
}
