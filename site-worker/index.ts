import {handleImageComparison} from '../src/lib/image-comparison-api.ts';
import {handlePhotoDirections} from '../src/lib/photo-direction-api.ts';
import {handleSimulationGenerate,simulationConnection,MAX_SIMULATION_TOTAL_BYTES} from '../src/lib/hair-simulation-api.ts';
import {handleProDesignAssist} from '../src/lib/pro-design-assist.ts';
import {handleSupportGenerate} from '../src/lib/after-support-api.ts';
import {handleSupportPlan} from '../src/lib/after-support-plan.ts';
import {handleReviewFeedback} from '../src/lib/after-review-feedback.ts';
import {auditProviderAuthentication} from '../src/lib/provider-auth-audit.ts';
type SiteEnv={OPENAI_API_KEY?:string;OPENAI_IMAGE_MODEL?:string;OPENAI_TEXT_MODEL?:string;ASSETS?:{fetch:(request:Request)=>Promise<Response>}};
/** The private Site dispatcher supplies the user header. Never accept a browser-supplied key. */
export default {async fetch(request:Request,env:SiteEnv):Promise<Response>{
 const pathname=new URL(request.url).pathname;
 if(pathname==='/diagnostics/provider-auth'){
  if(!request.headers.get('oai-authenticated-user-id'))return Response.json({code:'unauthenticated'},{status:401});
  if(request.method!=='GET')return new Response('Method not allowed',{status:405});
  const audit=await auditProviderAuthentication(env.OPENAI_API_KEY,fetch,!new URL(request.url).searchParams.has('format_only'));
  return new Response('<!doctype html><meta charset="utf-8"><title>v22 サーバー認証診断</title><main><h1>v22 サーバー認証診断</h1><p>Secret値は取得・表示しません。モデル一覧の読み取りによる認証確認です。画像生成は行いません。</p><pre>'+JSON.stringify(audit,null,2)+'</pre></main>',{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"}});
 }
 if(pathname==='/api/auth'){
  if(request.method!=='GET')return Response.json({error:'GETで確認してください。'}, {status:405});
  return Response.json({authenticated:Boolean(request.headers.get('oai-authenticated-user-id'))},{headers:{'Cache-Control':'no-store'}});
 }
 if(pathname==='/api/photos/directions'||pathname==='/api/compare-images'){
  if(!request.headers.get('oai-authenticated-user-id'))return Response.json({code:'unauthenticated',error:'ChatGPTでログインして操作してください。',providerAttempted:false},{status:401});
  if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'この画面から操作してください。',providerAttempted:false},{status:403});
  if(pathname==='/api/compare-images')return handleImageComparison(request,{apiKey:env.OPENAI_API_KEY,model:env.OPENAI_IMAGE_MODEL});
  return handlePhotoDirections(request,{apiKey:env.OPENAI_API_KEY,model:env.OPENAI_TEXT_MODEL});
 }
 if(pathname==='/api/after-review/feedback')return handleReviewFeedback(request,{apiKey:env.OPENAI_API_KEY,model:env.OPENAI_TEXT_MODEL});
 if(pathname==='/api/after-support/generate'||pathname==='/api/after-support/plan'){
  if(request.method==='POST'&&!request.headers.get('oai-authenticated-user-id'))return Response.json({code:'unauthenticated',error:'ログインしてから操作してください。',providerAttempted:false},{status:401});
  return pathname.endsWith('/generate')?handleSupportGenerate(request,{apiKey:env.OPENAI_API_KEY,model:env.OPENAI_IMAGE_MODEL}):handleSupportPlan(request,{apiKey:env.OPENAI_API_KEY,model:env.OPENAI_TEXT_MODEL});
 }
 if(pathname==='/api/pro-design/assist'){
  if(request.method==='POST'){
   if(!request.headers.get('oai-authenticated-user-id'))return Response.json({code:'unauthenticated',error:'ログインしてから操作してください。',providerAttempted:false},{status:401});
   const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return Response.json({code:'invalid_origin',error:'この画面から操作してください。',providerAttempted:false},{status:403});
  }
  return handleProDesignAssist(request,{apiKey:env.OPENAI_API_KEY,model:env.OPENAI_TEXT_MODEL});
 }
 if(pathname!=='/api/generate'){
  if(!env.ASSETS)return new Response('Not found',{status:404});
  if(pathname==='/fiole/pro-design'||pathname==='/fiole/counseling-page1'||pathname==='/fiole/after-support'||pathname==='/fiole/after-review'){const url=new URL(request.url);url.pathname='/';return env.ASSETS.fetch(new Request(url,request));}
  return env.ASSETS.fetch(request);
 }
 const runtime={apiKey:env.OPENAI_API_KEY,model:env.OPENAI_IMAGE_MODEL};
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 if(request.method==='GET')return reply(simulationConnection(runtime));
 if(request.method!=='POST')return reply({error:'この操作はPOSTで行ってください。'},405);
 if(!request.headers.get('oai-authenticated-user-id'))return reply({code:'unauthenticated',error:'ログインしてから生成してください。',providerAttempted:false},401);
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return reply({code:'invalid_origin',error:'この画面から生成してください。',providerAttempted:false},403);
 if(!runtime.apiKey)return reply({code:'not_configured',error:'APIキーが未設定のため、実画像を生成できません。',providerAttempted:false},503);
 if(Number(request.headers.get('content-length')??0)>MAX_SIMULATION_TOTAL_BYTES+2*1024*1024)return reply({code:'too_large',error:'元画像の合計は65MBまでです。',providerAttempted:false},413);
 try{return await handleSimulationGenerate(request,await request.formData(),{runtime});}catch{return reply({code:'invalid_body',error:'生成用の写真を確認してください。',providerAttempted:false},400);}
}};
