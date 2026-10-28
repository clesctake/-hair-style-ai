'use client';
import {sharedPortraitVerifier} from './generated-image-quality.ts';
import {comparisonRegions,type ComparisonCrop} from './image-comparison.ts';
import {imageSha256,simulationFormData,SimulationTransportError} from './hair-simulation-client.ts';
import type {SimulationRequest,SimulationSnapshot,SimulationResponse} from './hair-simulation-types.ts';
/** Split only at native integer cell boundaries, never resize or color-correct a generated result. */
export async function cropComparison(image:string,count:3|5,sharedRequestId:string,sourceSha256:string){
 if(await imageSha256(image)!==sourceSha256)throw Error('比較画像のbytesを確認できません。');const img=new Image();img.src=image;await img.decode();
 const expected=count===5?[2304,2048]:[1536,2048];if(img.naturalWidth!==expected[0]||img.naturalHeight!==expected[1])throw Error('比較画像の実寸が指定グリッドに一致しません。勝手に縮小・切り出しせず再確認してください。');
 const regions=comparisonRegions(count,img.naturalWidth,img.naturalHeight),images=[],verifier=sharedPortraitVerifier();try{
 for(let i=0;i<count;i++){const r=regions[i],canvas=document.createElement('canvas');canvas.width=r.width;canvas.height=r.height;const ctx=canvas.getContext('2d');if(!ctx)throw Error('比較画像を切り出せません。');ctx.drawImage(img,r.x,r.y,r.width,r.height,0,0,r.width,r.height);const dataUrl=canvas.toDataURL('image/png');const portraitStatus=await verifier.check(dataUrl);images.push({dataUrl,width:r.width,height:r.height,portraitVerification:portraitStatus,sha256:await imageSha256(dataUrl),crop:{version:'comparison-crop-v1',sharedRequestId,sourceSha256,sourceWidth:img.naturalWidth,sourceHeight:img.naturalHeight,...r,label:String.fromCharCode(65+i)} satisfies ComparisonCrop});canvas.width=canvas.height=0;}
 return images;}finally{verifier.close();}
}
export async function requestBangComparison(r:SimulationRequest,snapshot:SimulationSnapshot,variants:unknown[],signal?:AbortSignal){
 const form=simulationFormData(r,snapshot,null);form.set('comparisonSpec',JSON.stringify({purpose:'BANGS',variants}));
 let response:Response;try{response=await fetch('/api/compare-images',{method:'POST',body:form,signal:signal??AbortSignal.timeout(300000)});}catch{throw new SimulationTransportError('比較生成の接続が中断されました。生成・課金結果は不明です。','connection_error',true,true);}
 const value=await response.json() as SimulationResponse&{error?:string;providerAttempted?:boolean;outcomeUnknown?:boolean};if(!response.ok)throw new SimulationTransportError(value.error??'比較生成失敗',response.status===401?'unauthenticated':'comparison_failed',value.outcomeUnknown??false,value.providerAttempted??true);
 if(value.requestId!==r.requestId||value.jobId!==r.jobId||value.generation?.origin!=='REAL_API')throw Error('比較画像の入力・出所が一致しません。');
 return {result:value,images:await cropComparison(value.image,5,r.requestId,value.generation.sha256)};
}
