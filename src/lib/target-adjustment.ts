import type { ColorValue, Journey, Lab, Photo } from './journey.ts';
import { emptyHairMask, validateHairMask, hairMaskContainsPixel, type HairMask } from './hair-mask.ts';

export const targetControlSpecs = {
  target_lightness: { label: '明るさ', min: -50, max: 50, low: '暗く', high: '明るく' },
  target_saturation: { label: '彩度', min: -50, max: 50, low: '控えめ', high: '鮮やか' },
  target_redness: { label: '赤み', min: -50, max: 50, low: '抑える', high: '足す' },
  target_yellowness: { label: '黄み', min: -50, max: 50, low: '抑える', high: '足す' },
  target_mutedness: { label: 'くすみ', min: 0, max: 100, low: 'なし', high: 'くすませる' },
  target_beige: { label: 'ベージュ感', min: 0, max: 100, low: 'なし', high: 'ベージュへ' },
  target_transparency: { label: '透明感', min: 0, max: 100, low: 'なし', high: '軽やか' },
} as const;
export type TargetControl = keyof typeof targetControlSpecs;
export type TargetControls = Record<TargetControl, number>;
export type SamplePoint = { x: number; y: number; radius: number; selected: boolean; method: 'manual_circle' };
type DraftFields = { referencePhotoId: string; controls: TargetControls; samplePoint: SamplePoint; hueShift?:number };
export type HairTargetDraft = DraftFields & { version: 'live-tone-draft-v2'; hairMask: HairMask };
export type TargetAdjustmentDraft = HairTargetDraft | (DraftFields & { version: 'live-tone-draft-v1'; hairMask?: never });
type ConfirmationFields = {
  originalResolution?:{width:number;height:number;format:'PNG';tileRows:number};
  id: string; referencePhoto: Photo; previewPhoto: Photo; hueShift?:number;
  controls: TargetControls; normalizedControls: TargetControls; samplePoint: SamplePoint;
  sourceLab: Lab; color: ColorValue; clippedPixelFraction: number; confirmedAt: string; draftContext: string;
};
export type TargetAdjustment = ConfirmationFields & (
  { version: 'live-tone-confirmation-v1'; algorithmVersion: 'image-lab-tone-v1'; scope: 'reference_image_full_frame'; hairMask?: never } |
  { version: 'live-tone-confirmation-v2'; algorithmVersion: 'image-lab-hair-tone-v2'; scope: 'reference_image_hair_mask'; hairMask: HairMask }
);
export const defaultTargetControls = (): TargetControls => Object.fromEntries(Object.keys(targetControlSpecs).map(key => [key, 0])) as TargetControls;
export const defaultSamplePoint = (): SamplePoint => ({ x: .31, y: .44, radius: .035, selected: false, method: 'manual_circle' });
export function targetDraft(session: Journey): HairTargetDraft | null {
  const photo = session.target.reference;
  if (!photo) return null;
  const saved = session.target.adjustmentDraft;
  if (saved?.referencePhotoId === photo.id && saved.version === 'live-tone-draft-v2') return saved;
  const legacy = saved?.referencePhotoId === photo.id ? saved : null;
  const seed = session.target.referenceHairMask;
  return { version: 'live-tone-draft-v2', referencePhotoId: photo.id,
    controls: legacy ? { ...legacy.controls } : defaultTargetControls(), samplePoint: legacy ? { ...legacy.samplePoint, selected: false } : defaultSamplePoint(),
    hairMask: seed?.referencePhotoId === photo.id ? structuredClone(seed) : emptyHairMask(photo.id) };
}
export const targetDraftContext = (draft: TargetAdjustmentDraft) => JSON.stringify({
  version: draft.version, referencePhotoId: draft.referencePhotoId, controls: draft.controls, samplePoint: draft.samplePoint,
  ...(draft.hueShift!==undefined?{hueShift:draft.hueShift}:{}),
  ...(draft.version === 'live-tone-draft-v2' ? { hairMask: draft.hairMask } : {}),
});
export function confirmedTargetAdjustment(session: Journey): TargetAdjustment | undefined {
  const item = session.targetAdjustments?.find(item => item.id === session.target.confirmedAdjustmentId);
  return item?.referencePhoto.id === session.target.reference?.id ? item : undefined;
}
export function pendingTargetAdjustment(session: Journey): boolean {
  const draft = session.target.adjustmentDraft;
  if (confirmedTargetAdjustment(session)?.scope === 'reference_image_full_frame') return true;
  if (!draft) return Boolean(session.target.confirmedAdjustmentId && !confirmedTargetAdjustment(session));
  const confirmed = confirmedTargetAdjustment(session);
  // Keep legacy records readable, but require a new hair-only confirmation before reusing their target.
  if (draft.version === 'live-tone-draft-v1') return true;
  return !confirmed || draft.referencePhotoId !== session.target.reference?.id || confirmed.draftContext !== targetDraftContext(draft);
}
export function normalizeTargetControls(controls: TargetControls): TargetControls {
  return Object.fromEntries(Object.entries(targetControlSpecs).map(([key, spec]) => [key, controls[key as TargetControl] / spec.max])) as TargetControls;
}
export function validateTargetDraft(draft: TargetAdjustmentDraft) {
  if(draft.hueShift!==undefined&&(!Number.isInteger(draft.hueShift)||Math.abs(draft.hueShift)>180))throw new Error('色相調整値が範囲外です。');
  if (!['live-tone-draft-v1', 'live-tone-draft-v2'].includes(draft.version) || !draft.referencePhotoId) throw new Error('色調整の形式が不正です。');
  if (draft.version === 'live-tone-draft-v2') validateHairMask(draft.hairMask, draft.referencePhotoId);
  for (const [key, spec] of Object.entries(targetControlSpecs)) {
    const value = draft.controls[key as TargetControl];
    if (!Number.isInteger(value) || value < spec.min || value > spec.max) throw new Error('色調整値が範囲外です。');
  }
  const point = draft.samplePoint;
  if (point.method !== 'manual_circle' || typeof point.selected !== 'boolean' || ![point.x, point.y, point.radius].every(Number.isFinite) ||
      point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1 || point.radius <= 0 || point.radius > .15) throw new Error('採色位置を確認してください。');
}
const validLab = (value: Lab) => [value.L, value.a, value.b].every(Number.isFinite) && value.L >= 0 && value.L <= 100 && Math.abs(value.a) <= 128 && Math.abs(value.b) <= 128;
export function validateTargetAdjustment(item: TargetAdjustment) {
  const draft: TargetAdjustmentDraft = item.version === 'live-tone-confirmation-v2' ?
    { version: 'live-tone-draft-v2', referencePhotoId: item.referencePhoto.id, controls: item.controls, samplePoint: item.samplePoint, hairMask: item.hairMask,...(item.hueShift!==undefined?{hueShift:item.hueShift}:{}) } :
    { version: 'live-tone-draft-v1', referencePhotoId: item.referencePhoto.id, controls: item.controls, samplePoint: item.samplePoint };
  validateTargetDraft(draft);
  if(item.originalResolution&&(item.originalResolution.format!=='PNG'||item.originalResolution.width!==(item.referencePhoto.original??item.referencePhoto.capture?.original??item.referencePhoto).width||item.originalResolution.height!==(item.referencePhoto.original??item.referencePhoto.capture?.original??item.referencePhoto).height||item.originalResolution.width!==item.previewPhoto.width||item.originalResolution.height!==item.previewPhoto.height||item.previewPhoto.width*item.previewPhoto.height>16_777_216||!Number.isInteger(item.originalResolution.tileRows)||item.originalResolution.tileRows<1||item.originalResolution.tileRows>128))throw new Error('原解像度画像の情報が不正です。');
  const validVersion = item.version === 'live-tone-confirmation-v2' ? item.algorithmVersion === 'image-lab-hair-tone-v2' && item.scope === 'reference_image_hair_mask' :
    item.version === 'live-tone-confirmation-v1' && item.algorithmVersion === 'image-lab-tone-v1' && item.scope === 'reference_image_full_frame';
  if (!item.id || !validVersion || item.referencePhoto.view !== 'reference' || item.previewPhoto.view !== 'reference' ||
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(item.previewPhoto.dataUrl) || item.previewPhoto.dataUrl.length > (item.originalResolution?Math.min(128_000_000,item.previewPhoto.width*item.previewPhoto.height*5.4+65536):3000000) ||
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(item.referencePhoto.dataUrl) || item.referencePhoto.dataUrl.length > 1500000 ||
      !item.previewPhoto.id || !item.samplePoint.selected || ![item.previewPhoto.width, item.previewPhoto.height, item.referencePhoto.width, item.referencePhoto.height].every(v => Number.isInteger(v) && v > 0) ||
      !validLab(item.sourceLab) || !validLab(item.color.value) || item.color.origin !== 'image_preview_estimate' || item.color.version !== 'image-preview-v1' ||
      item.color.space !== 'CIELAB' || item.color.illuminant !== 'D65' || item.color.observer !== '2deg' || item.color.measurement !== 'not_measured' ||
      item.color.provenance?.sourcePhotoId !== item.referencePhoto.id || item.color.provenance?.targetAdjustmentId !== item.id || item.color.provenance?.calibration !== 'uncalibrated_srgb_image' ||
      !Number.isFinite(Date.parse(item.confirmedAt)) || !Number.isFinite(item.clippedPixelFraction) || item.clippedPixelFraction < 0 || item.clippedPixelFraction > 1 ||
      JSON.stringify(item.normalizedControls) !== JSON.stringify(normalizeTargetControls(item.controls)) ||
      item.draftContext !== targetDraftContext(draft)) {
    throw new Error('確定した色調整データが不正です。');
  }
  if (item.version === 'live-tone-confirmation-v2') assertHairSample(draft as HairTargetDraft, item.previewPhoto.width, item.previewPhoto.height);
}

