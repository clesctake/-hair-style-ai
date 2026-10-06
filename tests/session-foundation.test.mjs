import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog } from '../src/lib/catalog.ts';
import assets from '../src/data/journey_sample_assets.json' with { type: 'json' };
import { newJourney, correct, proposeRecipes } from '../src/lib/journey.ts';
import { createJourneySample } from '../src/lib/journey-sample.ts';
import { memoryJourneyStore } from '../src/lib/journey-store.ts';
import { diagnosisSessionStore } from '../src/lib/diagnosis-session-store.ts';
import { createDiagnosisSession, effectiveHairZone, sourcedValue, hairZones, sourceTypes, DATA_SCHEMA_VERSION, liftRouteValues, APP_VERSION, SPEC_VERSION } from '../src/lib/session-model.ts';
import { FeatureRegistry, featureStates, featureRegistryVersion } from '../src/lib/feature-registry.ts';
import { withDiagnosisSession, synchronizeDiagnosisSession, attachDiagnosisSession, resolveSessionImage } from '../src/lib/session-adapter.ts';
import { validateDiagnosisSession } from '../src/lib/session-validation.ts';
import { generationContract } from '../src/lib/generation-contract.ts';
import { sessionAnalysisInput } from '../src/lib/analysis-contract.ts';
import { targetDraft, confirmTargetAdjustment } from '../src/lib/target-adjustment.ts';
import { newBasePlan, newTreatment, fact } from '../src/lib/base-making.ts';
import { hairImageInput } from '../src/lib/hair-images.ts';
const sample = async () => (await createJourneySample(catalog, assets)).session;

test('session creation links every module, reserves MAIN/A-E/length children and leaves unknown calculations null', () => {
  const s = createDiagnosisSession({ customerId: 'customer-1' });
  assert.equal(s.customerId, 'customer-1'); assert.equal(s.specVersion, SPEC_VERSION); assert.equal(s.dataSchemaVersion, DATA_SCHEMA_VERSION);
  assert.equal(s.schemaVersion, DATA_SCHEMA_VERSION); assert.equal(s.revision, 0); assert.equal(s.status, 'DRAFT');
  for (const key of ['hairAnalysis', 'faceBoneAnalysis', 'styleTarget', 'colorTarget', 'designPlan', 'colorPlan', 'treatmentPlan', 'treatmentResult']) assert.equal(s[key].parentSessionId, s.id);
  assert.equal(s.designPlan.inputs.hairAnalysisId, s.hairAnalysis.id); assert.equal(s.designPlan.inputs.faceBoneAnalysisId, s.faceBoneAnalysis.id);
  assert.equal(s.designPlan.inputs.styleTargetId, s.styleTarget.id); assert.equal(s.designPlan.inputs.colorTargetId, s.colorTarget.id);
  assert.equal(s.treatmentPlan.colorPlanId, s.colorPlan.id); assert.equal(s.treatmentResult.treatmentPlanId, s.treatmentPlan.id);
  for (const zone of hairZones) {
    assert.equal(s.colorPlan.zones[zone].requiredUnderLevel.value, null); assert.equal(s.colorPlan.zones[zone].liftRoute.value, null);
    assert.equal(s.colorPlan.zones[zone].predictedUnder.level.value, null); assert.equal(s.colorPlan.zones[zone].onColorPlan.predictedFinalColor, null);
  }
  assert.equal(s.designPlan.mainDesign.generatedImage, null);
  assert.doesNotThrow(() => validateDiagnosisSession(s));
});

