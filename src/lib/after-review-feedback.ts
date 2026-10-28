import type {ReviewPairResult} from './after-review-analysis.ts';
export type ReviewFeedbackInput={results:{direction:'FRONT'|'SIDE'|'BACK';scores:{style:number|null;color:number|null;fringe:number|null;texture:number|null;overall:number|null};metrics:ReviewPairResult['metrics']}[]};
export type ReviewFeedback={source:'AI_ESTIMATE';model:string;providerRequestId:string|null;improvements:string[];education:{category:string;cause:string;check:string}[]};
export function reviewFeedbackInput(results:ReviewPairResult[]):ReviewFeedbackInput{
 return {results:results.map(result=>({direction:result.direction,scores:Object.fromEntries(Object.entries(result.scores).map(([key,value])=>[key,value.value])) as ReviewFeedbackInput['results'][number]['scores'],metrics:structuredClone(result.metrics)}))};
}
export function validateReviewFeedbackInput(value:unknown):asserts value is ReviewFeedbackInput{
 const input=value as ReviewFeedbackInput;if(!input||Object.keys(input).join()!=='results'||!Array.isArray(input.results)||!input.results.length||input.results.length>3)throw new Error('解析結果を確認してください。');
 const metrics=['silhouetteIoU','fringeIoU','deltaE76','lightnessDelta','redDelta','yellowDelta','chromaDelta','zoneDeltaE','flowSimilarity','targetHairPixels','actualHairPixels'];
 for(const result of input.results){
  if(!result||Object.keys(result).sort().join()!=='direction,metrics,scores'||!['FRONT','SIDE','BACK'].includes(result.direction)||!result.scores||!result.metrics)throw new Error('数値だけの解析結果を使用してください。');
  if(Object.keys(result.scores).sort().join()!=='color,fringe,overall,style,texture'||Object.values(result.scores).some(v=>v!==null&&(typeof v!=='number'||!Number.isFinite(v)||v<0||v>100)))throw new Error('スコアが不正です。');
  if(Object.keys(result.metrics).some(key=>!metrics.includes(key))||metrics.some(key=>!(key in result.metrics)))throw new Error('数値の項目が不正です。');
  for(const [key,value]of Object.entries(result.metrics)){
   if(key==='zoneDeltaE'){if(!Array.isArray(value)||value.length!==3||value.some(v=>v!==null&&(typeof v!=='number'||!Number.isFinite(v)||v<0||v>300)))throw new Error('色差が不正です。');}
   else if(value!==null&&(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>1_000_000))throw new Error('解析数値が不正です。');
  }
 }
 if(new Set(input.results.map(r=>r.direction)).size!==input.results.length)throw new Error('方向が重複しています。');
}
const categories=['撮影・照明の影響','薬剤・配合バランス','カット・セクション設計','スタイリング技術','モデルの髪質・コンディション'];
const referenceText=(value:unknown,limit:number)=>typeof value==='string'&&value.length>0&&value.length<=limit&&!/(必ず|確実|\d+(?:\.\d+)?\s*(?:%|％|cm|センチ|グラム))/i.test(value);
export function validReviewFeedback(value:unknown):value is Pick<ReviewFeedback,'improvements'|'education'>{
 const v=value as ReviewFeedback;return Boolean(v&&Object.keys(v).sort().join()==='education,improvements'&&Array.isArray(v.improvements)&&v.improvements.length<=4&&v.improvements.every(s=>referenceText(s,300))&&Array.isArray(v.education)&&v.education.length<=5&&v.education.every(x=>x&&Object.keys(x).sort().join()==='category,cause,check'&&categories.includes(x.category)&&[x.cause,x.check].every(s=>referenceText(s,400))));
}
export async function handleReviewFeedback(request:Request,env:{apiKey?:string;model?:string},fetcher:typeof fetch=fetch):Promise<Response>{
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
 if(request.method==='GET')return reply({configured:Boolean(env.apiKey),model:env.model||'gpt-4.1-mini',featureState:'PARTIAL',imageProcessing:'BROWSER_LOCAL',photosSentToFeedbackAPI:false});
 if(request.method!=='POST')return reply({code:'method_not_allowed'},405);
 if(!request.headers.get('oai-authenticated-user-id'))return reply({code:'unauthenticated',error:'ログインしてから操作してください。'},401);
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return reply({code:'invalid_origin'},403);
 if(!env.apiKey)return reply({code:'not_configured',error:'APIキー未設定。端末内の解析結果は保持しています。',providerAttempted:false},503);
 let input:ReviewFeedbackInput;try{const text=await request.text();if(text.length>12000)throw new Error('large');const data:unknown=JSON.parse(text);validateReviewFeedbackInput(data);input=data;}catch{return reply({code:'invalid_input',error:'個人情報・写真を含まない解析数値を確認してください。',providerAttempted:false},400);}
 const schema={type:'object',properties:{improvements:{type:'array',items:{type:'string'}},education:{type:'array',items:{type:'object',properties:{category:{type:'string',enum:categories},cause:{type:'string'},check:{type:'string'}},required:['category','cause','check'],additionalProperties:false}}},required:['improvements','education'],additionalProperties:false};
 try{
  const response=await fetcher('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+env.apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:env.model||'gpt-4.1-mini',store:false,messages:[{role:'system',content:'美容師教育用。入力は匿名の未校正画像解析数値です。AI参考スコアは実証済み精度ではありません。nullを判定しない。数値の差に対応する具体的な改善だけ提案。差がないとき改善を無理に作らない。薬剤配合・カット・髪質の原因は推定と確認事項を分け、具体的な薬剤量・配合率・医学的状態を推測しない。画像は受け取っていません。新しい点数、見えない髪、架空の結果を作らない。'},{role:'user',content:JSON.stringify(input)}],response_format:{type:'json_schema',json_schema:{name:'after_review_education',strict:true,schema}},max_completion_tokens:1800}),signal:AbortSignal.timeout(45000)});
  if(!response.ok)return reply({code:response.status===429?'provider_limit':'provider_error',error:'AI文章APIの権限・利用上限・モデル設定を確認してください。',providerAttempted:true},502);
  const data=await response.json(),choice=data.choices?.[0];if(choice?.finish_reason!=='stop'||choice.message?.refusal)throw new Error('incomplete');const value:unknown=JSON.parse(choice.message.content);if(!validReviewFeedback(value))throw new Error('invalid');
  return reply({feedback:{...value,source:'AI_ESTIMATE',model:data.model??env.model??'gpt-4.1-mini',providerRequestId:response.headers.get('x-request-id')},providerAttempted:true});
 }catch{return reply({code:'invalid_or_interrupted_provider_result',error:'AI文章を取得できませんでした。数値結果は保持しています。',providerAttempted:true},502);}
}
