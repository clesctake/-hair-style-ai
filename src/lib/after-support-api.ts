import type {SupportRequest,SupportImageResult} from './after-support-types.ts';
import {validateSupportRequest} from './after-support-validation.ts';
import {readSimulationPhoto,simulationImageHash,MAX_SIMULATION_IMAGE_BYTES as MAX_SIMULATION_PHOTO_BYTES} from './hair-simulation-api.ts';
import {supportInstructions,SUPPORT_PROMPT_VERSION} from './after-support-instructions.ts';
export type SupportRuntime={apiKey?:string;model?:string};
export function supportConnection(env:SupportRuntime){return {configured:Boolean(env.apiKey),model:env.model||'gpt-image-2',contract:'after-support-request-v1',featureState:'PARTIAL',realGenerationVerified:false};}
const cache=new Map<string,{signature:string;time:number;pending:boolean;promise:Promise<Response>}>();
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
export async function handleSupportGenerate(request:Request,env:SupportRuntime,options:{fetcher?:typeof fetch;origin?:'REAL_API'|'MOCK_TRANSPORT_FIXTURE';requestContext?:unknown}={}):Promise<Response>{
 if(request.method==='GET')return json(supportConnection(env));
 if(request.method!=='POST')return json({code:'method_not_allowed',error:'POSTで操作してください。',providerAttempted:false},405);
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({code:'invalid_origin',error:'この画面から生成してください。',providerAttempted:false},403);
 if(!env.apiKey)return json({code:'not_configured',error:'APIキー未設定のため実画像生成はできません。確定済みの画像とデータは保持しています。',providerAttempted:false},503);
 const length=Number(request.headers.get('content-length')||0);if(length>MAX_SIMULATION_PHOTO_BYTES+100_000)return json({code:'too_large',error:'元画像は20MBまでです。',providerAttempted:false},413);
 let r:SupportRequest,image:Awaited<ReturnType<typeof readSimulationPhoto>>;
 try{
  const form=await request.formData(),raw=form.get('supportRequest');
  if(typeof raw!=='string'||raw.length>50_000||form.getAll('supportRequest').length!==1||form.getAll('image').length!==1||[...form.keys()].some(k=>!['supportRequest','image'].includes(k)))throw new Error('確定デザイン1枚と正式な入力を確認してください。');
  r=JSON.parse(raw);validateSupportRequest(r);image=await readSimulationPhoto(form.get('image'),'CONFIRMED_FINAL');
  if(image.sha256!==r.source.sha256)throw new Error('確定済み最終デザインの元画像が一致しません。');
 }catch(e){return json({code:'invalid_request',error:e instanceof Error?e.message:'生成入力を確認してください。',providerAttempted:false},400);}
 const key=r.source.sessionId+':'+r.requestId,signature=JSON.stringify({context:options.requestContext,r,hash:image.sha256}),time=Date.now();
 for(const [id,v] of cache)if(!v.pending&&time-v.time>600_000)cache.delete(id);
 const prior=cache.get(key);if(prior){if(prior.signature!==signature)return json({code:'request_conflict',error:'同じリクエストの条件は変更できません。',providerAttempted:false},409);return (await prior.promise).clone();}
 if(cache.size>=12){const old=[...cache.entries()].filter(([,v])=>!v.pending).sort((a,b)=>a[1].time-b[1].time)[0];if(old)cache.delete(old[0]);else return json({code:'busy',error:'生成中です。完了してから操作してください。',providerAttempted:false},429);}
 const entry={signature,time,pending:true,promise:Promise.resolve(new Response())};
 entry.promise=(async()=>{
  const payload=new FormData();payload.set('model',env.model||'gpt-image-2');payload.set('quality','medium');payload.set('size','1024x1536');payload.set('output_format','png');payload.set('n','1');payload.set('prompt',supportInstructions(r));payload.append('image[]',image.file,'confirmed-final.'+(image.file.type==='image/jpeg'?'jpg':image.file.type==='image/png'?'png':'webp'));
  try{
   const response=await (options.fetcher??fetch)('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:'Bearer '+env.apiKey},body:payload,signal:AbortSignal.timeout(285000)});
   if(!response.ok)return json({code:response.status===429?'provider_limit':'provider_error',error:response.status===429?'生成の利用上限または混雑を確認してください。':'画像生成APIの利用権限・モデル設定を確認してください。',providerAttempted:true},response.status===429?429:502);
   const data=await response.json(),b64=data?.data?.[0]?.b64_json;
   if(typeof b64!=='string'||!b64||b64.length>24_000_000||!/^[A-Za-z0-9+/]+={0,2}$/.test(b64))return json({code:'invalid_output',error:'生成画像を取得できませんでした。',providerAttempted:true},502);
   const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));if(![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return json({code:'invalid_output',error:'生成画像がPNGではありません。',providerAttempted:true},502);
   const output:SupportImageResult={requestId:r.requestId,jobId:r.jobId,image:'data:image/png;base64,'+b64,generation:{origin:options.origin??'REAL_API',provider:'OPENAI_IMAGES_EDIT',model:env.model||'gpt-image-2',providerRequestId:response.headers.get('x-request-id'),generatedAt:new Date().toISOString(),sha256:await simulationImageHash(bytes),seed:null,promptVersion:SUPPORT_PROMPT_VERSION,providerAttempted:true,usage:data.usage??null}};
   return json(output);
  }catch(e){const timeout=e instanceof Error&&['TimeoutError','AbortError'].includes(e.name);return json({code:timeout?'timeout':'connection_error',error:'生成の待機が中断されました。生成・課金結果は不明です。',providerAttempted:true,outcomeUnknown:true},timeout?504:502);}finally{entry.pending=false;}
 })();cache.set(key,entry);return (await entry.promise).clone();
}