test('ROOT/MID/END and AI estimate/stylist correction survive storage without overwriting the fixed MOCK originals', async () => {
  const old = await sample(), store = memoryJourneyStore(catalog), original = JSON.stringify(old.analyses);
  const changed = withDiagnosisSession(correct(old, 'mid', 'under_level', 6), catalog);
  changed.proposals = proposeRecipes(changed, catalog); changed.selectedProposalId = changed.proposals[0].id;
  const saved = await store.save(changed), loaded = await store.load(saved.id), s = loaded.diagnosisSession;
  const a = s.hairAnalysis.aiEstimate.find(a => a.id === s.hairAnalysis.activeEstimateId);
  assert.equal(a.zones.ROOT.underLevel.value, 7); assert.equal(a.zones.MID.underLevel.value, 9); assert.equal(a.zones.END.underLevel.value, 11);
  for (const zone of hairZones) { assert.equal(a.zones[zone].baseLevel.value, null); assert.equal(a.zones[zone].underLevel.sourceType, 'MOCK'); }
  assert.equal(a.featureState, 'MOCK'); assert.equal(effectiveHairZone(s, 'MID').underLevel.value, 6);
  assert.equal(effectiveHairZone(s, 'MID').underLevel.sourceType, 'STYLIST_CORRECTED');
  assert.equal(effectiveHairZone(s, 'ROOT').underLevel.value, 7); assert.equal(JSON.stringify(loaded.analyses), original);
  assert.equal(loaded.id, s.id); assert.equal(loaded.version, s.revision);
  for (const key of ['lightness', 'hue', 'chroma', 'residualRed', 'residualOrange', 'residualYellow', 'artificialPigment', 'damage', 'porosity', 'hairThickness', 'grayPercentage']) assert.ok(key in a.zones.MID);
});

test('native bone correction and future fields persist through both store interfaces and legacy re-save', async () => {
  const store = memoryJourneyStore(catalog), native = diagnosisSessionStore(store, catalog);
  const saved = await store.save(await sample()), record = await native.load(saved.id), original = JSON.stringify(record.session.faceBoneAnalysis.aiEstimate);
  record.session.customerId = 'customer-42';
  record.session.faceBoneAnalysis.stylistCorrection.push({ id: 'manual-face-1', estimateId: record.session.faceBoneAnalysis.activeEstimateId, metric: 'foreheadHeightRatio', value: sourcedValue(.29, 'STYLIST_CORRECTED', 'manual-face-1', record.session.updatedAt, 'stylist_proportion_check'), actor: '美容師', createdAt: record.session.updatedAt });
  record.session.styleTarget.silhouette = 'round_layer';
  record.session.hairHistory[0].count = 2;
  const result = await native.save(record), reSaved = await store.save(result.legacyJourney), loaded = await native.load(reSaved.id);
  assert.equal(loaded.session.customerId, 'customer-42'); assert.equal(loaded.session.faceBoneAnalysis.stylistCorrection[0].value.value, .29);
  assert.equal(loaded.session.styleTarget.silhouette, 'round_layer'); assert.equal(loaded.session.hairHistory[0].count, 2);
  assert.equal(JSON.stringify(loaded.session.faceBoneAnalysis.aiEstimate), original);
  assert.equal((await native.list())[0].session.id, loaded.session.id);
});

test('STYLE and COLOR retain distinct image roles; changing STYLE cannot change target or recipe inputs', async () => {
  const old = await sample(), first = withDiagnosisSession(old, catalog), color = JSON.stringify(first.diagnosisSession.colorTarget);
  const next = withDiagnosisSession({ ...first, target: { ...first.target, style: 'STYLEだけ変更', styleReference: { ...first.target.styleReference, id: 'new-style-image' } } }, catalog);
  assert.equal(next.diagnosisSession.styleTarget.referenceImage.role, 'STYLE_REFERENCE'); assert.equal(next.diagnosisSession.styleTarget.referenceImage.imageId, 'new-style-image');
  assert.equal(next.diagnosisSession.colorTarget.referenceImage.role, 'COLOR_REFERENCE'); assert.equal(JSON.stringify(next.diagnosisSession.colorTarget), color);
  assert.deepEqual(proposeRecipes(next, catalog).map(p => p.lines), proposeRecipes(first, catalog).map(p => p.lines));
  const mixed = structuredClone(next.diagnosisSession); mixed.colorTarget.referenceImage = mixed.styleTarget.referenceImage;
  assert.throws(() => validateDiagnosisSession(mixed), /役割/);
});

