import type { BangFaceFrameDesign, BangFaceFrameParameters, FaceMetric, HairZoneValues, SourcedValue, StyleTarget } from './session-model.ts';

export const DESIGN_PLANNING_SCHEMA = 'design-planning-v1' as const;
export const DESIGN_ENGINE_VERSION = 'measurement-driven-design-rules-v1' as const;
export const planningParameterOptions = {
  bangLength: { label:'長さ', values:{above_brow:'オン眉',brow:'眉ライン',below_brow:'眉下',above_eye:'目上',eye:'目にかかる',cheekbone:'頬骨付近',long:'長め'} },
  bangWidth: { label:'幅', values:{narrow:'狭め',standard:'標準',wide:'広め'} },
  bangDensity: { label:'厚み', values:{thin:'薄め',standard:'標準',thick:'厚め'} },
  bangPart: { label:'分け目', values:{none:'なし',center:'センター',left:'左',right:'右'} },
  bangFlow: { label:'毛流れ', values:{straight:'ストレート',inward:'内側',side:'サイドへ流す',outward:'外へ流す'} },
  sideBangLength: { label:'サイドバング', values:{cheekbone:'頬骨',cheek:'頬',mouth:'口元',chin:'顎'} },
  faceFrameStart: { label:'顔周り開始', values:{cheekbone:'頬骨',cheek:'頬',mouth:'口元',chin:'顎'} },
  faceFrameLength: { label:'顔周り長さ', values:{cheekbone:'頬骨',cheek:'頬',mouth:'口元',chin:'顎',clavicle:'鎖骨'} },
  faceFrameDirection: { label:'顔周りの流れ', values:{inward:'内側',side:'サイド',outward:'外へ流す'} },
  faceFrameVolumePosition: { label:'動きの位置', values:{eye:'目元',cheekbone:'頬骨',cheek:'頬',jaw:'顎周り'} },
} as const;
export type PlanningParameter = keyof typeof planningParameterOptions;
export type PlanningParameters = { [K in PlanningParameter]: keyof typeof planningParameterOptions[K]['values'] };
export type StylingDirection = 'SOFT'|'CLEAN'|'AIRY'|'MOVEMENT';
export type CurrentHairContext = {
  lengthBand: SourcedValue<'PIXIE'|'BOB'|'MEDIUM'|'LONG'>;
  density: SourcedValue<'LOW'|'MEDIUM'|'HIGH'>;
  hasBang: SourcedValue<boolean>;
  bangLength: SourcedValue<PlanningParameters['bangLength']>;
  faceFrameLength: SourcedValue<PlanningParameters['faceFrameLength']>;
  part: SourcedValue<PlanningParameters['bangPart']>;
  hairFlow: SourcedValue<PlanningParameters['bangFlow']>;
  stylingDirection: SourcedValue<StylingDirection>;
};
export type UsedFaceMetric = { key:FaceMetric; observation:SourcedValue<number>; correctionId:string|null; rules:string[] };
export type DesignSourceAnalysisIds = { faceEstimateId:string|null; hairEstimateId:string|null; faceCorrectionIds:string[]; hairCorrectionIds:string[] };
export type PlannedDesign = BangFaceFrameDesign & {
  parameters:PlanningParameters;variantType:'BANG_FACE_FRAME';confidence:number;
  confidenceMethod:'UNVALIDATED_INPUT_COVERAGE_NOT_PROBABILITY';missingInputs:string[];needsStylistConfirmation:true;
  usedMetrics:UsedFaceMetric[];usedInputs:string[];ruleIds:string[];
  planningMetadata:{engineVersion:typeof DESIGN_ENGINE_VERSION;method:'MEASUREMENT_DRIVEN_RULES';validation:'UNVALIDATED';goal:string;rankScore:number};
  generationSeedMetadata:{strategy:'INHERIT_MAIN_PERSON_STYLE_COLOR';seed:null;parentRequestId:null};
  sourceAnalysisIds:DesignSourceAnalysisIds;
};
export type DesignPlanningInput = {
  parentSessionId:string;parentDesignId:string;currentPhotoIds:string[];
  faceAnalysisId:string;faceEstimateId:string|null;faceValues:Record<FaceMetric,SourcedValue<number>>;
  faceCorrectionIds:Partial<Record<FaceMetric,string>>;
  hairAnalysisId:string;hairEstimateId:string|null;hairZones:{ROOT:HairZoneValues;MID:HairZoneValues;END:HairZoneValues};hairCorrectionIds:string[];
  currentHair:CurrentHairContext;styleTarget:StyleTarget;
};
export type DesignPlanningRun = {
  id:string;parentSessionId:string;createdAt:string;schemaVersion:typeof DESIGN_PLANNING_SCHEMA;engineVersion:typeof DESIGN_ENGINE_VERSION;
  specVersion:'1.1';inputContext:string;input:DesignPlanningInput;proposals:PlannedDesign[];
};
export type PlanningCorrection = {id:string;parentSessionId:string;runId:string;designId:string;parameters:PlanningParameters;actor:string;createdAt:string;sourceType:'STYLIST_CORRECTED'};
export type PlanningSelection = {id:string;parentSessionId:string;runId:string;designId:string;correctionId:string|null;parameters:PlanningParameters;actor:string;createdAt:string;sourceType:'STYLIST_CORRECTED'};
export type DesignPlanningState = {
  schemaVersion:typeof DESIGN_PLANNING_SCHEMA;currentHair:CurrentHairContext;runs:DesignPlanningRun[];activeRunId:string|null;
  drafts:Record<string,PlanningParameters>;corrections:PlanningCorrection[];selections:PlanningSelection[];selectedSelectionId:string|null;
};
export function validatePlanningParameters(value:BangFaceFrameParameters):asserts value is PlanningParameters {
  if(!value||Object.entries(planningParameterOptions).some(([key,spec])=>typeof value[key as PlanningParameter]!=='string'||!Object.hasOwn(spec.values,value[key as PlanningParameter]!)))throw new Error('前髪・顔周りのパラメータを確認してください。');
}
