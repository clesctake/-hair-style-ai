import type { HairZone, PhotoDirection, PhotoQuality, SourcedValue, ColorRepresentation } from './session-model.ts';

/** Additive sub-schema: old diagnosis-session-v1 revisions remain readable. */
export const PHOTO_ANALYSIS_SCHEMA = 'photo-analysis-v1' as const;
export const ANALYSIS_PROVIDER = 'mediapipe-tasks-vision-1.0.1' as const;
export const HAIR_MODEL = 'hair_segmenter-float32-v1' as const;
export const FACE_MODEL = 'face_landmarker-float16-v1' as const;
export type LandmarkPoint = { x: number; y: number; z: number | null };
export type BinaryMask = { width: number; height: number; encoding: 'BINARY_RLE_V1'; runs: number[]; startsWith: 0 | 1 };
export type ZoneBands = { rootEnd: number; midEnd: number };
export type HairRegion = {
  id: string; imageId: string; modelVersion: string; sourceType: 'AI_ESTIMATE';
  mask: BinaryMask; confidenceThreshold: number; meanSelectedConfidence: number | null;
  bounds: { left: number; right: number; top: number; bottom: number } | null;
  zoneBands: ZoneBands | null; zoneMethod: 'IMAGE_VERTICAL_BANDS_NOT_ANATOMICAL_ROOTS';
  needsStylistConfirmation: true;
};
export type RegionCorrection = {
  id: string; runId: string; hairRegionId: string; imageId: string; createdAt: string;
  sourceType: 'STYLIST_CORRECTED'; actor: string; zoneBands: ZoneBands; mask: BinaryMask;
  zoneValues: Record<HairZone, ObservedHairZone | null>;
};
export type ObservedHairZone = {
  color: ColorRepresentation; pixelCount: number; unclippedPixelCount: number;
  lightness: SourcedValue<number>; hue: SourcedValue<number>; chroma: SourcedValue<number>;
  unevenness: SourcedValue<number>;
};
export type AnalysisPhotoResult = {
  imageId: string; direction: PhotoDirection | null; source: 'CAMERA' | 'LIBRARY' | null;
  inputRepresentation: 'ORIGINAL'; originalReference: string; originalWidth: number; originalHeight: number;
  analysisWidth: number; analysisHeight: number; orientation: 'BROWSER_EXIF_ORIENTED';
  calibration: 'UNCALIBRATED'; originalSha256: string;
  hairStatus: 'SUCCEEDED' | 'NO_HAIR' | 'FAILED'; faceStatus: 'SUCCEEDED' | 'NO_FACE' | 'MULTIPLE_FACES' | 'NOT_APPLICABLE' | 'FAILED';
  hairRegion: HairRegion | null; hairZones: Record<HairZone, ObservedHairZone | null>;
  faceLandmarks: LandmarkPoint[]; quality: PhotoQuality; errors: string[];
};
export type PhotoAnalysisRun = {
  id: string; parentSessionId: string; createdAt: string; schemaVersion: typeof PHOTO_ANALYSIS_SCHEMA;
  provider: typeof ANALYSIS_PROVIDER; hairModel: typeof HAIR_MODEL; faceModel: typeof FACE_MODEL;
  execution: 'WORKER_CPU' | 'MAIN_THREAD_CPU'; status: 'SUCCEEDED' | 'PARTIAL' | 'FAILED';
  inputPhotoIds: string[]; skipped: { imageId: string; reason: string }[]; photos: AnalysisPhotoResult[];
  hairEstimateId: string | null; faceEstimateId: string | null;
  representativeColorPhotoId: string | null; representativeFacePhotoId: string | null;
};
export type PhotoAnalysisState = {
  schemaVersion: typeof PHOTO_ANALYSIS_SCHEMA; activeRunId: string | null;
  runs: PhotoAnalysisRun[]; regionCorrections: RegionCorrection[];
};
export const emptyPhotoAnalysis = (): PhotoAnalysisState => ({ schemaVersion: PHOTO_ANALYSIS_SCHEMA, activeRunId: null, runs: [], regionCorrections: [] });