test('confirmed hair-only COLOR maps original, adjusted controls, Lab/display and preview with manual provenance, not AI inference', async () => {
  let old = await sample();
  old.target.adjustmentDraft = { ...targetDraft(old), controls: { ...targetDraft(old).controls, target_lightness: 12, target_redness: -8 }, samplePoint: { x: .31, y: .44, radius: .035, selected: true, method: 'manual_circle' } };
  // Synthetic test pixels/colour only; no image model or scientific hair measurement is invoked.
  old = confirmTargetAdjustment(old, { dataUrl: 'data:image/png;base64,dGVzdA==', width: 448, height: 560, sourceLab: { L: 45, a: 8, b: 20 }, adjustedLab: { L: 57, a: 2, b: 18 }, clippedPixelFraction: 0 });
  const mapped = withDiagnosisSession(old, catalog), target = mapped.diagnosisSession.colorTarget;
  assert.equal(target.originalColorParameters.perceptual.lab.L, 45); assert.equal(target.color.perceptual.lab.L, 57);
  assert.equal(target.adjustedColorParameters.lightness, 12); assert.equal(target.adjustedColorParameters.redness, -8);
  assert.equal(target.adjustedPreview.role, 'COLOR_PREVIEW'); assert.equal(target.confirmedAt, old.targetAdjustments[0].confirmedAt);
  assert.equal(target.color.perceptual.source.sourceType, 'STYLIST_CORRECTED'); assert.equal(target.color.perceptual.calibration, 'UNCALIBRATED');
  assert.ok(target.color.display.hex); assert.ok(target.color.perceptual.lch); assert.equal(target.color.manufacturerVector.axes, null);
  assert.equal(old.target.color.origin, 'image_preview_estimate');
  const input = generationContract(mapped.diagnosisSession); assert.equal(input.effectiveColorReference.imageId, old.targetAdjustments[0].previewPhoto.id);
  const store = memoryJourneyStore(catalog), loaded = await store.load((await store.save(mapped)).id);
  assert.equal(loaded.diagnosisSession.colorTarget.confirmations[0].hairMaskId, `confirmation-mask:${old.targetAdjustments[0].id}`);
});

test('MAIN, A-E and length variants have validated parent relations; placeholder image counts never mean generated', async () => {
  const s = synchronizeDiagnosisSession(await sample(), catalog), main = s.designPlan.mainDesign;
  assert.deepEqual(s.designPlan.bangFaceFrameDesigns.map(d => d.label), ['A', 'B', 'C', 'D', 'E']);
  for (const d of s.designPlan.bangFaceFrameDesigns) {
    assert.equal(d.parentDesignId, main.designId); assert.equal(d.parentSessionId, s.id); assert.equal(d.sourceType, 'MOCK');
    assert.equal(d.basedOnFaceBoneAnalysis.valuesWereUsed, false); assert.equal(d.generatedImage, null); assert.equal(d.generationStatus, 'NOT_REQUESTED');
  }
  assert.deepEqual(s.designPlan.lengthVariations.map(d => d.key), ['MINUS_10', 'MINUS_5', 'BASE', 'PLUS_5', 'PLUS_10']);
  assert.deepEqual(s.designPlan.lengthVariations.map(d => d.offsetCm), [-10, -5, 0, 5, 10]);
  assert.ok(s.designPlan.lengthVariations.every(d => d.parentDesignId === main.designId));
  const broken = structuredClone(s); broken.designPlan.bangFaceFrameDesigns[0].parentDesignId = 'other-parent';
  assert.throws(() => validateDiagnosisSession(broken), /MAIN親ID/);
  const fake = structuredClone(s); fake.designPlan.mainDesign.generationStatus = 'SUCCEEDED'; assert.throws(() => validateDiagnosisSession(fake), /完了/);
});

test('feature registry exposes exact five states separately from trust and reports the unfinished engines truthfully', () => {
  assert.deepEqual(featureStates, ['REAL', 'ESTIMATE', 'MOCK', 'PARTIAL', 'UNIMPLEMENTED']);
  assert.deepEqual(sourceTypes, ['MANUFACTURER', 'REFERENCE', 'EMPIRICAL', 'AI_ESTIMATE', 'STYLIST_CORRECTED', 'MOCK']);
  assert.equal(FeatureRegistry.hairAnalysis.state, 'PARTIAL'); assert.equal(FeatureRegistry.faceBoneAnalysis.state, 'PARTIAL');
  assert.equal(FeatureRegistry.liveColorAdjustment.state, 'REAL'); assert.equal(FeatureRegistry.targetColorConfirmation.state, 'REAL');
  assert.equal(FeatureRegistry.mainDesignGeneration.state, 'PARTIAL'); assert.equal(FeatureRegistry.requiredUnderCalculator.state, 'UNIMPLEMENTED');
  assert.equal(FeatureRegistry.bangFaceFrameGeneration.state, 'PARTIAL'); assert.equal(FeatureRegistry.fioleRecipeOptimization.state, 'UNIMPLEMENTED');
  assert.ok(Object.isFrozen(FeatureRegistry));
});

