import type {DiagnosisSession} from './session-model.ts';
import {DESIGN_ENGINE_VERSION,DESIGN_PLANNING_SCHEMA,planningParameterOptions,validatePlanningParameters,type DesignPlanningState} from './design-planning-types.ts';
import {designInputContext} from './design-planning-engine.ts';
const fail=(m:string):never=>{throw new Error(`デザイン設計: ${m}`);};
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function unique(items:{id:string}[],label:string){if(items.some(i=>!i.id)||new Set(items.map(i=>i.id)).size!==items.length)fail(`${label}IDが不正です。`);}
export function validateDesignPlanning(session:DiagnosisSession):void {
  const state=session.designPlan.planning;if(!state)return;
  if(state.schemaVersion!==DESIGN_PLANNING_SCHEMA)fail('未対応の設計スキーマです。');
  const contextOptions={lengthBand:['PIXIE','BOB','MEDIUM','LONG'],density:['LOW','MEDIUM','HIGH'],hasBang:[true,false],bangLength:Object.keys(planningParameterOptions.bangLength.values),faceFrameLength:Object.keys(planningParameterOptions.faceFrameLength.values),part:Object.keys(planningParameterOptions.bangPart.values),hairFlow:Object.keys(planningParameterOptions.bangFlow.values),stylingDirection:['SOFT','CLEAN','AIRY','MOVEMENT']};
  for(const key of Object.keys(contextOptions) as (keyof typeof contextOptions)[]){const v=state.currentHair[key];if(!v||v.value!==null&&!(contextOptions[key] as unknown[]).includes(v.value))fail('現在の髪の確認項目が不正です。');}
  unique(state.runs,'設計原本');unique(state.corrections,'補正');unique(state.selections,'採用');
  if(state.activeRunId&&!state.runs.some(r=>r.id===state.activeRunId))fail('アクティブ原本がありません。');
  const allDesigns=new Map(state.runs.flatMap(r=>r.proposals.map(d=>[d.id,{run:r,design:d}] as const)));
  for(const run of state.runs){
    if(run.schemaVersion!==DESIGN_PLANNING_SCHEMA||run.engineVersion!==DESIGN_ENGINE_VERSION||run.specVersion!=='1.1'||run.parentSessionId!==session.id||run.input.parentSessionId!==session.id||run.input.parentDesignId!==session.designPlan.mainDesign.designId||!equal(run.inputContext,designInputContext(run.input)))fail('入力スナップショット・版・親が不正です。');
    if((run.input.faceEstimateId!==null&&!session.faceBoneAnalysis.aiEstimate.some(a=>a.id===run.input.faceEstimateId))||run.input.faceAnalysisId!==session.faceBoneAnalysis.id)fail('骨格原本の参照がありません。');
    if(run.input.faceEstimateId===null){const key='faceHeightWidthRatio',cid=run.input.faceCorrectionIds[key];if(!session.faceBoneAnalysis.stylistCorrection.some(c=>c.id===cid&&c.estimateId===null&&c.metric===key&&equal(c.inputPhotoIds,[...run.input.currentPhotoIds].sort())&&equal(c.value,run.input.faceValues[key])))fail('美容師確認値と対象写真の参照がありません。');}
    unique(run.proposals,'A〜E');
    if(run.proposals.length!==5||new Set(run.proposals.map(d=>d.label)).size!==5||run.proposals.some(d=>!['A','B','C','D','E'].includes(d.label))||new Set(run.proposals.map(d=>JSON.stringify(d.parameters))).size!==5)fail('異なる5方向を保持してください。');
    for(const d of run.proposals){
      validatePlanningParameters(d.parameters);
      if(d.parentDesignId!==run.input.parentDesignId||d.parentSessionId!==session.id||d.sourceType!=='AI_ESTIMATE'||d.featureState!=='ESTIMATE'||d.generatedImage!==null||d.generationStatus!=='NOT_REQUESTED'||d.stylistCorrection.length||d.draftParameters||d.selectedCorrectionId)fail('AI設計原本・画像状態が不正です。');
      if(d.variantType!=='BANG_FACE_FRAME'||d.confidenceMethod!=='UNVALIDATED_INPUT_COVERAGE_NOT_PROBABILITY'||d.confidence<.1||d.confidence>.7||d.needsStylistConfirmation!==true||!Array.isArray(d.missingInputs))fail('信頼情報が不正です。');
      const keys=d.usedMetrics.map(m=>m.key);
      if(new Set(keys).size!==keys.length||!equal(keys,d.basedOnFaceBoneAnalysis.metricKeys)||d.basedOnFaceBoneAnalysis.valuesWereUsed!==(keys.length>0)||d.basedOnFaceBoneAnalysis.analysisId!==run.input.faceEstimateId)fail('valuesWereUsed・根拠キーが実使用値と一致しません。');
      for(const m of d.usedMetrics){
        const value=run.input.faceValues[m.key];
        if(!value||value.value===null||!['AI_ESTIMATE','STYLIST_CORRECTED','EMPIRICAL'].includes(value.sourceType??'')||!equal(value,m.observation)||!m.rules.length||m.rules.some(r=>!d.ruleIds.includes(r))||m.correctionId!==(run.input.faceCorrectionIds[m.key]??null))fail('使用した観測値の出所が不正です。');
        if(m.correctionId&&!session.faceBoneAnalysis.stylistCorrection.some(c=>c.id===m.correctionId&&c.metric===m.key&&c.estimateId===run.input.faceEstimateId&&equal(c.value,m.observation)))fail('使用した美容師補正への参照が不正です。');
        if(!m.correctionId&&!equal(session.faceBoneAnalysis.aiEstimate.find(a=>a.id===run.input.faceEstimateId)?.metrics[m.key],m.observation))fail('AI原本の実値と一致しません。');
      }
      if(d.sourceAnalysisIds.faceEstimateId!==run.input.faceEstimateId||!equal(d.sourceAnalysisIds.faceCorrectionIds,d.usedMetrics.flatMap(m=>m.correctionId?[m.correctionId]:[]))||d.generationSeedMetadata.seed!==null||d.generationSeedMetadata.parentRequestId!==null)fail('派生生成の出所・未取得seedが不正です。');
    }
  }
  for(const [designId,draft] of Object.entries(state.drafts)){if(!allDesigns.has(designId))fail('編集中の案がありません。');validatePlanningParameters(draft);}
  for(const correction of state.corrections){const found=allDesigns.get(correction.designId);validatePlanningParameters(correction.parameters);if(!found||found.run.id!==correction.runId||correction.parentSessionId!==session.id||correction.sourceType!=='STYLIST_CORRECTED'||!correction.actor||!Number.isFinite(Date.parse(correction.createdAt)))fail('補正の参照・出所が不正です。');}
  for(const selection of state.selections){
    const found=allDesigns.get(selection.designId),correction=state.corrections.find(c=>c.id===selection.correctionId);
    validatePlanningParameters(selection.parameters);
    if(!found||found.run.id!==selection.runId||selection.parentSessionId!==session.id||selection.sourceType!=='STYLIST_CORRECTED'||!selection.actor||!Number.isFinite(Date.parse(selection.createdAt)))fail('採用の参照・出所が不正です。');
    if(selection.correctionId?(!correction||correction.designId!==selection.designId||correction.runId!==selection.runId||!equal(selection.parameters,correction.parameters)):!equal(selection.parameters,found!.design.parameters))fail('採用値はAI案または保存済み補正を使用してください。');
  }
  if(state.selectedSelectionId&&!state.selections.some(s=>s.id===state.selectedSelectionId&&s.runId===state.activeRunId))fail('採用した現在の案がありません。');
}
export function assertDesignPlanningHistory(previous:DesignPlanningState|undefined,next:DesignPlanningState|undefined):void {
  if(!previous)return;if(!next)fail('保存済み設計を削除できません。');
  for(const key of ['runs','corrections','selections'] as const)for(const item of previous[key])if(!equal(item,next![key].find(n=>n.id===item.id)))fail(`保存済み${key}原本は変更できません。`);
}
