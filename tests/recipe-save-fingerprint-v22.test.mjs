import test from 'node:test';
import assert from 'node:assert/strict';
import {simulationFixture} from './helpers/simulation-fixture.mjs';
import {catalog} from '../src/lib/catalog.ts';
import {newBasePlan,fact} from '../src/lib/base-making.ts';
import {memoryJourneyStore} from '../src/lib/journey-store.ts';
import {ensureProDesign,calculateProDesignRecipes,currentRecipeSet,selectProRecipe,toggleNextColor,editStylistMessage,editProDesign,confirmProDesign,recipesAreCurrent,proDesignFingerprint} from '../src/lib/pro-design-session.ts';
function ready(){let j=calculateProDesignRecipes(ensureProDesign({...simulationFixture(),baseMaking:newBasePlan()},catalog),catalog);j=selectProRecipe(j,currentRecipeSet(j).recipes[0].id);for(const family of ['BEIGE','GREIGE','BROWN'])j=toggleNextColor(j,family);j=editStylistMessage(j,'架空サロン検証用\n全文保持');return editProDesign(j,{message:{...j.diagnosisSession.proDesign.message,reviewedAt:j.updatedAt}});}
test('Saving and reloading a selected recipe with a base-making snapshot still permits Page 3 handoff',async()=>{
 const store=memoryJourneyStore(catalog);let j=ready();const selected=j.diagnosisSession.proDesign.selectedRecipeId,before=proDesignFingerprint(j,j.diagnosisSession.proDesign.settings);
 j=await store.save(j);assert.ok(j.baseMaking.snapshot);assert.equal(recipesAreCurrent(j),true,'a derived snapshot written by save is not a changed clinical condition');assert.equal(proDesignFingerprint(j,j.diagnosisSession.proDesign.settings),before);
 j=await store.load(j.id);assert.equal(j.diagnosisSession.proDesign.selectedRecipeId,selected);j=confirmProDesign(j);assert.equal(j.diagnosisSession.proDesign.handoffs.at(-1).selectedRecipeId,selected);j=await store.save(j);assert.equal(recipesAreCurrent(j),true);assert.equal((await store.load(j.id)).diagnosisSession.proDesign.handoffs.at(-1).message,'架空サロン検証用\n全文保持');
});
test('Ignoring the derived snapshot does not ignore an actual change in base-making conditions or mutate history',()=>{
 const j=ready(),before=JSON.stringify(j.baseMaking),n=structuredClone(j);n.baseMaking.zones.mid.currentTone=fact('orange','STYLIST_CORRECTED',[],'stylist_confirmed');assert.equal(recipesAreCurrent(n),false);assert.throws(()=>confirmProDesign(n),/条件が変わりました/);assert.equal(JSON.stringify(j.baseMaking),before);
});