test('source validation keeps zero and unknown distinct and rejects fabricated AI provenance for MOCK', async () => {
  const old = await sample(); old.baseMaking = newBasePlan(); old.baseMaking.zones.mid.artificialPigment = fact(0, 'STYLIST_CORRECTED', [], 'stylist_review');
  const s = synchronizeDiagnosisSession(old, catalog);
  assert.equal(s.colorPlan.zones.MID.artificialPigment.value, 0); assert.equal(s.colorPlan.zones.ROOT.artificialPigment.value, null);
  const value = sourcedValue(0, 'STYLIST_CORRECTED', null, null, 'test', 0); assert.equal(value.confidence, 0); assert.equal(value.value, 0);
  const bad = structuredClone(s); bad.hairAnalysis.aiEstimate[0].zones.MID.damage.sourceType = 'AI_ESTIMATE'; assert.throws(() => validateDiagnosisSession(bad), /MOCK診断/);
  const noSource = structuredClone(s); noSource.colorPlan.zones.MID.requiredUnderLevel.value = 14; assert.throws(() => validateDiagnosisSession(noSource), /出所/);
});

test('old records adapt without edits to original photos, original schema, diagnosis, FIOLE proposals or extra legacy fields', async () => {
  const old = await sample(); delete old.diagnosisSession; old.id = 'old-record-1'; old.version = 5;
  old.photos[0].original = { dataUrl: 'data:image/jpeg;base64,b3JpZ2luYWw=', mimeType: 'image/jpeg', byteSize: 8, width: 448, height: 560, representation: 'original_file_bytes', colourProcessing: 'none_app_applied', profile: 'not_parsed' };
  old.legacyExtension = { untouched: true }; const before = JSON.stringify(old);
  const adapted = withDiagnosisSession(old, catalog);
  assert.equal(JSON.stringify(old), before); assert.equal(adapted.schemaVersion, 'color-journey-v1'); assert.equal(adapted.id, 'old-record-1'); assert.equal(adapted.version, 5);
  assert.deepEqual(adapted.photos, old.photos); assert.deepEqual(adapted.analyses, old.analyses); assert.deepEqual(adapted.proposals, old.proposals); assert.deepEqual(adapted.legacyExtension, old.legacyExtension);
  assert.equal(adapted.diagnosisSession.id, 'old-record-1'); assert.equal(adapted.diagnosisSession.revision, 5);
  assert.equal(adapted.diagnosisSession.currentPhotos[0].originalReference, `journey-original:${old.photos[0].id}`);
  assert.equal(JSON.stringify(adapted.diagnosisSession).includes('data:image'), false);
  assert.deepEqual(withDiagnosisSession(adapted, catalog).diagnosisSession, adapted.diagnosisSession);
});

test('legacy side and missing capture metadata remain unknown instead of inventing RIGHT/LIBRARY/GOOD', async () => {
  const old = await sample(); old.photos.push({ ...old.photos[0], id: 'legacy-side', view: 'side' }); old.activeAnalysisId = null;
  old.faceDesign.activeAnalysisId = null; const s = synchronizeDiagnosisSession(old, catalog), side = s.currentPhotos.find(p => p.imageId === 'legacy-side');
  assert.equal(side.direction, null); assert.equal(side.legacyDirection, 'side'); assert.equal(side.source, null); assert.equal(side.capturedAt, null);
  assert.equal(side.qualityStatus, null); assert.equal(side.qualityScore, null); assert.equal(side.qualityFlags.colorCast.state, 'NOT_ASSESSED');
  assert.ok(s.compatibility.warnings.some(w => w.includes('side')));
});

