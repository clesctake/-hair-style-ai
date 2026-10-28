import { featureSnapshot, type FeatureState, type FeatureSnapshot } from './feature-registry.ts';
import { emptyPhotoAnalysis, type PhotoAnalysisState } from './photo-analysis-types.ts';
import type { DesignPlanningState } from './design-planning-types.ts';
import type { HairSimulationState } from './hair-simulation-types.ts';
import type { CustomerTakeaway } from './takeaway-contract.ts';
import type { CounselingState } from './counseling-session.ts';
import type { ProDesignState } from './pro-design-types.ts';
import type { AfterSupportState } from './after-support-types.ts';

export const SPEC_VERSION = '1.1' as const;
export const supportedSpecVersions = ['1.0','1.1'] as const;
export type SpecVersion = typeof supportedSpecVersions[number];
export const DATA_SCHEMA_VERSION = 'diagnosis-session-v1' as const;
export const APP_VERSION = '0.1.0-phase.4';
export const sourceTypes = ['MANUFACTURER', 'REFERENCE', 'EMPIRICAL', 'AI_ESTIMATE', 'STYLIST_CORRECTED', 'MOCK'] as const;
export type SourceType = typeof sourceTypes[number];
export type SourcedValue<T> = {
  value: T | null;
  sourceType: SourceType | null;
  sourceId: string | null;
  sourceIds: string[];
  confidence: number | null;
  createdAt: string | null;
  method: string | null;
};
export function sourcedValue<T>(value: T | null, sourceType: SourceType | null = null, sourceId: string | null = null,
  createdAt: string | null = null, method: string | null = null, confidence: number | null = null): SourcedValue<T> {
  return { value, sourceType: value === null ? null : sourceType, sourceId, sourceIds: sourceId ? [sourceId] : [], confidence, createdAt, method };
}
export const unknownValue = <T>(): SourcedValue<T> => sourcedValue<T>(null);
export const hairZones = ['ROOT', 'MID', 'END'] as const;
export type HairZone = typeof hairZones[number];
export const photoDirections = ['FRONT', 'RIGHT', 'LEFT', 'BACK'] as const;
export type PhotoDirection = typeof photoDirections[number];
export type SessionStatus = 'DRAFT' | 'IN_PROGRESS' | 'DESIGN_CONFIRMED' | 'TREATMENT_COMPLETED' | 'ARCHIVED';
export type UnderTone = 'red' | 'red_orange' | 'orange' | 'yellow_orange' | 'yellow' | 'pale_yellow';
export const liftRouteValues = ['ONE_COLOR', 'HIGH_LIFT_COLOR', 'LIGHTENER', 'BLEACH_1', 'BLEACH_2_PLUS', 'HIGH_RISK', 'STYLIST_JUDGMENT', 'UNKNOWN'] as const;
export type LiftRoute = typeof liftRouteValues[number];
export type Lab = { L: number; a: number; b: number };
export type LCh = { L: number; C: number; h: number | null };

/** Byte storage is retained by the legacy photo record. References never duplicate image bytes. */
export type ImageReference = {
  imageId: string;
  parentSessionId: string;
  role: 'CURRENT' | 'STYLE_REFERENCE' | 'COLOR_REFERENCE' | 'COLOR_PREVIEW' | 'SIMULATION' | 'AFTER';
  imageUrl: string | null;
  localReference: string | null;
  originalReference: string | null;
  width: number | null;
  height: number | null;
  sourceType: SourceType | null;
};
export const qualityFlagKeys = ['backlight', 'overexposed', 'underexposed', 'blur', 'motionBlur', 'unevenLighting',
  'strongReflection', 'colorCast', 'positioning', 'framing', 'possibleLensFog', 'whiteClipping', 'blackClipping'] as const;
