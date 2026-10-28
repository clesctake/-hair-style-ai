'use client';
import {portraitVerification} from './generated-image-quality.ts';
import type {Lab} from './journey.ts';
import type {LandmarkPoint} from './photo-analysis-types.ts';
import type {VisionPrediction} from './photo-analysis-provider.ts';
import {createToneBuffer} from './live-tone.ts';
import {transferHairColor} from './counseling-color-preview.ts';
import {simulationClient} from './hair-simulation-client.ts';
import type {SimulationTransport} from './hair-simulation-types.ts';

/** Conservative, image-derived hair region. No fixed silhouette is used for an actual person. */
export function confidenceHairMask(p:VisionPrediction,width:number,height:number):Uint8Array{
 if(!p.hairConfidence||!p.maskWidth||!p.maskHeight)throw new Error('髪領域を取得できませんでした。');
 const {maskWidth:mw,maskHeight:mh,hairConfidence:raw}=p,mask=new Uint8Array(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const mx=Math.min(mw-1,Math.floor(x/width*mw)),my=Math.min(mh-1,Math.floor(y/height*mh));
  if(mx<1||my<1||mx>=mw-1||my>=mh-1)continue;
  if([-1,0,1].every(dy=>[-1,0,1].every(dx=>raw[(my+dy)*mw+mx+dx]>=.9)))mask[y*width+x]=255;
 }return mask;
}
/** Face below the brow stays original. Forehead hair is allowed only when classified as hair. */
export function protectedFaceMask(points:LandmarkPoint[],width:number,height:number):Uint8Array{
 const ovalIndices=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
 const oval=ovalIndices.map(i=>points[i]);
 if(oval.some(p=>!p)||!points[70]||!points[300])throw new Error('本人の顔を保護するランドマークが不足しています。');
 const brow=Math.min(points[70].y,points[300].y)-.015,mask=new Uint8Array(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const px=(x+.5)/width,py=(y+.5)/height;if(py<brow)continue;
  let inside=false;for(let i=0,k=oval.length-1;i<oval.length;k=i++){const a=oval[i],b=oval[k];if((a.y>py)!==(b.y>py)&&px<(b.x-a.x)*(py-a.y)/(b.y-a.y)+a.x)inside=!inside;}
  if(inside)mask[y*width+x]=255;
 }return mask;
}
/** Keeps every source pixel outside the estimated editable hair region, including alpha. */
export function protectGeneratedHair(original:Uint8ClampedArray,generated:Uint8ClampedArray,width:number,height:number,originalHair:Uint8Array,generatedHair:Uint8Array,face:Uint8Array,target:Lab|null):Uint8ClampedArray{
 const count=width*height;if(original.length!==count*4||generated.length!==count*4||[originalHair,generatedHair,face].some(m=>m.length!==count))throw new Error('画像と髪領域のサイズが一致しません。');
 if(!generatedHair.some(v=>v)||!face.some(v=>v))throw new Error('髪だけの生成結果を検証できません。');
 const colorMask=new Uint8Array(count);for(let i=0;i<count;i++)if(generatedHair[i]&&!face[i])colorMask[i]=255;
 const colored=target?transferHairColor(createToneBuffer(generated,width,height),target,colorMask):generated;
 const output=new Uint8ClampedArray(original);
 for(let i=0;i<count;i++)if((originalHair[i]||generatedHair[i])&&!face[i])for(let c=0;c<3;c++)output[i*4+c]=colored[i*4+c];
 return output;
}
export function counselingSimulationTransport():SimulationTransport{
 // Identity is checked by the stylist before adoption. Never splice silhouettes or apply COLOR twice.
 return simulationClient({postprocess:async output=>{const portraitStatus=await portraitVerification(output.image);return {...output,generation:{...output.generation,requiresStylistReview:true,portraitVerification:portraitStatus}};}});
}
