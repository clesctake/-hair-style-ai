import {srgbToLab,labToSrgb} from './live-tone.ts';
import type {LandmarkPoint} from './photo-analysis-types.ts';
/** Color-only transfer. Original geometry and all unselected RGBA pixels remain intact. */
export function supportColorComposite(source:Uint8ClampedArray,edited:Uint8ClampedArray,mask:Uint8Array,purpose:'HAIR'|'MAKEUP'){
 if(source.length!==edited.length||source.length!==mask.length*4)throw new Error('画像と編集範囲が一致しません。');
 const count=mask.reduce((n,v)=>n+(v>0?1:0),0);if(count<5)throw new Error('編集可能な領域を確認できません。');
 let dL=0,da=0,db=0;
 for(let i=0;i<mask.length;i++)if(mask[i]){const a=srgbToLab(source[i*4],source[i*4+1],source[i*4+2]),b=srgbToLab(edited[i*4],edited[i*4+1],edited[i*4+2]);dL+=b.L-a.L;da+=b.a-a.a;db+=b.b-a.b;}
 dL=Math.max(-12,Math.min(12,dL/count));da/=count;db/=count;
 const result=new Uint8ClampedArray(source);
 for(let i=0;i<mask.length;i++)if(mask[i]){const a=srgbToLab(source[i*4],source[i*4+1],source[i*4+2]),b=srgbToLab(edited[i*4],edited[i*4+1],edited[i*4+2]),color=labToSrgb(purpose==='HAIR'?{L:Math.max(0,Math.min(100,a.L+dL)),a:a.a+da,b:a.b+db}:{L:a.L,a:a.a+(b.a-a.a)*.75,b:a.b+(b.b-a.b)*.75}).rgb;
  for(let c=0;c<3;c++)result[i*4+c]=source[i*4+c]+mask[i]/255*(color[c]-source[i*4+c]);
 }return result;
}
function inside(x:number,y:number,polygon:LandmarkPoint[]){let hit=false;for(let i=0,k=polygon.length-1;i<polygon.length;k=i++){const a=polygon[i],b=polygon[k];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)hit=!hit;}return hit;}
/** Actual detected landmarks only. No fixed mask is used when measurement is absent. */
export function makeupRegionMask(points:LandmarkPoint[],width:number,height:number){
 const indices=[61,40,37,0,267,270,291,321,314,17,84,91,78,81,13,311,308,402,14,178,33,160,158,133,153,144,362,385,387,263,373,380,50,280,159,70,386,300,234,454];
 if(!indices.every(i=>points[i]&&Number.isFinite(points[i].x)&&Number.isFinite(points[i].y)))throw new Error('メイク編集用の顔ランドマークが不足しています。');
 const poly=(ii:number[])=>ii.map(i=>points[i]),lip=poly([61,40,37,0,267,270,291,321,314,17,84,91]),mouth=poly([78,81,13,311,308,402,14,178]),leftEye=poly([33,160,158,133,153,144]),rightEye=poly([362,385,387,263,373,380]);
 const faceWidth=Math.abs(points[454].x-points[234].x),rx=faceWidth*.10,ry=faceWidth*.065;
 const ellipse=(x:number,y:number,c:LandmarkPoint,w:number,h:number)=>((x-c.x)/w)**2+((y-c.y)/h)**2<1;
 const mask=new Uint8Array(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const px=(x+.5)/width,py=(y+.5)/height;
  if(inside(px,py,mouth)||inside(px,py,leftEye)||inside(px,py,rightEye))continue;
  const eyes=[{x:points[159].x,y:(points[159].y+points[70].y)/2,z:null},{x:points[386].x,y:(points[386].y+points[300].y)/2,z:null}];
  if(inside(px,py,lip)||[50,280].some(i=>ellipse(px,py,points[i],rx,ry))||eyes.some(p=>ellipse(px,py,p,rx*.75,ry*.65)))mask[y*width+x]=255;
 }return mask;
}

