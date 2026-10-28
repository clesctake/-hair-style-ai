import type {LandmarkPoint} from './photo-analysis-types.ts';
import {srgbToLab} from './live-tone.ts';

export type ReviewDirection='FRONT'|'SIDE'|'BACK';
export type ReviewPoint={x:number;y:number};
export type ReviewFlow={from:ReviewPoint;to:ReviewPoint;angle:number;coherence:number};
export type ReviewObservation={direction:ReviewDirection;width:number;height:number;mask:Uint8Array;landmarks:LandmarkPoint[];contour:ReviewPoint[];flow:ReviewFlow[];lab:{L:number;a:number;b:number}|null;zones:({L:number;a:number;b:number}|null)[];clippedFraction:number;hairPixels:number;errors:string[]};
export type ReviewTransform={a:number;b:number;c:number;d:number;e:number;f:number};
export type ReviewPose={roll:number;yaw:number;pitch:number;eyeDistance:number;center:ReviewPoint};
export type ReviewScore={value:number|null;reason:string;confidence:'LOW'|'UNAVAILABLE'};
export type ReviewPairResult={direction:ReviewDirection;comparable:boolean;reason:string;transform:ReviewTransform|null;targetPose:ReviewPose|null;actualPose:ReviewPose|null;targetContour:ReviewPoint[];actualContour:ReviewPoint[];actualFlow:ReviewFlow[];scores:{style:ReviewScore;color:ReviewScore;fringe:ReviewScore;texture:ReviewScore;overall:ReviewScore};metrics:{silhouetteIoU:number|null;fringeIoU:number|null;deltaE76:number|null;lightnessDelta:number|null;redDelta:number|null;yellowDelta:number|null;chromaDelta:number|null;zoneDeltaE:(number|null)[];flowSimilarity:number|null;targetHairPixels:number;actualHairPixels:number};improvements:string[];education:{category:string;cause:string;check:string}[];method:string;weights:typeof REVIEW_WEIGHTS;calibrated:false};
export const REVIEW_WEIGHTS=Object.freeze({style:.4,color:.3,fringe:.2,texture:.1});
export const REVIEW_METHOD='AI_REFERENCE_V1_FACE_SIMILARITY_MASK_IOU_CIELAB76_STRUCTURE_TENSOR_UNCALIBRATED';
const clamp=(v:number,min=0,max=1)=>Math.max(min,Math.min(max,v));
const degrees=(v:number)=>v*180/Math.PI;
export function mapReviewPoint(p:ReviewPoint,t:ReviewTransform):ReviewPoint{return {x:t.a*p.x+t.c*p.y+t.e,y:t.b*p.x+t.d*p.y+t.f};}
export function inverseReviewTransform(t:ReviewTransform):ReviewTransform{
 const det=t.a*t.d-t.b*t.c;if(!Number.isFinite(det)||Math.abs(det)<1e-9)throw new Error('位置合わせが不安定です。');
 return {a:t.d/det,b:-t.b/det,c:-t.c/det,d:t.a/det,e:(t.c*t.f-t.d*t.e)/det,f:(t.b*t.e-t.a*t.f)/det};
}
export function reviewPose(points:LandmarkPoint[],width:number,height:number):ReviewPose|null{
 if(![33,263,1,10,152].every(i=>points[i]&&Number.isFinite(points[i].x)&&Number.isFinite(points[i].y)))return null;
 const xyz=(i:number)=>({x:points[i].x*width,y:points[i].y*height,z:typeof points[i].z==='number'?points[i].z!*width:0});
 const l=xyz(33),r=xyz(263),top=xyz(10),chin=xyz(152),ex=r.x-l.x,ey=r.y-l.y,ez=r.z-l.z,vx=chin.x-top.x,vy=chin.y-top.y,vz=chin.z-top.z;
 const nx=ey*vz-ez*vy,ny=ez*vx-ex*vz,nz=ex*vy-ey*vx,distance=Math.hypot(ex,ey);
 if(distance<12||Math.hypot(nx,ny,nz)<1)return null;
 return {roll:degrees(Math.atan2(ey,ex)),yaw:degrees(Math.atan2(nx,nz)),pitch:degrees(Math.atan2(-ny,Math.hypot(nx,nz))),eyeDistance:distance,center:{x:(l.x+r.x)/2/width,y:(l.y+r.y)/2/height}};
}
/** Face anchors only. Hair bounding boxes must never be used to erase hairstyle differences. */
export function alignReviewFaces(target:ReviewObservation,actual:ReviewObservation){
 const t=reviewPose(target.landmarks,target.width,target.height),a=reviewPose(actual.landmarks,actual.width,actual.height);
 if(target.direction!==actual.direction)return {transform:null,reason:'撮影方向が異なります。',targetPose:t,actualPose:a};
 if(!t||!a)return {transform:null,reason:'顔の基準点が不足し、2D位置合わせは判定不可です。',targetPose:t,actualPose:a};
 if(Math.abs(t.yaw-a.yaw)>15||Math.abs(t.pitch-a.pitch)>12||Math.abs(t.yaw)>35||Math.abs(a.yaw)>35||Math.abs(t.pitch)>25||Math.abs(a.pitch)>25)return {transform:null,reason:'視点差が大きく、2D補正で比較できません。撮り直してください。',targetPose:t,actualPose:a};
 const scale=t.eyeDistance/a.eyeDistance;if(scale<.4||scale>2.5)return {transform:null,reason:'撮影距離・顔サイズの差が大きすぎます。',targetPose:t,actualPose:a};
 const theta=(t.roll-a.roll)*Math.PI/180,cs=Math.cos(theta)*scale,sn=Math.sin(theta)*scale;
 const matrix={a:cs*actual.width/target.width,b:sn*actual.width/target.height,c:-sn*actual.height/target.width,d:cs*actual.height/target.height,e:0,f:0};
 const center=mapReviewPoint(a.center,matrix);matrix.e=t.center.x-center.x;matrix.f=t.center.y-center.y;
 return {transform:matrix,reason:'目の位置・顔サイズ・ロールを2D補正。ヨー/ピッチは補正せず比較可否に使用。',targetPose:t,actualPose:a};
}
export function reviewContour(mask:Uint8Array,width:number,height:number):ReviewPoint[]{
 if(mask.length!==width*height)throw new Error('髪領域と写真の寸法が一致しません。');
 const left:ReviewPoint[]=[],right:ReviewPoint[]=[];
 for(let y=0;y<height;y+=Math.max(1,Math.floor(height/60))){let l=width,r=-1;for(let x=0;x<width;x++)if(mask[y*width+x]){l=Math.min(l,x);r=Math.max(r,x);}if(r>=l){left.push({x:l/width,y:y/height});right.push({x:(r+1)/width,y:y/height});}}
 return left.length>2?[...left,...right.reverse(),left[0]]:[];
}
/** Local strand orientation proxy; arrows have a 180° ambiguity, not measured root-to-tip flow. */
export function reviewFlow(pixels:Uint8ClampedArray,mask:Uint8Array,width:number,height:number):ReviewFlow[]{
 const luma=(x:number,y:number)=>{const i=(y*width+x)*4;return pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722;};
 const flows:ReviewFlow[]=[],cell=Math.max(12,Math.floor(Math.min(width,height)/7));
 for(let cy=cell;cy<height-cell;cy+=cell)for(let cx=cell;cx<width-cell;cx+=cell){let xx=0,xy=0,yy=0,n=0;
  for(let y=cy-cell/2|0;y<cy+cell/2;y+=2)for(let x=cx-cell/2|0;x<cx+cell/2;x+=2){if(!mask[y*width+x])continue;const gx=luma(x+1,y)-luma(x-1,y),gy=luma(x,y+1)-luma(x,y-1);xx+=gx*gx;xy+=gx*gy;yy+=gy*gy;n++;}
  const energy=xx+yy,coherence=energy?Math.hypot(xx-yy,2*xy)/energy:0;if(n<20||energy/n<8||coherence<.25)continue;
  const angle=.5*Math.atan2(2*xy,xx-yy)+Math.PI/2;let dx=Math.cos(angle)*cell*.65/width,dy=Math.sin(angle)*cell*.65/height;if(dy<0){dx=-dx;dy=-dy;}
  flows.push({from:{x:cx/width-dx/2,y:cy/height-dy/2},to:{x:cx/width+dx/2,y:cy/height+dy/2},angle,coherence});
 }
 return flows;
}
export function observeReviewPhoto(direction:ReviewDirection,pixels:Uint8ClampedArray,width:number,height:number,mask:Uint8Array,landmarks:LandmarkPoint[],errors:string[]=[]):ReviewObservation{
 if(width<8||height<8||pixels.length!==width*height*4||mask.length!==width*height)throw new Error('解析画像の寸法が不正です。');
 const sums=Array.from({length:3},()=>({L:0,a:0,b:0,n:0}));let count=0,clipped=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x;if(!mask[i]||pixels[i*4+3]<128)continue;count++;const rgb=[pixels[i*4],pixels[i*4+1],pixels[i*4+2]];if(rgb.some(v=>v<=5||v>=250)){clipped++;continue;}
  const lab=srgbToLab(rgb[0],rgb[1],rgb[2]),zone=sums[Math.min(2,Math.floor(y/height*3))];zone.L+=lab.L;zone.a+=lab.a;zone.b+=lab.b;zone.n++;
 }
 const zones=sums.map(s=>s.n>=20?{L:s.L/s.n,a:s.a/s.n,b:s.b/s.n}:null),n=sums.reduce((v,s)=>v+s.n,0),lab=n>=32?{L:sums.reduce((v,s)=>v+s.L,0)/n,a:sums.reduce((v,s)=>v+s.a,0)/n,b:sums.reduce((v,s)=>v+s.b,0)/n}:null;
 return {direction,width,height,mask,landmarks,contour:count>=32?reviewContour(mask,width,height):[],flow:count>=32?reviewFlow(pixels,mask,width,height):[],lab,zones,clippedFraction:count?clipped/count:1,hairPixels:count,errors};
}
function maskIoU(t:ReviewObservation,a:ReviewObservation,transform:ReviewTransform,fringe=false){
 const inverse=inverseReviewTransform(transform);let intersection=0,union=0,visible=0,targetArea=0;
 const pose=reviewPose(t.landmarks,t.width,t.height),top=t.landmarks[10],left=t.landmarks[234],right=t.landmarks[454];
 if(fringe&&(!pose||!top||!left||!right))return null;
 for(let y=0;y<128;y++)for(let x=0;x<128;x++){
  const p={x:(x+.5)/128,y:(y+.5)/128};if(fringe&&(p.y<top!.y-.04||p.y>pose!.center.y+.08||p.x<left!.x-.04||p.x>right!.x+.04))continue;
  const q=mapReviewPoint(p,inverse),tv=t.mask[Math.min(t.height-1,Math.floor(p.y*t.height))*t.width+Math.min(t.width-1,Math.floor(p.x*t.width))]>0;
  if(tv)targetArea++;if(q.x<0||q.x>=1||q.y<0||q.y>=1)continue;if(tv)visible++;
  const av=a.mask[Math.floor(q.y*a.height)*a.width+Math.floor(q.x*a.width)]>0;if(tv&&av)intersection++;if(tv||av)union++;
 }
 return union>=20&&targetArea>0&&visible/targetArea>=.9?intersection/union:null;
}
const score=(value:number|null,reason:string):ReviewScore=>({value:value===null?null:Math.round(clamp(value)*100),reason,confidence:value===null?'UNAVAILABLE':'LOW'});
const delta=(a:{L:number;a:number;b:number}|null,b:{L:number;a:number;b:number}|null)=>a&&b?Math.hypot(a.L-b.L,a.a-b.a,a.b-b.b):null;
export function compareReviewPhotos(target:ReviewObservation,actual:ReviewObservation):ReviewPairResult{
 const alignment=alignReviewFaces(target,actual),comparable=Boolean(alignment.transform)&&target.hairPixels>=32&&actual.hairPixels>=32;
 const iou=comparable?maskIoU(target,actual,alignment.transform!):null,fringe=comparable?maskIoU(target,actual,alignment.transform!,true):null;
 const de=target.direction===actual.direction&&target.clippedFraction<.2&&actual.clippedFraction<.2?delta(target.lab,actual.lab):null;
 let flowSimilarity:number|null=null;
 if(comparable&&target.flow.length>=3&&actual.flow.length>=3){const m=alignment.transform!;let sum=0,count=0;
  for(const vector of actual.flow){const from=mapReviewPoint(vector.from,m),to=mapReviewPoint(vector.to,m),center={x:(from.x+to.x)/2,y:(from.y+to.y)/2};
   const nearest=[...target.flow].sort((u,v)=>Math.hypot((u.from.x+u.to.x)/2-center.x,(u.from.y+u.to.y)/2-center.y)-Math.hypot((v.from.x+v.to.x)/2-center.x,(v.from.y+v.to.y)/2-center.y))[0];
   if(Math.hypot((nearest.from.x+nearest.to.x)/2-center.x,(nearest.from.y+nearest.to.y)/2-center.y)>.18)continue;
   const angle=Math.atan2((to.y-from.y)*target.height,(to.x-from.x)*target.width);sum+=(1+Math.cos(2*(nearest.angle-angle)))/2;count++;
  }if(count>=3&&count/actual.flow.length>=.75)flowSimilarity=sum/count;
 }
 const scores={style:score(iou,'顔基準で位置合わせ後の髪マスクIoU。レイヤーやカット技術の実測ではありません。'),color:score(de===null?null:Math.exp(-de/15),'画像上のCIELAB ΔE76から100×exp(-ΔE/15)。照明・カメラ未校正。'),fringe:score(fringe,'額〜目・顔周りの画像領域IoUによる見え方の参考指標。'),texture:score(flowSimilarity,'局所テクスチャ方向の一致。触感・ツヤの物理測定ではありません。'),overall:score(null,'全4項目が判定できる場合だけ算出。')};
 if([scores.style,scores.color,scores.fringe,scores.texture].every(s=>s.value!==null))scores.overall=score((scores.style.value!*REVIEW_WEIGHTS.style+scores.color.value!*REVIEW_WEIGHTS.color+scores.fringe.value!*REVIEW_WEIGHTS.fringe+scores.texture.value!*REVIEW_WEIGHTS.texture)/100,'STYLE40%・COLOR30%・顔周り20%・質感10%。未校正の参考重みです。');
 const improvements:string[]=[],education:ReviewPairResult['education']=[];
 if(!comparable)education.push({category:'撮影・照明の影響',cause:alignment.reason,check:'同じ方向・高さ・距離で撮影し、見えない方向は判定しないでください。'});
 if(de!==null&&de>3){const red=actual.lab!.a-target.lab!.a,yellow=actual.lab!.b-target.lab!.b;improvements.push('画像色差 ΔE76 '+de.toFixed(1)+'。'+(red>2?'赤みが強く見えます。':yellow>2?'黄みが強く見えます。':'色の見え方が異なります。')+'同じ照明で再確認してください。');education.push({category:'薬剤・配合バランス',cause:'画像だけでは薬剤処方や残留色素の原因を確定できません。',check:'撮影条件を統一し、施術履歴・実際の配合・毛髪状態を美容師が確認してください。'});}
 if(iou!==null&&iou<.9){improvements.push('髪の輪郭の重なり '+Math.round(iou*100)+'%。差分線でトップ・ハチ・毛先の見え方を確認してください。');education.push({category:'カット・セクション設計',cause:'輪郭差はカット、毛量、ブロー、姿勢の影響を受けます。原因は推定です。',check:'ライン差のある部分の長さ・ウエイト・セクションと、スタイリング条件を確認してください。'});}
 if(fringe!==null&&fringe<.9)improvements.push('前髪・顔周りの髪領域に差があります。同じ顔向きで長さ・分け目・ブロー方向を確認してください。');
 if(flowSimilarity!==null&&flowSimilarity<.9){improvements.push('毛流れの局所方向に差があります。矢印は180°の向きが曖昧な参考線です。ブロー方向を実際の毛束で確認してください。');education.push({category:'スタイリング技術',cause:'画像テクスチャ方向の違いを検出しました。毛根から毛先の向きは確定していません。',check:'顔周り・中間・毛先のブローとカール方向を確認してください。'});}
 if(target.clippedFraction>=.2||actual.clippedFraction>=.2)education.push({category:'撮影・照明の影響',cause:'暗部/明部のクリッピングが多く色は判定不可です。',check:'露出と光源を調整して撮り直してください。'});
 education.push({category:'モデルの髪質・コンディション',cause:'写真から触感や内部損傷を確定できません。',check:'乾湿状態、太さ、履歴、ダメージを実際の毛髪で確認してください。'});
 return {direction:actual.direction,comparable,reason:target.hairPixels<32||actual.hairPixels<32?'髪領域の解析が不足し、比較は判定不可です。':alignment.reason,transform:alignment.transform,targetPose:alignment.targetPose,actualPose:alignment.actualPose,targetContour:target.contour,actualContour:actual.contour,actualFlow:actual.flow,scores,metrics:{silhouetteIoU:iou,fringeIoU:fringe,deltaE76:de,lightnessDelta:de===null?null:actual.lab!.L-target.lab!.L,redDelta:de===null?null:actual.lab!.a-target.lab!.a,yellowDelta:de===null?null:actual.lab!.b-target.lab!.b,chromaDelta:de===null?null:Math.hypot(actual.lab!.a,actual.lab!.b)-Math.hypot(target.lab!.a,target.lab!.b),zoneDeltaE:target.zones.map((z,i)=>delta(z,actual.zones[i])),flowSimilarity,targetHairPixels:target.hairPixels,actualHairPixels:actual.hairPixels},improvements,education,method:REVIEW_METHOD,weights:REVIEW_WEIGHTS,calibrated:false};
}
