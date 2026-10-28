import type {Photo} from './journey.ts';
import type {PhotoVisionProvider} from './photo-analysis-provider.ts';
import {resampleConfidence} from './photo-analysis-pipeline.ts';
import {observeReviewPhoto,type ReviewDirection} from './after-review-analysis.ts';

/** Memory-only upload; no IndexedDB, localStorage, server upload, or Journey write. */
export async function readReviewPhoto(file:File,direction:ReviewDirection):Promise<Photo>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size===0||file.size>20*1024*1024)throw new Error('20MB以下のJPEG・PNG・WebPを選択してください。');
 const dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('写真を読み込めませんでした。'));reader.readAsDataURL(file);});
 const image=new Image();image.src=dataUrl;await image.decode();const width=image.naturalWidth,height=image.naturalHeight;image.src='';
 if(!width||!height||width*height>80_000_000)throw new Error('80MP以下の写真を選択してください。');
 return {id:'review-photo:'+crypto.randomUUID(),view:direction==='SIDE'?'side':direction.toLowerCase() as 'front'|'back',name:'temporary-review-photo',dataUrl,width,height,createdAt:new Date().toISOString()};
}
export async function analyzeReviewPhoto(photo:Photo,direction:ReviewDirection,provider:PhotoVisionProvider){
 const image=new Image();image.src=photo.original?.dataUrl??photo.dataUrl;await image.decode();const scale=Math.min(1,768/Math.max(image.naturalWidth,image.naturalHeight));
 const canvas=document.createElement('canvas');canvas.width=Math.max(8,Math.round(image.naturalWidth*scale));canvas.height=Math.max(8,Math.round(image.naturalHeight*scale));
 try{const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw new Error('写真を展開できませんでした。');context.drawImage(image,0,0,canvas.width,canvas.height);const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
  const prediction=await provider.predict(pixels,canvas.width,canvas.height,direction!=='BACK');
  if(prediction.faces.length>1)throw new Error('複数の顔が写っています。同じ一人の写真で比較してください。');
  if(!prediction.hairConfidence||!prediction.maskWidth||!prediction.maskHeight)throw new Error('髪領域を取得できませんでした。固定線や点数で補完しません。'+(prediction.errors.length?' 解析モデル：'+prediction.errors.join('／'):''));
  const {mask}=resampleConfidence(prediction.hairConfidence,prediction.maskWidth,prediction.maskHeight,canvas.width,canvas.height);
  return observeReviewPhoto(direction,pixels,canvas.width,canvas.height,mask,prediction.faces.length===1?prediction.faces[0]:[],prediction.errors);
 }finally{canvas.width=canvas.height=1;image.src='';}
}