test('future common schema and foreign session IDs are refused without resetting or mutating records', async () => {
  const old = await sample(), original = JSON.stringify(old); const future = structuredClone(old);
  future.diagnosisSession.schemaVersion = 'diagnosis-session-v99'; future.diagnosisSession.dataSchemaVersion = 'diagnosis-session-v99';
  assert.throws(() => withDiagnosisSession(future, catalog), /未対応の共通データ版/); assert.equal(future.diagnosisSession.schemaVersion, 'diagnosis-session-v99');
  const mapped = withDiagnosisSession(old, catalog), broken = structuredClone(mapped.diagnosisSession); broken.styleTarget.parentSessionId = 'other-customer';
  assert.throws(() => validateDiagnosisSession(broken), /別セッション/);
  assert.equal(JSON.stringify(old), original);
});

test('native and legacy stale saves and edits to saved analysis originals are rejected on the same revision chain', async () => {
  const store = memoryJourneyStore(catalog), native = diagnosisSessionStore(store, catalog), saved = await store.save(await sample());
  const a = await native.load(saved.id), b = await native.load(saved.id); a.session.customerId = 'first'; await native.save(a);
  b.session.customerId = 'stale'; await assert.rejects(native.save(b), /更新/);
  const current = await native.load(saved.id); current.session.hairAnalysis.aiEstimate[0].zones.MID.damage.value = 5;
  await assert.rejects(native.save(current), /原本/); assert.equal((await native.load(saved.id)).session.customerId, 'first');
  const foreign = createDiagnosisSession(); assert.throws(() => attachDiagnosisSession(saved, foreign), /別のカルテ/);
});

test('proposed recipe and actual treatment are independent; unconfirmed proposal copies are not empirical', async () => {
  const old = await sample(), p = old.proposals[0];
  old.actual = { ratioBasis: 'mass', confirmed: false, originProposalId: p.id, region: 'mid', lines: structuredClone(p.lines), totalGrams: 45, developerId: 'DEV_OX3', developerGrams: 45, durationMin: 20, notes: '美容師確認前' };
  let mapped = withDiagnosisSession(old, catalog);
  assert.equal(mapped.diagnosisSession.treatmentPlan.proposed[0].totalGrams.value, 60); assert.equal(mapped.diagnosisSession.treatmentPlan.proposed[0].sourceType, 'MOCK');
  assert.equal(mapped.diagnosisSession.treatmentResult.actual.totalGrams.value, 45); assert.equal(mapped.diagnosisSession.treatmentResult.actual.sourceType, 'STYLIST_CORRECTED');
  const fake = structuredClone(mapped.diagnosisSession); fake.treatmentResult.actual.sourceType = 'EMPIRICAL'; assert.throws(() => validateDiagnosisSession(fake), /未確認/);
  mapped = withDiagnosisSession({ ...mapped, actual: { ...mapped.actual, confirmed: true } }, catalog);
  assert.equal(mapped.diagnosisSession.treatmentResult.actual.sourceType, 'EMPIRICAL'); assert.equal(mapped.diagnosisSession.treatmentResult.actual.originProposalId, p.id);
  assert.notEqual(mapped.diagnosisSession.treatmentPlan.proposed[0].fioleDrugs, mapped.diagnosisSession.treatmentResult.actual.fioleDrugs);
  const saved = await memoryJourneyStore(catalog).save(mapped); assert.equal(saved.diagnosisSession.treatmentResult.actual.totalGrams.value, 45);
});

