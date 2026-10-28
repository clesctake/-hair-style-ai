import type {Journey,Photo} from './journey.ts';
import type {HairTargetDraft} from './target-adjustment.ts';
import {confirmedTargetAdjustment,confirmTargetAdjustment} from './target-adjustment.ts';
import {colorModalSample,colorModalPersonMask,colorModalMockMask} from './color-modal-preview.ts';
import {renderOriginalColorPhoto,type ColorMask} from './color-modal-quality.ts';
import {counselingState} from './counseling-session.ts';
import {savePersonColorPreview} from './counseling-color-preview.ts';
import {rasterizeHairMask} from './hair-mask.ts';
/** A valid COLOR target is independent of the optional CURRENT appearance preview.
 * Failed/missing CURRENT masks never fabricate an image or discard a confirmed target.
 */
export async function confirmColorModal(session:Journey,person:Photo,draft:HairTargetDraft,referenceSize:{width:number;height:number},personSize:{width:number;height:number},savePreview:boolean,signal:AbortSignal,render=renderOriginalColorPhoto){
 const reference=session.target.reference;if(!reference||reference.id!==draft.referencePhotoId)throw new Error('COLOR写真が変更されています。新しい写真で色味を確定してください。');
 const sampled=colorModalSample(draft,referenceSize.width,referenceSize.height);
 if(!sampled.samplePoint.selected)throw new Error('COLOR参考写真の髪範囲が未設定です。「理想イメージ調整」で選択してください。');
 const working={...session,target:{...session.target,referenceHairMask:sampled.hairMask,adjustmentDraft:sampled}};
 const result=await render(reference,sampled,sampled.hairMask,true,signal);signal.throwIfAborted();
 if(!result.sourceLab||!result.adjustedLab)throw new Error('COLOR参考写真の髪の採色が未完了です。');
 let next=confirmTargetAdjustment(working,{...result,sourceLab:result.sourceLab,adjustedLab:result.adjustedLab});
 let previewWarning='';
 if(savePreview){try{
  const manual=counselingState(session).personHairMasks?.[person.id],mask:ColorMask=person.id===sampled.referencePhotoId?sampled.hairMask:manual?.polygons.length?manual:person.name.startsWith('MOCK-')&&!manual?colorModalMockMask(person.id):{...colorModalPersonMask(session,person,personSize.width,personSize.height),width:personSize.width,height:personSize.height};
  const selected='weights'in mask?mask.weights.some(v=>v):rasterizeHairMask(mask,personSize.width,personSize.height).some(v=>v);
  if(!selected)throw new Error('本人の髪範囲が未設定のため、補正プレビューは未作成です。「範囲を調整」で選択してください。');
  const full=person.id===sampled.referencePhotoId?result:await render(person,sampled,mask,false,signal);signal.throwIfAborted();
  next=savePersonColorPreview(next,person,{id:crypto.randomUUID(),view:person.view,name:'person-hair-color-original-resolution.png',dataUrl:full.dataUrl,width:full.width,height:full.height,createdAt:new Date().toISOString()},person.name.startsWith('MOCK-')?'MOCK':manual?'STYLIST_CORRECTED':'AI_ESTIMATE');
 }catch(e){signal.throwIfAborted();previewWarning=e instanceof Error?e.message:'本人補正プレビューを作成できませんでした。';}}
 if(!confirmedTargetAdjustment(next))throw new Error('COLORの確定結果を保存できませんでした。');
 return {journey:next,previewWarning};
}
