import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {catalog} from '../src/lib/catalog.ts';
import {newJourney} from '../src/lib/journey.ts';
import {simulationFixture,fixtureResponse,png,pngHash} from './helpers/simulation-fixture.mjs';
import {runSimulationJobs} from '../src/lib/hair-simulation-pipeline.ts';
import {selectSimulationDesign,reviewSimulation} from '../src/lib/hair-simulation-session.ts';
import {ensureProDesign,calculateProDesignRecipes,currentRecipeSet,selectProRecipe,toggleNextColor,setNextTone,editStylistMessage,editProDesign,confirmProDesign,customerSupportPayload} from '../src/lib/pro-design-session.ts';
import {ensureAfterSupport,supportView,supportParameters,queueSupportImage,startSupportImage,finishSupportImage,failSupportImage,reconcileSupport,visibleSupportAsset,supportBangImage,appendSupportPlan,appendSupportFinishImage,appendSupportStylistProfile} from '../src/lib/after-support-session.ts';
import {validateSupportRequest,validateAfterSupport,assertAfterSupportHistory} from '../src/lib/after-support-validation.ts';
import {validateDiagnosisSession,assertSessionHistory} from '../src/lib/session-validation.ts';
import {handleSupportGenerate,supportConnection} from '../src/lib/after-support-api.ts';
import {supportPlanRequest,handleSupportPlan,validSupportPlanItems} from '../src/lib/after-support-plan.ts';
import {supportInstructions} from '../src/lib/after-support-instructions.ts';
import {supportColorComposite,makeupRegionMask} from '../src/lib/after-support-protection.ts';
import {supportImageClient} from '../src/lib/after-support-client.ts';
import {FeatureRegistry} from '../src/lib/feature-registry.ts';
import {memoryJourneyStore} from '../src/lib/journey-store.ts';
import {encodeJourneyRevision,decodeJourneyRevision} from '../src/lib/journey-storage-codec.ts';
import worker from '../site-worker/index.ts';
import {supportFinishPhotos,resolveConfirmedFinishReference,finishReference,supportProductCopy,supportPaletteSlots,supportStylist,registeredImageUrl,supportDesignPoints} from '../src/lib/after-support-presentation.ts';
const KEY='UNIT_TEST_ONLY_NOT_AN_API_KEY';
const ast=j=>j.diagnosisSession.afterSupport,pro=j=>j.diagnosisSession.proDesign;
// SYNTHETIC TEST-ONLY images. REAL_API here exercises the real-result selector path;
// no OpenAI call occurs and these fixture assets never ship in the demo.
let prepared;
async function fixture(){
 if(!prepared)prepared=(async()=>{
  let j=await runSimulationJobs(simulationFixture(),{transport:async r=>fixtureResponse(r,'REAL_API'),persist:async next=>next});
  j=selectSimulationDesign(j,j.diagnosisSession.hairSimulation.jobs.find(x=>x.label==='A').id);
  j=calculateProDesignRecipes(ensureProDesign(j,catalog),catalog);
  j=selectProRecipe(j,currentRecipeSet(j).recipes[0].id);
  for(const f of ['BEIGE','PINK','MATTE'])j=toggleNextColor(j,f);
  j=setNextTone(j,'PINK','DOWN');
  j=editStylistMessage(j,'今回のデザインを一緒に楽しんでください。\n次回もご相談しましょう。');
  j=editProDesign(j,{message:{...pro(j).message,reviewedAt:new Date().toISOString()},aftercare:{...pro(j).aftercare,visitWeeks:6,homeCare:['COLOR_RETENTION','UV']}});
  return ensureAfterSupport(confirmProDesign(j));
 })();
 return structuredClone(await prepared);
}
const output=(r,origin='MOCK_TRANSPORT_FIXTURE')=>({requestId:r.requestId,jobId:r.jobId,image:png,generation:{origin,provider:'OPENAI_IMAGES_EDIT',model:'SYNTHETIC_TEST_ONLY',providerRequestId:'test-request',generatedAt:new Date().toISOString(),sha256:pngHash,seed:null,promptVersion:'after-support-local-edit-v1',providerAttempted:true}});
function generated(j,purpose='NEXT_COLOR',index=0,origin='REAL_API'){
 const q=queueSupportImage(j,purpose,index);return {request:q.request,journey:finishSupportImage(startSupportImage(q.journey,q.request.jobId),q.request,output(q.request,origin),1,1)};
}
function plan(j,task,sourceType='AI_ESTIMATE'){
 const v=supportView(j),keys=task==='FADE'?['2','4','6']:task==='MAKEUP'?['NATURAL','PINK','ORANGE']:v.aftercare.productIds;
 return {id:crypto.randomUUID(),task,handoffId:v.handoff.id,inputFingerprint:v.handoff.sourceInputFingerprint,sourceType,provider:'SYNTHETIC_TEST_ONLY',model:'NOT_REAL_AI',requestId:null,createdAt:new Date().toISOString(),needsStylistReview:true,items:keys.map(key=>({key,description:task==='FADE'?'色味がやわらかく見える可能性を示す参考予測です。':'今回の髪色に合わせた参考提案です。',palette:task==='MAKEUP'?['#bb7766','#cc8899','#996655']:[],usageAdvice:null}))};
}
function imageRequest(r,image=png,extra=false){const f=new FormData();f.set('supportRequest',JSON.stringify(r));f.set('image',new File([Buffer.from(image.split(',')[1],'base64')],'confirmed.png',{type:'image/png'}));if(extra)f.set('styleReferenceImage','extra-role');return new Request('https://unit.test/api/after-support/generate',{method:'POST',body:f});}
const textRequest=r=>new Request('https://unit.test/api/after-support/plan',{method:'POST',body:JSON.stringify(r)});

