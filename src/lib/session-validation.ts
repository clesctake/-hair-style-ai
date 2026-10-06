import { DATA_SCHEMA_VERSION, supportedSpecVersions, sourceTypes, hairZones, photoDirections, qualityFlagKeys, faceMetricNames, lengthVariationKeys, liftRouteValues,
  type DiagnosisSession, type SourcedValue, type ImageReference } from './session-model.ts';
import { featureStates } from './feature-registry.ts';
import {validateHairSimulation,assertHairSimulationHistory} from './hair-simulation-validation.ts';
import { validatePhotoAnalysis } from './photo-analysis-validation.ts';
import { validateDesignPlanning,assertDesignPlanningHistory } from './design-planning-validation.ts';

const fail = (message: string): never => { throw new Error(`共通データ: ${message}`); };
const validDate = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const requireId = (id: unknown) => { if (typeof id !== 'string' || !id.trim()) fail('IDが必要です。'); };
function uniqueIds(items: { id: string }[], label: string) {
  const ids = new Set<string>();
  for (const item of items) { requireId(item.id); if (ids.has(item.id)) fail(`${label}のIDが重複しています。`); ids.add(item.id); }
}
function sourced(item: SourcedValue<unknown>) {
  if (!Array.isArray(item.sourceIds) || item.sourceIds.some(id => typeof id !== 'string') || item.sourceId !== null && typeof item.sourceId !== 'string' ||
    item.value !== null && (!item.sourceType || !sourceTypes.includes(item.sourceType)) || item.value === null && item.sourceType !== null ||
    item.confidence !== null && (typeof item.confidence !== 'number' || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1) ||
    item.createdAt !== null && !validDate(item.createdAt)) fail('値の出所・信頼度・時刻が不正です。');
}
function inspect(value: unknown, sessionId: string) {
  if (typeof value === 'number' && !Number.isFinite(value)) fail('有限の数値、またはnullを使用してください。');
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { value.forEach(item => inspect(item, sessionId)); return; }
  const object = value as Record<string, unknown>;
  if ('parentSessionId' in object && object.parentSessionId !== sessionId) fail('別セッションのデータが混入しています。');
  if ('value' in object && 'sourceIds' in object && 'sourceType' in object) sourced(object as SourcedValue<unknown>);
  if ('featureState' in object && !featureStates.includes(object.featureState as typeof featureStates[number])) fail('機能状態が不正です。');
  for (const item of Object.values(object)) inspect(item, sessionId);
}
function image(reference: ImageReference | null, role?: ImageReference['role']) {
  if (!reference) return;
  requireId(reference.imageId);
  if (role && reference.role !== role) fail('画像のSTYLE/COLOR等の役割が不正です。');
  if (!reference.imageUrl && !reference.localReference) fail('画像の保存先参照が必要です。');
  if (reference.width !== null && (!Number.isInteger(reference.width) || reference.width <= 0) || reference.height !== null && (!Number.isInteger(reference.height) || reference.height <= 0)) fail('画像サイズが不正です。');
}
function mockValues(value: unknown) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { value.forEach(mockValues); return; }
  const object = value as Record<string, unknown>;
  if ('value' in object && 'sourceType' in object && object.value !== null && object.sourceType !== 'MOCK') fail('MOCK診断を実測・AI推定として扱えません。');
  for (const item of Object.values(object)) mockValues(item);
}
export function validateDiagnosisSession(s: DiagnosisSession): void {
  if (s.schemaVersion !== DATA_SCHEMA_VERSION || s.dataSchemaVersion !== DATA_SCHEMA_VERSION || !supportedSpecVersions.includes(s.specVersion)) fail('未対応のschemaVersion / specVersionです。原データを保持してください。');
  requireId(s.id);
  if (s.customerId !== null && (typeof s.customerId !== 'string' || !s.customerId.trim()) || !validDate(s.createdAt) || !validDate(s.updatedAt) || !s.appVersion || !Number.isInteger(s.revision) || s.revision < 0 || !['DRAFT', 'IN_PROGRESS', 'DESIGN_CONFIRMED', 'TREATMENT_COMPLETED', 'ARCHIVED'].includes(s.status)) fail('セッションの基本情報が不正です。');
  inspect(s, s.id);
  validatePhotoAnalysis(s);
  validateHairSimulation(s);
  validateDesignPlanning(s);
  if (s.simulationMode !== null && !['STYLE_ONLY', 'COLOR_ONLY', 'STYLE_COLOR'].includes(s.simulationMode)) fail('STYLE/COLORの利用モードが不正です。');
  const modules = [s.hairAnalysis, s.faceBoneAnalysis, s.styleTarget, s.colorTarget, s.designPlan, s.colorPlan, s.treatmentPlan, s.treatmentResult];
  uniqueIds(modules, 'モジュール');
  for (const module of modules) if (module.parentSessionId !== s.id) fail('モジュールの親セッションが不正です。');
  if (!s.featureSnapshot?.registryVersion || Object.values(s.featureSnapshot.states).some(state => !featureStates.includes(state))) fail('FeatureRegistryの版・機能状態が不正です。');
  if (s.compatibility.adapterVersion !== 'journey-session-adapter-v1' || s.compatibility.legacyRecordId !== null && s.compatibility.legacyRecordId !== s.id) fail('既存カルテとの互換情報が不正です。');
  const directions = new Set<string>(), photoIds = new Set<string>();
  for (const p of s.currentPhotos) {
    image(p, 'CURRENT'); if (photoIds.has(p.imageId)) fail('現在写真のIDが重複しています。'); photoIds.add(p.imageId);
    if (p.direction !== null && !photoDirections.includes(p.direction) || p.source !== null && !['CAMERA', 'LIBRARY'].includes(p.source)) fail('写真方向・入力方法が不正です。');
    if (p.direction && directions.has(p.direction)) fail('同じ撮影方向が重複しています。'); if (p.direction) directions.add(p.direction);
    if (p.capturedAt !== null && !validDate(p.capturedAt)) fail('撮影日時が不正です。');
  }
  for (const p of s.photoQuality) {
    if (!photoIds.has(p.imageId) || p.status !== null && !['GOOD', 'CAUTION', 'NG'].includes(p.status) || p.score !== null && (p.score < 0 || p.score > 100)) fail('撮影品質の画像参照・スコアが不正です。');
    for (const key of qualityFlagKeys) if (!p.flags[key] || !['PASS', 'CAUTION', 'NG', 'NOT_ASSESSED'].includes(p.flags[key].state)) fail('撮影品質の個別フラグが不足しています。');
    const photo = s.currentPhotos.find(item => item.imageId === p.imageId)!;
    if (photo.qualityStatus !== p.status || photo.qualityScore !== p.score || JSON.stringify(photo.qualityFlags) !== JSON.stringify(p.flags)) fail('写真と品質レコードの値が一致しません。');
  }
  if (s.photoQuality.length !== s.currentPhotos.length || new Set(s.photoQuality.map(p => p.imageId)).size !== s.photoQuality.length) fail('現在写真と品質は1対1で保持してください。');
  for (const a of [s.hairAnalysis, s.faceBoneAnalysis]) {
    uniqueIds(a.aiEstimate, '診断原本'); uniqueIds(a.stylistCorrection, '美容師補正');
    if (a.activeEstimateId !== null && !a.aiEstimate.some(e => e.id === a.activeEstimateId)) fail('アクティブな診断原本への参照が不正です。');
    const active = a.aiEstimate.find(e => e.id === a.activeEstimateId);
    if (active && active.inputPhotoIds.some(id => !photoIds.has(id))) fail('現在写真に対応しない診断原本です。');
  }
  for (const a of s.hairAnalysis.aiEstimate) {
    for (const zone of hairZones) if (!a.zones[zone]) fail('ROOT/MID/ENDを独立して保持してください。');
    if (a.featureState === 'MOCK') mockValues(a.zones);
  }
  for (const c of s.hairAnalysis.stylistCorrection) {
    if (!hairZones.includes(c.zone) || c.estimateId !== null && !s.hairAnalysis.aiEstimate.some(a => a.id === c.estimateId)) fail('毛髪補正の部位・診断元が不正です。');
    const cleared = c.value.value === null && c.value.sourceType === null && c.value.method === 'stylist_clear_to_unknown';
    if (!cleared && c.value.sourceType !== 'STYLIST_CORRECTED' && c.value.sourceType !== 'EMPIRICAL') fail('美容師補正の出所を分離してください。');
    if (c.overridesId) {
      const previousCorrection = s.hairAnalysis.stylistCorrection.some(previous => previous.id === c.overridesId && previous.zone === c.zone && previous.metric === c.metric && previous.estimateId === c.estimateId);
      const original = s.hairAnalysis.aiEstimate.find(a => a.id === c.estimateId)?.zones[c.zone]?.[c.metric];
      if (!previousCorrection && original?.sourceId !== c.overridesId) fail('毛髪補正の前の判断への参照が不正です。');
    }
  }
  for (const a of s.faceBoneAnalysis.aiEstimate) {
    for (const key of faceMetricNames) if (!a.metrics[key]) fail('顔・骨格の測定枠が不足しています。');
    if (a.featureState === 'MOCK') { mockValues(a.metrics); mockValues(a.additionalMeasurements); if (a.landmarks.length) fail('固定MOCKに実ランドマークを付けないでください。'); }
  }
  for (const c of s.faceBoneAnalysis.stylistCorrection) if (!s.faceBoneAnalysis.aiEstimate.some(a => a.id === c.estimateId) || !faceMetricNames.includes(c.metric) || c.value.sourceType !== 'STYLIST_CORRECTED' && !(c.value.value === null && c.value.sourceType === null && c.value.method === 'stylist_clear_to_unknown')) fail('骨格補正の原本・出所が不正です。');
  image(s.styleTarget.referenceImage, 'STYLE_REFERENCE'); image(s.colorTarget.referenceImage, 'COLOR_REFERENCE'); image(s.colorTarget.adjustedPreview, 'COLOR_PREVIEW');
  uniqueIds(s.colorTarget.confirmations, 'COLOR確定履歴');
  for (const c of s.colorTarget.confirmations) { image(c.sourceReferenceImage, 'COLOR_REFERENCE'); image(c.adjustedPreview, 'COLOR_PREVIEW'); }
  if (s.colorTarget.confirmedAdjustmentId && !s.colorTarget.confirmations.some(c => c.id === s.colorTarget.confirmedAdjustmentId && c.confirmedAt === s.colorTarget.confirmedAt)) fail('COLOR確定参照が不正です。');
  const plan = s.designPlan, main = plan.mainDesign;
  requireId(main.designId);
  if (plan.inputs.hairAnalysisId !== s.hairAnalysis.id || plan.inputs.faceBoneAnalysisId !== s.faceBoneAnalysis.id || plan.inputs.styleTargetId !== s.styleTarget.id || plan.inputs.colorTargetId !== s.colorTarget.id || plan.inputs.hairEstimateId !== s.hairAnalysis.activeEstimateId || plan.inputs.faceEstimateId !== s.faceBoneAnalysis.activeEstimateId) fail('DesignPlanの入力参照が不正です。');
  if (main.sourceCurrentPhoto !== null && !photoIds.has(main.sourceCurrentPhoto)) fail('MAINの本人写真参照が不正です。');
  if (main.styleParameters && main.styleParameters.id !== s.styleTarget.id || main.colorParameters && main.colorParameters.id !== s.colorTarget.id || main.faceBoneAnalysisReference !== null && !s.faceBoneAnalysis.aiEstimate.some(a => a.id === main.faceBoneAnalysisReference)) fail('MAINのSTYLE/COLOR/骨格参照が不正です。');
  const designs = plan.bangFaceFrameDesigns;
  uniqueIds(designs, 'A〜E');
  if (designs.length !== 5 || new Set(designs.map(d => d.label)).size !== 5 || designs.some(d => !['A', 'B', 'C', 'D', 'E'].includes(d.label))) fail('A〜Eの5案を独立して保持してください。');
  for (const d of [...designs, ...plan.lengthVariations]) if (d.parentDesignId !== main.designId || d.id === main.designId) fail('子デザインのMAIN親IDが不正です。');
  uniqueIds(plan.lengthVariations, '長さ案');
  if (plan.lengthVariations.length !== 5 || new Set(plan.lengthVariations.map(v => v.key)).size !== 5 || plan.lengthVariations.some(v => !lengthVariationKeys.includes(v.key) || v.offsetCm !== ({ MINUS_10: -10, MINUS_5: -5, BASE: 0, PLUS_5: 5, PLUS_10: 10 })[v.key])) fail('長さ5種のキー・offsetが不正です。');
  if (plan.selectedDesignId && plan.selectedDesignId!==main.designId && !designs.some(d => d.id === plan.selectedDesignId)) fail('採用デザインへの参照が不正です。');
  for (const d of designs) {
    uniqueIds(d.stylistCorrection, '前髪補正');
    if (d.featureState === 'MOCK' && (d.sourceType !== 'MOCK' || d.basedOnFaceBoneAnalysis.valuesWereUsed)) fail('固定5案を骨格AI設計として扱えません。');
    if (d.basedOnFaceBoneAnalysis.analysisId && !s.faceBoneAnalysis.aiEstimate.some(a => a.id === d.basedOnFaceBoneAnalysis.analysisId)) fail('前髪案の骨格根拠参照が不正です。');
    if (d.selectedCorrectionId && !d.stylistCorrection.some(c => c.id === d.selectedCorrectionId)) fail('前髪補正の採用参照が不正です。');
  }
  for (const d of [main, ...designs, ...plan.lengthVariations]) {
    if (!['NOT_REQUESTED', 'QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'STALE'].includes(d.generationStatus)) fail('生成ジョブ状態が不正です。');
    image(d.generatedImage, 'SIMULATION');
    if (d.generationStatus === 'SUCCEEDED' && (!d.generatedImage || !d.generationMetadata)) fail('画像がない生成を完了扱いにできません。');
  }
  uniqueIds(s.simulations, '画像生成');
  for (const simulation of s.simulations) {
    image(simulation.generatedImage, 'SIMULATION');
    const historicalDesign=plan.planning?.runs.some(run=>run.proposals.some(d=>d.id===simulation.designId));
    if (simulation.kind !== 'LEGACY_SINGLE' && simulation.designId !== main.designId && !designs.some(d => d.id === simulation.designId) && !plan.lengthVariations.some(d => d.id === simulation.designId) && !historicalDesign) fail('生成画像のデザイン参照が不正です。');
    if (simulation.kind === 'LEGACY_SINGLE' && (simulation.designId !== null || simulation.parentDesignId !== null)) fail('旧単枚画像をMAINの子生成と偽装しないでください。');
  }
  if (s.colorPlan.hairAnalysisId !== s.hairAnalysis.id || s.colorPlan.colorTargetId !== s.colorTarget.id || s.treatmentPlan.colorPlanId !== s.colorPlan.id || s.treatmentResult.treatmentPlanId !== s.treatmentPlan.id) fail('カラー計画・施術計画・結果の参照が不正です。');
  for (const zone of hairZones) {
    const z = s.colorPlan.zones[zone];
    if (!z || z.preLift.area !== zone || z.onColorPlan.area !== zone || z.liftRoute.value !== null && !liftRouteValues.includes(z.liftRoute.value)) fail('部位別カラー計画・LIFT ROUTEが不正です。');
  }
  uniqueIds(s.treatmentPlan.proposed, '提案処方'); uniqueIds(s.treatmentResult.stages, '実施工程');
  if (s.treatmentPlan.selectedProposalId && !s.treatmentPlan.proposed.some(p => p.id === s.treatmentPlan.selectedProposalId)) fail('選択処方の参照が不正です。');
  const actual = s.treatmentResult.actual;
  if (actual && (actual.confirmed ? actual.sourceType !== 'EMPIRICAL' : actual.sourceType !== 'STYLIST_CORRECTED')) fail('未確認の処方を施術実績として扱えません。');
  for (const stage of s.treatmentResult.stages) if (stage.linkedPreLiftStageId && !s.treatmentResult.stages.some(p => p.id === stage.linkedPreLiftStageId && p.kind === 'PRE_LIFT' && stage.kind === 'ON_COLOR' && p.area === stage.area)) fail('ON COLORのPRE-LIFT参照が不正です。');
  for (const p of s.treatmentResult.afterPhotos) image(p, 'AFTER');
}

/** New native histories receive the same append-only protection as the legacy histories. */
export function assertSessionHistory(previous: DiagnosisSession, next: DiagnosisSession) {
  if (previous.id !== next.id || previous.createdAt !== next.createdAt) fail('親セッションID・作成時刻は変更できません。');
  const appendOnly = (before: { id: string }[], after: { id: string }[], name: string) => {
    for (const item of before) if (JSON.stringify(item) !== JSON.stringify(after.find(value => value.id === item.id))) fail(`保存済み${name}原本は変更できません。`);
  };
  appendOnly(previous.hairAnalysis.aiEstimate, next.hairAnalysis.aiEstimate, '毛髪診断');
  appendOnly(previous.hairAnalysis.stylistCorrection, next.hairAnalysis.stylistCorrection, '毛髪補正');
  appendOnly(previous.faceBoneAnalysis.aiEstimate, next.faceBoneAnalysis.aiEstimate, '骨格診断');
  appendOnly(previous.faceBoneAnalysis.stylistCorrection, next.faceBoneAnalysis.stylistCorrection, '骨格補正');
  appendOnly(previous.colorTarget.confirmations, next.colorTarget.confirmations, 'COLOR確定');
  appendOnly(previous.simulations, next.simulations, '生成画像');
  appendOnly(previous.treatmentResult.stages, next.treatmentResult.stages, '施術工程');
  appendOnly(previous.photoAnalysis?.runs ?? [], next.photoAnalysis?.runs ?? [], '元画像解析');
  appendOnly(previous.photoAnalysis?.regionCorrections ?? [], next.photoAnalysis?.regionCorrections ?? [], '髪領域補正');
  assertDesignPlanningHistory(previous.designPlan.planning,next.designPlan.planning);
  assertHairSimulationHistory(previous.hairSimulation,next.hairSimulation);
}
