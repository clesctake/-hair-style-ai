import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog} from '../src/lib/catalog.ts';
import {newJourney} from '../src/lib/journey.ts';
import {simulationFixture} from './helpers/simulation-fixture.mjs';
import {withDiagnosisSession} from '../src/lib/session-adapter.ts';
import {validateDiagnosisSession,assertSessionHistory} from '../src/lib/session-validation.ts';
import {memoryJourneyStore} from '../src/lib/journey-store.ts';
import {setCounselingInput,editCounseling,confirmCounseling} from '../src/lib/counseling-session.ts';
import {FeatureRegistry} from '../src/lib/feature-registry.ts';
import {ensureProDesign,proDesignInputs,proDesignFingerprint,proDesignAssistFingerprint,calculateProDesignRecipes,currentRecipeSet,selectProRecipe,setProDeveloper,recipesAreCurrent,toggleNextColor,setNextTone,applyNextColorProposal,applyMessageProposal,editProDesign,editStylistMessage,confirmProDesign,customerSupportPayload,defaultSalonConfiguration,colorPipeline} from '../src/lib/pro-design-session.ts';
import {makeAssistRequest,handleProDesignAssist} from '../src/lib/pro-design-assist.ts';
import worker from '../site-worker/index.ts';

const fixture=()=>calculateProDesignRecipes(ensureProDesign(simulationFixture(),catalog),catalog);
const pro=j=>j.diagnosisSession.proDesign;
const record=(j,kind,extra={})=>({id:crypto.randomUUID(),kind,createdAt:new Date().toISOString(),sourceType:'MOCK',provider:'MOCK_TRANSPORT',model:'NOT_REAL_AI',requestId:null,inputFingerprint:proDesignAssistFingerprint(j),usage:{inputTokens:null,outputTokens:null},text:null,options:null,...extra});
const colors=j=>['BEIGE','GREIGE','BROWN'].reduce((x,f)=>toggleNextColor(x,f),j);
function confirmable(){let j=fixture();j=selectProRecipe(j,currentRecipeSet(j).recipes[0].id);j=colors(j);j=editStylistMessage(j,'ご来店ありがとうございました。次回も髪の状態を見ながらご相談しましょう。');return editProDesign(j,{message:{...pro(j).message,reviewedAt:new Date().toISOString()}});}

