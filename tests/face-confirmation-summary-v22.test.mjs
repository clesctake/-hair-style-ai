import test from 'node:test';
import assert from 'node:assert/strict';
import {newJourney} from '../src/lib/journey.ts';
import {withDiagnosisSession} from '../src/lib/session-adapter.ts';
import {correctObservedFace} from '../src/lib/photo-analysis-pipeline.ts';
import {faceAnalysisSummary} from '../src/lib/effective-face-values.ts';
import {simulationFixture} from './helpers/simulation-fixture.mjs';
function manual(){const j=newJourney();j.photos=[structuredClone(simulationFixture('COLOR_ONLY').photos[0])];return withDiagnosisSession(j);}
test('registered FRONT without AI does not ask for the same photo again',()=>{
 const j=manual(),summary=faceAnalysisSummary(j.diagnosisSession);
 assert.equal(summary.title,'顔・骨格は未取得');assert.match(summary.detail,/AI解析は未完了/);assert.doesNotMatch(summary.detail,/正面写真をご用意/);
 assert.equal(faceAnalysisSummary(withDiagnosisSession(newJourney()).diagnosisSession).detail,'正面写真をご用意ください');
});
test('manual summary reports only non-null current corrections and never AI success',()=>{
 let j=correctObservedFace(manual(),'faceHeightWidthRatio',1.5),summary=faceAnalysisSummary(j.diagnosisSession);
 assert.equal(summary.title,'美容師確認値を保存しています');assert.match(summary.detail,/美容師確認 1項目/);assert.match(summary.detail,/AI解析は未完了/);
 j=correctObservedFace(j,'faceHeightWidthRatio',null);summary=faceAnalysisSummary(j.diagnosisSession);
 assert.equal(summary.title,'顔・骨格は未取得');assert.doesNotMatch(summary.detail,/美容師確認 1項目/);
});
test('manual summary never carries counts onto a replacement photo',()=>{
 const j=correctObservedFace(manual(),'faceHeightWidthRatio',1.5),next=withDiagnosisSession({...j,photos:[{...j.photos[0],id:'replacement'}]});
 assert.equal(faceAnalysisSummary(next.diagnosisSession).title,'顔・骨格は未取得');
});
test('existing real-model path and separate stylist correction remain distinguishable',()=>{
 let j=simulationFixture('COLOR_ONLY');assert.equal(faceAnalysisSummary(j.diagnosisSession).title,'顔の位置関係を取得しました');
 j=correctObservedFace(j,'faceHeightWidthRatio',1.5);assert.match(faceAnalysisSummary(j.diagnosisSession).detail,/AI推定.*美容師確認 1項目/);
});
