import type { Journey, Photo, ColorValue, DiagnosticMetric, RecipeLine, Region } from './journey.ts';
import { currentColor, lch, labHex } from './journey.ts';
import type { CatalogData } from './catalog.ts';
import type { EvidenceValue, DeveloperModel, FirstAgentModel, BaseCondition } from './base-making.ts';
import { basePlanIsCurrent } from './base-making.ts';
import { selectedBangDecision, activeBangSet, faceAnalysisFor, type BangParameters } from './bang-design.ts';
import { confirmedTargetAdjustment, pendingTargetAdjustment, targetDraft, type TargetControls } from './target-adjustment.ts';
import { simulationMode } from './design-target.ts';
import { createDiagnosisSession, DATA_SCHEMA_VERSION, hairZones, qualityFlagKeys, emptyHairZone, emptyZoneColorPlan,
  emptyColorRepresentation, emptyOx, unknownValue, sourcedValue, effectiveHairZone, type DiagnosisSession, type SessionSection, type SourceType,
  type SourcedValue, type ColorRepresentation, type ImageReference, type PhotoQuality, type HairZone, type HairMetric,
  type UnderTone, type UnderCondition, type Ox, type Drug, type FaceMetric, type ColorAdjustmentParameters, type BangFaceFrameParameters } from './session-model.ts';
import { validateDiagnosisSession } from './session-validation.ts';
import {projectHairSimulation} from './hair-simulation-context.ts';
import { projectDesignPlanning } from './design-planning-projection.ts';

export const sessionAdapterVersion = 'journey-session-adapter-v1';
export const supportedSessionMigrations = [{ from: 'color-journey-v1', to: DATA_SCHEMA_VERSION, mode: 'NON_DESTRUCTIVE_ADAPTER' }] as const;
const regionOf = (zone: HairZone): Region => zone.toLowerCase() as Region;
const zoneOf = (region: Region): HairZone => region.toUpperCase() as HairZone;
const mergeById = <T extends { id: string }>(previous: T[], imported: T[]): T[] => {
  const replacements = new Map(imported.map(item => [item.id, item]));
  const oldIds = new Set(previous.map(item => item.id));
  return [...previous.map(item => replacements.get(item.id) ?? item), ...imported.filter(item => !oldIds.has(item.id))];
};