test('PRE-LIFT/ON COLOR actual stages and predicted colour remain separated per zone', async () => {
  const old = await sample(); old.baseMaking = newBasePlan(); old.proposals = []; old.selectedProposalId = null;
  old.baseMaking.zones.mid.requiredLevel = fact(14, 'STYLIST_CORRECTED', [], 'manual_plan'); old.baseMaking.zones.mid.requiredTone = fact('yellow', 'STYLIST_CORRECTED', [], 'manual_plan');
  old.baseMaking.zones.mid.route = fact('STYLIST_REVIEW', 'STYLIST_CORRECTED', [], 'manual_plan');
  const pre = newTreatment(old, 'mid', 'PRE_LIFT'); pre.actual.level = fact(13, 'EMPIRICAL', [], 'stylist_observation'); pre.actual.tone = fact('yellow_orange', 'EMPIRICAL', [], 'stylist_observation'); old.baseMaking.stages.push(pre);
  const on = newTreatment(old, 'mid', 'ON_COLOR'); old.baseMaking.stages.push(on);
  const mapped = withDiagnosisSession(old, catalog), s = mapped.diagnosisSession;
  assert.equal(s.colorPlan.zones.MID.requiredUnderLevel.value, 14); assert.equal(s.colorPlan.zones.ROOT.requiredUnderLevel.value, null);
  assert.equal(s.colorPlan.zones.MID.liftRoute.value, 'STYLIST_JUDGMENT'); assert.equal(s.colorPlan.zones.MID.predictedUnder.level.value, null);
  assert.equal(s.colorPlan.zones.MID.onColorPlan.predictedFinalColor, null); assert.equal(s.treatmentResult.actualUnder.MID.level.value, 13);
  assert.equal(s.treatmentResult.stages[1].startingUnder.level.value, 13); assert.equal(s.treatmentResult.stages[1].linkedPreLiftStageId, pre.id);
  assert.deepEqual(liftRouteValues, ['ONE_COLOR', 'HIGH_LIFT_COLOR', 'LIGHTENER', 'BLEACH_1', 'BLEACH_2_PLUS', 'HIGH_RISK', 'STYLIST_JUDGMENT', 'UNKNOWN']);
  const saved = await memoryJourneyStore(catalog).save(mapped); assert.equal(saved.diagnosisSession.treatmentResult.stages.length, 2);
});

test('history enums separate dark/black/lightener and preserve ambiguous legacy history without guesses', async () => {
  const old = await sample(); old.history = [
    { id: 'ambiguous-dark', type: 'dark', date: '', region: 'mid', notes: '暗染めまたは黒染め' },
    { id: 'lightener', type: 'lightener', date: '2026-08-10', region: 'all', notes: 'ライトナー' },
    { id: 'black', type: 'black_dye', date: '', region: 'end', notes: '黒染め' },
  ];
  const s = synchronizeDiagnosisSession(old, catalog);
  assert.equal(s.hairHistory[0].type, 'OTHER'); assert.ok(s.hairHistory[0].ambiguity); assert.equal(s.hairHistory[0].date, null);
  assert.equal(s.hairHistory[1].type, 'LIGHTENER'); assert.equal(s.hairHistory[1].area, 'ALL'); assert.equal(s.hairHistory[1].count, null);
  assert.equal(s.hairHistory[2].type, 'BLACK_DYE'); assert.equal(s.hairHistory[2].area, 'END');
});

test('generation contract carries person/shape/colour/analysis/plan by role and child-parent ID without invoking an API', async () => {
  const s = synchronizeDiagnosisSession(await sample(), catalog), input = generationContract(s), child = generationContract(s, s.designPlan.bangFaceFrameDesigns[2].id);
  assert.equal(input.parentSessionId, s.id); assert.equal(input.styleTarget.id, s.styleTarget.id); assert.equal(input.colorTarget.id, s.colorTarget.id);
  assert.equal(input.hairAnalysis.id, s.hairAnalysis.id); assert.equal(input.faceBoneAnalysis.id, s.faceBoneAnalysis.id);
  assert.equal(input.hairAnalysis.activeEstimateId, s.hairAnalysis.activeEstimateId); assert.equal(input.faceBoneAnalysis.activeEstimateId, s.faceBoneAnalysis.activeEstimateId);
  assert.equal(input.effectiveHairZones.MID.damage.value, 4);
  assert.equal(input.preservePerson, true); assert.equal(input.referenceRoles.style, 'SHAPE_ONLY'); assert.equal(input.referenceRoles.color, 'HAIR_COLOR_ONLY');
  assert.equal(input.referenceRoles.faceBoneAnalysis, 'HAIR_DESIGN_ONLY_NOT_FACE_EDIT'); assert.equal(input.state, 'API_READY_REAL_UNVERIFIED');
  assert.equal(child.parentDesignId, s.designPlan.mainDesign.designId); assert.equal(child.design.label, 'C');
});