test('Page 3 additive model preserves every old session field and all FIOLE assets',()=>{
 const j=simulationFixture(),old=structuredClone(j.diagnosisSession),next=ensureAfterSupport(j);for(const k of Object.keys(old))assert.deepEqual(next.diagnosisSession[k],old[k]);
 assert.equal(ast(next).parentSessionId,old.id);assert.equal(ast(next).schemaVersion,'after-support-v1');assert.equal(catalog.variants.length,149);validateDiagnosisSession(next.diagnosisSession);
});
test('Page 1 to 2 to 3 carries the exact final image, colors, tones, message, care and visit',async()=>{
 const j=await fixture(),v=supportView(j),h=pro(j).handoffs.at(-1);assert.equal(v.finalImage,png);assert.equal(v.source.finalAssetId,h.finalImageReference.assetId);
 assert.deepEqual(v.nextColors.map(x=>[x.family,x.tone]),[['BEIGE','BASE'],['PINK','DOWN'],['MATTE','BASE']]);assert.equal(v.aftercare.visitWeeks,6);assert.equal(v.message,h.message);assert.match(v.message,/\n/);assert.equal(v.targetLevel,null);assert.equal(v.targetLab.L,58);
});
test('Page 3 reads confirmed handoff, never new unconfirmed Page 2 drafts',async()=>{
 const j=await fixture(),before=supportView(j);pro(j).message.text='未確定の改変';pro(j).aftercare.visitWeeks=8;pro(j).nextColors.reverse();const v=supportView(j);
 assert.equal(v.message,before.message);assert.equal(v.aftercare.visitWeeks,6);assert.equal(v.nextColors[0].family,'BEIGE');
});
test('Missing REAL final remains missing and cannot use a fixed or MOCK image as parent',async()=>{
 const j=await fixture();pro(j).handoffs.at(-1).finalImageReference=null;validateDiagnosisSession(j.diagnosisSession);assert.equal(supportView(j).finalImage,null);assert.throws(()=>queueSupportImage(j,'NEXT_COLOR',0),/実生成/);
 // A changed provenance label cannot bypass the original session validator.
 const tampered=await fixture();tampered.diagnosisSession.hairSimulation.generatedAssets.forEach(a=>a.origin='MOCK_TRANSPORT_FIXTURE');assert.equal(supportView(tampered).finalImage,null);assert.throws(()=>queueSupportImage(tampered,'NEXT_COLOR',0),/出所/);
});
test('Customer projection excludes drugs, developer/OX and internal mixing recipes',async()=>{
 const payload=customerSupportPayload(await fixture());assert.doesNotMatch(JSON.stringify(payload),/fioleDrugs|developerId|mixingRatio|DEV_OX|ratios/);
});
test('Next color request uses the Page 2 family/tone, confirmed parent hash and unknown salon level',async()=>{
 const j=await fixture(),q=queueSupportImage(j,'NEXT_COLOR',1);assert.equal(q.request.parameters.nextColor.family,'PINK');assert.equal(q.request.parameters.nextColor.tone,'DOWN');assert.equal(q.request.source.sha256,pngHash);assert.equal(q.request.parameters.targetLevel,null);validateSupportRequest(q.request);
});
test('Completed identical image is reused with no extra generation job',async()=>{
 const {journey:j}=generated(await fixture());const q=queueSupportImage(j,'NEXT_COLOR',0);assert.equal(q.cached,true);assert.equal(ast(q.journey).generationJobCount,1);assert.equal(visibleSupportAsset(j,'NEXT_COLOR',0).dataUrl,png);
});
test('MOCK transport image stays MOCK and is never exposed as REAL generation',async()=>{
 const {journey:j}=generated(await fixture(),'NEXT_COLOR',0,'MOCK_TRANSPORT_FIXTURE');assert.equal(visibleSupportAsset(j,'NEXT_COLOR',0),null);assert.equal(ast(j).assets[0].generation.origin,'MOCK_TRANSPORT_FIXTURE');
});
test('Image history records display-only policy, source design and immutable request snapshot',async()=>{
 const {journey:j,request}=generated(await fixture()),a=ast(j).assets[0];assert.equal(a.usage,'DISPLAY_ONLY');assert.equal(a.learningImageStorage,false);assert.equal(a.confirmedDesignId,request.source.finalDesignId);assert.deepEqual(ast(j).jobs[0].inputSnapshot,request);validateAfterSupport(j.diagnosisSession);
});
test('Partial image failure keeps success and allows only failed slot retry',async()=>{
 let {journey:j}=generated(await fixture());const q=queueSupportImage(j,'NEXT_COLOR',1);j=failSupportImage(startSupportImage(q.journey,q.request.jobId),q.request.jobId,{code:'provider_error',message:'失敗',providerAttempted:true,outcomeUnknown:false});const retry=queueSupportImage(j,'NEXT_COLOR',1);
 assert.equal(visibleSupportAsset(retry.journey,'NEXT_COLOR',0).dataUrl,png);assert.equal(ast(retry.journey).jobs.at(-1).attempts,2);assert.equal(ast(retry.journey).assets.length,1);
});
test('Retry is bounded and interrupted jobs record unknown API outcome without automatic calls',async()=>{
 let j=await fixture();for(let i=0;i<3;i++){const q=queueSupportImage(j,'NEXT_COLOR',0);j=failSupportImage(startSupportImage(q.journey,q.request.jobId),q.request.jobId,{code:'x',message:'失敗',providerAttempted:true,outcomeUnknown:true});}
 assert.throws(()=>queueSupportImage(j,'NEXT_COLOR',0),/3回/);const q=queueSupportImage(await fixture(),'NEXT_COLOR',1),recover=reconcileSupport(startSupportImage(q.journey,q.request.jobId));assert.equal(ast(recover).jobs[0].status,'FAILED');assert.equal(ast(recover).jobs[0].error.outcomeUnknown,true);assert.equal(ast(recover).jobs.length,1);
});
test('Changed Page 1 target marks old output stale but preserves all original assets',async()=>{
 const {journey:j}=generated(await fixture());j.diagnosisSession.styleTarget.requestText='変更';const next=reconcileSupport(j);assert.equal(supportView(next).sourceStale,true);assert.equal(ast(next).jobs[0].status,'STALE');assert.equal(ast(next).assets.length,1);assert.equal(visibleSupportAsset(next,'NEXT_COLOR',0),null);
});
test('Historical assets and generation input cannot be edited or removed',async()=>{
 const {journey:j}=generated(await fixture()),next=structuredClone(j);next.diagnosisSession.afterSupport.assets[0].dataUrl='changed';assert.throws(()=>assertAfterSupportHistory(ast(j),ast(next)),/原本/);
 const n=structuredClone(j);ast(n).jobs[0].inputSnapshot.parameters.nextColor.family='RED';assert.throws(()=>assertSessionHistory(j.diagnosisSession,n.diagnosisSession),/原本/);
});
test('Save and gzip reload preserves Page 1/2/3, their independent source data and selected recipe',async()=>{
 const store=memoryJourneyStore(catalog),{journey:j}=generated(await fixture()),saved=await store.save(j),loaded=await store.load(saved.id),decoded=await decodeJourneyRevision(await encodeJourneyRevision(saved));
 assert.deepEqual(ast(loaded),ast(saved));assert.deepEqual(decoded,saved);assert.equal(supportView(loaded).message,supportView(j).message);assert.deepEqual(loaded.diagnosisSession.hairAnalysis,saved.diagnosisSession.hairAnalysis);assert.deepEqual(loaded.diagnosisSession.colorTarget,saved.diagnosisSession.colorTarget);
});
test('Page 1 historical A-E images are reused with no new bang jobs',async()=>{
 const j=await fixture(),count=j.diagnosisSession.hairSimulation.jobs.length;for(const label of ['A','B','C','D','E'])assert.equal(supportBangImage(j,label).dataUrl,png);assert.equal(j.diagnosisSession.hairSimulation.jobs.length,count);assert.equal(ast(j).jobs.length,0);
 const img=supportBangImage(j,'B');const changed=reviewSimulation(j,img.eventId,{decision:'REJECTED',identity:'CONCERN',background:'NOT_REVIEWED',color:'NOT_REVIEWED',design:'NOT_REVIEWED',note:'テスト'});assert.equal(supportBangImage(changed,'B'),null);
});
test('Fade requires an actual AI proposal and never fabricates level or retention percentage',async()=>{
 let j=await fixture();assert.throws(()=>supportParameters(j,'FADE_COLOR',1),/未取得/);j=appendSupportPlan(j,plan(j,'FADE'));const p=supportParameters(j,'FADE_COLOR',1);assert.equal(p.weeks,2);assert.equal(p.targetLevel,null);assert.equal(p.prediction,'VISUAL_ESTIMATE_NOT_MEASURED');assert.doesNotMatch(p.description,/\d+\s*(%|Lv)/);
});
test('MOCK text plans are retained but do not qualify as an actual AI result',async()=>{
 let j=await fixture();j=appendSupportPlan(j,plan(j,'FADE','MOCK'));assert.throws(()=>supportParameters(j,'FADE_COLOR',1),/未取得/);assert.equal(ast(j).plans[0].sourceType,'MOCK');
});
test('Three makeup themes and palettes map exactly to the approved Master slots',async()=>{
 let j=await fixture();j=appendSupportPlan(j,plan(j,'MAKEUP'));assert.deepEqual([0,1,2].map(i=>supportParameters(j,'MAKEUP',i).makeupTheme),['NATURAL','PINK','ORANGE']);
 for(const i of [0,1,2]){const q=queueSupportImage(j,'MAKEUP',i);validateSupportRequest(q.request);assert.match(supportInstructions(q.request),/eyeshadow, cheek and lip color/);assert.match(supportInstructions(q.request),/Preserve hair color/);}
});
test('Late plan for another confirmed handoff or changed source is rejected',async()=>{
 const j=await fixture(),p=plan(j,'FADE');p.handoffId='wrong';assert.throws(()=>appendSupportPlan(j,p),/変わり/);
 const correct=plan(j,'FADE');j.diagnosisSession.styleTarget.requestText='変更';assert.throws(()=>appendSupportPlan(j,correct),/変わり/);
});
test('Plan input includes only selected confirmed products and never invents skin personal color',async()=>{
 const j=await fixture(),h=pro(j).handoffs.at(-1);h.aftercare.productIds=['registered'];h.aftercare.productSnapshots=[{productId:'registered',brand:'確認済みブランド',productName:'確認済み商品',features:['軽い質感'],usageMethod:'少量を毛先へ',usageTiming:'乾かす前',active:true,category:'MILK',price:null,targetConcerns:[],salonMemo:'',image:null}];
 h.aftercare.productSnapshots.push({...h.aftercare.productSnapshots[0],productId:'not-selected',productName:'未選択の商品'});
 const r=supportPlanRequest(j,'PRODUCT');assert.deepEqual(r.productIds,['registered']);assert.equal(r.context.selectedProducts.length,1);assert.equal(r.context.skinPersonalColor,null);assert.equal(r.context.hair.MID.damage.value,null);assert.doesNotMatch(JSON.stringify(r),/data:image|OPENAI_API_KEY/);
});
test('Strict qualitative plan output rejects wrong order, invented level and definite claims',()=>{
 const items=[{key:'2',description:'やわらかな変化の参考予測です。',palette:[],usageAdvice:null}];assert.equal(validSupportPlanItems(items,['2'],'FADE'),true);assert.equal(validSupportPlanItems(items,['4'],'FADE'),false);
 for(const description of ['95%退色します。','7.5 Lvです。','必ず変化します。'])assert.equal(validSupportPlanItems([{...items[0],description}],['2'],'FADE'),false);
});
test('No server API key returns explicit 503 and makes zero image/text provider requests',async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw new Error('must not call');};
 assert.equal((await handleSupportGenerate(new Request('https://unit.test/api/after-support/generate',{method:'POST',body:'x'}),{},{fetcher})).status,503);
 assert.equal((await handleSupportPlan(textRequest({}),{},{fetcher})).status,503);assert.equal(calls,0);assert.equal(supportConnection({}).configured,false);
});
test('Image API rejects wrong parent bytes and extra reference roles before external calls',async()=>{
 const j=await fixture(),r=queueSupportImage(j,'NEXT_COLOR',0).request;let calls=0;const opt={fetcher:async()=>{calls++;throw new Error('never');}};r.source.sha256='a'.repeat(64);
 assert.equal((await handleSupportGenerate(imageRequest(r),{apiKey:KEY},opt)).status,400);r.source.sha256=pngHash;assert.equal((await handleSupportGenerate(imageRequest(r,png,true),{apiKey:KEY},opt)).status,400);assert.equal(calls,0);
});
test('Image provider adapter sends one confirmed parent, caches request and labels stub output MOCK',async()=>{
 const r=queueSupportImage(await fixture(),'NEXT_COLOR',0).request;let calls=0,sent;const options={origin:'MOCK_TRANSPORT_FIXTURE',fetcher:async(url,opt)=>{calls++;assert.equal(url,'https://api.openai.com/v1/images/edits');sent=opt.body;return Response.json({data:[{b64_json:png.split(',')[1]}]},{headers:{'x-request-id':'stub-id'}});}};
 const first=await handleSupportGenerate(imageRequest(r),{apiKey:KEY},options),a=await first.json();assert.equal(first.status,200);assert.equal(a.generation.origin,'MOCK_TRANSPORT_FIXTURE');assert.equal(a.generation.sha256,pngHash);assert.equal(sent.getAll('image[]').length,1);assert.match(sent.get('prompt'),/Preserve identity/);
 assert.equal((await handleSupportGenerate(imageRequest(r),{apiKey:KEY},options)).status,200);assert.equal(calls,1);const conflict=structuredClone(r);conflict.parameters.description='changed';assert.equal((await handleSupportGenerate(imageRequest(conflict),{apiKey:KEY},options)).status,409);
});
test('Provider failure, truncated image and connection errors are safe and preserve failure states',async()=>{
 const r=queueSupportImage(await fixture(),'NEXT_COLOR',0).request;
 const bad=await handleSupportGenerate(imageRequest(r),{apiKey:KEY},{fetcher:async()=>new Response('private upstream detail',{status:429})});assert.equal(bad.status,429);assert.doesNotMatch(await bad.text(),/private upstream detail|UNIT_TEST/);
 r.requestId=crypto.randomUUID();const broken=await handleSupportGenerate(imageRequest(r),{apiKey:KEY},{fetcher:async()=>Response.json({data:[{b64_json:'YWJj'}]})});assert.equal(broken.status,502);
 r.requestId=crypto.randomUUID();const lost=await handleSupportGenerate(imageRequest(r),{apiKey:KEY},{fetcher:async()=>{throw new Error('secret details');}});assert.equal((await lost.json()).outcomeUnknown,true);
});
test('Structured text adapter records provenance and requires stylist review without real AI calls',async()=>{
 const j=await fixture(),r=supportPlanRequest(j,'MAKEUP'),items=plan(j,'MAKEUP').items;let sent;
 const response=await handleSupportPlan(textRequest(r),{apiKey:KEY},{provenance:'MOCK',fetcher:async(url,opt)=>{assert.equal(url,'https://api.openai.com/v1/chat/completions');sent=JSON.parse(opt.body);return Response.json({model:'SYNTHETIC_TEXT_ONLY',choices:[{finish_reason:'stop',message:{content:JSON.stringify({items})}}]});}});
 assert.equal(response.status,200);const value=await response.json();assert.equal(value.plan.sourceType,'MOCK');assert.equal(value.plan.needsStylistReview,true);assert.equal(sent.response_format.json_schema.strict,true);
});
test('Refused or malformed AI plan does not create an estimated result',async()=>{
 const r=supportPlanRequest(await fixture(),'FADE');for(const content of [{refusal:'no'}, {content:'invalid json'}]){
  const response=await handleSupportPlan(textRequest(r),{apiKey:KEY},{fetcher:async()=>Response.json({choices:[{finish_reason:'stop',message:content}]})});assert.equal(response.status,502);assert.equal((await response.json()).plan,undefined);
 }
});
test('Worker authenticates Page 3 API, enforces origin and preserves Page 1/2 routes',async()=>{
 const req=(path,headers)=>new Request('https://unit.test'+path,{method:'POST',headers,body:'invalid'});
 for(const path of ['/api/after-support/generate','/api/after-support/plan']){assert.equal((await worker.fetch(req(path,{}),{})).status,401);assert.equal((await worker.fetch(req(path,{'oai-authenticated-user-id':'stub',origin:'https://other.test'}),{})).status,403);assert.equal((await worker.fetch(req(path,{'oai-authenticated-user-id':'stub'}),{})).status,503);}
 for(const path of ['/fiole/after-support','/fiole/pro-design','/fiole/counseling-page1']){const r=await worker.fetch(new Request('https://unit.test'+path),{ASSETS:{fetch:async r=>new Response(new URL(r.url).pathname)}});assert.equal(await r.text(),'/');}
 assert.equal((await worker.fetch(new Request('https://unit.test/api/generate'),{})).status,200);
});
test('Client verifies parent and response, uses injected test-only postprocess and retains error code',async()=>{
 const r=queueSupportImage(await fixture(),'NEXT_COLOR',0).request;let calls=0;const client=supportImageClient({fetcher:async()=>{calls++;return Response.json(output(r));},postprocess:async o=>({...o,width:1,height:1})});
 const value=await client(r,png);assert.equal(value.generation.origin,'MOCK_TRANSPORT_FIXTURE');assert.equal(calls,1);const wrong=structuredClone(r);wrong.source.sha256='b'.repeat(64);await assert.rejects(()=>client(wrong,png),/元画像/);assert.equal(calls,1);
 const fail=supportImageClient({fetcher:async()=>Response.json({code:'not_configured',error:'APIキー未設定',providerAttempted:false},{status:503})});await assert.rejects(()=>fail(r,png),e=>e.code==='not_configured'&&e.providerAttempted===false);
});
test('Local color-only composite preserves all unselected source RGB and alpha exactly',()=>{
 const source=new Uint8ClampedArray(40),edited=new Uint8ClampedArray(40),mask=new Uint8Array(10);for(let i=0;i<10;i++){source.set([80,60,40,200+i],i*4);edited.set([150,70,90,255],i*4);if(i<6)mask[i]=255;}
 const changed=supportColorComposite(source,edited,mask,'HAIR');assert.notDeepEqual(changed.slice(0,3),source.slice(0,3));assert.deepEqual(changed.slice(6*4),source.slice(6*4));for(let i=0;i<10;i++)assert.equal(changed[i*4+3],source[i*4+3]);
});
test('Missing real landmarks or too little editable region fails closed instead of changing the whole face',()=>{
 assert.throws(()=>makeupRegionMask([],10,10),/不足/);assert.throws(()=>supportColorComposite(new Uint8ClampedArray(40),new Uint8ClampedArray(40),new Uint8Array(10),'MAKEUP'),/確認できません/);
});
test('Registry separates REAL projection from unverified API quality and protects old page styles',()=>{
 assert.equal(FeatureRegistry.afterSupportDataProjection.state,'REAL');assert.equal(FeatureRegistry.afterSupportImageGeneration.state,'PARTIAL');assert.equal(FeatureRegistry.requiredUnderCalculator.state,'UNIMPLEMENTED');assert.equal(FeatureRegistry.productCatalog.state,'UNIMPLEMENTED');
 const ui=readFileSync(new URL('../src/components/after-support-page.tsx',import.meta.url),'utf8');assert.equal((ui.match(/data-section=/g)||[]).length,10);assert.doesNotMatch(ui,/developerId|fioleDrugs|mixingRatio/);
 const css=readFileSync(new URL('../app/fiole/after-support/after-support.css',import.meta.url),'utf8');assert.doesNotMatch(css,/\.pd-/);
 const baseline=JSON.parse(readFileSync(new URL('../docs/page3-audit/baseline-hashes.json',import.meta.url),'utf8')).files;
 for(const path of ['app/fiole/counseling-page1/page-one.css','app/fiole/counseling-page1/page-one-final.css','app/fiole/pro-design/pro-design.css'])assert.equal(createHash('sha256').update(readFileSync(new URL('../'+path,import.meta.url))).digest('hex'),baseline[path]);
 // The 2026-10-13 instruction permits COLOR-modal edits only. Keep the
 // original Page 1 master and STYLE branch immutable instead of locking
 // the entire component against the explicitly authorized change.
 const pageOne=readFileSync(new URL('../src/components/counseling-page-one.tsx',import.meta.url),'utf8');
 const protectedMain=pageOne.slice(pageOne.indexOf(' return <div className="cfa-counseling-outer'),pageOne.indexOf(' {dialog&&')).replace('photoChange(()=>colorUpload.current?.click())','photoChange(()=>void openColor())').replace(/ <input hidden ref=\{colorUpload\}[^\n]+\n/,'');
 const protectedStyle=pageOne.slice(pageOne.indexOf(" {dialog==='style'"),pageOne.indexOf(" {dialog==='color'")).replace('</label><div className="cf-generation-controls">','</label><DesignPlanningPanel session={session} busy={busy} onChange={change}/><div className="cf-generation-controls">').replace('同じSTYLE・確定COLORでA〜Eを1回で生成。顔・色・境界を確認して採用してください。','MAINを保存後、同じSTYLE・確定COLORでA〜Eの前髪だけを変更します。実生成品質は未検証です。');
 assert.equal(createHash('sha256').update(protectedMain).digest('hex'),'52d9b1675cfc2ef337ce9c114a51c3f1cd1054f95a0a2ea1aa0309b8ef7c72bc');
 assert.equal(createHash('sha256').update(protectedStyle).digest('hex'),'4b2f74caf744db310e181a9b95f69b81d2853157640327cec4211e9f5fc5981c');
});

