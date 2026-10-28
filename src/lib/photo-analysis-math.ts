import { emptyColorRepresentation, sourcedValue, hairZones, faceMetricNames, unknownValue,
  type HairZone, type SourceType, type FaceEstimate } from './session-model.ts';
import { srgbToLab, labToSrgb } from './live-tone.ts';
import { lch } from './journey.ts';
import type { BinaryMask, ZoneBands, LandmarkPoint, ObservedHairZone } from './photo-analysis-types.ts';

export function encodeMask(data: Uint8Array, width: number, height: number): BinaryMask {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || data.length !== width * height || data.length > 2_000_000) throw new Error('髪マスクの大きさが不正です。');
  const runs: number[] = [], startsWith = data[0] ? 1 : 0; let value = startsWith, count = 0;
  for (const pixel of data) { const v = pixel ? 1 : 0; if (v !== value) { runs.push(count); value = v; count = 0; } count++; }
  runs.push(count); return { width, height, encoding: 'BINARY_RLE_V1', startsWith, runs };
}
export function decodeMask(mask: BinaryMask): Uint8Array {
  if (mask.encoding !== 'BINARY_RLE_V1' || ![0, 1].includes(mask.startsWith) || !Number.isInteger(mask.width) || !Number.isInteger(mask.height) || mask.width < 1 || mask.height < 1 || mask.width * mask.height > 2_000_000 || !mask.runs.length) throw new Error('髪マスクの形式が不正です。');
  const out = new Uint8Array(mask.width * mask.height); let offset = 0, value: number = mask.startsWith;
  for (const n of mask.runs) { if (!Number.isInteger(n) || n <= 0 || offset + n > out.length) throw new Error('髪マスクの長さが不正です。'); out.fill(value, offset, offset + n); offset += n; value = 1 - value; }
  if (offset !== out.length) throw new Error('髪マスクが欠けています。'); return out;
}
export function maskBounds(data: Uint8Array, width: number, height: number) {
  let left = width, right = -1, top = height, bottom = -1;
  data.forEach((v, i) => { if (v) { const x = i % width, y = Math.floor(i / width); left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); } });
  return right < 0 ? null : { left: left / width, right: (right + 1) / width, top: top / height, bottom: (bottom + 1) / height };
}
export function candidateBands(mask: Uint8Array, width: number, height: number): ZoneBands | null {
  const b = maskBounds(mask, width, height); if (!b) return null;
  return { rootEnd: b.top + (b.bottom - b.top) / 3, midEnd: b.top + (b.bottom - b.top) * 2 / 3 };
}
export function validateBands(b: ZoneBands) { if (!Number.isFinite(b.rootEnd) || !Number.isFinite(b.midEnd) || b.rootEnd <= 0 || b.rootEnd >= b.midEnd || b.midEnd >= 1) throw new Error('根元・中間・毛先の区切りを確認してください。'); }
/** Confidence is segmentation confidence, NOT colour/diagnostic accuracy. No salon-level conversion. */
export function observeHairZones(pixels: Uint8ClampedArray, width: number, height: number, mask: BinaryMask, bands: ZoneBands | null,
  sourceId: string, createdAt: string, sourceType: 'AI_ESTIMATE' | 'STYLIST_CORRECTED' = 'AI_ESTIMATE'): Record<HairZone, ObservedHairZone | null> {
  if (pixels.length !== width * height * 4 || width !== mask.width || height !== mask.height) throw new Error('髪領域と解析画像の座標が一致しません。');
  const out: Record<HairZone, ObservedHairZone | null> = { ROOT: null, MID: null, END: null }; if (!bands) return out; validateBands(bands);
  const decoded = decodeMask(mask);
  for (const zone of hairZones) {
    const values: { L: number; a: number; b: number }[] = []; let count = 0;
    for (let i = 0; i < decoded.length; i++) {
      if (!decoded[i] || pixels[i * 4 + 3] < 250) continue;
      const y = (Math.floor(i / width) + .5) / height, z = y < bands.rootEnd ? 'ROOT' : y < bands.midEnd ? 'MID' : 'END'; if (z !== zone) continue;
      count++; const [r, g, b] = [pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]];
      if (Math.max(r, g, b) >= 250 || Math.max(r, g, b) <= 8) continue;
      values.push(srgbToLab(r, g, b));
    }
    if (values.length < 32) continue;
    values.sort((a, b) => a.L - b.L); const trim = Math.floor(values.length * .1), selected = values.slice(trim, values.length - trim);
    const lab = selected.reduce((sum, v) => ({ L: sum.L + v.L / selected.length, a: sum.a + v.a / selected.length, b: sum.b + v.b / selected.length }), { L: 0, a: 0, b: 0 });
    const lc = lch(lab), color = emptyColorRepresentation(), method = 'segmented_original_srgb_D65_trimmed_Lab_mean_uncalibrated';
    const make = (v: number | null, suffix: string) => sourcedValue(v, sourceType, sourceId, createdAt, suffix);
    color.perceptual = { lab, lch: lc, illuminant: 'D65', observer: '2deg', calibration: 'UNCALIBRATED', source: sourcedValue(lab, sourceType, sourceId, createdAt, method) };
    // RGB here is a representative display swatch converted from mean Lab, not a physical dye vector.
    const rgb = labRgb(lab); color.display = { rgb, hex: '#' + [rgb.r, rgb.g, rgb.b].map(v => v.toString(16).padStart(2, '0')).join(''), source: sourcedValue(sourceId, sourceType, sourceId, createdAt, method) };
    const dispersion = Math.sqrt(selected.reduce((n, v) => n + (v.L - lab.L) ** 2 + (v.a - lab.a) ** 2 + (v.b - lab.b) ** 2, 0) / selected.length);
    out[zone] = { color, pixelCount: count, unclippedPixelCount: values.length, lightness: make(lc.L, method), hue: make(lc.h, method), chroma: make(lc.C, method), unevenness: make(dispersion, 'image_Lab_dispersion_NOT_ordinal_1_to_5_NOT_dye_residue') };
  }
  return out;
}
const labRgb = (lab: { L: number; a: number; b: number }) => { const { rgb } = labToSrgb(lab); return { r: rgb[0], g: rgb[1], b: rgb[2] }; };

