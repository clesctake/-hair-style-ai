import type {Journey,Lab,Photo} from './journey.ts';
import type {HairMask} from './hair-mask.ts';
import {rasterizeHairMask} from './hair-mask.ts';
import {decodeMask} from './photo-analysis-math.ts';
import {currentAnalysisRun} from './photo-analysis-pipeline.ts';
import {labToSrgb,srgbToLab,createToneBuffer,type ToneBuffer} from './live-tone.ts';
import {counselingState,editCounseling} from './counseling-session.ts';
import {confirmedTargetAdjustment,pendingTargetAdjustment} from './target-adjustment.ts';

/** Coordinates apply ONLY to the explicitly labelled visual-master sample. */
export function counselingSampleMask(photoId:string):HairMask {
 const polygons=[[[.01,.38],[.08,.19],[.21,.06],[.47,.025],[.48,.16],[.3,.3],[.24,.56],[.25,.76],[.38,.99],[.025,.99]],
 [[.52,.03],[.77,.1],[.91,.25],[.98,.43],[.98,.99],[.67,.99],[.78,.72],[.78,.52],[.7,.34],[.52,.19]]];
 return {version:'hair-mask-v1',referencePhotoId:photoId,origin:'demo_hand_traced',polygons:polygons.map(p=>p.map(([x,y])=>({x,y}))),strokes:[],feather:.006};
}
export function rotateLabHue(lab:Lab,degrees:number):Lab {
 const r=degrees*Math.PI/180;return {L:lab.L,a:lab.a*Math.cos(r)-lab.b*Math.sin(r),b:lab.a*Math.sin(r)+lab.b*Math.cos(r)};
}
export function counselingPhotoSource(photo:Photo):{dataUrl:string;width:number;height:number} {
 const original=photo.original??photo.capture?.original;
 return original?{dataUrl:original.dataUrl,width:original.width,height:original.height}:{dataUrl:photo.dataUrl,width:photo.width,height:photo.height};
}
export function shiftMaskedHue(pixels:Uint8ClampedArray,mask:Uint8Array,degrees:number):Uint8ClampedArray {
 if(mask.length*4!==pixels.length)throw new Error('色相補正と髪領域のサイズが一致しません。');
 const out=new Uint8ClampedArray(pixels);if(!degrees)return out;
 for(let i=0;i<mask.length;i++)if(mask[i]){const lab=rotateLabHue(srgbToLab(pixels[i*4],pixels[i*4+1],pixels[i*4+2]),degrees),{rgb}=labToSrgb(lab);for(let c=0;c<3;c++)out[i*4+c]=pixels[i*4+c]+mask[i]/255*(rgb[c]-pixels[i*4+c]);}return out;
}
/** Never edits a pixel outside the mask. Target transfer is an uncalibrated appearance preview. */
export function transferHairColor(buffer:ToneBuffer,target:Lab,mask:Uint8Array):Uint8ClampedArray {
 if(mask.length!==buffer.width*buffer.height)throw new Error('本人写真と髪領域の座標が一致しません。');
 const selected:number[]=[];for(let i=0;i<mask.length;i++)if(mask[i]>=200)selected.push(i);
 if(!selected.length)return new Uint8ClampedArray(buffer.original);
 selected.sort((a,b)=>buffer.lab[a*3]-buffer.lab[b*3]);const n=Math.floor(selected.length*.1),used=selected.slice(n,selected.length-n);
 const mean=used.reduce((m,i)=>({L:m.L+buffer.lab[i*3]/used.length,a:m.a+buffer.lab[i*3+1]/used.length,b:m.b+buffer.lab[i*3+2]/used.length}),{L:0,a:0,b:0});
 const output=new Uint8ClampedArray(buffer.original);
 for(let i=0;i<mask.length;i++){
  const amount=mask[i]/255;if(!amount)continue;
  const lab={L:Math.max(0,Math.min(100,buffer.lab[i*3]+target.L-mean.L)),a:buffer.lab[i*3+1]+target.a-mean.a,b:buffer.lab[i*3+2]+target.b-mean.b};
  const {rgb}=labToSrgb(lab);for(let c=0;c<3;c++)output[i*4+c]=buffer.original[i*4+c]+amount*(rgb[c]-buffer.original[i*4+c]);
 }return output;
}
export function personHairWeights(j:Journey,photo:Photo,width:number,height:number):{weights:Uint8Array;source:'AI_ESTIMATE'|'STYLIST_CORRECTED'|'MOCK'|null} {
 const manual=counselingState(j).personHairMasks?.[photo.id];
 if(manual)return {weights:rasterizeHairMask(manual,width,height),source:manual.origin==='demo_hand_traced'?'MOCK':'STYLIST_CORRECTED'};
 const run=currentAnalysisRun(j),result=run?.photos.find(p=>p.imageId===photo.id),region=result?.hairRegion;
 if(!region)return {weights:new Uint8Array(width*height),source:null};
 const raw=decodeMask(region.mask),weights=new Uint8Array(width*height),mw=region.mask.width,mh=region.mask.height;
 const face=result.faceLandmarks,oval=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109].map(i=>face[i]).filter(Boolean);
 const insideFace=(x:number,y:number)=>{let inside=false;for(let a=0,b=oval.length-1;a<oval.length;b=a++){const p=oval[a],q=oval[b];if((p.y>y)!==(q.y>y)&&x<(q.x-p.x)*(y-p.y)/(q.y-p.y)+p.x)inside=!inside;}return inside;};
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const mx=Math.min(mw-1,Math.floor(x/width*mw)),my=Math.min(mh-1,Math.floor(y/height*mh));
  // Conservative erosion and face-surface exclusion; stylist can adjust the remaining selection.
  if(mx<1||my<1||mx>=mw-1||my>=mh-1||oval.length>3&&insideFace((x+.5)/width,(y+.5)/height))continue;
  if([-1,0,1].every(dy=>[-1,0,1].every(dx=>raw[(my+dy)*mw+mx+dx])))weights[y*width+x]=255;
 }
 return {weights,source:'AI_ESTIMATE'};
}
export function savePersonColorPreview(j:Journey,photo:Photo,preview:Photo,source:'AI_ESTIMATE'|'STYLIST_CORRECTED'|'MOCK'):Journey {
 const target=confirmedTargetAdjustment(j);if(!target||pendingTargetAdjustment(j))throw new Error('COLORの色味を確定してください。');
 const state=counselingState(j),item={id:crypto.randomUUID(),sourceCurrentPhotoId:photo.id,targetConfirmationId:target.id,referencePhotoId:target.referencePhoto.id,previewPhoto:preview,maskSource:source,createdAt:new Date().toISOString(),kind:'LIGHTWEIGHT_HAIR_ONLY_NOT_GENERATED' as const};
 return editCounseling(j,{personColorPreviews:[...(state.personColorPreviews??[]),item],confirmation:null});
}
export function commonCounselingColor(j:Journey){const c=confirmedTargetAdjustment(j);return c&&!pendingTargetAdjustment(j)?{confirmationId:c.id,referencePhotoId:c.referencePhoto.id,lab:structuredClone(c.color.value),hueShift:c.hueShift??0}:null;}
/** Re-render from the just-confirmed snapshot; never save an earlier animation frame. */
export async function buildConfirmedPersonPreview(j:Journey,photo:Photo):Promise<Journey> {
 const target=commonCounselingColor(j);if(!target)return j;
 const image=new Image();image.src=counselingPhotoSource(photo).dataUrl;await image.decode();
 const scale=Math.min(1,512/Math.max(image.naturalWidth,image.naturalHeight)),c=document.createElement('canvas');c.width=Math.round(image.naturalWidth*scale);c.height=Math.round(image.naturalHeight*scale);
 const ctx=c.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('本人のプレビューを保存できません。');ctx.drawImage(image,0,0,c.width,c.height);
 const b=createToneBuffer(ctx.getImageData(0,0,c.width,c.height).data,c.width,c.height),selection=personHairWeights(j,photo,c.width,c.height);if(!selection.source||!selection.weights.some(v=>v))return j;
 const output=ctx.createImageData(c.width,c.height);output.data.set(transferHairColor(b,target.lab,selection.weights));ctx.putImageData(output,0,0);
 return savePersonColorPreview(j,photo,{id:crypto.randomUUID(),view:'front',name:'person-hair-color-preview.png',dataUrl:c.toDataURL('image/png'),width:c.width,height:c.height,createdAt:new Date().toISOString()},selection.source);
}