export type QualityFlag = { state: 'PASS' | 'CAUTION' | 'NG' | 'NOT_ASSESSED'; method: string | null; message: string | null; metrics: Record<string, number | null> };
export type PhotoQuality = {
  imageId: string;
  status: 'GOOD' | 'CAUTION' | 'NG' | null;
  score: number | null;
  flags: Record<typeof qualityFlagKeys[number], QualityFlag>;
  featureState: FeatureState;
  evaluatedAt: string | null;
  algorithmVersion: string | null;
  assessmentScope: string | null;
  stylistOverride: boolean | null;
};
export type CurrentPhoto = ImageReference & {
  role: 'CURRENT';
  direction: PhotoDirection | null;
  legacyDirection: string | null;
  capturedAt: string | null;
  importedAt: string | null;
  source: 'CAMERA' | 'LIBRARY' | null;
  qualityStatus: PhotoQuality['status'];
  qualityScore: number | null;
  qualityFlags: PhotoQuality['flags'];
  calibration: { status: 'UNCALIBRATED' | 'CALIBRATED' | 'NOT_ASSESSED'; referenceImageId: string | null; transform: number[] | null };
};
export type DisplayColor = { rgb: { r: number; g: number; b: number } | null; hex: string | null; source: SourcedValue<string> };
export type PerceptualColor = { lab: Lab | null; lch: LCh | null; illuminant: string | null; observer: string | null; calibration: 'UNCALIBRATED' | 'CALIBRATED' | 'MOCK' | 'UNKNOWN'; source: SourcedValue<Lab> };
export type ManufacturerColorVector = { manufacturer: 'FIOLE'; axes: Record<string, number | null> | null; interpretation: 'DIAGRAM_COMPOSITION_NOT_CHEMICAL_CONCENTRATION'; source: SourcedValue<string> };
export type ColorRepresentation = { display: DisplayColor; perceptual: PerceptualColor; manufacturerVector: ManufacturerColorVector };
export type HairZoneValues = {
  baseLevel: SourcedValue<number>; underLevel: SourcedValue<number>; underTone: SourcedValue<UnderTone>;
  lightness: SourcedValue<number>; hue: SourcedValue<number>; chroma: SourcedValue<number>;
  residualRed: SourcedValue<number>; residualOrange: SourcedValue<number>; residualYellow: SourcedValue<number>;
  artificialPigment: SourcedValue<number>; naturalMelanin: SourcedValue<number>; damage: SourcedValue<number>;
  porosity: SourcedValue<number>; hairThickness: SourcedValue<number>; grayPercentage: SourcedValue<number>;
  unevenness: SourcedValue<number>; color: ColorRepresentation | null;
};
export type HairMetric = Exclude<keyof HairZoneValues, 'color'>;
export type HairEstimate = { id: string; inputPhotoIds: string[]; createdAt: string; featureState: FeatureState; modelVersion: string | null; zones: Record<HairZone, HairZoneValues> };
export type HairCorrection = { id: string; estimateId: string | null; overridesId: string | null; zone: HairZone; metric: HairMetric; value: SourcedValue<number | UnderTone>; actor: string | null; createdAt: string };
export type HairAnalysis = { id: string; parentSessionId: string; activeEstimateId: string | null; aiEstimate: HairEstimate[]; stylistCorrection: HairCorrection[] };
export const hairHistoryTypes = ['COLOR', 'DARK_COLOR', 'BLACK_DYE', 'BLEACH', 'LIGHTENER', 'STRAIGHTENING', 'ACID_STRAIGHTENING', 'PERM', 'OTHER'] as const;
export type HairHistory = { id: string; parentSessionId: string; type: typeof hairHistoryTypes[number]; legacyType: string | null; date: string | null; area: HairZone | 'ALL'; count: number | null; note: string; source: SourcedValue<string>; ambiguity: string | null };
export const faceMetricNames = ['faceWidthRatio', 'faceHeightRatio', 'faceHeightWidthRatio', 'foreheadHeightRatio', 'foreheadWidthRatio',
  'upperFaceRatio', 'midfaceRatio', 'lowerFaceRatio', 'cheekbonePosition', 'cheekboneWidthRatio', 'jawWidthRatio', 'chinPosition',
  'browPosition', 'eyePosition', 'browEyeDistance', 'hairlinePosition', 'facialBalance', 'crown', 'parietal', 'temporal', 'occipital',
  'headWidthRatio', 'headDepthRatio'] as const;
