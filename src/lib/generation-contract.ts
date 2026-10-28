import { DATA_SCHEMA_VERSION, effectiveHairZone, type SpecVersion,type DiagnosisSession, type ImageReference, type StyleTarget, type ColorTarget, type FaceBoneAnalysis, type HairAnalysis, type MainDesign, type BangFaceFrameDesign, type LengthVariation, type HairZoneValues, type HairZone,type FaceEstimate } from './session-model.ts';
import { validateDiagnosisSession } from './session-validation.ts';
import { effectiveFaceBoneValues } from './effective-face-values.ts';
import { activePlanningRun,selectedPlannedDesign } from './design-planning-projection.ts';
import type {DesignSourceAnalysisIds,PlanningParameters,PlannedDesign} from './design-planning-types.ts';

/** Shared inputs consumed by the Phase 4 pipeline; this selector itself performs no API call. */
export type HairGenerationContract = {
  contractVersion: 'hair-generation-contract-v1'; specVersion: SpecVersion; dataSchemaVersion: typeof DATA_SCHEMA_VERSION;
  parentSessionId: string; mode: 'STYLE_ONLY' | 'COLOR_ONLY' | 'STYLE_COLOR';
  currentPhoto: ImageReference;
  styleTarget: StyleTarget | null;
  colorTarget: ColorTarget | null;
  effectiveColorReference: ImageReference | null;
  hairAnalysis: HairAnalysis;
  effectiveHairZones: Record<HairZone, HairZoneValues>;
  faceBoneAnalysis: FaceBoneAnalysis;
  effectiveFaceBoneValues: FaceEstimate['metrics'];
  selectedDesign: {designId:string;selectionId:string;parameters:PlanningParameters}|null;
  planningVariant: {variantType:'BANG_FACE_FRAME';designParameters:PlanningParameters;aiProposal:PlanningParameters;parameterPrecedence:'VARIANT_OVERRIDES_BASE_BANG_AND_FACE_FRAME';sourceAnalysisIds:DesignSourceAnalysisIds;generationSeedMetadata:PlannedDesign['generationSeedMetadata']}|null;
  designPlanId: string;
  design: MainDesign | BangFaceFrameDesign | LengthVariation;
  parentDesignId: string | null;
  preservePerson: true;
  referenceRoles: { current: 'PERSON'; style: 'SHAPE_ONLY'; color: 'HAIR_COLOR_ONLY'; faceBoneAnalysis: 'HAIR_DESIGN_ONLY_NOT_FACE_EDIT' };
  state: 'INTERFACE_ONLY_NOT_CONNECTED'|'API_READY_REAL_UNVERIFIED';
  consultation?:NonNullable<DiagnosisSession['counseling']>['combinedInputs'];
};
export function generationContract(session: DiagnosisSession, designId = session.designPlan.mainDesign.designId): HairGenerationContract {
  validateDiagnosisSession(session);
  const current = session.currentPhotos.find(p => p.direction === 'FRONT') ?? session.currentPhotos[0];
  if (!current) throw new Error('画像生成用データには本人の現在写真が必要です。');
  const main = session.designPlan.mainDesign;
  const design = designId === main.designId ? main : session.designPlan.bangFaceFrameDesigns.find(d => d.id === designId) ?? session.designPlan.lengthVariations.find(d => d.id === designId);
  if (!design) throw new Error('同じセッションのデザインを選択してください。');
  const style = session.simulationMode==='COLOR_ONLY'?null:session.styleTarget, color = session.simulationMode==='STYLE_ONLY'?null:session.colorTarget;
  if(!session.simulationMode)throw new Error('STYLEまたはCOLORを設定してください。');
  if (!style && !color) throw new Error('STYLEまたはCOLORを設定してください。');
  if (color?.pendingConfirmation) throw new Error('COLORを再確定してください。');
  const run=activePlanningRun(session),selected=selectedPlannedDesign(session),planned=run?.proposals.find(d=>d.id===designId);
  if(designId.startsWith('planned:')&&!planned)throw new Error('骨格・STYLE入力が変更されています。A〜Eを再設計してください。');
  const latest=planned?session.designPlan.planning?.corrections.findLast(c=>c.runId===run?.id&&c.designId===planned.id):null;
  return structuredClone({ contractVersion: 'hair-generation-contract-v1', specVersion: session.specVersion, dataSchemaVersion: DATA_SCHEMA_VERSION,
    parentSessionId: session.id, mode: style && color ? 'STYLE_COLOR' : style ? 'STYLE_ONLY' : 'COLOR_ONLY', currentPhoto: current,
    styleTarget: style, colorTarget: color, effectiveColorReference: color?.adjustedPreview ?? color?.referenceImage ?? null,
    ...(session.counseling?.combinedInputs?{consultation:session.counseling.combinedInputs}:{}),
    hairAnalysis: session.hairAnalysis,
    effectiveHairZones: { ROOT: effectiveHairZone(session, 'ROOT'), MID: effectiveHairZone(session, 'MID'), END: effectiveHairZone(session, 'END') },
    faceBoneAnalysis: session.faceBoneAnalysis,
    effectiveFaceBoneValues:effectiveFaceBoneValues(session),
    selectedDesign:session.simulationMode!=='COLOR_ONLY'&&selected?{designId:selected.design.id,selectionId:selected.selectionId,parameters:selected.parameters}:null,
    planningVariant:planned?{variantType:'BANG_FACE_FRAME',designParameters:latest?.parameters??planned.parameters,aiProposal:planned.parameters,parameterPrecedence:'VARIANT_OVERRIDES_BASE_BANG_AND_FACE_FRAME',sourceAnalysisIds:planned.sourceAnalysisIds,generationSeedMetadata:planned.generationSeedMetadata}:null,
    designPlanId: session.designPlan.id, design, parentDesignId: 'parentDesignId' in design ? design.parentDesignId : null, preservePerson: true,
    referenceRoles: { current: 'PERSON', style: 'SHAPE_ONLY', color: 'HAIR_COLOR_ONLY', faceBoneAnalysis: 'HAIR_DESIGN_ONLY_NOT_FACE_EDIT' }, state: 'API_READY_REAL_UNVERIFIED' });
}

/** Five Phase 3 variants prepared for MAIN-first jobs. No API call or synthetic seed here. */
export function generationBatchContract(session:DiagnosisSession){
  const run=activePlanningRun(session);if(!run)throw new Error('現在の入力でA〜Eを設計してください。');
  return {contractVersion:'main-and-variants-contract-v1' as const,parentSessionId:session.id,planningRunId:run.id,
    mainDesign:generationContract(session),variants:run.proposals.map(d=>generationContract(session,d.id)),
    dependency:'GENERATE_MAIN_THEN_VARIANTS' as const,state:'API_READY_REAL_UNVERIFIED' as const};
}
