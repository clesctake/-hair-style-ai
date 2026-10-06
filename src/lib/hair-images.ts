import type { Journey, Photo } from './journey.ts';
import { confirmedTargetAdjustment, pendingTargetAdjustment } from './target-adjustment.ts';
import {simulationMode,designStyleText,type SimulationMode,type StyleParameters} from './design-target.ts';
import {selectedBangDecision} from './bang-design.ts';

export type HairImageRoles={version:'hair-image-roles-v1';mode:SimulationMode;currentPhotoId:string;styleReferencePhotoId:string|null;colorReferencePhotoId:string|null;selectedBangDecisionId:string|null;styleParameters:StyleParameters|null};

export type GeneratedHairImage = {
  id: string;
  origin: 'openai_images_edit';
  model: string;
  promptVersion: string;
  createdAt: string;
  requestId: string | null;
  currentPhotoId: string;
  referencePhotoId: string;
  requestText: string;
  context: string;
  dataUrl: string;
  width: number;
  height: number;
  roles?:HairImageRoles;
};
export type HairImageInput = { current: Photo; reference: Photo; requestText: string; context: string;roles?:HairImageRoles;styleReference?:Photo|null;colorReference?:Photo|null };
export interface HairImageGenerator {
  status(): Promise<{ configured: boolean; model: string }>;
  generate(input: HairImageInput, signal: AbortSignal): Promise<GeneratedHairImage>;
}

export function hairImageInput(session: Journey): HairImageInput | null {
  const current = session.photos.find(p => p.view === 'front') ?? session.photos[0];
  const mode=simulationMode(session);
  if(!current||!mode)return null;
  const usesStyle=mode!=='color_only',usesColor=mode!=='style_only';
  if (usesColor&&pendingTargetAdjustment(session)) return null;
  const adjustment = confirmedTargetAdjustment(session);
  const styleReference=usesStyle?session.target.styleReference??null:null;
  const colorReference=usesColor?adjustment?.previewPhoto??session.target.reference:null;
  const styleText=usesStyle?designStyleText(session):'',colorText=usesColor?session.target.text.trim():'';
  if(usesStyle&&!styleReference&&!styleText||usesColor&&!colorReference&&!colorText)return null;
  const requestText=[mode==='style_only'?'髪型だけを変更し、本人の現在の髪色を維持してください。':mode==='color_only'?'カラーだけを変更し、現在の長さ・シルエット・前髪・顔周りを維持してください。':'STYLEの形とCOLORの色を組み合わせてください。',styleText?`STYLE希望：${styleText}`:'',colorText?`COLOR希望：${colorText}`:'',usesColor&&adjustment?`髪色は確定した調整後の希望写真（COLOR）を参考にしてください。ライブ調整値（プレビューへ適用済み・再適用しない）：${JSON.stringify(adjustment.controls)}。これらは画像上の調整量であり実測染料量ではありません。`:''].filter(Boolean).join('\n');
  const reference=colorReference??styleReference??current;
  const bang=usesStyle?selectedBangDecision(session):undefined;
  const roles:HairImageRoles={version:'hair-image-roles-v1',mode,currentPhotoId:current.id,styleReferencePhotoId:styleReference?.id??null,colorReferencePhotoId:colorReference?.id??null,selectedBangDecisionId:bang?.id??null,styleParameters:usesStyle?session.target.styleParameters??null:null};
  // Mock Lab, diagnosis and recipe ratios are not image-generation inputs.
  const context = JSON.stringify({ currentPhotoId: current.id, referencePhotoId: reference.id, requestText,roles });
  return { current, reference,styleReference,colorReference,roles,requestText, context };
}

export function hairImageProvenance(input:HairImageInput){return {currentPhotoId:input.current.id,referencePhotoId:input.reference.id,requestText:input.requestText,context:input.context,...(input.roles?{roles:input.roles}:{})};}

export function matchingHairImage(session: Journey): GeneratedHairImage | undefined {
  const input = hairImageInput(session);
  return input ? session.imageGenerations?.findLast(image => image.context === input.context) : undefined;
}

export function validateHairImage(image: GeneratedHairImage) {
  const roles=image.roles;
  if(roles&&(roles.version!=='hair-image-roles-v1'||!['style_only','color_only','style_color'].includes(roles.mode)||roles.currentPhotoId!==image.currentPhotoId||roles.mode==='style_only'&&roles.colorReferencePhotoId!==null||roles.mode==='color_only'&&(roles.styleReferencePhotoId!==null||roles.selectedBangDecisionId!==null||roles.styleParameters!==null)||image.referencePhotoId!==(roles.colorReferencePhotoId??roles.styleReferencePhotoId??roles.currentPhotoId)))throw new Error('生成画像のSTYLE・COLOR入力元が不正です。');
  if (!image.id || image.origin !== 'openai_images_edit' || !image.model || !image.promptVersion ||
      !Number.isFinite(Date.parse(image.createdAt)) || !image.currentPhotoId || !image.referencePhotoId ||
      !image.requestText.trim() || image.requestText.length > 4500 ||
      image.context !== JSON.stringify({ currentPhotoId: image.currentPhotoId, referencePhotoId: image.referencePhotoId, requestText: image.requestText,...(roles?{roles}:{}) }) ||
      !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(image.dataUrl) || image.dataUrl.length > 24000030 ||
      !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1) {
    throw new Error('生成画像・生成元の記録が不正です。');
  }
}
