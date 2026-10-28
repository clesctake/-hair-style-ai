'use client';
import {verifySinglePortrait} from './generated-image-quality.ts';
import type {SupportRequest,SupportImageResult} from './after-support-types.ts';
import {validateSupportRequest} from './after-support-validation.ts';
import {dataUrlFile,imageSha256,SimulationTransportError} from './hair-simulation-client.ts';
import {createVisionProvider} from './photo-analysis-provider.ts';
import {confidenceHairMask,protectedFaceMask} from './counseling-generation-protection.ts';
import {makeupRegionMask,supportColorComposite} from './after-support-protection.ts';
async function image(src:string){const img=new Image();img.src=src;await img.decode();return img;}
function canvasPixels(img:HTMLImageElement,width:number,height:number,fit=false){
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('画像を確認できません。');
 let sw=img.naturalWidth,sh=img.naturalHeight;if(fit){if(sw/sh>width/height)sw=sh*width/height;else sh=sw/(width/height);}
 ctx.drawImage(img,(img.naturalWidth-sw)/2,(img.naturalHeight-sh)/2,sw,sh,0,0,width,height);return {canvas,ctx,pixels:ctx.getImageData(0,0,width,height).data};
}
export async function protectSupportOutput(output:SupportImageResult,r:SupportRequest,parent:string):Promise<SupportImageResult&{width:number;height:number}>{
 const [source,edited]=await Promise.all([image(parent),image(output.image)]),scale=Math.min(1,1536/Math.max(source.naturalWidth,source.naturalHeight)),width=Math.round(source.naturalWidth*scale),height=Math.round(source.naturalHeight*scale),a=canvasPixels(source,width,height),b=canvasPixels(edited,width,height,true);
 const provider=await createVisionProvider();try{
  const prediction=await provider.predict(a.pixels,width,height,true);if(prediction.faces.length!==1)throw new Error('本人1人の顔を確認できませんでした。');
  let mask:Uint8Array;if(r.purpose==='MAKEUP')mask=makeupRegionMask(prediction.faces[0],width,height);else{mask=confidenceHairMask(prediction,width,height);const protectedFace=protectedFaceMask(prediction.faces[0],width,height);for(let i=0;i<mask.length;i++)if(protectedFace[i])mask[i]=0;}
  const pixels=supportColorComposite(a.pixels,b.pixels,mask,r.purpose==='MAKEUP'?'MAKEUP':'HAIR'),frame=a.ctx.createImageData(width,height);frame.data.set(pixels);a.ctx.putImageData(frame,0,0);const src=a.canvas.toDataURL('image/png');
  return {...output,image:src,width,height,generation:{...output.generation,providerOriginalSha256:output.generation.sha256,sha256:await imageSha256(src),postprocessing:{version:'support-local-color-only-v1',maskSource:'AI_ESTIMATE',geometryPreserved:true,unselectedPixelsPreserved:true}}};
 }finally{provider.close();}
}
export function supportImageClient(options:{fetcher?:typeof fetch;postprocess?:typeof protectSupportOutput}={}){
 return async(r:SupportRequest,parent:string):Promise<SupportImageResult&{width:number;height:number}>=>{
  validateSupportRequest(r);if(await imageSha256(parent)!==r.source.sha256)throw new SimulationTransportError('確定した元画像が一致しません。','invalid_parent',false,false);
  const form=new FormData();form.set('supportRequest',JSON.stringify(r));form.set('image',dataUrlFile(parent,'confirmed-final.png'));
  let response:Response;try{response=await (options.fetcher??fetch)('/api/after-support/generate',{method:'POST',body:form,signal:AbortSignal.timeout(300000)});}catch{throw new SimulationTransportError('生成待機が中断されました。生成・課金結果は不明です。','connection_error',true,true);}
  const output=await response.json() as SupportImageResult&{error?:string;code?:string;outcomeUnknown?:boolean;providerAttempted?:boolean};if(!response.ok)throw new SimulationTransportError(output.error??'実画像生成に接続できませんでした。',output.code,output.outcomeUnknown??false,output.providerAttempted??true);
  if(output.requestId!==r.requestId||output.jobId!==r.jobId||!['REAL_API','MOCK_TRANSPORT_FIXTURE'].includes(output.generation?.origin)||output.generation.seed!==null||!/^data:image\/png;base64,/.test(output.image)||await imageSha256(output.image)!==output.generation.sha256)throw new SimulationTransportError('生成結果の入力契約・画像を確認できませんでした。','invalid_output',false,true);
  try{if(options.postprocess)return await options.postprocess(output,r,parent);await verifySinglePortrait(output.image);const result=await image(output.image);return {...output,width:result.naturalWidth,height:result.naturalHeight};}catch(e){throw new SimulationTransportError(e instanceof Error?e.message:'変更範囲を確認できませんでした。','local_protection_failed',false,true);}
 };
}