export type FaceMetric = typeof faceMetricNames[number];
export type FaceEstimate = { id: string; inputPhotoIds: string[]; createdAt: string; featureState: FeatureState; modelVersion: string | null; metrics: Record<FaceMetric, SourcedValue<number>>; additionalMeasurements: Record<string, SourcedValue<number>>; coordinateSpace: 'NORMALIZED_IMAGE_2D'; landmarks: { imageId: string; key: string; x: number; y: number; sourceType: SourceType }[] };
export type FaceCorrection = { id: string; estimateId: string|null; inputPhotoIds?:string[]; metric: FaceMetric; value: SourcedValue<number>; actor: string; createdAt: string };
export type FaceBoneAnalysis = { id: string; parentSessionId: string; activeEstimateId: string | null; aiEstimate: FaceEstimate[]; stylistCorrection: FaceCorrection[] };

export type BangFaceFrameParameters = {
  bangLength: string | null; bangWidth: string | null; bangDensity: string | null; bangPart: string | null; bangFlow: string | null;
  sideBangLength: string | null; faceFrameStart: string | null; faceFrameLength: string | null; faceFrameDirection: string | null;
  faceFrameVolumePosition: string | null;
};
export type StyleTarget = {
  id: string; parentSessionId: string; referenceImage: ImageReference | null; requestText: string;
  overallLength: SourcedValue<number>; lengthOffsetCm: number | null; silhouette: string | null; layer: { amount: string | null; start: string | null };
  weight: string | null; volume: string | null; ends: string | null; part: string | null; hairFlow: string | null; styling: string | null;
  bang: BangFaceFrameParameters | null; faceFrame: BangFaceFrameParameters | null; selectedBangDecisionId: string | null;
};
export type ColorAdjustmentParameters = {
  hueShift?:number|null;
  lightness: number | null; saturation: number | null; redness: number | null; yellowness: number | null;
  mutedness: number | null; beige: number | null; transparency: number | null; ash: number | null; olive: number | null; violet: number | null;
};
export type ColorConfirmation = { id: string; sourceReferenceImage: ImageReference; adjustedPreview: ImageReference; controls: ColorAdjustmentParameters; normalizedControls: ColorAdjustmentParameters; originalColor: ColorRepresentation; adjustedColor: ColorRepresentation; confirmedAt: string; hairMaskId: string | null; algorithmVersion: string; scope: string };
export type ColorTarget = {
  id: string; parentSessionId: string; referenceImage: ImageReference | null; requestText: string;
  originalColorParameters: ColorRepresentation | null; adjustedColorParameters: ColorAdjustmentParameters | null;
  draftColorParameters: ColorAdjustmentParameters | null; color: ColorRepresentation | null; targetFinishLevel: SourcedValue<number>;
  confirmedAt: string | null; confirmedAdjustmentId: string | null; pendingConfirmation: boolean; adjustedPreview: ImageReference | null;
  confirmations: ColorConfirmation[]; zones: { zone: HairZone | 'HIGHLIGHT' | 'LOWLIGHT'; color: ColorRepresentation | null; sourceImageId: string | null; areaRatio: number | null }[];
};
export type GenerationStatus = 'NOT_REQUESTED' | 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'STALE';
export type GenerationMetadata = { model: string | null; modelVersion: string | null; promptVersion: string | null; requestId: string | null; createdAt: string; sourceType: SourceType; inputContext: string | null };
export type MainDesign = {
  designId: string; parentSessionId: string; sourceCurrentPhoto: string | null; styleParameters: StyleTarget | null;
  colorParameters: ColorTarget | null; faceBoneAnalysisReference: string | null; generatedImage: ImageReference | null;
  generationStatus: GenerationStatus; generationMetadata: GenerationMetadata | null;
};
export type DesignCorrection = { id: string; proposalId: string; parameters: BangFaceFrameParameters; actor: string | null; createdAt: string; sourceType: 'STYLIST_CORRECTED' };
export type BangFaceFrameDesign = {
  id: string; parentSessionId: string; parentDesignId: string; label: 'A' | 'B' | 'C' | 'D' | 'E'; name: string | null;
  visualEffectDescription: string | null; parameters: BangFaceFrameParameters; rationale: string | null;
  basedOnFaceBoneAnalysis: { analysisId: string | null; metricKeys: string[]; valuesWereUsed: boolean };
  sourceType: SourceType | null; featureState: FeatureState; generatedImage: ImageReference | null;
  generationStatus: GenerationStatus; generationMetadata: GenerationMetadata | null;
  stylistCorrection: DesignCorrection[]; draftParameters: BangFaceFrameParameters | null; selectedCorrectionId: string | null;
};
export const lengthVariationKeys = ['MINUS_10', 'MINUS_5', 'BASE', 'PLUS_5', 'PLUS_10'] as const;
export type LengthVariation = { id: string; parentSessionId: string; parentDesignId: string; key: typeof lengthVariationKeys[number]; offsetCm: -10 | -5 | 0 | 5 | 10; generatedImage: ImageReference | null; generationStatus: GenerationStatus; generationMetadata: GenerationMetadata | null };
export type DesignPlan = {
  id: string; parentSessionId: string; featureState: FeatureState;
  inputs: { hairAnalysisId: string; hairEstimateId: string | null; faceBoneAnalysisId: string; faceEstimateId: string | null; styleTargetId: string; colorTargetId: string };
  mainDesign: MainDesign; bangFaceFrameDesigns: BangFaceFrameDesign[]; lengthVariations: LengthVariation[]; selectedDesignId: string | null;
  planning?: DesignPlanningState;
};
export type Simulation = { id: string; parentSessionId: string; designId: string | null; parentDesignId: string | null; kind: 'MAIN' | 'BANG_FACE_FRAME' | 'LENGTH' | 'LEGACY_SINGLE'; sourceCurrentPhotoId: string; styleReferenceImageId: string | null; colorReferenceImageId: string | null; generatedImage: ImageReference; metadata: GenerationMetadata };
export type UnderCondition = { level: SourcedValue<number>; tone: SourcedValue<UnderTone>; residualRed: SourcedValue<number>; residualOrange: SourcedValue<number>; residualYellow: SourcedValue<number>; artificialPigment: SourcedValue<number>; color: ColorRepresentation | null };
export type Drug = { productId: string | null; variantId: string | null; label: string | null; parts: SourcedValue<number>; setLevel: SourcedValue<number>; dyeVector: ManufacturerColorVector; alkali: SourcedValue<string>; lift: SourcedValue<number>; deposit: SourcedValue<number> };
export type Ox = { productId: string | null; concentrationPercent: SourcedValue<number>; grams: SourcedValue<number>; liftEffect: SourcedValue<number>; hairConditionImpact: SourcedValue<number> };
export type PreLiftPlan = {
  startingLevel: SourcedValue<number>; targetUnderLevel: SourcedValue<number>; targetUnderTone: SourcedValue<UnderTone>;
  predictedUnderLevel: SourcedValue<number>; predictedUnderTone: SourcedValue<UnderTone>; predictedResidualRed: SourcedValue<number>;
  predictedResidualOrange: SourcedValue<number>; predictedResidualYellow: SourcedValue<number>; predictedArtificialPigment: SourcedValue<number>;
  drug: Drug[]; ox: Ox; mixingRatio: SourcedValue<number>; processingTime: SourcedValue<number>; area: HairZone;
};
export type OnColorPlan = { beforeUnderLevel: SourcedValue<number>; beforeUnderTone: SourcedValue<UnderTone>; target: ColorRepresentation | null; fioleDrugs: Drug[]; ratios: SourcedValue<number>[]; ox: Ox; mixingRatio: SourcedValue<number>; processingTime: SourcedValue<number>; area: HairZone; predictedFinalColor: ColorRepresentation | null };
export type ZoneColorPlan = { currentColor: ColorRepresentation | null; requiredUnderLevel: SourcedValue<number>; requiredUnderTone: SourcedValue<UnderTone>; liftRoute: SourcedValue<LiftRoute>; predictedUnder: UnderCondition; preLift: PreLiftPlan; onColorPlan: OnColorPlan; naturalMelanin: SourcedValue<number>; artificialPigment: SourcedValue<number>; hairOrigin: SourcedValue<string> };
export type ColorPlan = { id: string; parentSessionId: string; featureState: FeatureState; hairAnalysisId: string; colorTargetId: string; targetColor: ColorRepresentation | null; targetFinishLevel: SourcedValue<number>; zones: Record<HairZone, ZoneColorPlan> };
export type RecipeProposal = { id: string; parentSessionId: string; label: string; area: HairZone; fioleDrugs: Drug[]; ratios: SourcedValue<number>[]; totalGrams: SourcedValue<number>; oxCandidateIds: string[]; reasons: string[]; sourceType: SourceType; featureState: FeatureState; algorithmVersion: string; inputContext: string; active: boolean };
export type TreatmentPlan = { id: string; parentSessionId: string; colorPlanId: string; proposed: RecipeProposal[]; selectedProposalId: string | null; ox: Ox; processingTime: SourcedValue<number> };
export type ActualTreatment = { id: string; parentSessionId: string; originProposalId: string | null; confirmed: boolean; sourceType: 'EMPIRICAL' | 'STYLIST_CORRECTED'; area: HairZone; fioleDrugs: Drug[]; ratios: SourcedValue<number>[]; totalGrams: SourcedValue<number>; ox: Ox; mixingRatio: SourcedValue<number>; processingTime: SourcedValue<number>; note: string };
export type ActualStage = { id: string; parentSessionId: string; kind: 'PRE_LIFT' | 'ON_COLOR'; area: HairZone; application: string; performedAt: string | null; sourcePhotoIds: string[]; drug: Drug[]; totalGrams: SourcedValue<number>; ox: Ox; mixingRatio: SourcedValue<number>; processingTime: SourcedValue<number>; startingUnder: UnderCondition; targetUnder: UnderCondition; actualUnder: UnderCondition; linkedPreLiftStageId: string | null; linkedProposalId: string | null; afterPhotoId: string | null; note: string };
export type TreatmentResult = { id: string; parentSessionId: string; treatmentPlanId: string; actual: ActualTreatment | null; stages: ActualStage[]; actualUnder: Record<HairZone, UnderCondition | null>; afterPhotos: ImageReference[]; resultEvaluation: { colorMatch: SourcedValue<number>; damageChange: SourcedValue<number>; note: string; actualAfterColor: ColorRepresentation | null } };
export type SessionSection = 'currentPhotos' | 'hairAnalysis' | 'hairHistory' | 'faceBoneAnalysis' | 'styleTarget' | 'colorTarget' | 'simulationMode' | 'designPlan' | 'simulations' | 'colorPlan' | 'treatmentPlan' | 'treatmentResult';
export type DiagnosisSession = {
  id: string; customerId: string | null; createdAt: string; updatedAt: string; status: SessionStatus; appVersion: string;
  specVersion: SpecVersion; schemaVersion: typeof DATA_SCHEMA_VERSION; dataSchemaVersion: typeof DATA_SCHEMA_VERSION; revision: number;
  simulationMode: 'STYLE_ONLY' | 'COLOR_ONLY' | 'STYLE_COLOR' | null;
  currentPhotos: CurrentPhoto[]; photoQuality: PhotoQuality[]; hairAnalysis: HairAnalysis; hairHistory: HairHistory[];
  faceBoneAnalysis: FaceBoneAnalysis; styleTarget: StyleTarget; colorTarget: ColorTarget; designPlan: DesignPlan; simulations: Simulation[];
  colorPlan: ColorPlan; treatmentPlan: TreatmentPlan; treatmentResult: TreatmentResult; featureSnapshot: FeatureSnapshot;
  photoAnalysis?: PhotoAnalysisState;
  /** Optional, append-only Phase 4 extension; old revisions stay readable. */
  hairSimulation?: HairSimulationState;
  /** v1.1 extension point, not implemented in Phase 3. */
  customerTakeaway?: CustomerTakeaway | null;
  /** Page 1 assessment/drafts, independent of AI originals and recipe records. */
  counseling?: CounselingState;
  /** Page 2 additive extension. Legacy sessions need no migration or reset. */
  proDesign?: ProDesignState;
  /** Additive Page 3 display history; never an image learning database. */
  afterSupport?: AfterSupportState;
  compatibility: { adapterVersion: 'journey-session-adapter-v1'; legacySchemaVersion: 'color-journey-v1' | null; legacyRecordId: string | null; bindings: Partial<Record<SessionSection, string>>; warnings: string[] };
};

