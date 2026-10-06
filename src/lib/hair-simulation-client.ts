import type {SimulationRequest,SimulationSnapshot,SimulationAsset,SimulationResponse,SimulationTransport} from './hair-simulation-types.ts';
import {validateSimulationRequest} from './hair-simulation-validation.ts';
export class SimulationTransportError extends Error {code:string;outcomeUnknown:boolean;providerAttempted:boolean;constructor(message:string,code='transport_error',outcomeUnknown=false,providerAttempted=true){super(message);this.code=code;this.outcomeUnknown=outcomeUnknown;this.providerAttempted=providerAttempted;}}
export function dataUrlFile(dataUrl:string,name:string):File {const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);if(!match)throw new SimulationTransportError('生成用画像は無加工のJPEG・PNG・WebPで保存してください。','invalid_image',false,false);const bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0));return new File([bytes],name,{type:match[1]});}
export async function imageSha256(dataUrl:string){const bytes=await dataUrlFile(dataUrl,'image').arrayBuffer();return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
export function simulationFormData(r:SimulationRequest,snapshot:SimulationSnapshot,parent:SimulationAsset|null):FormData {
 validateSimulationRequest(r);const form=new FormData();form.set('generationRequest',JSON.stringify(r));
 const add=(field:string,imageId:string)=>{const image=snapshot.photos[imageId];if(!image)throw new SimulationTransportError('生成時点の元画像がありません。','missing_image',false,false);if(field==='image'&&!['original_file_bytes','browser_video_frame_jpeg'].includes(image.representation))throw new SimulationTransportError('縮小画像を本人元画像として使用できません。','missing_original',false,false);form.set(field,dataUrlFile(image.dataUrl,field));};
 add('image',r.contract.currentPhoto.imageId);
 if(r.parentMode==='IMAGE_EDIT'){if(!parent||parent.id!==r.parentAsset?.imageId||parent.sha256!==r.parentAsset.sha256)throw new SimulationTransportError('保存したMAIN親画像が一致しません。','invalid_parent',false,false);form.set('parentImage',dataUrlFile(parent.dataUrl,'main-parent.png'));}
 if(r.contract.styleTarget?.referenceImage)add('styleReferenceImage',r.contract.styleTarget.referenceImage.imageId);
 if(r.contract.effectiveColorReference)add('colorReferenceImage',r.contract.effectiveColorReference.imageId);
 return form;
}
export function decodeSimulationImage(src:string):Promise<{width:number;height:number}>{return new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve({width:i.naturalWidth,height:i.naturalHeight});i.onerror=()=>reject(new SimulationTransportError('生成画像を表示できません。','invalid_output'));i.src=src;});}
export function simulationClient(options:{fetcher?:typeof fetch;decoder?:(src:string)=>Promise<{width:number;height:number}>}={}):SimulationTransport {
 return async(r,snapshot,parent,signal)=>{
  const form=simulationFormData(r,snapshot,parent);let response:Response;
  try{response=await (options.fetcher??fetch)('/api/generate',{method:'POST',body:form,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(300000)]):AbortSignal.timeout(300000)});}catch{throw new SimulationTransportError('生成待機が中断されました。生成・課金結果は不明です。','connection_error',true,true);}
  const result=await response.json();if(!response.ok)throw new SimulationTransportError(result.error??'画像生成を完了できませんでした。',result.code,result.outcomeUnknown??false,result.providerAttempted??true);
  const output=result as SimulationResponse;if(output.requestId!==r.requestId||output.jobId!==r.jobId||output.designId!==r.designId||output.parentGenerationId!==r.parentGenerationId||output.parentMode!==r.parentMode||!['REAL_API','MOCK_TRANSPORT_FIXTURE'].includes(output.generation?.origin)||output.generation.seed!==null)throw new SimulationTransportError('生成応答が入力契約と一致しません。','invalid_response');
  if(await imageSha256(output.image)!==output.generation.sha256)throw new SimulationTransportError('生成画像のbytesが一致しません。','invalid_output');
  return {...output,...await (options.decoder??decodeSimulationImage)(output.image)};
 };
}
