import type {LandmarkPoint} from '@/lib/photo-analysis-types';

/** SVG and image use the same intrinsic aspect ratio and normalized view box. */
export default function CounselingFaceOverlay({points,width,height,ratio}:{points:LandmarkPoint[];width:number;height:number;ratio:number|null}){
 if(![10,152,234,454,33,263,1,13,70,300].every(i=>points[i]))return null;
 const p=(i:number)=>({x:points[i].x*1000,y:points[i].y*1000*height/width});
 const top=p(10),chin=p(152),left=p(234),right=p(454),rows=[(p(70).y+p(300).y)/2,(p(33).y+p(263).y)/2,p(1).y,p(13).y,chin.y];
 const oval=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109].filter(i=>points[i]).map(i=>p(i));
 return <svg className="cf-face-guides" viewBox={`0 0 1000 ${1000*height/width}`} preserveAspectRatio="xMidYMid meet" data-coordinate-space="NORMALIZED_IMAGE_2D" aria-label="画像上の顔ランドマーク推定ガイド"><g fill="none" stroke="white" strokeWidth="3" opacity=".82"><path d={`M${top.x},${top.y} L${chin.x},${chin.y}`}/><path d={`M${left.x},${left.y} L${right.x},${right.y}`}/><path d={'M'+oval.map(v=>`${v.x},${v.y}`).join(' L')+' Z'}/>{rows.map((y,i)=><path key={i} strokeDasharray="8 5" d={`M${left.x},${y} H${right.x}`}/>)}</g><g fill="white">{[10,152,234,454,33,263,1,13].map(i=><circle key={i} cx={p(i).x} cy={p(i).y} r="6"/>)}</g>{ratio!==null&&<text x="500" y={Math.min(1000*height/width-30,chin.y+65)} fill="white" fontSize="45" textAnchor="middle">縦横比 1 : {ratio.toFixed(2)}</text>}</svg>;
}