test('Finish keeps the confirmed front and does not repurpose CURRENT photos as missing angles',async()=>{
 const j=await fixture(),v=supportView(j),images=supportFinishPhotos(j,v);
 assert.equal(images.FRONT.src,v.finalImage);
 for(const key of ['SIDE','BACK','FACE_FRAME','HAIR_DETAIL','COLOR_TEXTURE'])assert.equal(images[key],null);
 const current=j.diagnosisSession.currentPhotos[0];
 assert.throws(()=>appendSupportFinishImage(j,'SIDE',current,'検証'),/保存画像/);
 assert.throws(()=>appendSupportFinishImage(j,'BACK',j.diagnosisSession.hairSimulation.generatedAssets[0].reference,'検証'),/撮影方向/);
});
test('Explicit related-image references reuse verified session pixels without duplicating them',async()=>{
 const j=await fixture(),v=supportView(j),asset=j.diagnosisSession.hairSimulation.generatedAssets.find(x=>x.id===v.source.finalAssetId);
 const next=appendSupportFinishImage(j,'FACE_FRAME',asset.reference,'検証');
 assert.equal(supportFinishPhotos(next,supportView(next)).FACE_FRAME.src,png);
 assert.equal(next.diagnosisSession.hairSimulation.generatedAssets.length,j.diagnosisSession.hairSimulation.generatedAssets.length);
 assert.equal(ast(next).finishReferences[0].image.imageId,asset.id);
 assert.equal(Object.hasOwn(ast(next).finishReferences[0],'dataUrl'),false);validateAfterSupport(next.diagnosisSession);
});
test('Finish image bindings reject another handoff, color, viewing angle, person and rejected output',async()=>{
 const j=await fixture(),v=supportView(j),asset=j.diagnosisSession.hairSimulation.generatedAssets.find(x=>x.id===v.source.finalAssetId);
 const binding=finishReference(asset.reference,'FACE_FRAME',v,'検証');
 for(const patch of [{handoffId:'other'},{targetConfirmationId:'other'},{designId:'other'},{role:'SIDE'},{image:{...asset.reference,parentSessionId:'other'}}])assert.equal(resolveConfirmedFinishReference(j,v,{...binding,...patch}),null);
 const changed=reviewSimulation(j,asset.eventId,{decision:'REJECTED',identity:'CONCERN',background:'NOT_REVIEWED',color:'NOT_REVIEWED',design:'NOT_REVIEWED',note:'検証用'});
 assert.equal(resolveConfirmedFinishReference(changed,supportView(changed),binding),null);
});
test('Old afterSupport-v1 records need no new fields; added references and profile survive save/reload',async()=>{
 let j=await fixture();assert.equal(ast(j).finishReferences,undefined);assert.equal(ast(j).stylistProfiles,undefined);validateAfterSupport(j.diagnosisSession);
 const asset=j.diagnosisSession.hairSimulation.generatedAssets.find(x=>x.id===supportView(j).source.finalAssetId);
 j=appendSupportFinishImage(j,'COLOR_TEXTURE',asset.reference,'検証');
 j=appendSupportStylistProfile(j,{name:'登録済み担当者',photo:{imageId:'registered-staff',imageUrl:null,localReference:'/registered/staff.png',width:100,height:100},source:'SALON_REGISTERED'});
 const store=memoryJourneyStore(catalog),saved=await store.save(j),loaded=await store.load(saved.id),decoded=await decodeJourneyRevision(await encodeJourneyRevision(saved));
 assert.deepEqual(ast(loaded).finishReferences,ast(saved).finishReferences);assert.deepEqual(ast(decoded).stylistProfiles,ast(saved).stylistProfiles);
 assert.equal(supportStylist(loaded,supportView(loaded)).photo,'/registered/staff.png');assert.equal(supportView(loaded).message,supportView(j).message);
});
test('Additional confirmed image and stylist records are append-only',async()=>{
 let j=await fixture(),v=supportView(j);const image=j.diagnosisSession.hairSimulation.generatedAssets.find(x=>x.id===v.source.finalAssetId).reference;
 j=appendSupportFinishImage(j,'HAIR_DETAIL',image,'検証');j=appendSupportStylistProfile(j,{name:'担当者',photo:null,source:'SALON_REGISTERED'});
 for(const key of ['finishReferences','stylistProfiles']){const next=structuredClone(j);ast(next)[key][0].confirmedAt='changed';assert.throws(()=>assertAfterSupportHistory(ast(j),ast(next)),/原本/);}
 const wrong=structuredClone(j);ast(wrong).finishReferences[0].image.role='CURRENT';assert.throws(()=>validateAfterSupport(wrong.diagnosisSession),/原本/);
});
test('Five makeup palette positions remain fixed without inventing missing colors in legacy records',()=>{
 const old=['#bb7766','#cc8899','#996655'];assert.deepEqual(supportPaletteSlots(old),[...old,null,null]);assert.deepEqual(old,['#bb7766','#cc8899','#996655']);
 assert.deepEqual(supportPaletteSlots([]),[null,null,null,null,null]);assert.equal(supportPaletteSlots(['#111111','#222222','#333333','#444444','#555555']).length,5);
});
const registeredProduct=()=>({productId:'registered-product',brand:'SYNTHETIC_REGISTERED_BRAND',productName:'検証用の登録商品',category:'MILK',image:{imageId:'registered-product-image',imageUrl:null,localReference:'/registered/product.png',width:100,height:200},price:null,targetConcerns:[],features:['登録済みの質感情報'],usageTiming:'乾かす前',usageMethod:'登録済みの使用方法',salonMemo:'',active:true});
function withProduct(j){const product=registeredProduct(),h=pro(j).handoffs.at(-1);h.aftercare.productIds=[product.productId];h.aftercare.productSnapshots=[product];return product;}
function takeawayFor(j,product){const v=supportView(j),layers=()=>({aiProposed:null,stylistSelected:[],stylistEdited:[],activeSelectionId:null,activeEditId:null});return {id:'takeaway-test',parentSessionId:j.diagnosisSession.id,schemaVersion:'customer-takeaway-v1',specVersion:'1.1',sourceRevision:j.version,createdAt:j.createdAt,updatedAt:j.updatedAt,currentResult:{designId:v.source.finalDesignId,color:null,bangFaceFrame:null,finishPoints:[]},nextColorOptions:layers(),nextDesignOptions:layers(),makeupSuggestions:layers(),productRecommendations:{...layers(),stylistSelected:[{id:'selected',state:'STYLIST_SELECTED',proposalId:null,value:[{id:'recommendation-test',productId:product.productId,catalogId:'registered-catalog',catalogRevision:1,sourceHairAnalysisId:j.diagnosisSession.hairAnalysis.id,sourceTreatmentResultId:j.diagnosisSession.treatmentResult.id,sourceFinalDesignId:v.source.finalDesignId,recommendationReason:'美容師が確定した理由。\n全文を保持します。',usageAdvice:'美容師が確定した使い方',usageTiming:'乾かす前',selectedProductSnapshot:product}],actor:'検証',createdAt:j.createdAt}],activeSelectionId:'selected'},nextVisitProposal:{timing:null,reason:null},outputs:[]};}
test('Unreviewed AI product text does not replace confirmed registered product information',async()=>{
 let j=await fixture();const product=withProduct(j),proposal=plan(j,'PRODUCT');proposal.items[0].description='未確認のAI文章';proposal.items[0].usageAdvice='未確認の使用方法';j=appendSupportPlan(j,proposal);
 const copy=supportProductCopy(j,supportView(j),product);assert.equal(copy.reason,'登録済みの質感情報');assert.equal(copy.usageAdvice,'登録済みの使用方法');assert.equal(copy.image,'/registered/product.png');assert.equal(copy.source,'REGISTERED_PRODUCT');
 assert.equal(ast(j).plans.at(-1).items[0].description,'未確認のAI文章');assert.equal(supportProductCopy(j,supportView(j),{...product,productId:'unselected'}),null);
});
test('Stylist-confirmed product reason and edits take precedence, with exact original newlines',async()=>{
 const j=await fixture(),product=withProduct(j);j.diagnosisSession.customerTakeaway=takeawayFor(j,product);
 assert.equal(supportProductCopy(j,supportView(j),product).reason,'美容師が確定した理由。\n全文を保持します。');
 const layers=j.diagnosisSession.customerTakeaway.productRecommendations,values=structuredClone(layers.stylistSelected[0].value);values[0].recommendationReason='美容師が編集した確定理由';
 layers.stylistEdited.push({id:'edited',state:'STYLIST_EDITED',selectionId:'selected',value:values,actor:'検証',createdAt:j.createdAt});layers.activeEditId='edited';
 assert.equal(supportProductCopy(j,supportView(j),product).reason,'美容師が編集した確定理由');assert.equal(layers.stylistSelected[0].value[0].recommendationReason,'美容師が確定した理由。\n全文を保持します。');
});
test('Product recommendation for a different final design is not shown as this visit’s reason',async()=>{
 const j=await fixture(),product=withProduct(j);j.diagnosisSession.customerTakeaway=takeawayFor(j,product);j.diagnosisSession.customerTakeaway.productRecommendations.stylistSelected[0].value[0].sourceFinalDesignId='other-design';
 assert.equal(supportProductCopy(j,supportView(j),product).source,'REGISTERED_PRODUCT');
});
test('Registered image URLs do not interpret internal references or dangerous URLs as photos',()=>{
 const image=localReference=>({imageId:'test',imageUrl:null,localReference,width:null,height:null});
 for(const value of ['javascript:alert(1)','//external.test/x.png','salon-image:unknown','https://user:secret@example.test/image.png','data:text/html;base64,YQ=='])assert.equal(registeredImageUrl(image(value)),null);
 assert.equal(registeredImageUrl(image('/registered/photo.png')),'/registered/photo.png');assert.equal(registeredImageUrl(image(png)),png);assert.equal(registeredImageUrl(image('https://example.test/image.png')),'https://example.test/image.png');
});
test('Stylist photo is explicit, handoff-scoped and never substitutes a stock portrait',async()=>{
 let j=await fixture();assert.equal(supportStylist(j,supportView(j)).photo,null);
 j=appendSupportStylistProfile(j,{name:'登録済み担当者',photo:{imageId:'staff',imageUrl:'https://example.test/staff.png',localReference:null,width:100,height:100},source:'SALON_REGISTERED'});
 assert.deepEqual(supportStylist(j,supportView(j)),{name:'登録済み担当者',photo:'https://example.test/staff.png'});
 ast(j).stylistProfiles[0].handoffId='different-handoff';assert.deepEqual(supportStylist(j,supportView(j)),{name:'検証',photo:null});
});
test('Design explanations reuse the confirmed design and never another design’s takeaway',async()=>{
 const j=await fixture(),product=withProduct(j);j.diagnosisSession.customerTakeaway=takeawayFor(j,product);const result=j.diagnosisSession.customerTakeaway.currentResult;result.finishPoints=['確定した説明1','確定した説明2'];
 assert.deepEqual(supportDesignPoints(j,supportView(j)),result.finishPoints);result.designId='other';assert.deepEqual(supportDesignPoints(j,supportView(j)),supportView(j).designPoints);
});
test('Master row coordinates and both small column gaps agree at the canonical 1024px width',()=>{
 const css=readFileSync(new URL('../app/fiole/after-support/after-support.css',import.meta.url),'utf8').split('@media')[0],master=JSON.parse(readFileSync(new URL('../docs/visual-master/page3/IDENTITY.json',import.meta.url))).canonicalCards;
 const body=selector=>css.match(new RegExp('(?:^|\\n)'+selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\{([^}]*)\\}'))?.[1];
 const number=(selector,property)=>Number(body(selector)?.match(new RegExp(property+':calc\\((\\d+) \\* var\\(--a\\)\\)'))?.[1]);
 const rowTop=[number('.as-header','height')+number('.as-lead','min-height')];
 for(const [i,[selector,height]]of [['.as-fade',310],['.as-bangs',232],['.as-face-makeup-grid',200],['.as-products-care-grid',272],['.as-bottom-grid',187]].entries()){
  const margin=selector==='.as-fade'?10:number(selector,'margin-top');rowTop.push(rowTop[i]+height+margin);
 }
 assert.deepEqual(rowTop,[master.finish[1],master.fade[1],master.bangs[1],master.face[1],master.products[1],master.visit[1]]);
 assert.equal(number('.as-face-makeup-grid','gap'),master.makeup[0]-master.face[0]-master.face[2]);assert.equal(number('.as-bottom-grid','gap'),master.message[0]-master.visit[0]-master.visit[2]);
 assert.match(body('.as-page'),/width:1024px;height:1536px;max-width:1024px/);assert.match(css,/object-fit:contain/);assert.match(css,/white-space:pre-wrap/);
});
test('Rejected or incomplete final generation is not promoted to a usable final parent',async()=>{
 const j=await fixture(),v=supportView(j),source=j.diagnosisSession.hairSimulation.events.find(x=>x.id===pro(j).handoffs.at(-1).finalImageReference.generationId);
 source.status='FAILED';assert.equal(supportView(j).finalImage,null);assert.equal(supportView(j).source,null);
 source.status='COMPLETE';const rejected=reviewSimulation(j,source.id,{decision:'REJECTED',identity:'CONCERN',background:'NOT_REVIEWED',color:'NOT_REVIEWED',design:'NOT_REVIEWED',note:'検証用'});
 assert.equal(supportView(rejected).finalImage,null);assert.equal(v.finalImage,png);
});
test('Saved simulation angle cannot contradict the original photograph’s recorded direction',async()=>{
 const j=await fixture(),v=supportView(j),asset=j.diagnosisSession.hairSimulation.generatedAssets.find(x=>x.id===v.source.finalAssetId),binding=finishReference(asset.reference,'BACK',v,'検証');
 j.diagnosisSession.hairSimulation.events.find(x=>x.id===asset.eventId).request.contract.currentPhoto.direction='BACK';
 assert.equal(resolveConfirmedFinishReference(j,v,binding),null);
});