test('STYLE-only sessions retain current colour; COLOR-only sessions exclude STYLE from the future generation contract', async () => {
  const base = newJourney(); base.title = '髪型だけ'; base.photos = [{ id: 'person', view: 'front', name: 'person.jpg', ...assets.current, createdAt: base.createdAt }]; base.target.styleReference = { ...base.photos[0], id: 'shape', view: 'style_reference' };
  const style = synchronizeDiagnosisSession(base, catalog), a = generationContract(style);
  assert.equal(style.colorTarget.color, null); assert.equal(a.mode, 'STYLE_ONLY'); assert.equal(a.colorTarget, null);
  const colorCase = { ...base, target: { ...base.target, reference: { ...base.photos[0], id: 'colour', view: 'reference' }, simulationMode: 'color_only' } };
  const color = synchronizeDiagnosisSession(colorCase, catalog), b = generationContract(color);
  assert.equal(b.mode, 'COLOR_ONLY'); assert.equal(b.styleTarget, null); assert.equal(b.effectiveColorReference.imageId, 'colour');
});

test('legacy single generated images remain standalone, never mislabeled as MAIN or a generated A-E child', async () => {
  const old = await sample(), input = hairImageInput(old);
  old.imageGenerations = [{ id: 'single-image', origin: 'openai_images_edit', model: 'test-model', promptVersion: 'test-v1', createdAt: old.createdAt, requestId: 'test-request', currentPhotoId: input.current.id, referencePhotoId: input.reference.id, requestText: input.requestText, context: input.context, roles: input.roles, dataUrl: 'data:image/png;base64,dGVzdA==', width: 448, height: 560 }];
  const mapped = withDiagnosisSession(old, catalog), simulation = mapped.diagnosisSession.simulations[0];
  assert.equal(simulation.kind, 'LEGACY_SINGLE'); assert.equal(simulation.designId, null); assert.equal(simulation.parentDesignId, null);
  assert.equal(mapped.diagnosisSession.designPlan.mainDesign.generatedImage, null); assert.equal(mapped.diagnosisSession.designPlan.bangFaceFrameDesigns.filter(d => d.generatedImage).length, 0);
  await memoryJourneyStore(catalog).save(mapped);
});

test('manual base correction appends A-B-A and clear-to-unknown decisions without changing originals', async () => {
  let old = await sample(); old.proposals = []; old.selectedProposalId = null;
  old.baseMaking = newBasePlan();
  let record = withDiagnosisSession(old, catalog), original = JSON.stringify(record.diagnosisSession.hairAnalysis.aiEstimate);
  const store = memoryJourneyStore(catalog);
  for (const value of ['yellow', 'orange', 'yellow', null]) {
    record = withDiagnosisSession({ ...record, baseMaking: { ...record.baseMaking, zones: { ...record.baseMaking.zones, mid: { ...record.baseMaking.zones.mid, currentTone: fact(value, value === null ? null : 'STYLIST_CORRECTED', [], 'stylist_review') } } } }, catalog);
    assert.equal(effectiveHairZone(record.diagnosisSession, 'MID').underTone.value, value);
    record = await store.save(record);
    assert.equal(effectiveHairZone(record.diagnosisSession, 'MID').underTone.value, value);
  }
  const corrections = record.diagnosisSession.hairAnalysis.stylistCorrection.filter(c => c.metric === 'underTone');
  assert.deepEqual(corrections.map(c => c.value.value), ['yellow', 'orange', 'yellow', null]);
  assert.equal(new Set(corrections.map(c => c.id)).size, 4);
  assert.equal(JSON.stringify(record.diagnosisSession.hairAnalysis.aiEstimate), original);
});

