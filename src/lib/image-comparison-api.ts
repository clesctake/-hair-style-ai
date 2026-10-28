import {handleSimulationGenerate,type SimulationRuntime} from './hair-simulation-api.ts';
import {handleSupportGenerate} from './after-support-api.ts';
import {simulationInstructions} from './hair-simulation-instructions.ts';
import {supportInstructions} from './after-support-instructions.ts';
import {validatePlanningParameters} from './design-planning-types.ts';
import {validateSupportRequest} from './after-support-validation.ts';
import {comparisonPrompt,comparisonLayout} from './image-comparison.ts';
import {stableJson} from './hair-simulation-context.ts';
export async function handleImageComparison(request:Request,env:SimulationRuntime,fetcher:typeof fetch=fetch){
 const json=(b:unknown,status=200)=>Response.json(b,{status,headers:{'Cache-Control':'no-store'}});
 if(request.method!=='POST')return json({error:'POSTで操作してください。',providerAttempted:false},405);
 let form:FormData,base:string,variants:unknown[],count:3|5,purpose:'BANGS'|'SUPPORT';
 try{form=await request.formData();const spec=JSON.parse(String(form.get('comparisonSpec')));purpose=spec.purpose;variants=spec.variants;if(purpose==='BANGS'){
   count=5;if(!Array.isArray(variants)||variants.length!==5)throw Error();const rows=variants as {label:string;designId:string;parameters:Parameters<typeof validatePlanningParameters>[0]}[];
   if(rows.map(x=>x.label).join('')!=='ABCDE'||new Set(rows.map(x=>x.designId)).size!==5)throw Error();for(const x of rows)validatePlanningParameters(x.parameters);if(new Set(rows.map(x=>stableJson(x.parameters))).size!==5)throw Error();
   const r=JSON.parse(String(form.get('generationRequest')));if(r.parentMode!=='NONE'||r.contract.mode==='COLOR_ONLY')throw Error();base=simulationInstructions(r);
  }else if(purpose==='SUPPORT'){
   count=3;const rows=spec.variants;if(!Array.isArray(rows)||rows.length!==3)throw Error();for(const x of rows)validateSupportRequest(x);const first=rows[0];if(new Set(rows.map(x=>x.jobId)).size!==3||rows.some(x=>x.purpose!==first.purpose||stableJson(x.source)!==stableJson(first.source)))throw Error();
   if(stableJson(JSON.parse(String(form.get('supportRequest'))))!==stableJson(first))throw Error();base=rows.map((r,i)=>`Panel ${i+1}: ${supportInstructions(r)}`).join('\n');variants=rows.map(x=>({purpose:x.purpose,parameters:x.parameters}));
  }else throw Error();
 }catch{return json({code:'invalid_comparison',error:'比較案と元画像の条件を確認してください。',providerAttempted:false},400);}
 form.delete('comparisonSpec');
 const provider:typeof fetch=async(url,options)=>{const payload=options?.body;if(!(payload instanceof FormData))throw Error('比較画像の送信形式が不正です。');payload.set('prompt',comparisonPrompt(base,variants,count));payload.set('size',comparisonLayout(count).size);payload.set('n','1');return fetcher(url,{...options,body:payload});};
 return purpose==='BANGS'?handleSimulationGenerate(request,form,{runtime:env,providerFetch:provider,requestContext:{purpose,variants}}):handleSupportGenerate(new Request(request.url,{method:'POST',headers:{origin:new URL(request.url).origin},body:form}),env,{fetcher:provider,requestContext:{purpose,variants}});
}
