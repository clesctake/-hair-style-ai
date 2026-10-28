import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog} from '../src/lib/catalog.ts';
import assets from '../src/data/journey_sample_assets.json' with {type:'json'};
import {createJourneySample,samplePreviewMatches} from '../src/lib/journey-sample.ts';
import {mockFaceAnalyzer,faceInputContext,validateFaceAnalysis,faceMetricSpecs} from '../src/lib/face-measurements.ts';
import {addFaceAnalysis,activeBangSet,bangDraft,changeBangDraft,adoptBangDesign,selectedBangDecision,requestBangTrial} from '../src/lib/bang-design.ts';
import {newJourney,recipeContext,proposeRecipes,recipeIsCurrent} from '../src/lib/journey.ts';
import {memoryJourneyStore} from '../src/lib/journey-store.ts';
import {hairImageInput} from '../src/lib/hair-images.ts';
import {newStyleParameters,simulationMode} from '../src/lib/design-target.ts';
const photo={id:'before',view:'front',name:'photo.jpg',dataUrl:assets.current.dataUrl,width:assets.current.width,height:assets.current.height,createdAt:new Date().toISOString()};
test('face data declares fixed MOCK numbers, unknown landmarks and no image measurement; side inputs and quality remain attributable',async()=>{
 const inputs=[photo,{...photo,id:'right',view:'right'},{...photo,id:'left',view:'left'}],a=await mockFaceAnalyzer.analyze(inputs);
 assert.equal(a.provider,'mock-fixed-example-v1');assert.equal(Object.keys(a.metrics).length,Object.keys(faceMetricSpecs).length);assert.equal(a.landmarks.length,0);assert.equal(a.faceLabel,null);assert.equal(a.metrics.nose_y.status,'not_assessed');assert.equal(a.metrics.nose_y.value,null);
 for(const m of Object.values(a.metrics)){assert.ok(['mock','not_assessed'].includes(m.status));assert.equal(m.confidence,null);}
 assert.equal(a.inputContext,faceInputContext(inputs));assert.equal(a.qualityInputs.length,3);assert.doesNotThrow(()=>validateFaceAnalysis(a));const lie=structuredClone(a);lie.metrics.face_height_width_ratio.status='image_estimate';assert.throws(()=>validateFaceAnalysis(lie),/出典/);await assert.rejects(mockFaceAnalyzer.analyze(inputs.slice(1)),/正面/);
});
test('five design proposals retain their originals while draft and stylist final decisions are stored separately and append only',async()=>{
 const {session}=await createJourneySample(catalog,assets),set=activeBangSet(session);assert.deepEqual(set.proposals.map(p=>p.label),['A','B','C','D','E']);const c=set.proposals[2],original=JSON.stringify(set);
 let s=changeBangDraft(session,c,{...c.parameters,length:'eye',width:'wide',density:'thick',part:'right',sideBang:'mouth',faceFrame:'chin'});assert.equal(JSON.stringify(activeBangSet(s)),original);assert.equal(bangDraft(s,c).width,'wide');s=adoptBangDesign(s,c);const chosen=selectedBangDecision(s);assert.equal(chosen.origin,'stylist_final');assert.equal(chosen.parameters.width,'wide');assert.equal(chosen.proposalId,c.id);
 s=requestBangTrial(s,c);assert.equal(s.faceDesign.trials[0].state,'not_connected');assert.equal(s.faceDesign.trials[0].generatedImage,null);assert.match(s.faceDesign.trials[0].requestText,/顔・表情・年齢/);assert.equal(s.after,null);
 const store=memoryJourneyStore(catalog),saved=await store.save(s),loaded=await store.load(saved.id);assert.deepEqual(loaded.faceDesign,s.faceDesign);assert.equal(loaded.target.finalDesignParameters.selectedBangDecisionId,chosen.id);
 const changed=structuredClone(loaded);changed.faceDesign.decisions[0].parameters.length='brow';await assert.rejects(store.save(changed),/履歴は変更/);
 const newPhoto={...loaded,photos:[{...photo,id:'new-person'}]};assert.equal(activeBangSet(newPhoto),undefined);assert.equal(selectedBangDecision(newPhoto),undefined);assert.equal(newPhoto.faceDesign.decisions.length,1);assert.equal(samplePreviewMatches(await createJourneySample(catalog,assets),newPhoto),false);
});
test('STYLE shape, face decisions and COLOR targets are independent; only colour changes invalidate FIOLE recipes',async()=>{
 const {session}=await createJourneySample(catalog,assets),context=recipeContext(session),set=activeBangSet(session);
 let changed={...session,target:{...session.target,styleReference:{...session.target.styleReference,id:'other-style'},style:'赤い髪のレイヤー写真から形だけ参照',styleParameters:{...newStyleParameters(),lengthOffsetCm:-5}}};changed=adoptBangDesign(changed,set.proposals[2]);assert.equal(recipeContext(changed),context);assert.equal(recipeIsCurrent(changed,session.proposals[0].context),true);
 assert.deepEqual(proposeRecipes(changed,catalog).map(p=>p.lines.map(l=>l.variantId)),session.proposals.map(p=>p.lines.map(l=>l.variantId)));assert.equal(changed.target.color,session.target.color);assert.equal(changed.target.reference,session.target.reference);
 const legacy=JSON.parse(context);legacy.target.style='昔の髪型テキスト';assert.equal(recipeIsCurrent(changed,JSON.stringify(legacy)),true);assert.equal(recipeIsCurrent({...changed,target:{...changed.target,color:{...changed.target.color,value:{...changed.target.color.value,L:70}}}},context),false);
 const input=hairImageInput(changed);assert.equal(input.roles.mode,'style_color');assert.equal(input.styleReference.id,'other-style');assert.equal(input.colorReference.id,session.target.reference.id);assert.match(input.requestText,/美容師が採用した前髪/);assert.equal(samplePreviewMatches(await createJourneySample(catalog,assets),changed),false);
});
test('STYLE-only and COLOR-only preserve the other axis and can save a style consultation without a mock hair diagnosis',async()=>{
 const base=newJourney();base.title='髪型相談';base.photos=[photo];base.target.styleReference={...photo,id:'style',view:'style_reference'};
 assert.equal(simulationMode(base),'style_only');const style=hairImageInput(base);assert.ok(style);assert.equal(style.colorReference,null);assert.match(style.requestText,/現在の髪色を維持/);
 const store=memoryJourneyStore(catalog),saved=await store.save(base),loaded=await store.load(saved.id);assert.equal(loaded.analyses.length,0);assert.equal(loaded.target.styleReference.id,'style');assert.equal(loaded.target.reference,null);assert.equal(loaded.proposals.length,0);
 const color={...base,target:{...base.target,styleReference:null,reference:{...photo,id:'color',view:'reference'},style:'オン眉にしたい',simulationMode:'color_only'}};
 const colorInput=hairImageInput(color);assert.equal(colorInput.styleReference,null);assert.equal(colorInput.roles.selectedBangDecisionId,null);assert.doesNotMatch(colorInput.requestText,/オン眉/);assert.match(colorInput.requestText,/現在の長さ/);
 const stylistOnly=addFaceAnalysis({...base,target:{...base.target,styleReference:null}},await mockFaceAnalyzer.analyze(base.photos));const faceOnly=adoptBangDesign(stylistOnly,activeBangSet(stylistOnly).proposals[0]);assert.ok(hairImageInput(faceOnly));assert.equal(hairImageInput(faceOnly).reference.id,photo.id);
});