/** Surface landmark proxies in the 2D image, not physical skull measurements or inferred hairline. */
export function observeFace(landmarks: LandmarkPoint[], width: number, height: number, imageId: string, id: string, createdAt: string, direction: string | null): FaceEstimate {
  const metrics = Object.fromEntries(faceMetricNames.map(key => [key, unknownValue<number>()])) as FaceEstimate['metrics'];
  const result: FaceEstimate = { id, inputPhotoIds: [imageId], createdAt, featureState: 'PARTIAL', modelVersion: 'face_landmarker-float16-v1', metrics, additionalMeasurements: {}, coordinateSpace: 'NORMALIZED_IMAGE_2D', landmarks: landmarks.map((p, i) => ({ imageId, key: `mediapipe:${i}`, x: p.x, y: p.y, sourceType: 'AI_ESTIMATE' as SourceType })) };
  const point = (i: number) => landmarks[i], valid = (p: LandmarkPoint | undefined) => p && [p.x, p.y].every(Number.isFinite) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
  if (direction !== 'FRONT' || ![10,152,234,454,172,397,1,2,168,33,133,362,263,70,300].every(i => valid(point(i)))) return result;
  const p = (i: number) => ({ x: point(i).x * width, y: point(i).y * height });
  const dist = (a: number, b: number) => Math.hypot(p(a).x - p(b).x, p(a).y - p(b).y);
  const w = dist(234,454), h = dist(10,152); if (w < 16 || h < 16) return result;
  const top = p(10), chin = p(152), axis = { x: (chin.x - top.x) / h, y: (chin.y - top.y) / h };
  const projection = (i: number) => ((p(i).x - top.x) * axis.x + (p(i).y - top.y) * axis.y) / h;
  const set = (key: keyof typeof metrics, value: number, method: string) => { if (Number.isFinite(value)) metrics[key] = sourcedValue(value, 'AI_ESTIMATE', imageId, createdAt, method); };
  set('faceWidthRatio', w / width, 'landmarks_234_454_distance_div_image_width');
  set('faceHeightRatio', h / height, 'landmarks_10_152_surface_span_div_image_height_NOT_hairline');
  set('faceHeightWidthRatio', h / w, 'pixel_aspect_corrected_surface_height_width_ratio_NOT_skull');
  set('cheekboneWidthRatio', w / width, 'surface_234_454_proxy_div_image_width_NOT_bone_measurement');
  set('jawWidthRatio', dist(172,397) / w, 'surface_172_397_div_face_width_NOT_bone_measurement');
  set('chinPosition', projection(152), 'chin_axis_normalized_face_surface');
  const brow = (projection(70) + projection(300)) / 2;
  const eyes = (projection(33) + projection(133) + projection(362) + projection(263)) / 4;
  set('browPosition', brow, 'surface_brow_y_div_face_surface_height'); set('eyePosition', eyes, 'eye_corners_mean_y_div_face_surface_height');
  set('browEyeDistance', Math.abs(eyes - brow), 'projected_eye_brow_distance_div_face_surface_height');
  const noseBase = projection(2); if (noseBase > brow && noseBase < 1) {
    set('midfaceRatio', noseBase - brow, 'brow_to_nose_base_div_face_surface_span_NOT_anatomical_thirds');
    set('lowerFaceRatio', 1 - noseBase, 'nose_base_to_chin_div_face_surface_span');
  }
  set('cheekbonePosition', (projection(234) + projection(454)) / 2, 'lateral_surface_landmarks_axis_position_NOT_bone');
  result.additionalMeasurements.nosePosition = sourcedValue(projection(1), 'AI_ESTIMATE', imageId, createdAt, 'nose_tip_axis_div_face_surface_span');
  // Forehead/hairline/crown and physical symmetry are intentionally unknown. No landmark 10 == hairline assumption.
  return result;
}