test('Page 2 addition is optional and reads legacy Page 1 without losing any existing asset',()=>{
 const old=withDiagnosisSession(newJourney(),catalog),copy=structuredClone(old.diagnosisSession),j=ensureProDesign(old,catalog);
 assert.equal(pro(j).parentSessionId,old.diagnosisSession.id);assert.equal(pro(j).schemaVersion,'pro-design-v1');
 for(const key of Object.keys(copy))assert.deepEqual(j.diagnosisSession[key],copy[key]);validateDiagnosisSession(j.diagnosisSession);
});
test('Page 1 confirmation, person/style/color, hair and face reference the same session',()=>{
 const input=confirmCounseling(editCounseling(simulationFixture(),{historyNote:'過去のカラー',requestNote:'透明感'}),null),j=ensureProDesign(input,catalog),i=pro(j).inputSnapshot;
 assert.equal(i.sessionId,input.diagnosisSession.id);assert.notEqual(i.styleTarget.referenceImage.imageId,i.colorTarget.referenceImage.imageId);assert.deepEqual(i.colorTarget,input.diagnosisSession.colorTarget);assert.equal(i.counselingConfirmationId,input.diagnosisSession.counseling.confirmation.id);assert.equal(i.faceEstimateId,input.diagnosisSession.faceBoneAnalysis.activeEstimateId);
});
test('Effective ROOT/MID/END use stylist correction without overwriting AI estimates',()=>{
 const input=simulationFixture(),ai=structuredClone(input.diagnosisSession.hairAnalysis.aiEstimate),j=ensureProDesign(setCounselingInput(input,'damage','高'),catalog);
 for(const z of ['ROOT','MID','END'])assert.equal(proDesignInputs(j,pro(j).settings).hairZones[z].damage.value,5);assert.deepEqual(j.diagnosisSession.hairAnalysis.aiEstimate,ai);
});
test('Changing STYLE hair shape never replaces confirmed COLOR reference',()=>{
 const j=fixture(),target=structuredClone(j.diagnosisSession.colorTarget),changed=ensureProDesign(withDiagnosisSession({...j,target:{...j.target,style:'短めのレイヤー'}},catalog),catalog);assert.deepEqual(changed.diagnosisSession.colorTarget,target);
});
test('Three objective cards use only registered FIOLE products and actual manufacturer diagram evidence',()=>{
 const j=fixture(),r=currentRecipeSet(j).recipes;assert.deepEqual(r.map(x=>x.label),['A','B','C']);assert.equal(new Set(r.map(x=>x.objective)).size,3);assert.ok(r.every(x=>x.proposal.fioleDrugs.length>0));
 for(const x of r)for(const d of x.proposal.fioleDrugs){assert.ok(catalog.records.some(p=>p.id===d.productId));assert.equal(d.dyeVector.source.sourceType,'MANUFACTURER');assert.equal(d.dyeVector.interpretation,'DIAGRAM_COMPOSITION_NOT_CHEMICAL_CONCENTRATION');}
});
test('Unknown under, lift, blend ratios, grams, predicted Lab and fidelity remain NULL',()=>{
 const j=fixture();for(const r of currentRecipeSet(j).recipes){assert.equal(r.reproductionScore,null);assert.equal(r.predictedFinish,null);assert.equal(r.mixingRatio.value,null);assert.ok(r.proposal.ratios.every(v=>v.value===null));assert.equal(r.proposal.totalGrams.value,null);assert.equal(r.proposal.featureState,'PARTIAL');}
 for(const z of Object.values(colorPipeline(j))){assert.equal(z.required.requiredLevel.value,null);assert.equal(z.route.route.value,null);assert.equal(z.onColor.predictedFinalLab.value,null);}
});
test('Missing CURRENT or unconfirmed COLOR shows three empty proposals rather than fixed demo recipes',()=>{
 const j=calculateProDesignRecipes(ensureProDesign(newJourney(),catalog),catalog);assert.equal(currentRecipeSet(j).recipes.length,3);assert.ok(currentRecipeSet(j).recipes.every(r=>!r.proposal.fioleDrugs.length));
});
test('Salon registration input excludes unregistered drugs and preserves settings history',()=>{
 const j=fixture(),settings={...defaultSalonConfiguration(catalog),enabledFirstAgentIds:['DOES_NOT_EXIST']};assert.throws(()=>ensureProDesign(j,catalog,settings),/登録済み/);
 const configured={...defaultSalonConfiguration(catalog),revision:2,enabledFirstAgentIds:[]},next=ensureProDesign(j,catalog,configured);validateDiagnosisSession(next.diagnosisSession);assert.deepEqual(pro(next).recipeSets,pro(j).recipeSets);
});
test('Selectable recipe and developer store separately; unregistered OX is rejected',()=>{
 let j=fixture(),r=currentRecipeSet(j).recipes[1];j=setProDeveloper(j,r.id,'DEV_OX3');j=selectProRecipe(j,r.id);assert.equal(pro(j).selectedRecipeId,r.id);assert.equal(j.diagnosisSession.treatmentPlan.ox.productId,'DEV_OX3');assert.equal(j.diagnosisSession.treatmentPlan.ox.concentrationPercent.value,null);assert.throws(()=>setProDeveloper(j,r.id,'FAKE'),/登録済み/);validateDiagnosisSession(j.diagnosisSession);
});
test('Changed Page 1 input invalidates recipes without deleting previous proposals',()=>{
 const j=fixture(),changed=ensureProDesign(editCounseling(j,{requestNote:'新しい希望'}),catalog);assert.equal(recipesAreCurrent(changed),false);assert.throws(()=>selectProRecipe(changed,currentRecipeSet(j).recipes[0].id),/変わりました/);const next=calculateProDesignRecipes(changed,catalog);assert.equal(pro(next).recipeSets.length,2);assert.deepEqual(pro(next).recipeSets[0],pro(j).recipeSets[0]);
});
test('Next color has at most three unique families and saves tone, order and reason',()=>{
 let j=colors(fixture());assert.throws(()=>toggleNextColor(j,'RED'),/3色まで/);j=setNextTone(j,'GREIGE','DOWN');assert.equal(pro(j).nextColors[1].tone,'DOWN');assert.deepEqual(pro(j).nextColors.map(x=>x.order),[0,1,2]);assert.ok(pro(j).nextColors.every(x=>x.reason));j=toggleNextColor(j,'BEIGE');assert.deepEqual(pro(j).nextColors.map(x=>x.order),[0,1]);
});
test('Mock AI transport adds only missing colors and preserves MOCK provenance',()=>{
 let j=toggleNextColor(fixture(),'BEIGE');const proposal=record(j,'NEXT_COLORS',{options:[{family:'ASH',tone:'BASE',reason:'寒色の方向',order:1,sourceType:'MOCK',sourceId:null,needsStylistConfirmation:true},{family:'PINK',tone:'BASE',reason:'暖色の方向',order:2,sourceType:'MOCK',sourceId:null,needsStylistConfirmation:true}]});j=applyNextColorProposal(j,proposal);assert.equal(pro(j).nextColors.length,3);assert.equal(pro(j).nextColors[0].sourceType,'STYLIST_CORRECTED');assert.equal(pro(j).nextColors[1].sourceType,'MOCK');assert.equal(pro(j).aiHistory[0].sourceType,'MOCK');validateDiagnosisSession(j.diagnosisSession);
});
test('Changing selection, notes or aftercare rejects a late AI response',()=>{
 const j=fixture(),r=record(j,'MESSAGE',{text:'保存しない古い返答'});for(const change of [toggleNextColor(j,'BEIGE'),editProDesign(j,{message:{...pro(j).message,notes:'追加メモ'}}),editProDesign(j,{aftercare:{...pro(j).aftercare,visitWeeks:8}})])assert.throws(()=>applyMessageProposal(change,r),/条件が変わりました/);
});
test('Registered salon menu and product snapshots plus five care focuses save',()=>{
 const j=fixture(),settings={...pro(j).settings,menus:[{id:'mock-menu',name:'MOCK:登録メニュー',active:true}],productCatalog:{catalogId:'mock-catalog',salonId:'mock-salon',schemaVersion:'product-catalog-v1',revision:1,products:[{productId:'mock-oil',brand:'MOCK',productName:'MOCK:登録商品',category:'OIL',image:null,price:null,targetConcerns:[],features:[],usageTiming:null,usageMethod:null,salonMemo:'TEST ONLY',active:true}]}};
 const configured=ensureProDesign(j,catalog,settings),next=editProDesign(configured,{aftercare:{visitWeeks:null,customWeeks:5,menuId:'mock-menu',menuSnapshot:{id:'mock-menu',name:'MOCK:登録メニュー'},homeCare:['COLOR_RETENTION','DAMAGE','HEAT','DRYNESS','UV'],productIds:['mock-oil'],productSnapshots:settings.productCatalog.products}});validateDiagnosisSession(next.diagnosisSession);assert.equal(pro(next).aftercare.customWeeks,5);assert.equal(pro(next).aftercare.productSnapshots[0].productName,'MOCK:登録商品');
});
test('AI message original is preserved when stylist edits the text; review is required again',()=>{
 const j=fixture(),r=record(j,'MESSAGE',{text:'MOCK通信で生成した文章'}),generated=applyMessageProposal(j,r),edited=editStylistMessage(generated,'美容師が確認・編集した文章');assert.deepEqual(pro(edited).aiHistory[0],r);assert.equal(pro(edited).message.sourceType,'STYLIST_CORRECTED');assert.equal(pro(edited).message.reviewedAt,null);assert.equal(pro(generated).message.sourceType,'MOCK');
});
test('Confirmation saves Page 3 handoff in the same session and omits professional drug/OX fields',()=>{
 const j=confirmProDesign(confirmable()),payload=customerSupportPayload(j);assert.equal(pro(j).handoffs.length,1);assert.equal(payload.sessionId,j.diagnosisSession.id);assert.equal(payload.nextColors.length,3);assert.equal(pro(j).handoffs[0].generationStatus,'PARTIAL');assert.doesNotMatch(JSON.stringify(payload),/fioleDrugs|mixingRatio|developerId|DEV_OX/);validateDiagnosisSession(j.diagnosisSession);
});
test('Incomplete recipe, colors, or unreviewed message cannot be silently confirmed',()=>{
 assert.throws(()=>confirmProDesign(fixture()),/レシピ/);let j=fixture();j=selectProRecipe(j,currentRecipeSet(j).recipes[0].id);assert.throws(()=>confirmProDesign(j),/3色/);j=colors(j);assert.throws(()=>confirmProDesign(editStylistMessage(j,'確認前')),/メッセージ/);
});
test('Saving/reloading keeps Page 1 data, COLOR, recipe, OX, next colors and message',async()=>{
 const store=memoryJourneyStore(catalog);let j=confirmable();j=setProDeveloper(j,pro(j).selectedRecipeId,'DEV_OX3');j=confirmProDesign(j);j=await store.save(j);const loaded=await store.load(j.id);assert.deepEqual(pro(loaded),pro(j));assert.deepEqual(loaded.diagnosisSession.colorTarget,j.diagnosisSession.colorTarget);assert.deepEqual(loaded.diagnosisSession.hairAnalysis,j.diagnosisSession.hairAnalysis);
});
test('Historical handoffs are immutable and survive newer settings/recipe sets',()=>{
 const j=confirmProDesign(confirmable()),next=calculateProDesignRecipes(j,catalog);assertSessionHistory(j.diagnosisSession,next.diagnosisSession);const changed=structuredClone(next);changed.diagnosisSession.proDesign.handoffs[0].message='改変';assert.throws(()=>assertSessionHistory(j.diagnosisSession,changed.diagnosisSession),/変更|履歴|原本|保持|変更できません/);
});
test('Feature registry distinguishes data input/search/AI connection from uncalibrated optimization',()=>{
 assert.equal(FeatureRegistry.proDesignPage.state,'REAL');assert.equal(FeatureRegistry.proDesignRecipeReview.state,'PARTIAL');assert.equal(FeatureRegistry.nextColorAiCompletion.state,'PARTIAL');assert.equal(FeatureRegistry.requiredUnderCalculator.state,'UNIMPLEMENTED');
});
test('Assist request is text-only and excludes original photos, keys and fake salon level',()=>{
 const j=fixture(),r=makeAssistRequest(j,'MESSAGE');assert.equal(r.context.targetFinishLevel,null);assert.equal(r.inputFingerprint,proDesignAssistFingerprint(j));assert.doesNotMatch(JSON.stringify(r),/data:image|OPENAI_API_KEY/);assert.equal(r.context.currentHair.MID.damage.value,null);
});
test('No API key returns explicit 503 without making any provider request',async()=>{
 let calls=0;const r=await handleProDesignAssist(new Request('https://unit.test/api/pro-design/assist',{method:'POST',body:'invalid'}),{},{fetcher:async()=>{calls++;throw new Error('must not call');}});assert.equal(r.status,503);assert.equal((await r.json()).providerAttempted,false);assert.equal(calls,0);
});
test('GET exposes only connection state; server key never appears in response',async()=>{
 const r=await handleProDesignAssist(new Request('https://unit.test/api/pro-design/assist'),{apiKey:'UNIT_TEST_NOT_REAL'});const text=await r.text();assert.equal(JSON.parse(text).configured,true);assert.doesNotMatch(text,/UNIT_TEST_NOT_REAL/);
});
test('Malformed inputs and duplicate selection are rejected before provider call',async()=>{
 const r=makeAssistRequest(fixture(),'NEXT_COLORS');r.selected=[{family:'BEIGE',tone:'BASE'},{family:'BEIGE',tone:'BASE'}];const output=await handleProDesignAssist(new Request('https://unit.test/api/pro-design/assist',{method:'POST',body:JSON.stringify(r)}),{apiKey:'UNIT_TEST_NOT_REAL'});assert.equal(output.status,400);assert.equal((await output.json()).providerAttempted,false);
});
test('Structured text AI transport is connected, missing colors remain same brightness, MOCK is preserved',async()=>{
 const j=toggleNextColor(fixture(),'BEIGE'),body=makeAssistRequest(j,'NEXT_COLORS');let sent;
 const r=await handleProDesignAssist(new Request('https://unit.test/api/pro-design/assist',{method:'POST',body:JSON.stringify(body)}),{apiKey:'UNIT_TEST_NOT_REAL'},{provenance:'MOCK',fetcher:async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/chat/completions');sent=JSON.parse(options.body);return Response.json({model:'MOCK_TRANSPORT_ONLY',choices:[{finish_reason:'stop',message:{content:JSON.stringify({options:[{family:'ASH',tone:'BASE',reason:'寒色方向との比較'},{family:'PINK',tone:'BASE',reason:'暖色方向との比較'}]})}}],usage:{prompt_tokens:10,completion_tokens:15}},{headers:{'x-request-id':'mock-request'}});}});
 assert.equal(r.status,200);assert.equal(sent.response_format.json_schema.strict,true);const result=await r.json();assert.equal(result.record.sourceType,'MOCK');assert.ok(result.record.options.every(c=>c.sourceType==='MOCK'));assert.equal(result.record.requestId,'mock-request');assert.equal(pro(applyNextColorProposal(j,result.record)).nextColors.length,3);
});
test('Structured message AI transport returns editable text and preserves failure details safely',async()=>{
 const body=makeAssistRequest(fixture(),'MESSAGE'),request=()=>new Request('https://unit.test/api/pro-design/assist',{method:'POST',body:JSON.stringify(body)});
 const good=await handleProDesignAssist(request(),{apiKey:'UNIT_TEST_NOT_REAL'},{provenance:'MOCK',fetcher:async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({text:'ご来店ありがとうございました。'})}}]})});assert.equal((await good.json()).record.text,'ご来店ありがとうございました。');
 const bad=await handleProDesignAssist(request(),{apiKey:'UNIT_TEST_NOT_REAL'},{fetcher:async()=>new Response('private_provider_information',{status:429})});assert.equal(bad.status,502);assert.doesNotMatch(await bad.text(),/private_provider_information|UNIT_TEST_NOT_REAL/);
});
test('Worker enforces authentication/origin and preserves direct Page 2 reload routing',async()=>{
 const req=headers=>new Request('https://unit.test/api/pro-design/assist',{method:'POST',headers,body:'invalid'});assert.equal((await worker.fetch(req({}),{})).status,401);assert.equal((await worker.fetch(req({'oai-authenticated-user-id':'mock','origin':'https://other.test'}),{})).status,403);assert.equal((await worker.fetch(req({'oai-authenticated-user-id':'mock'}),{})).status,503);
 const r=await worker.fetch(new Request('https://unit.test/fiole/pro-design'),{ASSETS:{fetch:async r=>new Response(new URL(r.url).pathname)}});assert.equal(await r.text(),'/');
});
