import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog} from '../src/lib/catalog.ts';
import assets from '../src/data/journey_sample_assets.json' with {type:'json'};
import {createJourneySample} from '../src/lib/journey-sample.ts';
import {newBasePlan,fact,currentBase,targetAnalysis,requiredUnderCalculator,liftRouteCalculator,preLiftPredictor,onColorAssessment,newTreatment,validateBasePlan} from '../src/lib/base-making.ts';
import {correct,recipeContext,proposeRecipes} from '../src/lib/journey.ts';
import {memoryJourneyStore} from '../src/lib/journey-store.ts';
test('required base and lift route remain unknown, finish level does not invent a bleach threshold or an actual Lab',async()=>{
 const {session}=await createJourneySample(catalog,assets);session.baseMaking=newBasePlan();session.target.level=10;
 assert.equal(requiredUnderCalculator.calculate(session,'mid').requiredLevel.value,null);assert.equal(liftRouteCalculator.calculate(session,'mid').route.value,null);assert.equal(preLiftPredictor.predict(session,'mid').level.value,null);assert.equal(onColorAssessment(session,'mid').predictedFinalLab.value,null);assert.equal(targetAnalysis(session).targetFinishLevel.trust,'MOCK');
 assert.deepEqual(liftRouteCalculator.calculate(session,'mid').candidates,['ONE_COLOR','HIGH_LIFT_COLOR','LIGHTENER','BLEACH_1','BLEACH_2_PLUS','STYLIST_REVIEW']);
 session.baseMaking.zones.mid.requiredLevel=fact(14,'STYLIST_CORRECTED',[],'stylist_plan');session.baseMaking.zones.mid.requiredTone=fact('yellow','STYLIST_CORRECTED',[],'stylist_plan');assert.equal(requiredUnderCalculator.calculate(session,'mid').status,'stylist_set');assert.equal(session.target.level,10);assert.equal(requiredUnderCalculator.calculate(session,'end').status,'unknown');
});
test('natural melanin, artificial residue, AI observations and stylist corrections are distinct per zone and affect planning contexts',async()=>{
 const {session}=await createJourneySample(catalog,assets);const initial=recipeContext(session);session.baseMaking=newBasePlan();assert.notEqual(recipeContext(session),initial);const original=currentBase(session,'mid');const revised=correct(session,'mid','under_level',7);revised.baseMaking.zones.mid.artificialPigment=fact(4,'STYLIST_CORRECTED',[],'history_review');revised.baseMaking.zones.mid.hairOrigin=fact('colored','STYLIST_CORRECTED',[],'history_review');
 assert.equal(currentBase(revised,'mid').ai.level.value,original.ai.level.value);assert.equal(currentBase(revised,'mid').effective.level.value,7);assert.equal(currentBase(revised,'mid').effective.level.trust,'STYLIST_CORRECTED');assert.equal(currentBase(revised,'mid').naturalMelanin.value,null);assert.equal(currentBase(revised,'end').effective.artificialPigment.value,null);assert.equal(original.ai.level.trust,'MOCK');
 const context=recipeContext(revised);revised.target.style='unrelated shape';assert.equal(recipeContext(revised),context);assert.equal(proposeRecipes(revised,catalog)[0].status,'trial_requires_stylist');
});
test('pre lift and on color actual results retain independent evidence and survive revisions without changing previous results',async()=>{
 const {session}=await createJourneySample(catalog,assets);session.baseMaking=newBasePlan();session.proposals=[];session.selectedProposalId=null;
 const pre=newTreatment(session,'mid','PRE_LIFT');pre.actual.level=fact(14,'EMPIRICAL',[],'stylist_observation');pre.actual.tone=fact('yellow_orange','EMPIRICAL',[],'stylist_observation');pre.developer.h2o2Percent=fact(3,'EMPIRICAL',[],'recorded_label');pre.developer.mixRatio=fact(2,'EMPIRICAL',[],'actual_mix');pre.durationMin=25;
 session.baseMaking.stages.push(pre);session.baseMaking.zones.mid.predicted=structuredClone(pre.actual);const on=newTreatment(session,'mid','ON_COLOR');assert.equal(on.before.level.value,14);assert.equal(on.before.tone.value,'yellow_orange');assert.equal(on.actual.lab.value,null);session.baseMaking.stages.push(on);
 const store=memoryJourneyStore(catalog),saved=await store.save(session),loaded=await store.load(saved.id);assert.equal(loaded.baseMaking.stages.length,2);assert.equal(loaded.baseMaking.stages[0].developer.liftEffect.value,null);assert.equal(loaded.baseMaking.snapshot.current.end.naturalMelanin.value,null);
 const mutated=structuredClone(saved);mutated.baseMaking.stages[0].durationMin=30;await assert.rejects(store.save(mutated),/実績/);const next=await store.save({...saved,baseMaking:{...saved.baseMaking,stages:[...saved.baseMaking.stages,newTreatment(saved,'root','PRE_LIFT')]}});assert.equal(next.baseMaking.stages.length,3);
});
test('provenance and numeric bounds are enforced, unknown is never silently converted into a measured pass',()=>{
 const plan=newBasePlan();assert.doesNotThrow(()=>validateBasePlan(plan));plan.zones.root.requiredLevel=fact(14,null);assert.throws(()=>validateBasePlan(plan),/信頼/);plan.zones.root.requiredLevel=fact(25,'MOCK');assert.throws(()=>validateBasePlan(plan),/数値/);plan.zones.root.requiredLevel=fact(null);plan.zones.root.predicted.lab=fact({L:101,a:0,b:0},'AI_ESTIMATE');assert.throws(()=>validateBasePlan(plan),/Lab/);
});
