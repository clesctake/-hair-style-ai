import { DATA_SCHEMA_VERSION, type SpecVersion, type DiagnosisSession, type CurrentPhoto, type PhotoQuality, type HairHistory, type HairEstimate, type FaceEstimate } from './session-model.ts';
import { validateDiagnosisSession } from './session-validation.ts';
import type { FeatureState } from './feature-registry.ts';
import type { Journey } from './journey.ts';
import { withDiagnosisSession, resolveSessionImage } from './session-adapter.ts';

/** Providers consume shared metadata. Pixel resolution is explicit and original-only. */
export type SessionAnalysisInput = {
  contractVersion: 'session-analysis-input-v1'; parentSessionId: string; specVersion: SpecVersion; dataSchemaVersion: typeof DATA_SCHEMA_VERSION;
  currentPhotos: CurrentPhoto[]; photoQuality: PhotoQuality[]; hairHistory: HairHistory[];
  pixelPolicy: 'RESOLVE_ORIGINAL_EXPLICITLY_NEVER_LABEL_PREVIEW_AS_ORIGINAL';
};
export interface SessionHairAnalyzer { featureState: FeatureState; modelVersion: string; analyze(input: SessionAnalysisInput): Promise<HairEstimate> }
export interface SessionFaceBoneAnalyzer { featureState: FeatureState; modelVersion: string; analyze(input: SessionAnalysisInput): Promise<FaceEstimate> }
export function sessionAnalysisInput(session: DiagnosisSession): SessionAnalysisInput {
  validateDiagnosisSession(session);
  return structuredClone({ contractVersion: 'session-analysis-input-v1', parentSessionId: session.id, specVersion: session.specVersion, dataSchemaVersion: DATA_SCHEMA_VERSION,
    currentPhotos: session.currentPhotos, photoQuality: session.photoQuality, hairHistory: session.hairHistory,
    pixelPolicy: 'RESOLVE_ORIGINAL_EXPLICITLY_NEVER_LABEL_PREVIEW_AS_ORIGINAL' });
}

export type ResolvedAnalysisPhoto = {
  photo: CurrentPhoto; quality: PhotoQuality; display: ReturnType<typeof resolveSessionImage>;
  original: ReturnType<typeof resolveSessionImage> | null; unavailableReason: string | null;
};
export function resolveAnalysisInput(journey: Journey): SessionAnalysisInput & { photos: ResolvedAnalysisPhoto[] } {
  const current = withDiagnosisSession(journey), input = sessionAnalysisInput(current.diagnosisSession!);
  return { ...input, photos: input.currentPhotos.map(photo => {
    let original: ReturnType<typeof resolveSessionImage> | null = null, unavailableReason: string | null = null;
    try { original = resolveSessionImage(current, photo, 'original'); } catch (e) { unavailableReason = e instanceof Error ? e.message : '元画像がありません。'; }
    return { photo, quality: input.photoQuality.find(q => q.imageId === photo.imageId)!, display: resolveSessionImage(current, photo, 'preview'), original, unavailableReason };
  }) };
}
