import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog} from '../src/lib/catalog.ts';
import assets from '../src/data/journey_sample_assets.json' with {type:'json'};
import {createJourneySample,samplePreviewMatches} from '../src/lib/journey-sample.ts';
import {memoryJourneyStore} from '../src/lib/journey-store.ts';
import {aiValue,effectiveValue,correct} from '../src/lib/journey.ts';

test('sample consultation saves AI, stylist, goal and trial without manufacturing a real After or outcome',async()=>{
 const sample=await createJourneySample(catalog,assets);
 assert.equal(sample.session.photos.length,1);
 assert.equal(sample.session.target.reference.view,'reference');
 assert.equal(aiValue(sample.session,'mid','damage').value,3);
 assert.equal(effectiveValue(sample.session,'mid','damage').value,4);
 assert.equal(sample.preview.origin,'pre_generated_sample');
 assert.ok(sample.preview.dataUrl.startsWith('data:image/jpeg;base64,'));
 const store=memoryJourneyStore(catalog),saved=await store.save(sample.session),loaded=await store.load(saved.id);
 assert.equal(loaded.actual,null);assert.equal(loaded.after,null);
 assert.equal(loaded.outcome.colorMatch,null);assert.equal(loaded.outcome.actualAfterColor,null);
 assert.equal(loaded.proposals.length,3);
 assert.equal(loaded.target.styleReference.view,'style_reference');assert.equal(loaded.imageGenerations?.length??0,0);assert.equal(loaded.faceDesign.analyses[0].provider,'mock-fixed-example-v1');
 assert.equal(samplePreviewMatches(sample,loaded),true);
});

test('pre-generated finish cannot be attributed to another photo, goal, diagnosis or recipe',async()=>{
 const sample=await createJourneySample(catalog,assets),s=sample.session;
 assert.equal(samplePreviewMatches(sample,s),true);
 for(const changed of [
  {...s,photos:[{...s.photos[0],id:'another-photo'}]},
  {...s,target:{...s.target,text:'別の希望色'}},
  {...s,selectedProposalId:s.proposals[1].id},
  correct(s,'mid','damage',5),
 ])assert.equal(samplePreviewMatches(sample,changed),false);
});
