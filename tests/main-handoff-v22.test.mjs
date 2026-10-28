import test from 'node:test';
import assert from 'node:assert/strict';
import {completedMainWithRetainedPlan,confirmTestSupport,testReview as review} from './helpers/main-handoff-fixture.mjs';
import {reviewMainSimulation} from '../src/lib/hair-simulation-session.ts';
import {counselingFinalDesign,alignCounselingSelection} from '../src/lib/counseling-generation.ts';
import {supportView} from '../src/lib/after-support-session.ts';
import {memoryJourneyStore} from '../src/lib/journey-store.ts';
import {catalog} from '../src/lib/catalog.ts';
import {withDiagnosisSession} from '../src/lib/session-adapter.ts';
test('COLOR_ONLY retained A-E shape selection must not hide an explicitly adopted current MAIN',()=>{
 let j=completedMainWithRetainedPlan();assert.equal(counselingFinalDesign(j),null);
 j=alignCounselingSelection(reviewMainSimulation(j,review));
 assert.equal(counselingFinalDesign(j)?.id,j.diagnosisSession.hairSimulation.generatedAssets[0].id);
 assert.equal(j.diagnosisSession.hairSimulation.generatedAssets.length,1);
});
test('reviewed MAIN pixels and recipe selection survive Page 1 to 2 to 3 and storage',async()=>{
 const store=memoryJourneyStore(catalog);let j=confirmTestSupport(reviewMainSimulation(completedMainWithRetainedPlan(),review));
 const v=supportView(j),pixels=j.diagnosisSession.hairSimulation.generatedAssets[0].dataUrl;
 assert.equal(v.finalImage,pixels);assert.equal(v.sourceStale,false);assert.equal(v.handoff.generationStatus,'REAL');
 const recipe=j.diagnosisSession.proDesign.selectedRecipeId;j=await store.save(j);j=await store.load(j.id);
 assert.equal(j.diagnosisSession.proDesign.selectedRecipeId,recipe);assert.equal(supportView(j).finalImage,pixels);
 assert.match(supportView(j).message,/\nKeep the complete message/);
});
test('MAIN rejection removes its Page 3 display; changed conditions retain bytes but stop current adoption',()=>{
 let j=confirmTestSupport(reviewMainSimulation(completedMainWithRetainedPlan(),review));
 const bytes=j.diagnosisSession.hairSimulation.generatedAssets[0].dataUrl;
 j=reviewMainSimulation(j,{...review,decision:'REJECTED',identity:'CONCERN'});
 assert.equal(counselingFinalDesign(j),null);assert.equal(supportView(j).finalImage,null);
 j=reviewMainSimulation(j,review);j=withDiagnosisSession({...j,target:{...j.target,text:'TEST ONLY changed color request'}});
 assert.equal(counselingFinalDesign(j),null);assert.equal(supportView(j).sourceStale,true);
 assert.equal(j.diagnosisSession.hairSimulation.generatedAssets[0].dataUrl,bytes);
 assert.throws(()=>reviewMainSimulation(j,review),/現在/);
});
