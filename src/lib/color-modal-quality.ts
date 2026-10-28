import type {Photo} from './journey.ts';
import type {HairMask} from './hair-mask.ts';
import {validateHairMask} from './hair-mask.ts';
import type {HairTargetDraft} from './target-adjustment.ts';
import {counselingPhotoSource} from './counseling-color-preview.ts';
import {createToneBuffer,sampleImageLab} from './live-tone.ts';
import {renderColorModal} from './color-modal-preview.ts';
export type ColorMask=HairMask|{weights:Uint8Array;width:number;height:number};
export function projectColorMaskTile(mask:ColorMask,width:number,height:number,region:PixelRegion){
 if(!('weights'in mask))return colorMaskTile(mask,width,height,region);
 const result=new Uint8Array(region.width*region.height);for(let y=0;y<region.height;y++)for(let x=0;x<region.width;x++){const sx=Math.min(mask.width-1,Math.floor((x+region.x+.5)/width*mask.width)),sy=Math.min(mask.height-1,Math.floor((y+region.y+.5)/height*mask.height));result[y*region.width+x]=mask.weights[sy*mask.width+sx];}return result;
}
export type PixelRegion={x:number;y:number;width:number;height:number};
/** Image-relative vectors, rasterized in original-pixel coordinates with a feather halo. */
export function colorMaskTile(mask:HairMask,width:number,height:number,region:PixelRegion):Uint8Array{
 validateHairMask(mask,mask.referencePhotoId);
 if(![width,height,region.x,region.y,region.width,region.height].every(Number.isInteger)||width<1||height<1||region.x<0||region.y<0||region.width<1||region.height<1||region.x+region.width>width||region.y+region.height>height||region.width*region.height>1_048_576)throw new Error('画像分割の座標が不正です。');
 const feather=mask.feather*Math.min(width,height),halo=Math.ceil(feather)+1,x0=Math.max(0,region.x-halo),y0=Math.max(0,region.y-halo),x1=Math.min(width,region.x+region.width+halo),y1=Math.min(height,region.y+region.height+halo),w=x1-x0,h=y1-y0,binary=new Uint8Array(w*h);
 for(const polygon of mask.polygons)for(let y=y0;y<y1;y++){
  const intersections:number[]=[],row=(y+.5)/height;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a.y>row)!==(b.y>row))intersections.push((a.x+(row-a.y)/(b.y-a.y)*(b.x-a.x))*width);}intersections.sort((a,b)=>a-b);
  for(let i=0;i+1<intersections.length;i+=2)for(let x=Math.max(x0,Math.ceil(intersections[i]-.5));x<=Math.min(x1-1,Math.floor(intersections[i+1]-.5));x++)binary[(y-y0)*w+x-x0]=1;
 }
 for(const stroke of mask.strokes){const radius=stroke.diameter*Math.min(width,height)/2;for(let i=0;i<stroke.points.length;i++){const a=stroke.points[Math.max(0,i-1)],b=stroke.points[i],ax=a.x*width,ay=a.y*height,bx=b.x*width,by=b.y*height,dx=bx-ax,dy=by-ay,length2=dx*dx+dy*dy;
  for(let y=Math.max(y0,Math.floor(Math.min(ay,by)-radius));y<=Math.min(y1-1,Math.ceil(Math.max(ay,by)+radius));y++)for(let x=Math.max(x0,Math.floor(Math.min(ax,bx)-radius));x<=Math.min(x1-1,Math.ceil(Math.max(ax,bx)+radius));x++){const t=length2?Math.max(0,Math.min(1,((x+.5-ax)*dx+(y+.5-ay)*dy)/length2)):0;if((x+.5-ax-t*dx)**2+(y+.5-ay-t*dy)**2<=radius*radius)binary[(y-y0)*w+x-x0]=stroke.operation==='add'?1:0;}
 }}
 const distance=new Float32Array(binary.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=y*w+x;distance[p]=binary[p]?Math.min(x?distance[p-1]+1:1,y?distance[p-w]+1:1):0;}
 for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){const p=y*w+x;if(binary[p])distance[p]=Math.min(distance[p],x+1<w?distance[p+1]+1:1,y+1<h?distance[p+w]+1:1);}
 const result=new Uint8Array(region.width*region.height);for(let y=0;y<region.height;y++)for(let x=0;x<region.width;x++){const p=(y+region.y-y0)*w+x+region.x-x0;result[y*region.width+x]=feather<1?binary[p]*255:Math.round(255*Math.min(1,distance[p]/feather));}return result;
}
export function colorImagePoint(clientX:number,clientY:number,bounds:{left:number;top:number;width:number;height:number},width:number,height:number){
 const scale=Math.min(bounds.width/width,bounds.height/height),w=width*scale,h=height*scale,x=(clientX-bounds.left-(bounds.width-w)/2)/w,y=(clientY-bounds.top-(bounds.height-h)/2)/h;
 return {x:Math.max(0,Math.min(1,x)),y:Math.max(0,Math.min(1,y)),inside:x>=0&&x<=1&&y>=0&&y<=1};
}
export const COLOR_MAX_ORIGINAL_PIXELS=16_777_216;
export async function renderOriginalColorPhoto(photo:Photo,draft:HairTargetDraft,mask:ColorMask,measure=true,signal?:AbortSignal){
 signal?.throwIfAborted();const image=new Image();image.src=counselingPhotoSource(photo).dataUrl;await image.decode();const width=image.naturalWidth,height=image.naturalHeight;
 if(!width||!height||width*height>COLOR_MAX_ORIGINAL_PIXELS){image.src='';throw new Error('原画像が16MPの安全上限を超えています。画質を落とさず確定するため、処理を中止しました。');}
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx){image.src='';throw new Error('原画像を展開できませんでした。');}
 try{
  signal?.throwIfAborted();ctx.drawImage(image,0,0);image.src='';
  const p=draft.samplePoint,radius=Math.max(1,p.radius*Math.min(width,height)),cx=p.x*(width-1),cy=p.y*(height-1),sample={x:Math.max(0,Math.floor(cx-radius)),y:Math.max(0,Math.floor(cy-radius)),width:0,height:0};sample.width=Math.min(width,Math.ceil(cx+radius)+1)-sample.x;sample.height=Math.min(height,Math.ceil(cy+radius)+1)-sample.y;
  const patchMask=measure?projectColorMaskTile(mask,width,height,sample):new Uint8Array(sample.width*sample.height),samplePoint={...p,x:(cx-sample.x)/(Math.max(1,sample.width-1)),y:(cy-sample.y)/(Math.max(1,sample.height-1)),radius:radius/Math.min(sample.width,sample.height)},sourceLab=measure?sampleImageLab(ctx.getImageData(sample.x,sample.y,sample.width,sample.height).data,sample.width,sample.height,samplePoint,patchMask):null;
  let clipped=0,selectedPixels=0;const rows=Math.max(1,Math.min(128,Math.floor(524288/width)));
  for(let y=0;y<height;y+=rows){signal?.throwIfAborted();const region={x:0,y,width,height:Math.min(rows,height-y)},data=ctx.getImageData(0,y,width,region.height),weights=projectColorMaskTile(mask,width,height,region),rendered=renderColorModal(createToneBuffer(data.data,width,region.height),draft,weights,true);data.data.set(rendered.pixels);ctx.putImageData(data,0,y);const selected=weights.reduce((n,v)=>n+(v?1:0),0);selectedPixels+=selected;clipped+=rendered.clippedPixelFraction*selected;await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));}
  const adjustedLab=measure?sampleImageLab(ctx.getImageData(sample.x,sample.y,sample.width,sample.height).data,sample.width,sample.height,samplePoint,patchMask):null,blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('原解像度PNGを生成できませんでした。')),'image/png'));
  const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('PNGを取得できませんでした。'));reader.readAsDataURL(blob);});
  return {dataUrl,width,height,sourceLab,adjustedLab,clippedPixelFraction:selectedPixels?clipped/selectedPixels:0,originalResolution:{width,height,format:'PNG' as const,tileRows:rows}};
 }finally{image.src='';canvas.width=canvas.height=1;}
}
