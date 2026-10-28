import type {SupportRequest} from './after-support-types.ts';
import {familyNames} from './pro-design-types.ts';
export const SUPPORT_PROMPT_VERSION='after-support-local-edit-v1' as const;
/** References have one role: the confirmed final person is the only image input. */
export function supportInstructions(r:SupportRequest):string{
 const p=r.parameters;
 const preservation='Edit this exact photograph. Preserve identity, face geometry, eyes, nose, mouth shape, jaw, expression, skin, age, pose, camera angle, background, clothes, lighting and composition. No beautification, face reshaping, skin smoothing or idealization. Preserve the hairstyle, length, silhouette, bangs, face framing, strand flow, density and volume. Do not replace the person.';
 const action=r.purpose==='MAKEUP'
  ? 'Change only eyeshadow, cheek and lip color. Preserve hair color and every face feature and skin shape. Theme: '+p.makeupTheme+'. Color palette: '+p.palette.join(', ')+'. '+p.description
  : r.purpose==='NEXT_COLOR'
   ? 'Change hair color only. Use '+familyNames[p.nextColor!.family]+'. Tone '+p.nextColor!.tone+' relative to the confirmed source hair color: BASE maintains the same perceived lightness band; DOWN slightly darker; UP slightly lighter. Keep the same haircut, natural roots, highlights/shadows and realistic strand flow. '+p.description
   : 'Change hair color only for an UNVALIDATED VISUAL FADE ESTIMATE at '+p.weeks+' weeks. This is a qualitative illustration, not measured salon level or retention percentage. Preserve the exact haircut. '+p.description;
 return preservation+'\n'+action+'\nSource confirmed hair Lab (uncalibrated image representation, not guaranteed dye outcome): '+JSON.stringify(p.targetLab)+'.\nNatural texture, realistic density and roots; no wig-like appearance. Do not add text, grids, labels, logos or multiple panels.';
}

