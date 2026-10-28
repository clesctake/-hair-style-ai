import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog } from '../src/lib/catalog.ts';
import assets from '../src/data/journey_sample_assets.json' with {type:'json'};
import { createJourneySample } from '../src/lib/journey-sample.ts';
import { colorDifference, direction, proposeRecipes, recipeContext } from '../src/lib/journey.ts';
import { memoryJourneyStore } from '../src/lib/journey-store.ts';
import { hairImageInput } from '../src/lib/hair-images.ts';
import { defaultTargetControls, targetDraft, pendingTargetAdjustment, confirmedTargetAdjustment, confirmTargetAdjustment,
  normalizeTargetControls, validateTargetAdjustment } from '../src/lib/target-adjustment.ts';
import { srgbToLab, labToSrgb, adjustLab, createToneBuffer, renderTone, sampleImageLab } from '../src/lib/live-tone.ts';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLXcAAAAASUVORK5CYII=';

test('sRGB conversion has standard reference values and returns display RGB within one byte',()=>{
 const red=srgbToLab(255,0,0),white=srgbToLab(255,255,255),black=srgbToLab(0,0,0);
 assert.ok(Math.abs(red.L-53.24)<.02);assert.ok(Math.abs(red.a-80.09)<.02);assert.ok(Math.abs(red.b-67.2)<.02);
 assert.ok(Math.abs(white.L-100)<.001);assert.ok(Math.abs(white.a)<.001);assert.ok(Math.abs(white.b)<.001);assert.equal(black.L,0);
 for(const rgb of [[0,0,0],[255,255,255],[128,128,128],[65,40,20],[180,130,90],[255,0,0],[0,255,0],[0,0,255]]){
  const decoded=labToSrgb(srgbToLab(...rgb)).rgb;decoded.forEach((n,i)=>assert.ok(Math.abs(n-rgb[i])<=1));
 }
});
test('neutral preview preserves original bytes; controls really change pixels and preserve alpha',()=>{
 const pixels=Uint8ClampedArray.from([100,75,50,255,160,130,100,127]),buffer=createToneBuffer(pixels,2,1),zero=defaultTargetControls();
 assert.deepEqual(renderTone(buffer,zero).pixels,pixels);
 const bright=renderTone(buffer,{...zero,target_lightness:35});assert.ok(srgbToLab(...bright.pixels.slice(0,3)).L>srgbToLab(...pixels.slice(0,3)).L+7);
 assert.equal(bright.pixels[3],255);assert.equal(bright.pixels[7],127);
 const lessRed=renderTone(buffer,{...zero,target_redness:-25});assert.ok(srgbToLab(...lessRed.pixels.slice(0,3)).a<srgbToLab(...pixels.slice(0,3)).a-5);
 const gray=renderTone(buffer,{...zero,target_mutedness:80}),c=lab=>Math.hypot(lab.a,lab.b);
 assert.ok(c(srgbToLab(...gray.pixels.slice(0,3)))<c(srgbToLab(...pixels.slice(0,3))));
 const softenedLow=adjustLab({L:25,a:8,b:18},{...zero,target_transparency:100}),softenedHigh=adjustLab({L:75,a:8,b:18},{...zero,target_transparency:100});
 assert.ok(softenedHigh.L-softenedLow.L<50);assert.ok(softenedLow.L>25);
});
test('manual patch sampling excludes the unrelated background and rejects transparent samples',()=>{
 const pixels=new Uint8ClampedArray(20*20*4);
 for(let y=0;y<20;y++)for(let x=0;x<20;x++){const i=(y*20+x)*4;pixels.set(x<10?[80,55,30,255]:[255,255,255,255],i);}
 const point={x:.2,y:.5,radius:.1,selected:true,method:'manual_circle'};
 const sampled=sampleImageLab(pixels,20,20,point),expected=srgbToLab(80,55,30);
 assert.ok(colorDifference(sampled,expected).deltaE76<1e-8);
 assert.throws(()=>sampleImageLab(new Uint8ClampedArray(16),2,2,point),/採色/);
});

async function ready(){const {session}=await createJourneySample(catalog,assets);return session;}
function editable(s,changes={}){const draft=targetDraft(s);return {...s,target:{...s.target,adjustmentDraft:{...draft,controls:{...draft.controls,...changes},samplePoint:{...draft.samplePoint,selected:true}}}};}
const preview={dataUrl:png,width:16,height:20,sourceLab:{L:48,a:11,b:22},adjustedLab:{L:64,a:2,b:18},clippedPixelFraction:.015};

