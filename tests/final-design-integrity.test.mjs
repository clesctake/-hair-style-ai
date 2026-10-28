import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {simulationFixture,fixtureResponse} from './helpers/simulation-fixture.mjs';
import {counselingFinalDesign,counselingFinalDisplay} from '../src/lib/counseling-generation.ts';
import {queueSimulationBatch,beginSimulationJob,completeSimulationJob} from '../src/lib/hair-simulation-session.ts';
import {withDiagnosisSession} from '../src/lib/session-adapter.ts';
import {latestSimulationEvent} from '../src/lib/hair-simulation-context.ts';
import {createToneBuffer} from '../src/lib/live-tone.ts';
import {renderColorModal} from '../src/lib/color-modal-preview.ts';
import {defaultTargetControls} from '../src/lib/target-adjustment.ts';
const w=20,h=30,pixels=Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:60+(i%71)),mask=Uint8Array.from({length:w*h},(_,i)=>i%w<5?255:0),buffer=createToneBuffer(pixels,w,h);
for(const [label,controls] of [['zero',{}],['red +1',{target_redness:1}],['light +10',{target_lightness:10}],['combined',{target_lightness:10,target_saturation:8,target_redness:1,target_yellowness:-8,target_mutedness:10,target_beige:15,target_transparency:20}]])test('final pipeline / '+label+' recomputes from original; comparison never affects pixels',()=>{
 const draft={controls:{...defaultTargetControls(),...controls},hueShift:0};const a=renderColorModal(buffer,draft,mask,true).pixels,b=renderColorModal(buffer,draft,mask,true).pixels;assert.deepEqual(a,b);
 for(let i=0;i<mask.length;i++){assert.equal(a[i*4+3],pixels[i*4+3]);if(!mask[i])assert.deepEqual(a.slice(i*4,i*4+4),pixels.slice(i*4,i*4+4));}
 if(label==='zero')assert.deepEqual(a,pixels);if(label==='red +1')assert.ok(Math.max(...a.map((v,i)=>Math.abs(v-pixels[i])))<=2);
});
function completed(){let j=queueSimulationBatch(simulationFixture()),job=j.diagnosisSession.hairSimulation.jobs[0];j=beginSimulationJob(j,job.id);const e=latestSimulationEvent(j.diagnosisSession,job.id);return completeSimulationJob(j,job.id,fixtureResponse(e.request,'REAL_API'));}
test('unchanged current generated image is passed byte-for-byte, never colored twice',()=>{const j=completed(),a=counselingFinalDesign(j);assert.ok(a);assert.equal(counselingFinalDisplay(j).dataUrl,a.dataUrl);});
for(const key of ['style','text'])test('changing '+key+' after confirmation hides stale asset without deleting it',()=>{const j=completed(),k=withDiagnosisSession({...j,target:{...j.target,[key]:'changed condition'}});assert.equal(counselingFinalDesign(k),null);assert.equal(k.diagnosisSession.hairSimulation.generatedAssets.length,1);});
test('manual mask/color preview cannot be promoted to STYLE completion; reopen retains ungenerated state',()=>{const j=simulationFixture();j.diagnosisSession.counseling={...j.diagnosisSession.counseling,personColorPreviews:[{previewPhoto:{dataUrl:'UNSAFE_CACHE'}}]};assert.equal(counselingFinalDisplay(j).status,'NOT_GENERATED');assert.deepEqual(counselingFinalDisplay(structuredClone(j)),counselingFinalDisplay(j));});
test('legacy spliced provider result is retained but is not a safe final asset',()=>{const j=completed(),e=j.diagnosisSession.hairSimulation.events.at(-1);e.metadata.postprocessing={version:'hair-only-protection-v1'};assert.equal(counselingFinalDesign(j),null);assert.equal(j.diagnosisSession.hairSimulation.generatedAssets.length,1);});
test('final card and modal never call legacy transfer renderer; mock examples are unmodified',()=>{const s=readFileSync('src/components/counseling-page-one.tsx','utf8'),card=s.slice(s.indexOf(' const finalImage='),s.indexOf(' return <div className="cfa-counseling-outer')),modal=s.slice(s.indexOf(" {dialog==='final'"),s.indexOf(" {dialog==='handoff'"));for(const v of [card,modal])assert.doesNotMatch(v,/CounselingHairPhoto|target=\{colorLab\}/);assert.match(modal,/未加工/);});