function colorRepresentation(color: ColorValue, createdAt: string, sourceId: string | null): ColorRepresentation {
  // A manually selected Canvas sample is not an AI inference. The old origin remains untouched in Journey.
  const type: SourceType = color.origin === 'demo_fixture' ? 'MOCK' : 'STYLIST_CORRECTED';
  const method = color.origin === 'image_preview_estimate' ? 'manual_hair_image_sample_uncalibrated' : color.origin === 'demo_fixture' ? 'legacy_fixed_colour' : 'stylist_colour';
  const source = sourcedValue(structuredClone(color.value), type, sourceId, createdAt, method);
  const hex = labHex(color.value), channels = hex.slice(1).match(/../g)!.map(channel => parseInt(channel, 16));
  return { display: { hex, rgb: { r: channels[0], g: channels[1], b: channels[2] }, source: sourcedValue(hex, type, sourceId, createdAt, 'Lab_to_display_sRGB_not_hair_prediction') },
    perceptual: { lab: structuredClone(color.value), lch: lch(color.value), illuminant: color.illuminant, observer: color.observer,
      calibration: type === 'MOCK' ? 'MOCK' : 'UNCALIBRATED', source }, manufacturerVector: emptyColorRepresentation().manufacturerVector };
}
function fromFact<T>(item: EvidenceValue<T> | undefined, time: string): SourcedValue<T> {
  if (!item || item.value === null) return unknownValue();
  const value = sourcedValue(structuredClone(item.value), item.trust, item.sourceIds[0] ?? null, time, item.method, item.confidence);
  value.sourceIds = [...item.sourceIds];
  return value;
}
function tone(item: EvidenceValue<import('./base-making.ts').UnderTone> | undefined, time: string): SourcedValue<UnderTone> {
  if (!item || item.value === null || item.value === 'unknown') return unknownValue();
  return fromFact({ ...item, value: item.value }, time);
}
function imageReference(photo: Photo, sessionId: string, role: ImageReference['role']): ImageReference {
  return { imageId: photo.id, parentSessionId: sessionId, role, imageUrl: null, localReference: `journey-image:${photo.id}`,
    originalReference: photo.capture?.original || photo.original ? `journey-original:${photo.id}` : null,
    width: photo.width, height: photo.height, sourceType: photo.capture?.source === 'demo_sample' || /^MOCK-(final-master|visual-master)-/.test(photo.name) ? 'MOCK' : null };
}
function quality(photo: Photo): PhotoQuality {
  const source = photo.capture?.quality;
  const map = { backlight: 'backlight', overexposed: 'white_clip', underexposed: 'black_clip', blur: 'blur', motionBlur: 'motion', unevenLighting: 'uneven_light', strongReflection: 'reflection', colorCast: 'color_cast', positioning: 'position', framing: 'framing', possibleLensFog: 'lens_haze', whiteClipping: 'white_clip', blackClipping: 'black_clip' } as const;
  const flags = Object.fromEntries(qualityFlagKeys.map(key => {
    const check = source?.checks[map[key]];
    return [key, check ? { state: ({ pass: 'PASS', caution: 'CAUTION', ng: 'NG', not_assessed: 'NOT_ASSESSED' } as const)[check.state], method: check.method, message: check.message, metrics: structuredClone(check.metrics) } : { state: 'NOT_ASSESSED', method: null, message: null, metrics: {} }];
  })) as PhotoQuality['flags'];
  return { imageId: photo.id, status: source?.grade ?? null, score: source?.score ?? null, flags,
    featureState: source ? 'PARTIAL' : 'UNIMPLEMENTED', evaluatedAt: source?.evaluatedAt ?? null, algorithmVersion: source?.algorithmVersion ?? null,
    assessmentScope: source?.roi ?? null, stylistOverride: photo.capture?.accepted.qualityOverride ?? null };
}
const hairMetricMap: Record<DiagnosticMetric, HairMetric> = { under_level: 'underLevel', red: 'residualRed', orange: 'residualOrange', yellow: 'residualYellow', damage: 'damage', porosity: 'porosity', thickness: 'hairThickness', gray_percent: 'grayPercentage', unevenness: 'unevenness' };
const faceMetricMap: Record<FaceMetric, string | null> = {
  faceWidthRatio: 'face_width_ratio', faceHeightRatio: 'face_height_ratio', faceHeightWidthRatio: 'face_height_width_ratio', foreheadHeightRatio: 'forehead_height_ratio', foreheadWidthRatio: 'forehead_width_ratio', upperFaceRatio: 'upper_face_ratio', midfaceRatio: 'midface_ratio', lowerFaceRatio: 'lower_face_ratio', cheekbonePosition: 'cheekbone_y', cheekboneWidthRatio: 'cheekbone_width_ratio', jawWidthRatio: 'jaw_width_ratio', chinPosition: 'chin_y', browPosition: 'brow_y', eyePosition: 'eye_y', browEyeDistance: 'brow_eye_distance_ratio', hairlinePosition: 'hairline_y', facialBalance: 'left_right_balance', crown: 'head_top_y', parietal: 'parietal_y', temporal: null, occipital: null, headWidthRatio: null, headDepthRatio: 'occipital_depth_ratio',
};
function bangParameters(p: BangParameters): BangFaceFrameParameters {
  return { bangLength: p.length, bangWidth: p.width, bangDensity: p.density, bangPart: p.part, bangFlow: p.flow, sideBangLength: p.sideBang, faceFrameStart: p.faceFrame, faceFrameLength: null, faceFrameDirection: null, faceFrameVolumePosition: null };
}
const adjustmentParameters = (controls: TargetControls): ColorAdjustmentParameters => ({ lightness: controls.target_lightness, saturation: controls.target_saturation, redness: controls.target_redness, yellowness: controls.target_yellowness, mutedness: controls.target_mutedness, beige: controls.target_beige, transparency: controls.target_transparency, ash: null, olive: null, violet: null });
function under(item: BaseCondition, time: string): UnderCondition {
  const color = item.lab.value ? colorRepresentation({ space: 'CIELAB', illuminant: 'D65', observer: '2deg', value: item.lab.value, origin: item.lab.trust === 'MOCK' ? 'demo_fixture' : 'stylist', measurement: 'not_measured', version: 'lab-demo-v1' }, time, item.lab.sourceIds[0] ?? null) : null;
  if (color && item.lab.trust) {color.perceptual.source = fromFact(item.lab,time);color.display.source.sourceType = item.lab.trust;}
  return { level: fromFact(item.level, time), tone: tone(item.tone, time), residualRed: fromFact(item.residualRed, time), residualOrange: fromFact(item.residualOrange, time), residualYellow: fromFact(item.residualYellow, time), artificialPigment: fromFact(item.artificialPigment, time), color };
}
function ox(item: DeveloperModel | undefined, time: string): Ox {
  return item ? { productId: item.productId, concentrationPercent: fromFact(item.h2o2Percent, time), grams: unknownValue(), liftEffect: fromFact(item.liftEffect, time), hairConditionImpact: fromFact(item.burdenEffect, time) } : emptyOx();
}
function firstAgent(item: FirstAgentModel, time: string, id: string): Drug {
  return { productId: item.productId, variantId: item.variantId, label: item.productLabel ?? null, parts: sourcedValue(item.parts, 'EMPIRICAL', id, time, 'recorded_mix'), setLevel: fromFact(item.settingLevel, time),
    dyeVector: { manufacturer: 'FIOLE', axes: item.dyeVector ? structuredClone(item.dyeVector) : null, interpretation: 'DIAGRAM_COMPOSITION_NOT_CHEMICAL_CONCENTRATION', source: fromFact(item.dyeEvidence, time) }, alkali: fromFact(item.alkali, time), lift: fromFact(item.lift, time), deposit: fromFact(item.deposit, time) };
}
function recipeDrug(line: RecipeLine, type: SourceType, time: string, id: string, data?: CatalogData): Drug {
  return { productId: line.productId, variantId: line.variantId, label: line.label, parts: sourcedValue(line.parts, type, id, time, type === 'MOCK' ? 'legacy_demo_mass_ratio' : 'stylist_recorded_mass_ratio'), setLevel: sourcedValue(line.level, 'MANUFACTURER', line.sourceId, time, line.levelSemantics),
    dyeVector: { manufacturer: 'FIOLE', axes: data?.records.find(record => record.id === line.productId)?.diagram_vector ?? null, interpretation: 'DIAGRAM_COMPOSITION_NOT_CHEMICAL_CONCENTRATION', source: sourcedValue('manufacturer_diagram', 'MANUFACTURER', line.sourceId, time, 'diagram_not_concentration') }, alkali: unknownValue(), lift: unknownValue(), deposit: unknownValue() };
}
function photoBinding(photo: Photo | null | undefined) {
  if (!photo) return null;
  const capture = photo.capture;
  return { id: photo.id, view: photo.view, width: photo.width, height: photo.height, createdAt: photo.createdAt, name: photo.name,
    original: photo.original ? { representation: photo.original.representation, width: photo.original.width, height: photo.original.height } : null,
    capture: capture ? { source: capture.source, capturedAt: capture.capturedAt, importedAt: capture.importedAt, quality: capture.quality, accepted: capture.accepted, calibration: capture.calibration } : null };
}

