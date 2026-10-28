import type {Journey,Lab,Photo} from './journey.ts';
import {renderTone,sampleImageLab,type ToneBuffer} from './live-tone.ts';
import {shiftMaskedHue,personHairWeights} from './counseling-color-preview.ts';
import {targetDraft,type HairTargetDraft} from './target-adjustment.ts';
import {rasterizeHairMask,type HairMask} from './hair-mask.ts';
import {counselingState,editCounseling} from './counseling-session.ts';
/** One render path for the COLOR modal. Existing seven-control mathematics are unchanged. */
export function renderColorModal(buffer:ToneBuffer,draft:HairTargetDraft,mask:Uint8Array,hairOnly:boolean,baseTarget:Lab|null=null){
 if(Object.values(draft.controls).every(value=>value===0)&&!(draft.hueShift??0))return {pixels:new Uint8ClampedArray(buffer.original),clippedPixelFraction:0};
 // A reference color must not activate a second, discontinuous color transfer.
 void baseTarget;
 const selection=hairOnly?mask:new Uint8Array(mask.length).fill(255),result=renderTone(buffer,draft.controls,selection);
 return {...result,pixels:shiftMaskedHue(result.pixels,selection,draft.hueShift??0)};
}
export function colorModalSample(draft:HairTargetDraft,width:number,height:number):HairTargetDraft{
 const mask=rasterizeHairMask(draft.hairMask,width,height),p=draft.samplePoint;
 if(p.selected&&mask[Math.min(height-1,Math.floor(p.y*height))*width+Math.min(width-1,Math.floor(p.x*width))]>=128)return draft;
 let chosen=-1,distance=Infinity;for(let i=0;i<mask.length;i++){if(mask[i]<200)continue;const x=(i%width+.5)/width,y=(Math.floor(i/width)+.5)/height,d=Math.hypot(x-p.x,y-p.y);if(d<distance){distance=d;chosen=i;}}
 return chosen<0?{...draft,samplePoint:{...p,selected:false}}:{...draft,samplePoint:{...p,x:(chosen%width+.5)/width,y:(Math.floor(chosen/width)+.5)/height,selected:true}};
}
export function colorModalReference(session:Journey,photo:Photo,mask:HairMask):Journey{
 if(session.target.reference)return session;
 const reference={...photo,view:'reference' as const},hairMask={...mask,referencePhotoId:reference.id};
 return {...session,target:{...session.target,reference,referenceHairMask:hairMask,adjustmentDraft:null,confirmedAdjustmentId:null}};
}
export function colorModalConfirmation(session:Journey,buffer:ToneBuffer){
 const draft=targetDraft(session);if(!draft)throw new Error('カラー写真がありません。');const mask=rasterizeHairMask(draft.hairMask,buffer.width,buffer.height);
 const rendered=renderColorModal(buffer,draft,mask,true);return {...rendered,sourceLab:sampleImageLab(buffer.original,buffer.width,buffer.height,draft.samplePoint,mask),adjustedLab:sampleImageLab(rendered.pixels,buffer.width,buffer.height,draft.samplePoint,mask)};
}

/** Hand-traced only for the existing current-front MOCK photo, never for customer uploads. */
export function colorModalMockMask(referencePhotoId:string):HairMask{
 const shapes=[[[94,6],[75,11],[59,23],[43,45],[29,69],[18,94],[12,122],[14,146],[20,161],[16,181],[8,207],[4,229],[15,247],[38,255],[52,254],[49,237],[43,209],[44,183],[43,155],[48,124],[57,99],[65,84],[75,65],[86,33]],
 [[96,7],[114,16],[132,36],[147,61],[157,89],[163,117],[166,145],[166,174],[175,207],[177,236],[163,252],[141,255],[134,240],[137,214],[135,183],[138,156],[136,128],[127,100],[119,84],[108,57]],
 [[91,24],[80,44],[79,63],[94,80],[106,90],[111,89],[105,75],[99,54]]];
 return {version:'hair-mask-v1',referencePhotoId,origin:'demo_hand_traced',polygons:shapes.map(shape=>shape.map(([x,y])=>({x:x/184,y:y/256}))),strokes:[],feather:.006};
}

/** Manual strokes refine an available AI mask rather than discarding its untouched areas. */
export function applyColorMaskStrokes(base:Uint8Array,manual:HairMask,width:number,height:number){
 const out=new Uint8Array(base);for(const stroke of manual.strokes){const shape={...manual,polygons:[],strokes:[{...stroke,operation:'add' as const}]},selection=rasterizeHairMask(shape,width,height);for(let i=0;i<out.length;i++)if(selection[i])out[i]=stroke.operation==='add'?Math.max(out[i],selection[i]):Math.min(out[i],255-selection[i]);}
 return out;
}
export function colorModalPersonMask(session:Journey,photo:Photo,width:number,height:number){
 const manual=counselingState(session).personHairMasks?.[photo.id];if(!manual||manual.polygons.length)return personHairWeights(session,photo,width,height);
 const masks={...counselingState(session).personHairMasks};delete masks[photo.id];const base=personHairWeights(editCounseling(session,{personHairMasks:masks}),photo,width,height);
 if(!base.source)return personHairWeights(session,photo,width,height);
 return {weights:applyColorMaskStrokes(base.weights,manual,width,height),source:'STYLIST_CORRECTED' as const};
}

/** The approved modal has seven controls; a hidden legacy hue is not an eighth input. History remains unchanged. */
export function colorModalEditingDraft(draft:HairTargetDraft):HairTargetDraft{return {...draft,hueShift:0};}