test('confirmation keeps original, adjusted preview, UI values, normalized values and uncali­brated target separate',async()=>{
 const base=await ready(),before=JSON.stringify(base.target.reference),editing=editable(base,{target_lightness:25,target_redness:-20,target_transparency:40});
 assert.equal(pendingTargetAdjustment(editing),true);assert.throws(()=>proposeRecipes(editing,catalog),/確定/);assert.equal(hairImageInput(editing),null);
 const confirmed=confirmTargetAdjustment(editing,preview),record=confirmedTargetAdjustment(confirmed);
 assert.equal(pendingTargetAdjustment(confirmed),false);assert.equal(JSON.stringify(confirmed.target.reference),before);
 assert.equal(record.referencePhoto.dataUrl,base.target.reference.dataUrl);assert.equal(record.previewPhoto.dataUrl,png);
 assert.equal(record.controls.target_lightness,25);assert.equal(record.normalizedControls.target_lightness,.5);assert.equal(record.normalizedControls.target_redness,-.4);
 assert.equal(record.color.origin,'image_preview_estimate');assert.equal(record.color.measurement,'not_measured');assert.equal(record.color.provenance.calibration,'uncalibrated_srgb_image');
 assert.equal(confirmed.after,null);assert.equal(confirmed.actual,null);assert.equal(confirmed.target.level,base.target.level);
 assert.equal(hairImageInput(confirmed).reference.id,record.previewPhoto.id);assert.match(hairImageInput(confirmed).requestText,/調整後の希望写真/);
});
test('recipe context uses confirmed target and rejects later drafts; candidates stay in the existing library',async()=>{
 const base=await ready(),confirmed=confirmTargetAdjustment(editable(base,{target_redness:-30}),preview);
 const recipes=proposeRecipes(confirmed,catalog);assert.equal(recipes.length,3);assert.ok(recipes.every(p=>p.algorithmVersion==='image-target-direction-demo-v2'));
 assert.equal(recipes[0].context,recipeContext(confirmed));assert.match(recipes[0].reasons[0],/確定した調整後画像/);
 for(const proposal of recipes)for(const line of proposal.lines)assert.ok(catalog.variants.some(v=>v.id===line.variantId));
 assert.notDeepEqual(direction(base),direction(confirmed));
 const changed=editable(confirmed,{target_lightness:45});assert.equal(pendingTargetAdjustment(changed),true);assert.notEqual(recipeContext(changed),recipes[0].context);
 assert.throws(()=>proposeRecipes(changed,catalog),/確定/);assert.equal(hairImageInput(changed),null);
});
test('saved adjustment confirmations survive reload and remain append only across reconfirmation',async()=>{
 const store=memoryJourneyStore(catalog),confirmed=confirmTargetAdjustment(editable(await ready()),preview);
 const saved=await store.save(confirmed),loaded=await store.load(saved.id);
 assert.deepEqual(loaded.targetAdjustments,confirmed.targetAdjustments);assert.deepEqual(loaded.target.color,preview.adjustedLab?confirmed.target.color:null);
 const second=confirmTargetAdjustment(editable(loaded,{target_beige:70}),{...preview,adjustedLab:{L:66,a:3,b:19}});
 const updated=await store.save(second);assert.equal(updated.targetAdjustments.length,2);assert.equal(updated.targetAdjustments[0].id,saved.targetAdjustments[0].id);
 const altered=structuredClone(updated);altered.targetAdjustments[0].referencePhoto.name='changed';
 await assert.rejects(store.save(altered),/履歴は変更/);
 await assert.rejects(store.save({...updated,targetAdjustments:updated.targetAdjustments.slice(1)}),/履歴は変更/);
 assert.equal((await store.load(saved.id)).targetAdjustments.length,2);
});
test('invalid control ranges, unselected patch and mismatched normalization are rejected',async()=>{
 const s=await ready();assert.throws(()=>confirmTargetAdjustment(s,preview),/髪をタップ/);
 assert.throws(()=>confirmTargetAdjustment(editable(s,{target_lightness:51}),preview),/範囲/);
 const record=confirmedTargetAdjustment(confirmTargetAdjustment(editable(s),preview));
 assert.throws(()=>validateTargetAdjustment({...record,normalizedControls:{...normalizeTargetControls(record.controls),target_beige:1}}),/不正/);
});
