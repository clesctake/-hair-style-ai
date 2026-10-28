'use client';
import type {SupportRequest,SupportImageResult} from './after-support-types.ts';
import {cropComparison} from './image-comparison-client.ts';
import {dataUrlFile,imageSha256,SimulationTransportError} from './hair-simulation-client.ts';
export async function requestSupportComparison(requests:SupportRequest[],parent:string){
 if(requests.length!==3||await imageSha256(parent)!==requests[0].source.sha256)throw Error('確定デザインと3案を確認してください。');
 const form=new FormData();form.set('supportRequest',JSON.stringify(requests[0]));form.set('image',dataUrlFile(parent,'confirmed-final.png'));form.set('comparisonSpec',JSON.stringify({purpose:'SUPPORT',variants:requests}));
 let response:Response;try{response=await fetch('/api/compare-images',{method:'POST',body:form,signal:AbortSignal.timeout(300000)});}catch{throw new SimulationTransportError('生成待機が中断されました。生成・課金結果は不明です。','connection_error',true,true);}
 const value=await response.json() as SupportImageResult&{error?:string;providerAttempted?:boolean;outcomeUnknown?:boolean};if(!response.ok)throw new SimulationTransportError(value.error??'生成失敗','comparison_failed',value.outcomeUnknown??false,value.providerAttempted??true);
 if(value.requestId!==requests[0].requestId||value.jobId!==requests[0].jobId||value.generation?.origin!=='REAL_API')throw Error('比較画像の出所が一致しません。');
 const images=await cropComparison(value.image,3,value.requestId,value.generation.sha256);return images.map((image,i)=>({requestId:requests[i].requestId,jobId:requests[i].jobId,image:image.dataUrl,width:image.width,height:image.height,generation:{...value.generation,sha256:image.sha256,comparisonCrop:image.crop,...(i?{usage:null}:{})}}));
}