/** Additive adapter: old bytes/fields and revision history are never rewritten on read. */
export function synchronizeDiagnosisSession(journey: Journey, data?: CatalogData, previous?: DiagnosisSession): DiagnosisSession {
  if (journey.schemaVersion !== 'color-journey-v1') throw new Error('未対応の旧データ版です。移行せず原データを保持してください。');
  const attached = journey.diagnosisSession ?? previous;
  if (attached && (attached.schemaVersion !== DATA_SCHEMA_VERSION || attached.dataSchemaVersion !== DATA_SCHEMA_VERSION)) throw new Error('未対応の共通データ版です。新しい版のアプリで開いてください。');
  if (attached && journey.id && attached.id !== journey.id) throw new Error('セッションIDと既存カルテIDが一致しません。');
  const s = attached ? structuredClone(attached) : createDiagnosisSession({ id: journey.id ?? undefined, createdAt: journey.createdAt });
  s.updatedAt = journey.updatedAt; s.revision = journey.version;
  s.compatibility.legacySchemaVersion = journey.schemaVersion; s.compatibility.legacyRecordId = journey.id;
  const time = journey.updatedAt;
  // A native module owns its fields when the corresponding legacy input has not changed.
  // This keeps future fields/corrections on read-save cycles, instead of projecting empty legacy fields over them.
  const update = (section: SessionSection, input: unknown, apply: () => void) => {
    const binding = JSON.stringify(input);
    if (s.compatibility.bindings[section] !== binding) { apply(); s.compatibility.bindings[section] = binding; }
  };
  update('currentPhotos', journey.photos.map(photoBinding), () => {
    s.photoQuality = journey.photos.map(quality);
    s.currentPhotos = journey.photos.map(photo => {
      const q = quality(photo), capture = photo.capture;
      return { ...imageReference(photo, s.id, 'CURRENT'), role: 'CURRENT', direction: photo.view === 'side' ? null : photo.view.toUpperCase() as import('./session-model.ts').PhotoDirection,
        legacyDirection: photo.view === 'side' ? 'side' : null, capturedAt: capture?.capturedAt ?? null, importedAt: capture?.importedAt ?? photo.createdAt,
        source: !capture || capture.source === 'demo_sample' ? null : capture.source === 'library' ? 'LIBRARY' : 'CAMERA',
        qualityStatus: q.status, qualityScore: q.score, qualityFlags: q.flags, calibration: { status: capture ? 'UNCALIBRATED' : 'NOT_ASSESSED', referenceImageId: null, transform: null } };
    });
    const warning = '旧side写真は右／左を断定できないためdirection=nullのまま保持。';
    s.compatibility.warnings = s.compatibility.warnings.filter(value => value !== warning);
    if (journey.photos.some(photo => photo.view === 'side')) s.compatibility.warnings.push(warning);
  });
  update('hairAnalysis', { analyses: journey.analyses, corrections: journey.corrections, colors: journey.colorCorrections, active: journey.activeAnalysisId, zones: journey.baseMaking?.zones }, () => {
    s.hairAnalysis.aiEstimate = mergeById(s.hairAnalysis.aiEstimate, journey.analyses.map(a => {
      const zones = Object.fromEntries(hairZones.map(zone => {
        const values = emptyHairZone(), region = regionOf(zone);
        for (const observation of a.observations.filter(item => item.region === region)) {
          const key = hairMetricMap[observation.metric];
          const type = observation.origin === 'demo_ai' ? 'MOCK' : 'AI_ESTIMATE';
          (values[key] as SourcedValue<number>) = sourcedValue(observation.value, type, observation.id, observation.createdAt, observation.scaleVersion);
        }
        const color = colorRepresentation(a.colors[region], a.createdAt, a.id);
        values.color = color;
        values.lightness = { ...color.perceptual.source, value: color.perceptual.lch!.L };
        values.hue = { ...color.perceptual.source, value: color.perceptual.lch!.h };
        values.chroma = { ...color.perceptual.source, value: color.perceptual.lch!.C };
        if (values.hue.value === null) values.hue.sourceType = null;
        return [zone, values];
      })) as import('./session-model.ts').HairEstimate['zones'];
      return { id: a.id, inputPhotoIds: [...a.photoIds], createdAt: a.createdAt, featureState: a.provider === 'demo-fixture-v1' ? 'MOCK' as const : 'ESTIMATE' as const, modelVersion: a.provider, zones };
    }));
    s.hairAnalysis.activeEstimateId = journey.activeAnalysisId;
    s.hairAnalysis.stylistCorrection = mergeById(s.hairAnalysis.stylistCorrection, journey.corrections.map(c => ({ id: c.id, estimateId: c.analysisId, overridesId: c.overridesId, zone: zoneOf(c.region), metric: hairMetricMap[c.metric], value: sourcedValue<number | UnderTone>(c.value, 'STYLIST_CORRECTED', c.id, c.createdAt, c.scaleVersion), actor: c.actor, createdAt: c.createdAt })));
    for (const zone of hairZones) {
      const z = journey.baseMaking?.zones[regionOf(zone)];
      if (!z) continue;
      for (const [metric, value] of [['underTone', tone(z.currentTone, time)], ['artificialPigment', fromFact(z.artificialPigment, time)], ['naturalMelanin', fromFact(z.naturalMelanin, time)]] as const) {
        const prefix = `legacy-base:${s.id}:${journey.activeAnalysisId}:${zone}:${metric}:`;
        const latest = s.hairAnalysis.stylistCorrection.findLast(c => c.id.startsWith(prefix));
        if (value.value === null) {
          if (!latest || latest.value.value === null) continue;
        } else {
          if (value.sourceType !== 'STYLIST_CORRECTED' && value.sourceType !== 'EMPIRICAL') continue;
          if (latest && latest.value.value === value.value && latest.value.sourceType === value.sourceType) continue;
        }
        // Append each decision, including A -> B -> A and an explicit return to unknown.
        // A value-derived ID would incorrectly re-activate B when A was chosen again.
        const id = `${prefix}${s.hairAnalysis.stylistCorrection.length}`;
        const correction = value.value === null ? sourcedValue<number | UnderTone>(null, null, null, time, 'stylist_clear_to_unknown') : value;
        s.hairAnalysis.stylistCorrection.push({ id, estimateId: journey.activeAnalysisId, overridesId: latest?.id ?? null, zone, metric, value: correction, actor: journey.stylist || null, createdAt: time });
      }
    }
  });
  update('hairHistory', journey.history, () => {
    const mapping: Record<string, import('./session-model.ts').HairHistory['type']> = { color: 'COLOR', dark_color: 'DARK_COLOR', black_dye: 'BLACK_DYE', bleach: 'BLEACH', lightener: 'LIGHTENER', straightening: 'STRAIGHTENING', acid_straightening: 'ACID_STRAIGHTENING', perm: 'PERM' };
    s.hairHistory = mergeById(s.hairHistory, journey.history.map(h => ({ id: h.id, parentSessionId: s.id, type: mapping[h.type.toLowerCase()] ?? 'OTHER', legacyType: h.type, date: h.date || null, area: h.region === 'all' ? 'ALL' as const : zoneOf(h.region), count: s.hairHistory.find(item=>item.id===h.id)?.count??null, note: h.notes, source: s.hairHistory.find(item=>item.id===h.id)?.source??unknownValue<string>(), ambiguity: h.type === 'dark' ? '旧選択肢は黒染め／暗染めを区別していない。' : null })));
  });
  update('faceBoneAnalysis', { analyses: journey.faceDesign?.analyses ?? [], active: faceAnalysisFor(journey)?.id ?? null }, () => {
    s.faceBoneAnalysis.aiEstimate = mergeById(s.faceBoneAnalysis.aiEstimate, (journey.faceDesign?.analyses ?? []).map(a => {
      const measurement = (key: string | null): SourcedValue<number> => {
        const m = key ? a.metrics[key as keyof typeof a.metrics] : null;
        if (!m || m.value === null) return unknownValue();
        return sourcedValue(m.value, m.status === 'mock' ? 'MOCK' : m.status === 'stylist_measured' ? 'STYLIST_CORRECTED' : 'AI_ESTIMATE', a.id, a.createdAt, m.method, m.confidence);
      };
      return { id: a.id, inputPhotoIds: [...a.photoIds], createdAt: a.createdAt, featureState: a.provider === 'mock-fixed-example-v1' ? 'MOCK' as const : a.provider === 'stylist' ? 'REAL' as const : 'ESTIMATE' as const, modelVersion: a.modelVersion,
        metrics: Object.fromEntries(Object.entries(faceMetricMap).map(([key, legacy]) => [key, measurement(legacy)])) as import('./session-model.ts').FaceEstimate['metrics'],
        additionalMeasurements: Object.fromEntries(Object.keys(a.metrics).map(key => [key, measurement(key)])), coordinateSpace: 'NORMALIZED_IMAGE_2D' as const,
        landmarks: a.landmarks.map(point => ({ imageId: point.photoId, key: point.key, x: point.x, y: point.y, sourceType: point.origin === 'stylist_measured' ? 'STYLIST_CORRECTED' as const : 'AI_ESTIMATE' as const })) };
    }));
    s.faceBoneAnalysis.activeEstimateId = faceAnalysisFor(journey)?.id ?? null;
  });
  const chosen = selectedBangDecision(journey), activeSet = activeBangSet(journey), mode = simulationMode(journey);
  update('simulationMode', { requested: journey.target.simulationMode, resolved: mode }, () => { s.simulationMode = mode ? mode.toUpperCase() as DiagnosisSession['simulationMode'] : null; });
  update('styleTarget', { photo: photoBinding(journey.target.styleReference), parameters: journey.target.styleParameters, text: journey.target.style, chosen }, () => {
    const parameters = journey.target.styleParameters;
    s.styleTarget = { ...s.styleTarget, referenceImage: journey.target.styleReference ? imageReference(journey.target.styleReference, s.id, 'STYLE_REFERENCE') : null, requestText: journey.target.style,
      lengthOffsetCm: parameters?.lengthOffsetCm ?? null, layer: { amount: parameters?.layerAmount ?? null, start: parameters?.layerStart ?? null }, volume: parameters?.volumePosition ?? null, ends: parameters?.endsLightness ?? null,
      bang: chosen ? bangParameters(chosen.parameters) : null, faceFrame: chosen ? bangParameters(chosen.parameters) : null, selectedBangDecisionId: chosen?.id ?? null };
  });
  const confirmed = confirmedTargetAdjustment(journey), draft = targetDraft(journey);
  update('colorTarget', { photo: photoBinding(journey.target.reference), text: journey.target.text, color: journey.target.color, level: journey.target.level, draft, confirmations: journey.targetAdjustments?.map(c => ({ id: c.id, color: c.color, controls: c.controls, original: c.sourceLab, previewId: c.previewPhoto.id, at: c.confirmedAt })), confirmed: journey.target.confirmedAdjustmentId, finish: journey.baseMaking?.targetFinishLevel, zones: journey.target.colorZones, mode }, () => {
    const hasColor = mode !== 'style_only' && Boolean(journey.target.reference || journey.target.text.trim());
    const finish = journey.baseMaking?.targetFinishLevel;
    s.colorTarget = { ...s.colorTarget, referenceImage: journey.target.reference ? imageReference(journey.target.reference, s.id, 'COLOR_REFERENCE') : null, requestText: journey.target.text,
      originalColorParameters: confirmed ? colorRepresentation({ ...confirmed.color, value: confirmed.sourceLab }, confirmed.confirmedAt, confirmed.referencePhoto.id) : null,
      adjustedColorParameters: confirmed ? {...adjustmentParameters(confirmed.controls),hueShift:confirmed.hueShift??null} : null, draftColorParameters: draft ? {...adjustmentParameters(draft.controls),hueShift:draft.hueShift??null} : null,
      color: hasColor ? colorRepresentation(journey.target.color, confirmed?.confirmedAt ?? time, confirmed?.id ?? journey.target.reference?.id ?? null) : null,
      targetFinishLevel: !hasColor ? unknownValue() : finish?.value === journey.target.level ? fromFact(finish, time) : sourcedValue(journey.target.level, 'MOCK', null, time, 'legacy_level_provenance_untracked'),
      confirmedAt: confirmed?.confirmedAt ?? null, confirmedAdjustmentId: confirmed?.id ?? null, pendingConfirmation: pendingTargetAdjustment(journey), adjustedPreview: confirmed ? imageReference(confirmed.previewPhoto, s.id, 'COLOR_PREVIEW') : null,
      confirmations: mergeById(s.colorTarget.confirmations, (journey.targetAdjustments ?? []).map(c => ({ id: c.id, sourceReferenceImage: imageReference(c.referencePhoto, s.id, 'COLOR_REFERENCE'), adjustedPreview: imageReference(c.previewPhoto, s.id, 'COLOR_PREVIEW'), controls: adjustmentParameters(c.controls), normalizedControls: adjustmentParameters(c.normalizedControls), originalColor: colorRepresentation({ ...c.color, value: c.sourceLab }, c.confirmedAt, c.referencePhoto.id), adjustedColor: colorRepresentation(c.color, c.confirmedAt, c.id), confirmedAt: c.confirmedAt, hairMaskId: c.hairMask ? `confirmation-mask:${c.id}` : null, algorithmVersion: c.algorithmVersion, scope: c.scope }))),
      zones: (journey.target.colorZones ?? []).map(z => ({ zone: z.zone.toUpperCase() as HairZone | 'HIGHLIGHT' | 'LOWLIGHT', color: z.color ? colorRepresentation(z.color, time, z.sourcePhotoId) : null, sourceImageId: z.sourcePhotoId, areaRatio: z.areaRatio })) };
  });
  update('designPlan', { current: journey.photos.map(photoBinding), activeHair: journey.activeAnalysisId, activeFace: s.faceBoneAnalysis.activeEstimateId, style: s.compatibility.bindings.styleTarget, color: s.compatibility.bindings.colorTarget, set: activeSet, drafts: journey.faceDesign?.drafts, decisions: journey.faceDesign?.decisions, chosen: chosen?.id }, () => {
    const plan = s.designPlan;
    plan.inputs = { hairAnalysisId: s.hairAnalysis.id, hairEstimateId: s.hairAnalysis.activeEstimateId, faceBoneAnalysisId: s.faceBoneAnalysis.id, faceEstimateId: s.faceBoneAnalysis.activeEstimateId, styleTargetId: s.styleTarget.id, colorTargetId: s.colorTarget.id };
    plan.mainDesign.sourceCurrentPhoto = journey.photos.find(p => p.view === 'front')?.id ?? journey.photos[0]?.id ?? null;
    plan.mainDesign.styleParameters = mode === 'color_only' ? null : structuredClone(s.styleTarget);
    plan.mainDesign.colorParameters = mode === 'style_only' ? null : structuredClone(s.colorTarget);
    plan.mainDesign.faceBoneAnalysisReference = s.faceBoneAnalysis.activeEstimateId;
    if (plan.mainDesign.generatedImage) plan.mainDesign.generationStatus = 'STALE';
    // Preserve native/generated design plans; fixed legacy templates never become AI-designed plans.
    if (activeSet && plan.featureState === 'UNIMPLEMENTED') plan.bangFaceFrameDesigns = activeSet.proposals.map(p => ({
      id: p.id, parentSessionId: s.id, parentDesignId: plan.mainDesign.designId, label: p.label, name: p.title, visualEffectDescription: p.intent, parameters: bangParameters(p.parameters), rationale: p.emphasis,
      basedOnFaceBoneAnalysis: { analysisId: activeSet.analysisId, metricKeys: [...p.basisMetrics], valuesWereUsed: false }, sourceType: 'MOCK', featureState: 'MOCK', generatedImage: null, generationStatus: 'NOT_REQUESTED', generationMetadata: null,
      draftParameters: journey.faceDesign?.drafts[p.id] ? bangParameters(journey.faceDesign.drafts[p.id]) : null,
      stylistCorrection: (journey.faceDesign?.decisions ?? []).filter(d => d.proposalId === p.id).map(d => ({ id: d.id, proposalId: p.id, parameters: bangParameters(d.parameters), actor: d.actor, createdAt: d.createdAt, sourceType: 'STYLIST_CORRECTED' })), selectedCorrectionId: chosen?.proposalId === p.id ? chosen.id : null,
    }));
    if(!plan.planning?.activeRunId)plan.selectedDesignId = chosen?.proposalId ?? null;
  });
  update('simulations', journey.imageGenerations?.map(i => ({ id: i.id, context: i.context, model: i.model, roles: i.roles })) ?? [], () => {
    s.simulations = mergeById(s.simulations, (journey.imageGenerations ?? []).map(i => ({ id: i.id, parentSessionId: s.id, designId: null, parentDesignId: null, kind: 'LEGACY_SINGLE' as const, sourceCurrentPhotoId: i.currentPhotoId, styleReferenceImageId: i.roles?.styleReferencePhotoId ?? null, colorReferenceImageId: i.roles?.colorReferencePhotoId ?? i.referencePhotoId,
      generatedImage: { imageId: i.id, parentSessionId: s.id, role: 'SIMULATION', imageUrl: null, localReference: `journey-generation:${i.id}`, originalReference: null, width: i.width, height: i.height, sourceType: 'AI_ESTIMATE' }, metadata: { model: i.model, modelVersion: null, promptVersion: i.promptVersion, requestId: i.requestId, createdAt: i.createdAt, sourceType: 'AI_ESTIMATE', inputContext: i.context } })));
  });
  update('colorPlan', { zones: journey.baseMaking?.zones, hair: s.compatibility.bindings.hairAnalysis, target: s.compatibility.bindings.colorTarget, history: journey.history }, () => {
    s.colorPlan.targetColor = structuredClone(s.colorTarget.color); s.colorPlan.targetFinishLevel = structuredClone(s.colorTarget.targetFinishLevel);
    for (const zone of hairZones) {
      const region = regionOf(zone), z = basePlanIsCurrent(journey, region) ? journey.baseMaking?.zones[region] : undefined;
      const plan = emptyZoneColorPlan(zone), current = currentColor(journey, region);
      plan.currentColor = current ? colorRepresentation(current, time, journey.activeAnalysisId) : null;
      plan.requiredUnderLevel = fromFact(z?.requiredLevel, time); plan.requiredUnderTone = tone(z?.requiredTone, time);
      const route = z?.route;
      plan.liftRoute = route?.value ? sourcedValue(route.value === 'STYLIST_REVIEW' ? 'STYLIST_JUDGMENT' : route.value, route.trust, route.sourceIds[0] ?? null, time, route.method) : unknownValue();
      if (z) plan.predictedUnder = under(z.predicted, time);
      plan.naturalMelanin = fromFact(z?.naturalMelanin, time); plan.artificialPigment = fromFact(z?.artificialPigment, time); plan.hairOrigin = fromFact(z?.hairOrigin, time);
      plan.preLift = { ...plan.preLift, startingLevel: effectiveHairZone(s,zone).underLevel, targetUnderLevel: structuredClone(plan.requiredUnderLevel), targetUnderTone: structuredClone(plan.requiredUnderTone), predictedUnderLevel: structuredClone(plan.predictedUnder.level), predictedUnderTone: structuredClone(plan.predictedUnder.tone), predictedResidualRed: structuredClone(plan.predictedUnder.residualRed), predictedResidualOrange: structuredClone(plan.predictedUnder.residualOrange), predictedResidualYellow: structuredClone(plan.predictedUnder.residualYellow), predictedArtificialPigment: structuredClone(plan.predictedUnder.artificialPigment) };
      plan.onColorPlan = { ...plan.onColorPlan, beforeUnderLevel: structuredClone(plan.predictedUnder.level), beforeUnderTone: structuredClone(plan.predictedUnder.tone), target: structuredClone(s.colorTarget.color) };
      s.colorPlan.zones[zone] = plan;
    }
  });
  update('treatmentPlan', { proposals: journey.proposals, selected: journey.selectedProposalId, planned: journey.planned }, () => {
    s.treatmentPlan.proposed = mergeById<import('./session-model.ts').RecipeProposal>(s.treatmentPlan.proposed.map(p => ({ ...p, active: false })), journey.proposals.map(p => ({ id: p.id, parentSessionId: s.id, label: p.label, area: zoneOf(p.region), fioleDrugs: p.lines.map(line => recipeDrug(line, 'MOCK', time, p.id, data)), ratios: p.lines.map(line => sourcedValue(line.parts, 'MOCK', p.id, time, 'legacy_demo_mass_ratio')), totalGrams: sourcedValue(p.totalGrams, 'MOCK', p.id, time, 'demo_trial_total'), oxCandidateIds: [...p.developerCandidateIds], reasons: [...p.reasons], sourceType: 'MOCK', featureState: 'PARTIAL', algorithmVersion: p.algorithmVersion, inputContext: p.context, active: true })));
    s.treatmentPlan.selectedProposalId = journey.selectedProposalId;
    s.treatmentPlan.ox = { ...emptyOx(), productId: journey.planned.developerId, grams: sourcedValue(journey.planned.developerGrams, 'STYLIST_CORRECTED', s.treatmentPlan.id, time, 'stylist_plan') };
    s.treatmentPlan.processingTime = sourcedValue(journey.planned.durationMin, 'STYLIST_CORRECTED', s.treatmentPlan.id, time, 'stylist_plan');
  });
  update('treatmentResult', { actual: journey.actual, stages: journey.baseMaking?.stages, after: photoBinding(journey.after), outcome: journey.outcome }, () => {
    const actual = journey.actual, id = `actual:${s.id}`, type = actual?.confirmed ? 'EMPIRICAL' as const : 'STYLIST_CORRECTED' as const;
    s.treatmentResult.actual = actual ? { id, parentSessionId: s.id, originProposalId: actual.originProposalId, confirmed: actual.confirmed, sourceType: type, area: zoneOf(actual.region), fioleDrugs: actual.lines.map(line => recipeDrug(line, type, time, id, data)), ratios: actual.lines.map(line => sourcedValue(line.parts, type, id, time, 'recorded_mass_ratio')), totalGrams: sourcedValue(actual.totalGrams, type, id, time, 'recorded_total'), ox: { ...emptyOx(), productId: actual.developerId, grams: sourcedValue(actual.developerGrams, type, id, time, 'recorded_developer_mass') }, mixingRatio: unknownValue(), processingTime: sourcedValue(actual.durationMin, type, id, time, 'recorded_time'), note: actual.notes } : null;
    s.treatmentResult.stages = mergeById(s.treatmentResult.stages, (journey.baseMaking?.stages ?? []).map(t => ({ id: t.id, parentSessionId: s.id, kind: t.kind, area: zoneOf(t.region), application: t.application, performedAt: t.performedAt, sourcePhotoIds: [...t.sourcePhotoIds], drug: t.firstAgents.map(agent => firstAgent(agent, t.recordedAt, t.id)), totalGrams: sourcedValue(t.firstAgentTotalGrams, 'EMPIRICAL', t.id, t.recordedAt, 'recorded_first_agent_mass'), ox: ox(t.developer, t.recordedAt), mixingRatio: fromFact(t.developer.mixRatio, t.recordedAt), processingTime: sourcedValue(t.durationMin, 'EMPIRICAL', t.id, t.recordedAt, 'recorded_time'), startingUnder: under(t.before, t.recordedAt), targetUnder: under(t.goal, t.recordedAt), actualUnder: under(t.actual, t.recordedAt), linkedPreLiftStageId: t.linkedPreLiftStageId, linkedProposalId: t.linkedProposalId, afterPhotoId: t.actualAfterPhotoId, note: t.notes })));
    for (const zone of hairZones) { const actualStage = s.treatmentResult.stages.findLast(t => t.area === zone && (t.actualUnder.level.value !== null || t.actualUnder.tone.value !== null)); s.treatmentResult.actualUnder[zone] = actualStage ? structuredClone(actualStage.actualUnder) : null; }
    if (journey.after) s.treatmentResult.afterPhotos = mergeById(s.treatmentResult.afterPhotos.map(p => ({ ...p, id: p.imageId })), [{ ...imageReference(journey.after, s.id, 'AFTER'), id: journey.after.id }]).map(({ id: _id, ...photo }) => photo);
    s.treatmentResult.resultEvaluation = { colorMatch: sourcedValue(journey.outcome.colorMatch, 'EMPIRICAL', s.treatmentResult.id, time, 'stylist_result_evaluation'), damageChange: sourcedValue(journey.outcome.damageChange, 'EMPIRICAL', s.treatmentResult.id, time, 'stylist_result_evaluation'), note: journey.outcome.notes, actualAfterColor: journey.outcome.actualAfterColor ? colorRepresentation(journey.outcome.actualAfterColor, time, journey.after?.id ?? null) : null };
  });
  // Reference maintenance is real data plumbing, never an AI design-planning step.
  // Real photo analysis owns its original estimates. Legacy demo/record editing must not reset these values.
  const nativeRun = s.photoAnalysis?.runs.find(r => r.id === s.photoAnalysis?.activeRunId);
  if (nativeRun && nativeRun.inputPhotoIds.join('|') === s.currentPhotos.map(p => p.imageId).join('|')) {
    s.hairAnalysis.activeEstimateId = nativeRun.hairEstimateId;
    s.faceBoneAnalysis.activeEstimateId = nativeRun.faceEstimateId;
    for (const result of nativeRun.photos) {
      const q = s.photoQuality.find(q => q.imageId === result.imageId), photo = s.currentPhotos.find(p => p.imageId === result.imageId);
      if (q) Object.assign(q, structuredClone(result.quality));
      if (photo) { photo.qualityStatus = result.quality.status; photo.qualityScore = result.quality.score; photo.qualityFlags = structuredClone(result.quality.flags); }
    }
    const representative = nativeRun.photos.find(p => p.imageId === nativeRun.representativeColorPhotoId);
    const regionCorrection = s.photoAnalysis?.regionCorrections.findLast(c => c.runId === nativeRun.id && c.imageId === representative?.imageId);
    for (const zone of hairZones) s.colorPlan.zones[zone].currentColor = structuredClone(regionCorrection ? regionCorrection.zoneValues[zone]?.color ?? null : representative?.hairZones[zone]?.color ?? null);
  } else if (nativeRun) {
    s.photoAnalysis!.activeRunId = null;
    if (s.hairAnalysis.activeEstimateId === nativeRun.hairEstimateId) s.hairAnalysis.activeEstimateId = null;
    if (s.faceBoneAnalysis.activeEstimateId === nativeRun.faceEstimateId) s.faceBoneAnalysis.activeEstimateId = null;
  }
  for (const module of [s.hairAnalysis, s.faceBoneAnalysis]) {
    const active = module.aiEstimate.find(a => a.id === module.activeEstimateId);
    if (active?.inputPhotoIds.some(id => !s.currentPhotos.some(p => p.imageId === id))) module.activeEstimateId = null;
  }
  s.designPlan.inputs = { hairAnalysisId: s.hairAnalysis.id, hairEstimateId: s.hairAnalysis.activeEstimateId, faceBoneAnalysisId: s.faceBoneAnalysis.id, faceEstimateId: s.faceBoneAnalysis.activeEstimateId, styleTargetId: s.styleTarget.id, colorTargetId: s.colorTarget.id };
  if (s.designPlan.mainDesign.generationStatus === 'NOT_REQUESTED') {
    s.designPlan.mainDesign.styleParameters = s.simulationMode === 'COLOR_ONLY' || s.simulationMode === null ? null : structuredClone(s.styleTarget);
    s.designPlan.mainDesign.colorParameters = s.simulationMode === 'STYLE_ONLY' || s.simulationMode === null ? null : structuredClone(s.colorTarget);
    s.designPlan.mainDesign.faceBoneAnalysisReference = s.faceBoneAnalysis.activeEstimateId;
  }
  projectDesignPlanning(s);
  projectHairSimulation(s);
  if (s.status === 'DRAFT' && journey.photos.length) s.status = 'IN_PROGRESS';
  validateDiagnosisSession(s);
  return s;
}

