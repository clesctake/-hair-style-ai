import {createHash} from 'node:crypto';
import type {SimulationRequest,SimulationResponse,SimulationOrigin} from './hair-simulation-types.ts';
import {validateSimulationRequest} from './hair-simulation-validation.ts';
import {simulationInstructions,SIMULATION_PROMPT_VERSION} from './hair-simulation-instructions.ts';
export const MAX_SIMULATION_IMAGE_BYTES=20*1024*1024;
export const MAX_SIMULATION_TOTAL_BYTES=65*1024*1024;
const pngMagic=[137,80,78,71,13,10,26,10];
const cache=new Map<string,{signature:string;time:number;promise:Promise<Response>}>();
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
export function clearSimulationRequestCache(){cache.clear();}
export function simulationConnection(){return {configured:Boolean(process.env.OPENAI_API_KEY),model:process.env.OPENAI_IMAGE_MODEL||'gpt-image-2',contract:'hair-simulation-request-v1',featureState:'PARTIAL',realGenerationVerified:false};}
export type ApiTestOptions={providerFetch?:typeof fetch;origin?:SimulationOrigin};
async function photo(value:FormDataEntryValue|null,name:string){
 if(!(value instanceof File)||!value.size||value.size>MAX_SIMULATION_IMAGE_BYTES||!['image/jpeg','image/png','image/webp'].includes(value.type))throw new Error(`${name}は20MB以下のJPEG・PNG・WebPを使用してください。元画像を無断縮小しません。`);
 const bytes=new Uint8Array(await value.arrayBuffer());
 const valid=value.type==='image/png'?pngMagic.every((v,i)=>bytes[i]===v):value.type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP';
 if(!valid)throw new Error(`${name}の画像形式が一致しません。`);
 return {file:value,sha256:hash(bytes)};
}
export async function handleSimulationGenerate(request:Request,form:FormData,options:ApiTestOptions={}):Promise<Response>{
 if(!process.env.OPENAI_API_KEY)return json({code:'not_configured',error:'画像生成の接続設定が必要です。',providerAttempted:false},503);
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({code:'invalid_origin',error:'この画面から生成してください。',providerAttempted:false},403);
 let r:SimulationRequest,images:{role:string;file:File;sha256:string}[]=[];
 try{
  const raw=form.get('generationRequest');if(typeof raw!=='string'||raw.length>2_000_000)throw new Error('正式な生成契約を確認してください。');r=JSON.parse(raw);validateSimulationRequest(r);
  const roles=[['image','CURRENT',true],['parentImage','MAIN',r.parentMode==='IMAGE_EDIT'],['styleReferenceImage','STYLE',Boolean(r.contract.styleTarget?.referenceImage)],['colorReferenceImage','COLOR',Boolean(r.contract.effectiveColorReference)]] as const;
  if(form.has('referenceImage')||form.has('mode'))throw new Error('旧形式と正式契約を混ぜないでください。');
  for(const [field,role,needed] of roles){if(form.getAll(field).length!==(needed?1:0))throw new Error('画像の役割・枚数が一致しません。');if(needed){const image=await photo(form.get(field),role);images.push({role,...image});}}
  if(images.reduce((n,i)=>n+i.file.size,0)>MAX_SIMULATION_TOTAL_BYTES)throw new Error('元画像の合計は65MBまでです。');
  if(r.parentMode==='IMAGE_EDIT'&&images.find(i=>i.role==='MAIN')?.sha256!==r.parentAsset?.sha256)throw new Error('保存したMAIN親画像のbytesが一致しません。');
 }catch(e){return json({code:'invalid_contract',error:e instanceof Error?e.message:'生成入力を確認してください。',providerAttempted:false},400);}
 const key=`${r.parentSessionId}:${r.requestId}`,signature=JSON.stringify({r,images:images.map(i=>({role:i.role,hash:i.sha256}))});
 const time=Date.now();for(const [k,v] of cache)if(time-v.time>600_000)cache.delete(k);
 const existing=cache.get(key);if(existing){if(existing.signature!==signature)return json({code:'request_conflict',error:'同じrequestIdで入力を変更できません。',providerAttempted:false},409);return (await existing.promise).clone();}
 if(cache.size>=12){const oldest=[...cache.entries()].sort((a,b)=>a[1].time-b[1].time)[0];cache.delete(oldest[0]);}
 const promise=(async()=>{
  const payload=new FormData();payload.set('model',process.env.OPENAI_IMAGE_MODEL||'gpt-image-2');payload.set('quality','medium');payload.set('size','1024x1536');payload.set('output_format','png');payload.set('n','1');payload.set('prompt',simulationInstructions(r));
  for(const i of images)payload.append('image[]',i.file,`${i.role.toLowerCase()}.${i.file.type==='image/jpeg'?'jpg':i.file.type==='image/png'?'png':'webp'}`);
  try{
   const provider=await (options.providerFetch??fetch)('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:payload,signal:AbortSignal.timeout(285000)});
   const data=await provider.json();if(!provider.ok)return json({code:provider.status===429?'provider_limit':'provider_error',error:provider.status===429?'生成が混み合っているか利用上限に達しました。':'画像生成APIの利用権限・モデル設定・写真を確認してください。',providerAttempted:true},provider.status===429?429:502);
   const b64=data?.data?.[0]?.b64_json;if(typeof b64!=='string'||!b64||b64.length>24_000_000||!/^[A-Za-z0-9+/]+={0,2}$/.test(b64))return json({code:'invalid_output',error:'生成画像を取得できませんでした。',providerAttempted:true},502);
   const bytes=Buffer.from(b64,'base64');if(!pngMagic.every((v,i)=>bytes[i]===v))return json({code:'invalid_output',error:'生成画像がPNGではありません。',providerAttempted:true},502);
   const response:SimulationResponse={requestId:r.requestId,jobId:r.jobId,designId:r.designId,parentGenerationId:r.parentGenerationId,parentMode:r.parentMode,image:`data:image/png;base64,${b64}`,generation:{origin:options.origin??'REAL_API',provider:'OPENAI_IMAGES_EDIT',model:process.env.OPENAI_IMAGE_MODEL||'gpt-image-2',promptVersion:SIMULATION_PROMPT_VERSION,providerRequestId:provider.headers.get('x-request-id'),generatedAt:new Date().toISOString(),sha256:hash(bytes),usage:data.usage??null,seed:null,providerAttempted:true}};
   return json(response);
  }catch(e){const timeout=e instanceof Error&&['AbortError','TimeoutError'].includes(e.name);return json({code:timeout?'timeout':'connection_error',error:timeout?'生成の待ち時間を超えました。生成・課金結果は不明です。':'画像生成APIへの接続が中断されました。生成・課金結果は不明です。',providerAttempted:true,outcomeUnknown:true},timeout?504:502);}
 })();cache.set(key,{signature,time,promise});return (await promise).clone();
}
