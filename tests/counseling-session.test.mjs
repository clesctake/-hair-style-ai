import test from 'node:test';
import assert from 'node:assert/strict';
import {newJourney} from '../src/lib/journey.ts';
import {catalog} from '../src/lib/catalog.ts';
import {withDiagnosisSession} from '../src/lib/session-adapter.ts';
import {effectiveHairZone} from '../src/lib/session-model.ts';
import {validateDiagnosisSession} from '../src/lib/session-validation.ts';
import {memoryJourneyStore} from '../src/lib/journey-store.ts';
import {FeatureRegistry} from '../src/lib/feature-registry.ts';
import {emptyCounselingState,counselingState,setCounselingInput,resetCounselingInputs,editCounseling,confirmCounseling,COUNSELING_MASTER_ID} from '../src/lib/counseling-session.ts';

const fixture=()=>{const j=newJourney();j.title='カウンセリング検証';return withDiagnosisSession(j,catalog);};
test('Counseling master is immutable and initial visible defaults are not invented clinical values',()=>{
 const state=emptyCounselingState();assert.equal(state.visualMasterId,COUNSELING_MASTER_ID);assert.ok(Object.values(state.inputs).every(v=>v===null));
 assert.equal(FeatureRegistry.counselingPageOne.state,'REAL');
 const s=fixture().diagnosisSession;assert.equal(s.hairAnalysis.aiEstimate.length,0);assert.equal(effectiveHairZone(s,'MID').damage.value,null);
});
test('Stylist hair input is independent of AI originals and supports all three zones',()=>{
 const before=fixture(),j=setCounselingInput(before,'porosity','高');assert.equal(before.diagnosisSession.hairAnalysis.stylistCorrection.length,0);
 assert.deepEqual(j.diagnosisSession.hairAnalysis.aiEstimate,before.diagnosisSession.hairAnalysis.aiEstimate);
 for(const z of ['ROOT','MID','END']){const v=effectiveHairZone(j.diagnosisSession,z).porosity;assert.equal(v.value,5);assert.equal(v.sourceType,'STYLIST_CORRECTED');}
 validateDiagnosisSession(j.diagnosisSession);
});
test('Gray percentage bands never become fabricated exact percentages',()=>{
 for(const label of ['～10%','10～30%','30%以上']){const j=setCounselingInput(fixture(),'grayPercentage',label);assert.equal(effectiveHairZone(j.diagnosisSession,'MID').grayPercentage.value,null);assert.equal(counselingState(j).inputs.grayPercentage,label);}
 assert.equal(effectiveHairZone(setCounselingInput(fixture(),'grayPercentage','なし').diagnosisSession,'MID').grayPercentage.value,0);
});
test('Unknown bleach counts and unknown history dates remain null',()=>{
 const j=setCounselingInput(fixture(),'bleachHistory','複数回'),h=j.diagnosisSession.hairHistory.at(-1);
 assert.equal(h.count,null);assert.equal(h.date,null);assert.equal(h.source.sourceType,'STYLIST_CORRECTED');assert.equal(h.type,'BLEACH');
});
test('Reset preserves prior stylist observations and existing clinical assets',()=>{
 let j=setCounselingInput(fixture(),'damage','中');j=setCounselingInput(j,'bleachHistory','1回');const old=structuredClone(j.diagnosisSession);
 j=resetCounselingInputs(j);assert.deepEqual(j.diagnosisSession.hairAnalysis.stylistCorrection.slice(0,old.hairAnalysis.stylistCorrection.length),old.hairAnalysis.stylistCorrection);
 assert.deepEqual(j.diagnosisSession.hairHistory.slice(0,old.hairHistory.length),old.hairHistory);assert.equal(effectiveHairZone(j.diagnosisSession,'MID').damage.value,null);
});
test('Notes and COLOR/STYLE references stay separate through stored revisions',async()=>{
 let j=editCounseling(fixture(),{historyNote:'縮毛矯正の履歴確認',requestNote:'赤みを抑えたい'});j=setCounselingInput(j,'damage','中');
 j.photos=[{id:'counseling-fixture-photo',view:'front',name:'MOCK storage fixture',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',width:1,height:1,createdAt:j.createdAt}];
 j.target.style='美容師による髪型の希望';
 const store=memoryJourneyStore(catalog);j=await store.save(j);const result=await store.load(j.id);
 assert.equal(counselingState(result).historyNote,'縮毛矯正の履歴確認');assert.equal(counselingState(result).requestNote,'赤みを抑えたい');
 assert.notEqual(result.diagnosisSession.styleTarget.id,result.diagnosisSession.colorTarget.id);assert.equal(result.diagnosisSession.specVersion,'1.1');
});
test('Confirmation persists a handoff without creating Page 2 or converting mock to real',()=>{
 const j=confirmCounseling(editCounseling(fixture(),{selectedMockPreview:'C'}),null);
 assert.equal(j.diagnosisSession.counseling.confirmation.mockPreview,'C');assert.equal(j.diagnosisSession.counseling.confirmation.generationState,'PARTIAL');assert.equal(j.diagnosisSession.counseling.confirmation.page2Status,'AWAITING_USER_APPROVAL');
 assert.equal(j.diagnosisSession.treatmentPlan.proposed.length,0);assert.equal(j.diagnosisSession.simulations.length,0);validateDiagnosisSession(j.diagnosisSession);
});