export const emptyBangParameters = (): BangFaceFrameParameters => ({ bangLength: null, bangWidth: null, bangDensity: null, bangPart: null, bangFlow: null, sideBangLength: null, faceFrameStart: null, faceFrameLength: null, faceFrameDirection: null, faceFrameVolumePosition: null });
export const emptyHairZone = (): HairZoneValues => ({ baseLevel: unknownValue(), underLevel: unknownValue(), underTone: unknownValue(), lightness: unknownValue(), hue: unknownValue(), chroma: unknownValue(), residualRed: unknownValue(), residualOrange: unknownValue(), residualYellow: unknownValue(), artificialPigment: unknownValue(), naturalMelanin: unknownValue(), damage: unknownValue(), porosity: unknownValue(), hairThickness: unknownValue(), grayPercentage: unknownValue(), unevenness: unknownValue(), color: null });
export function effectiveHairZone(session: DiagnosisSession, zone: HairZone): HairZoneValues {
  const analysis = session.hairAnalysis;
  const values = structuredClone(analysis.aiEstimate.find(a => a.id === analysis.activeEstimateId)?.zones[zone] ?? emptyHairZone());
  for (const correction of analysis.stylistCorrection.filter(c => c.zone === zone && c.estimateId === analysis.activeEstimateId)) {
    (values[correction.metric] as SourcedValue<number | UnderTone>) = structuredClone(correction.value);
  }
  return values;
}
export const emptyOx = (): Ox => ({ productId: null, concentrationPercent: unknownValue(), grams: unknownValue(), liftEffect: unknownValue(), hairConditionImpact: unknownValue() });
export const emptyUnder = (): UnderCondition => ({ level: unknownValue(), tone: unknownValue(), residualRed: unknownValue(), residualOrange: unknownValue(), residualYellow: unknownValue(), artificialPigment: unknownValue(), color: null });
export const emptyColorRepresentation = (): ColorRepresentation => ({ display: { rgb: null, hex: null, source: unknownValue() }, perceptual: { lab: null, lch: null, illuminant: null, observer: null, calibration: 'UNKNOWN', source: unknownValue() }, manufacturerVector: { manufacturer: 'FIOLE', axes: null, interpretation: 'DIAGRAM_COMPOSITION_NOT_CHEMICAL_CONCENTRATION', source: unknownValue() } });
export function emptyZoneColorPlan(area: HairZone): ZoneColorPlan {
  return { currentColor: null, requiredUnderLevel: unknownValue(), requiredUnderTone: unknownValue(), liftRoute: unknownValue(), predictedUnder: emptyUnder(),
    preLift: { startingLevel: unknownValue(), targetUnderLevel: unknownValue(), targetUnderTone: unknownValue(), predictedUnderLevel: unknownValue(), predictedUnderTone: unknownValue(), predictedResidualRed: unknownValue(), predictedResidualOrange: unknownValue(), predictedResidualYellow: unknownValue(), predictedArtificialPigment: unknownValue(), drug: [], ox: emptyOx(), mixingRatio: unknownValue(), processingTime: unknownValue(), area },
    onColorPlan: { beforeUnderLevel: unknownValue(), beforeUnderTone: unknownValue(), target: null, fioleDrugs: [], ratios: [], ox: emptyOx(), mixingRatio: unknownValue(), processingTime: unknownValue(), area, predictedFinalColor: null }, naturalMelanin: unknownValue(), artificialPigment: unknownValue(), hairOrigin: unknownValue() };
}
export function createDiagnosisSession(options: { id?: string; customerId?: string | null; createdAt?: string } = {}): DiagnosisSession {
  const id = options.id ?? crypto.randomUUID(), time = options.createdAt ?? new Date().toISOString();
  const mainId = `main:${id}`;
  const style: StyleTarget = { id: `style:${id}`, parentSessionId: id, referenceImage: null, requestText: '', overallLength: unknownValue(), lengthOffsetCm: null, silhouette: null, layer: { amount: null, start: null }, weight: null, volume: null, ends: null, part: null, hairFlow: null, styling: null, bang: null, faceFrame: null, selectedBangDecisionId: null };
  const color: ColorTarget = { id: `color:${id}`, parentSessionId: id, referenceImage: null, requestText: '', originalColorParameters: null, adjustedColorParameters: null, draftColorParameters: null, color: null, targetFinishLevel: unknownValue(), confirmedAt: null, confirmedAdjustmentId: null, pendingConfirmation: false, adjustedPreview: null, confirmations: [], zones: [] };
  return { id, customerId: options.customerId ?? null, createdAt: time, updatedAt: time, status: 'DRAFT', appVersion: APP_VERSION, specVersion: SPEC_VERSION, schemaVersion: DATA_SCHEMA_VERSION, dataSchemaVersion: DATA_SCHEMA_VERSION, revision: 0,
    simulationMode: null, currentPhotos: [], photoQuality: [], hairAnalysis: { id: `hair:${id}`, parentSessionId: id, activeEstimateId: null, aiEstimate: [], stylistCorrection: [] }, hairHistory: [],
    faceBoneAnalysis: { id: `face:${id}`, parentSessionId: id, activeEstimateId: null, aiEstimate: [], stylistCorrection: [] }, styleTarget: style, colorTarget: color,
    designPlan: { id: `design-plan:${id}`, parentSessionId: id, featureState: 'UNIMPLEMENTED', inputs: { hairAnalysisId: `hair:${id}`, hairEstimateId: null, faceBoneAnalysisId: `face:${id}`, faceEstimateId: null, styleTargetId: style.id, colorTargetId: color.id }, mainDesign: { designId: mainId, parentSessionId: id, sourceCurrentPhoto: null, styleParameters: null, colorParameters: null, faceBoneAnalysisReference: null, generatedImage: null, generationStatus: 'NOT_REQUESTED', generationMetadata: null },
      bangFaceFrameDesigns: (['A', 'B', 'C', 'D', 'E'] as const).map(label => ({ id: `bang:${id}:${label}`, parentSessionId: id, parentDesignId: mainId, label, name: null, visualEffectDescription: null, parameters: emptyBangParameters(), rationale: null, basedOnFaceBoneAnalysis: { analysisId: null, metricKeys: [], valuesWereUsed: false }, sourceType: null, featureState: 'UNIMPLEMENTED', generatedImage: null, generationStatus: 'NOT_REQUESTED', generationMetadata: null, stylistCorrection: [], draftParameters: null, selectedCorrectionId: null })),
      lengthVariations: lengthVariationKeys.map((key, index) => ({ id: `length:${id}:${key}`, parentSessionId: id, parentDesignId: mainId, key, offsetCm: ([-10, -5, 0, 5, 10] as const)[index], generatedImage: null, generationStatus: 'NOT_REQUESTED', generationMetadata: null })), selectedDesignId: null },
    simulations: [], colorPlan: { id: `color-plan:${id}`, parentSessionId: id, featureState: 'UNIMPLEMENTED', hairAnalysisId: `hair:${id}`, colorTargetId: color.id, targetColor: null, targetFinishLevel: unknownValue(), zones: { ROOT: emptyZoneColorPlan('ROOT'), MID: emptyZoneColorPlan('MID'), END: emptyZoneColorPlan('END') } },
    treatmentPlan: { id: `treatment-plan:${id}`, parentSessionId: id, colorPlanId: `color-plan:${id}`, proposed: [], selectedProposalId: null, ox: emptyOx(), processingTime: unknownValue() },
    treatmentResult: { id: `treatment-result:${id}`, parentSessionId: id, treatmentPlanId: `treatment-plan:${id}`, actual: null, stages: [], actualUnder: { ROOT: null, MID: null, END: null }, afterPhotos: [], resultEvaluation: { colorMatch: unknownValue(), damageChange: unknownValue(), note: '', actualAfterColor: null } },
    photoAnalysis: emptyPhotoAnalysis(), featureSnapshot: featureSnapshot(), compatibility: { adapterVersion: 'journey-session-adapter-v1', legacySchemaVersion: null, legacyRecordId: null, bindings: {}, warnings: [] } };
}