export function withDiagnosisSession(journey: Journey, data?: CatalogData, previous?: DiagnosisSession): Journey {
  return { ...journey, diagnosisSession: synchronizeDiagnosisSession(journey, data, previous) };
}

/** Native callers can save new fields without clearing their backing legacy data. */
export function attachDiagnosisSession(journey: Journey, session: DiagnosisSession): Journey {
  validateDiagnosisSession(session);
  if (journey.id && journey.id !== session.id) throw new Error('別のカルテへ共通データを保存できません。');
  if (journey.version !== session.revision) throw new Error('共通データと既存カルテの保存版が異なります。');
  return { ...journey, diagnosisSession: structuredClone(session) };
}

/** Resolve role-specific local references without recolouring, recompressing or copying stored bytes. */
export function resolveSessionImage(journey: Journey, reference: ImageReference, representation: 'preview' | 'original' = 'preview') {
  if ((journey.id ?? journey.diagnosisSession?.id) !== reference.parentSessionId) throw new Error('別セッションの画像を参照できません。');
  const confirmations = journey.targetAdjustments ?? [];
  const candidates: Partial<Record<ImageReference['role'], Photo[]>> = {
    CURRENT: [...journey.photos, ...(journey.analysisPhotoArchive ?? [])], STYLE_REFERENCE: journey.target.styleReference ? [journey.target.styleReference] : [],
    COLOR_REFERENCE: [...(journey.target.reference ? [journey.target.reference] : []), ...confirmations.map(c => c.referencePhoto)],
    COLOR_PREVIEW: confirmations.map(c => c.previewPhoto), AFTER: journey.after ? [journey.after] : [],
  };
  const p = candidates[reference.role]?.find(p => p.id === reference.imageId);
  if (p) {
    const original = p.capture?.original ?? p.original;
    if (representation === 'original') {
      if (!original || reference.originalReference !== `journey-original:${p.id}`) throw new Error('解析用元画像がありません。縮小画像を元画像として扱えません。');
      return { dataUrl: original.dataUrl, mimeType: original.mimeType, width: original.width, height: original.height, representation: original.representation };
    }
    if (reference.localReference !== `journey-image:${p.id}`) throw new Error('画像の保存先参照が一致しません。');
    return { dataUrl: p.dataUrl, mimeType: p.dataUrl.slice(5).split(';')[0], width: p.width, height: p.height, representation: 'ui_preview' as const };
  }
  if (reference.role === 'SIMULATION' && representation === 'preview') {
    const asset=journey.diagnosisSession?.hairSimulation?.generatedAssets.find(a=>a.id===reference.imageId);
    if(asset&&reference.localReference===`simulation-asset:${asset.id}`)return {dataUrl:asset.dataUrl,mimeType:'image/png',width:asset.reference.width!,height:asset.reference.height!,representation:'generated_image' as const};
    const i = journey.imageGenerations?.find(i => i.id === reference.imageId);
    if (i && reference.localReference === `journey-generation:${i.id}`) return { dataUrl: i.dataUrl, mimeType: 'image/png', width: i.width, height: i.height, representation: 'generated_image' as const };
  }
  throw new Error('現在の保存版に画像がありません。元のカルテ保存版を保持して確認してください。');
}
