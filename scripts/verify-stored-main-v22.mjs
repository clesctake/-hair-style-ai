/** Offline integration ONLY. Reuses real image bytes inside a synthetic test contract.
 * Does not restore the original consultation and is not evidence of a browser/API generation.
 * No fetch, server write or persistent customer storage. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {completedMainWithRetainedPlan,confirmTestSupport,testReview} from '../tests/helpers/main-handoff-fixture.mjs';
import {reviewMainSimulation} from '../src/lib/hair-simulation-session.ts';
import {counselingFinalDesign} from '../src/lib/counseling-generation.ts';
import {supportView} from '../src/lib/after-support-session.ts';
import {memoryJourneyStore} from '../src/lib/journey-store.ts';
import {catalog} from '../src/lib/catalog.ts';
import {encodeJourneyRevision,decodeJourneyRevision} from '../src/lib/journey-storage-codec.ts';
import {validateDiagnosisSession} from '../src/lib/session-validation.ts';
import {observeReviewPhoto,compareReviewPhotos} from '../src/lib/after-review-analysis.ts';
import {requireVisionContext} from '../src/lib/vision-context.ts';
const [input,output]=process.argv.slice(2);if(!input||!output)throw new Error('Usage: node --experimental-strip-types scripts/verify-stored-main-v22.mjs INPUT_PNG OUTPUT_JSON');
globalThis.fetch=async()=>{throw new Error('Network prohibited in this offline test');};
const bytes=readFileSync(input);assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20),sha256=createHash('sha256').update(bytes).digest('hex');
const dataUrl='data:image/png;base64,'+bytes.toString('base64'),store=memoryJourneyStore(catalog);
let j=completedMainWithRetainedPlan({dataUrl,width,height,sha256});assert.equal(counselingFinalDesign(j),null);
j=reviewMainSimulation(j,testReview);assert.equal(counselingFinalDesign(j).dataUrl,dataUrl);
j=confirmTestSupport(j);validateDiagnosisSession(j.diagnosisSession);assert.equal(supportView(j).finalImage,dataUrl);
const recipeId=j.diagnosisSession.proDesign.selectedRecipeId;
j=await store.save(j);j=await store.load(j.id);j=await decodeJourneyRevision(await encodeJourneyRevision(j));
const final=supportView(j);assert.equal(final.finalImage,dataUrl);assert.equal(j.diagnosisSession.proDesign.selectedRecipeId,recipeId);
const restoredBytes=Buffer.from(final.finalImage.split(',')[1],'base64');assert.equal(createHash('sha256').update(restoredBytes).digest('hex'),sha256);
assert.throws(()=>requireVisionContext({getContext:()=>null}),/WebGL 2/);
// No segmentation/landmarks were obtained: verify that no invented score appears.
const unavailable=observeReviewPhoto('FRONT',new Uint8ClampedArray(32*32*4),32,32,new Uint8Array(32*32),[],['TEST ONLY: WebGL unavailable']);
const review=compareReviewPhotos(unavailable,unavailable);assert.ok(Object.values(review.scores).every(s=>s.value===null));
const result={mode:'OFFLINE_SYNTHETIC_CONTRACT',originalConsultationRestored:false,paidApiCalls:0,source:'previously generated real PNG bytes',image:{width,height,byteSize:bytes.length,sha256},checks:{explicitMainReview:true,page2FinalImageReference:true,page3ExactBytes:true,recipeSaveRestore:true,storageCodecRestore:true,sourceStale:final.sourceStale,webglFailureDetected:true,unavailableReviewScores:review.scores},limitations:['No browser MAIN adoption','No new generation','No real segmentation/face analysis','Not a Page 3 PNG export']};
writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
