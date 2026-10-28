'use client';
import {createVisionProvider,type PhotoVisionProvider} from './photo-analysis-provider.ts';
import {SimulationTransportError} from './hair-simulation-client.ts';
export function assertSinglePortrait(faceCount:number){if(faceCount!==1)throw new SimulationTransportError(faceCount>1?'単独の人物画像を要求しましたが、複数の顔が含まれています。比較画像を完成案として採用しません。':'生成画像で1人の顔を確認できません。画像は未確認として扱います。','portrait_validation_failed',false,true);}
/** Analysis canvas is temporary; the returned full-resolution PNG is never modified. */
export async function verifySinglePortrait(image:string,shared?:PhotoVisionProvider){const img=new Image();img.src=image;await img.decode();const scale=Math.min(1,768/Math.max(img.naturalWidth,img.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new SimulationTransportError('画像確認を開始できません。','portrait_validation_failed',false,true);ctx.drawImage(img,0,0,canvas.width,canvas.height);const provider=shared??await createVisionProvider();try{const result=await provider.predict(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height,true);assertSinglePortrait(result.faces.length);}finally{if(!shared)provider.close();canvas.width=canvas.height=0;}}

/** Missing device capability must not discard a completed paid API image. */
export async function portraitVerification(image:string,verify:(image:string)=>Promise<void>=verifySinglePortrait):Promise<'PASSED'|'UNAVAILABLE'>{
 try{await verify(image);return 'PASSED';}catch(error){
  if(error instanceof Error&&error.message.includes('WebGL 2'))return 'UNAVAILABLE';
  throw error;
 }
}

/** Include provider initialization in the unavailable-capability boundary. */
export function sharedPortraitVerifier(create:()=>Promise<PhotoVisionProvider>=createVisionProvider,verify:typeof verifySinglePortrait=verifySinglePortrait){
 let pending:Promise<PhotoVisionProvider>|undefined,provider:PhotoVisionProvider|undefined;
 return {
  check:(image:string)=>portraitVerification(image,async value=>{
   pending??=create().then(result=>{provider=result;return result;});
   await verify(value,await pending);
  }),
  close:()=>provider?.close(),
 };
}