test('current-analysis input carries photo quality/history but never claims to analyze or uses a preview as original', async () => {
  const old = await sample();
  old.photos[0].original = { dataUrl: 'data:image/jpeg;base64,b3JpZ2luYWw=', mimeType: 'image/jpeg', byteSize: 8, width: 896, height: 1120, representation: 'original_file_bytes', colourProcessing: 'none_app_applied', profile: 'not_parsed' };
  const record = withDiagnosisSession(old, catalog), input = sessionAnalysisInput(record.diagnosisSession);
  assert.equal(input.parentSessionId, record.diagnosisSession.id); assert.equal(input.specVersion, SPEC_VERSION);
  assert.deepEqual(input.currentPhotos, record.diagnosisSession.currentPhotos);
  assert.deepEqual(input.photoQuality, record.diagnosisSession.photoQuality); assert.deepEqual(input.hairHistory, record.diagnosisSession.hairHistory);
  const reference = input.currentPhotos[0];
  const original = resolveSessionImage(record, reference, 'original');
  assert.equal(original.dataUrl, old.photos[0].original.dataUrl); assert.equal(original.width, 896);
  assert.equal(original.representation, 'original_file_bytes');
  assert.equal(resolveSessionImage(record, reference, 'preview').dataUrl, old.photos[0].dataUrl);
  assert.throws(() => resolveSessionImage(record, record.diagnosisSession.styleTarget.referenceImage, 'original'), /元画像/);
  const foreign = { ...reference, parentSessionId: 'another-session' };
  assert.throws(() => resolveSessionImage(record, foreign), /別セッション/);
  input.currentPhotos[0].direction = 'BACK'; assert.equal(record.diagnosisSession.currentPhotos[0].direction, 'FRONT');
});

test('recalculating recipe candidates preserves the original proposal linked to actual treatment', async () => {
  let old = await sample(); const origin = old.proposals[0];
  old.actual = { ratioBasis: 'mass', confirmed: false, originProposalId: origin.id, region: 'mid', lines: structuredClone(origin.lines), totalGrams: 45, developerId: 'DEV_OX3', developerGrams: 45, durationMin: 20, notes: '' };
  old = withDiagnosisSession(old, catalog);
  let updated = { ...old, target: { ...old.target, text: '新しい希望カラー' } };
  updated.proposals = proposeRecipes(updated, catalog); updated.selectedProposalId = updated.proposals[0].id;
  const next = withDiagnosisSession(updated, catalog).diagnosisSession;
  assert.ok(next.treatmentPlan.proposed.some(p => p.id === origin.id && !p.active));
  assert.ok(next.treatmentPlan.proposed.some(p => p.id === updated.selectedProposalId && p.active));
  assert.equal(next.treatmentResult.actual.originProposalId, origin.id);
  assert.deepEqual(next.treatmentResult.actual.fioleDrugs.map(d => d.parts.value), origin.lines.map(l => l.parts));
});

test('native STYLE fields reach the future generation contract after re-save without changing COLOR', async () => {
  const store = memoryJourneyStore(catalog), native = diagnosisSessionStore(store, catalog);
  const saved = await store.save(await sample()), record = await native.load(saved.id), color = JSON.stringify(record.session.colorTarget);
  record.session.styleTarget.silhouette = 'round_layer'; record.session.styleTarget.weight = 'below_cheek';
  const next = await native.save(record), input = generationContract(next.session);
  assert.equal(input.styleTarget.silhouette, 'round_layer'); assert.equal(input.design.styleParameters.weight, 'below_cheek');
  assert.equal(JSON.stringify(next.session.colorTarget), color);
});

test('reading preserves saved app/registry metadata; only a new saved revision stamps current capabilities', async () => {
  const old = withDiagnosisSession(await sample(), catalog);
  old.diagnosisSession.appVersion = '0.0.9-previous'; old.diagnosisSession.featureSnapshot.registryVersion = 'previous-feature-registry';
  const read = withDiagnosisSession(old, catalog);
  assert.equal(read.diagnosisSession.appVersion, '0.0.9-previous'); assert.equal(read.diagnosisSession.featureSnapshot.registryVersion, 'previous-feature-registry');
  const saved = await memoryJourneyStore(catalog).save(read);
  assert.equal(saved.diagnosisSession.appVersion, APP_VERSION); assert.equal(saved.diagnosisSession.featureSnapshot.registryVersion, featureRegistryVersion);
  assert.equal(old.diagnosisSession.appVersion, '0.0.9-previous'); assert.equal(old.diagnosisSession.featureSnapshot.registryVersion, 'previous-feature-registry');
});