function assertHairSample(draft: HairTargetDraft, width: number, height: number) {
  const x=Math.min(width-1,Math.floor(draft.samplePoint.x*width)),y=Math.min(height-1,Math.floor(draft.samplePoint.y*height));
  if(!hairMaskContainsPixel(draft.hairMask,width,height,x,y))throw new Error('髪の範囲を選び、その範囲の中をタップして採色してください。');
}

export function confirmTargetAdjustment(session: Journey, preview: {
  originalResolution?:{width:number;height:number;format:'PNG';tileRows:number};
  dataUrl: string; width: number; height: number; sourceLab: Lab; adjustedLab: Lab; clippedPixelFraction: number;
}): Journey {
  const draft = targetDraft(session), reference = session.target.reference;
  if (!reference || !draft || !draft.samplePoint.selected) throw new Error('写真の髪をタップして採色位置を選んでください。');
  validateTargetDraft(draft); assertHairSample(draft, preview.width, preview.height);
  const confirmedAt = new Date().toISOString(), id = crypto.randomUUID();
  const color: ColorValue = {
    space: 'CIELAB', illuminant: 'D65', observer: '2deg', value: preview.adjustedLab,
    origin: 'image_preview_estimate', measurement: 'not_measured', version: 'image-preview-v1',
    provenance: { sourcePhotoId: reference.id, targetAdjustmentId: id, calibration: 'uncalibrated_srgb_image' },
  };
  const item: TargetAdjustment = {
    ...(draft.hueShift!==undefined?{hueShift:draft.hueShift}:{}),
    ...(preview.originalResolution?{originalResolution:preview.originalResolution}:{}),
    id, version: 'live-tone-confirmation-v2', algorithmVersion: 'image-lab-hair-tone-v2', scope: 'reference_image_hair_mask', hairMask: structuredClone(draft.hairMask),
    referencePhoto: structuredClone(reference), previewPhoto: { id: crypto.randomUUID(), view: 'reference', name: 'adjusted-target.png',
      dataUrl: preview.dataUrl, width: preview.width, height: preview.height, createdAt: confirmedAt },
    controls: structuredClone(draft.controls), normalizedControls: normalizeTargetControls(draft.controls), samplePoint: { ...draft.samplePoint },
    sourceLab: preview.sourceLab, color, clippedPixelFraction: preview.clippedPixelFraction, confirmedAt, draftContext: targetDraftContext(draft),
  };
  validateTargetAdjustment(item);
  return { ...session, target: { ...session.target, color, preset: 'adjusted_image', adjustmentDraft: draft, confirmedAdjustmentId: id },
    targetAdjustments: [...(session.targetAdjustments ?? []), item], proposals: [], selectedProposalId: null,
    preview: { state: 'not_connected', context: null }, updatedAt: confirmedAt };
}

export function validateTargetState(session: Journey) {
  if (session.target.referenceHairMask) validateHairMask(session.target.referenceHairMask, session.target.reference?.id ?? '');
  if (session.target.adjustmentDraft) validateTargetDraft(session.target.adjustmentDraft);
  const ids = new Set<string>();
  for (const item of session.targetAdjustments ?? []) {
    validateTargetAdjustment(item);
    if (ids.has(item.id)) throw new Error('色調整の確定履歴IDが重複しています。');
    ids.add(item.id);
  }
  if (session.target.confirmedAdjustmentId) {
    const item = confirmedTargetAdjustment(session);
    if (!item || JSON.stringify(item.color) !== JSON.stringify(session.target.color)) throw new Error('目標色と確定した調整結果が一致しません。');
  }
}

export function assertTargetHistory(previous: Journey, next: Journey) {
  for (let i = 0; i < (previous.targetAdjustments?.length ?? 0); i++) {
    if (JSON.stringify(previous.targetAdjustments![i]) !== JSON.stringify(next.targetAdjustments?.[i])) throw new Error('保存済みの色調整確定履歴は変更できません。');
  }
}
