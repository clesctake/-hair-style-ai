import type {DiagnosisSession} from './session-model.ts';
import type {HairSimulationState,SimulationRequest} from './hair-simulation-types.ts';
import {HAIR_SIMULATION_SCHEMA} from './hair-simulation-types.ts';
import {stableJson} from './hair-simulation-context.ts';
import {validatePlanningParameters} from './design-planning-types.ts';
function fail(m:string):never{throw new Error('画像生成: '+m);}
const commonInput=(c:SimulationRequest['contract'])=>({currentPhoto:c.currentPhoto,mode:c.mode,styleTarget:c.styleTarget,colorTarget:c.colorTarget,effectiveColorReference:c.effectiveColorReference,hairAnalysis:c.hairAnalysis,faceBoneAnalysis:c.faceBoneAnalysis,...(c.consultation?{consultation:c.consultation}:{})});
export function validateSimulationRequest(r:SimulationRequest):void {
 const c=r?.contract;if(r?.protocol!=='hair-simulation-request-v1'||!r.requestId||!r.jobId||!r.batchId||!c||c.contractVersion!=='hair-generation-contract-v1'||c.parentSessionId!==r.parentSessionId||c.designPlanId!==`design-plan:${r.parentSessionId}`)fail('正式契約・セッションを確認してください。');
 const id='designId' in c.design?c.design.designId:c.design.id;if(id!==r.designId||c.currentPhoto.role!=='CURRENT'||c.currentPhoto.parentSessionId!==r.parentSessionId||!c.currentPhoto.originalReference||c.preservePerson!==true)fail('本人元画像・デザインが一致しません。');
 if(c.mode==='COLOR_ONLY'&&(c.styleTarget!==null||c.planningVariant!==null||c.selectedDesign!==null)||c.mode==='STYLE_ONLY'&&(c.colorTarget!==null||c.effectiveColorReference!==null)||!['STYLE_ONLY','COLOR_ONLY','STYLE_COLOR'].includes(c.mode))fail('STYLE/COLORの役割が不正です。');
 if(c.styleTarget?.referenceImage&&c.styleTarget.referenceImage.role!=='STYLE_REFERENCE'||c.effectiveColorReference&&!['COLOR_REFERENCE','COLOR_PREVIEW'].includes(c.effectiveColorReference.role))fail('参考画像の役割が不正です。');
 if(c.colorTarget&&(c.colorTarget.pendingConfirmation||!c.colorTarget.confirmedAt||!c.colorTarget.confirmedAdjustmentId||!c.colorTarget.adjustedPreview||c.effectiveColorReference?.imageId!==c.colorTarget.adjustedPreview.imageId))fail('COLORはライブ調整後の色味を確定してください。');
 if(c.referenceRoles.current!=='PERSON'||c.referenceRoles.style!=='SHAPE_ONLY'||c.referenceRoles.color!=='HAIR_COLOR_ONLY'||c.referenceRoles.faceBoneAnalysis!=='HAIR_DESIGN_ONLY_NOT_FACE_EDIT')fail('参照役割を変更できません。');
 if(r.parentMode==='NONE'){
  if(r.parentDesignId||r.parentGenerationId||r.parentAsset||c.parentDesignId||c.planningVariant)fail('MAINの親関係が不正です。');
 }else if(r.parentMode==='IMAGE_EDIT'){
  if(!r.parentGenerationId||!r.parentAsset||!/^[a-f0-9]{64}$/.test(r.parentAsset.sha256)||r.parentDesignId!==c.parentDesignId||!r.parentDesignId||!c.planningVariant||!('parameters' in c.design))fail('MAIN親画像・子案の関係が不正です。');
  validatePlanningParameters(c.planningVariant!.designParameters);
  const design=c.design as import('./session-model.ts').BangFaceFrameDesign;
  const expected=design.stylistCorrection.at(-1)?.parameters??design.parameters;
  if(stableJson(expected)!==stableJson(c.planningVariant!.designParameters)||c.planningVariant!.sourceAnalysisIds.faceEstimateId!==c.faceBoneAnalysis.activeEstimateId)fail('DesignPlanの実効パラメータ・解析IDが一致しません。');
 }else fail('未対応の親生成モードです。');
}
export function validateHairSimulation(s:DiagnosisSession):void {
 const st=s.hairSimulation;if(!st)return;if(st.schemaVersion!==HAIR_SIMULATION_SCHEMA)fail('未対応の保存版です。');
 for(const key of ['batches','jobs','events','generatedAssets','selections','reviews'] as const){if(!Array.isArray(st[key]))fail('保存形式が不正です。');const ids=new Set<string>();for(const item of st[key]){if(!item.id||item.parentSessionId!==s.id||ids.has(item.id))fail('ID・親セッション・重複を確認してください。');ids.add(item.id);}}
 if(st.activeBatchId&&!st.batches.some(b=>b.id===st.activeBatchId))fail('バッチ参照が不正です。');
 for(const b of st.batches){
  if(b.mainDesignId!==s.designPlan.mainDesign.designId||b.snapshot.contract.parentSessionId!==s.id)fail('MAINの参照が不正です。');
  const labels=b.variantContracts.map(c=>'label' in c.design?c.design.label:null);
  if(b.variantContracts.length!==0&&(stableJson([...labels].sort())!==stableJson(['A','B','C','D','E'])))fail('A〜E5案を確認してください。');
  if(b.snapshot.contract.mode==='COLOR_ONLY'&&labels.length||b.snapshot.contract.mode!=='COLOR_ONLY'&&labels.length!==5)fail('モードと5案の役割が不正です。');
  for(const c of b.variantContracts)if(c.parentDesignId!==b.mainDesignId||stableJson(commonInput(c))!==stableJson(commonInput(b.snapshot.contract)))fail('子案の共通本人・STYLE・COLOR・解析が一致しません。');
  const jobs=st.jobs.filter(j=>j.batchId===b.id);if(jobs.filter(j=>j.variantType==='MAIN').length!==1||jobs.length!==labels.length+1)fail('MAINと子ジョブの数が不正です。');
 }
 for(const j of st.jobs){const b=st.batches.find(b=>b.id===j.batchId);if(!b||j.parentDesignId!==(j.variantType==='MAIN'?null:b.mainDesignId)||j.variantType==='MAIN'&&(j.designId!==b.mainDesignId||j.label!=='MAIN')||j.variantType!=='MAIN'&&!b.variantContracts.some(c=>'id' in c.design&&c.design.id===j.designId&&'label' in c.design&&c.design.label===j.label))fail('ジョブの親関係・DesignPlan対応が不正です。');}
 for(const e of st.events){const j=st.jobs.find(j=>j.id===e.jobId),b=st.batches.find(b=>b.id===e.batchId);if(!j||!b||j.batchId!==b.id||e.request.jobId!==j.id||e.request.designId!==j.designId||e.request.requestId!==e.requestId||e.request.batchId!==b.id||!Number.isInteger(e.retryCount)||e.retryCount<0||e.retryCount>2||!['QUEUED','GENERATING','COMPLETE','FAILED'].includes(e.status))fail('イベントの参照が不正です。');validateSimulationRequest(e.request);
  if(stableJson(commonInput(e.request.contract))!==stableJson(commonInput(b.snapshot.contract))||stableJson(e.inputSnapshot.contract)!==stableJson(e.request.contract)||stableJson(e.inputSnapshot.photos)!==stableJson(b.snapshot.photos))fail('イベントの共通入力・スナップショットが一致しません。');
  if(e.status==='COMPLETE'&&(!e.assetId||!e.metadata||!st.generatedAssets.some(a=>a.id===e.assetId&&a.eventId===e.id)))fail('完了画像の保存が必要です。');
  if(e.request.parentGenerationId){const parent=st.events.find(p=>p.id===e.request.parentGenerationId);if(parent?.status!=='COMPLETE'||st.jobs.find(j=>j.id===parent.jobId)?.variantType!=='MAIN'||parent.batchId!==e.batchId||parent.assetId!==e.request.parentAsset?.imageId)fail('保存したMAIN完了イベントを参照してください。');}
 }
 for(const a of st.generatedAssets){const e=st.events.find(e=>e.id===a.eventId);if(a.reference.role!=='SIMULATION'||a.reference.imageId!==a.id||a.reference.parentSessionId!==s.id||a.reference.localReference!==`simulation-asset:${a.id}`||!a.dataUrl.startsWith('data:image/png;base64,')||!['REAL_API','MOCK_TRANSPORT_FIXTURE'].includes(a.origin)||!/^[a-f0-9]{64}$/.test(a.sha256)||e?.metadata?.sha256!==a.sha256||e?.metadata?.origin!==a.origin||e?.metadata?.seed!==null||a.reference.sourceType!==(a.origin==='REAL_API'?'AI_ESTIMATE':'MOCK'))fail('画像の出所・保存先が不正です。');}
 for(const a of st.generatedAssets){const e=st.events.find(e=>e.id===a.eventId),p=e?.metadata?.postprocessing,raw=a.providerOriginalImage;
  if(p||raw){if(a.origin!=='REAL_API'||!raw||!p||p.version!=='hair-only-protection-v1'||p.maskSource!=='AI_ESTIMATE'||p.quality!=='NEEDS_STYLIST_REVIEW'||p.facePixelsPreserved!==true||p.nonHairPixelsPreserved!==true||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(raw.dataUrl)||!Number.isInteger(raw.width)||raw.width<1||!Number.isInteger(raw.height)||raw.height<1||!/^([a-f0-9]{64})$/.test(raw.sha256)||raw.sha256!==p.providerSha256||!/^([a-f0-9]{64})$/.test(p.currentOriginalSha256)||p.targetColorId!==(e?.request.contract.colorTarget?.id??null)||p.targetConfirmationId!==(e?.request.contract.colorTarget?.confirmedAdjustmentId??null))fail('生成原本・髪だけの表示画像の保存条件が不正です。');}
 }
 for(const selection of st.selections){const e=st.events.find(e=>e.id===selection.generationId);if(e?.status!=='COMPLETE'||e.jobId!==selection.jobId||e.assetId!==selection.assetId||e.request.designId!==selection.designId)fail('採用した生成画像が一致しません。');}
 for(const review of st.reviews)if(!st.events.some(e=>e.id===review.generationId&&e.status==='COMPLETE'))fail('確認対象の生成画像がありません。');
 if(st.selectedSelectionId&&!st.selections.some(s=>s.id===st.selectedSelectionId))fail('採用参照が不正です。');
}
export function assertHairSimulationHistory(previous:HairSimulationState|undefined,next:HairSimulationState|undefined):void {
 if(!previous)return;if(!next)fail('保存済み生成原本は削除できません。');
 for(const key of ['batches','jobs','events','generatedAssets','selections','reviews'] as const)for(const item of previous[key])if(stableJson(item)!==stableJson(next![key].find(x=>x.id===item.id)))fail('保存済み生成原本は変更できません。');
}
