import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyHairMask, demoHairMask, rasterizeHairMask, validateHairMask } from '../src/lib/hair-mask.ts';
import { createToneBuffer, renderTone, sampleImageLab, srgbToLab } from '../src/lib/live-tone.ts';
import { defaultTargetControls, targetDraft, targetDraftContext, confirmTargetAdjustment, confirmedTargetAdjustment,
  pendingTargetAdjustment, validateTargetAdjustment } from '../src/lib/target-adjustment.ts';
import { catalog } from '../src/lib/catalog.ts';
import assets from '../src/data/journey_sample_assets.json' with {type:'json'};
import { createJourneySample } from '../src/lib/journey-sample.ts';
import { memoryJourneyStore } from '../src/lib/journey-store.ts';
import { hairImageInput } from '../src/lib/hair-images.ts';
import { proposeRecipes, recipeContext } from '../src/lib/journey.ts';

test('all seven tone controls preserve every unselected RGBA byte, including skin and background holes',()=>{
  const width=40,height=40,mask={...emptyHairMask('photo'),polygons:[[{x:.1,y:.1},{x:.9,y:.1},{x:.9,y:.9},{x:.1,y:.9}]],
    strokes:[{operation:'erase',diameter:.3,points:[{x:.5,y:.5}]}]},weights=rasterizeHairMask(mask,width,height);
  const pixels=new Uint8ClampedArray(width*height*4);
  for(let p=0;p<width*height;p++)pixels.set([78+p%33,55+p%22,38+p%19,p%4===0?128:255],p*4);
  const buffer=createToneBuffer(pixels,width,height),zero=defaultTargetControls();
  for(const key of Object.keys(zero)){
    const rendered=renderTone(buffer,{...zero,[key]:key==='target_redness'?-40:40},weights).pixels;
    let changed=0,protectedPixels=0;
    for(let p=0;p<weights.length;p++){
      assert.equal(rendered[p*4+3],pixels[p*4+3]);
      if(!weights[p]){assert.deepEqual(rendered.slice(p*4,p*4+4),pixels.slice(p*4,p*4+4),key);protectedPixels++;}
      else if(rendered[p*4]!==pixels[p*4]||rendered[p*4+1]!==pixels[p*4+1]||rendered[p*4+2]!==pixels[p*4+2])changed++;
    }
    assert.ok(changed>300,key);assert.ok(protectedPixels>500);assert.equal(weights[20*width+20],0);
  }
  assert.deepEqual(renderTone(buffer,{...zero,target_lightness:50},new Uint8Array(width*height)).pixels,pixels);
  assert.throws(()=>renderTone(buffer,zero,new Uint8Array(1)),/サイズ/);
});
test('feather blends inward only and strokes can add, erase and restore the selected hair without leaks',()=>{
  let mask={...emptyHairMask('photo'),feather:.02,polygons:[[{x:.2,y:.2},{x:.8,y:.2},{x:.8,y:.8},{x:.2,y:.8}]]};
  const weights=rasterizeHairMask(mask,200,200);
  assert.equal(weights[100*200+39],0);assert.ok(weights[100*200+40]>0&&weights[100*200+40]<255);assert.equal(weights[100*200+50],255);
  mask={...mask,strokes:[{operation:'erase',diameter:.15,points:[{x:.5,y:.4},{x:.5,y:.6}]}]};
  assert.equal(rasterizeHairMask(mask,200,200)[100*200+100],0);
  mask.strokes.push({operation:'add',diameter:.05,points:[{x:.5,y:.5}]});
  assert.equal(rasterizeHairMask(mask,200,200)[100*200+100],255);
  assert.equal(rasterizeHairMask({...mask,strokes:mask.strokes.slice(0,-1)},200,200)[100*200+100],0);
  assert.throws(()=>validateHairMask(mask,'other-photo'),/範囲/);
});
test('the hand-traced demo selects hair and excludes forehead, face, neck, blouse and background at multiple resolutions',()=>{
  for(const [w,h]of [[448,560],[410,512],[205,256]]){
    const mask=rasterizeHairMask(demoHairMask('fixture'),w,h),at=(x,y)=>mask[Math.floor(y*h)*w+Math.floor(x*w)];
    for(const [x,y]of [[.31,.44],[.6,.11],[.75,.5]])assert.ok(at(x,y)>127,`hair ${x},${y}`);
    for(const [x,y]of [[.5,.25],[.51,.39],[.53,.55],[.48,.82],[.06,.4],[.92,.4]])assert.equal(at(x,y),0,`protected ${x},${y}`);
  }
});
test('target sampling excludes nonhair pixels inside a circular patch and rejects a skin-only patch',()=>{
  const width=20,height=20,pixels=new Uint8ClampedArray(width*height*4),weights=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const p=y*width+x;pixels.set(x<10?[80,55,30,255]:[230,180,155,255],p*4);weights[p]=x<10?255:0;
  }
  const sampled=sampleImageLab(pixels,width,height,{x:.49,y:.5,radius:.15,selected:true,method:'manual_circle'},weights);
  const expected=srgbToLab(80,55,30);for(const k of['L','a','b'])assert.ok(Math.abs(sampled[k]-expected[k])<1e-7);
  assert.throws(()=>sampleImageLab(pixels,width,height,{x:.8,y:.5,radius:.1,selected:true,method:'manual_circle'},weights),/髪/);
});
test('hair-only confirmation stores the editable mask; changing or replacing it blocks recipe and image generation until reconfirmed',async()=>{
  const {session}=await createJourneySample(catalog,assets),draft=targetDraft(session);
  const editing={...session,target:{...session.target,adjustmentDraft:{...draft,controls:{...draft.controls,target_lightness:30},samplePoint:{...draft.samplePoint,selected:true}}}};
  const preview={dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLXcAAAAASUVORK5CYII=',width:410,height:512,sourceLab:{L:45,a:9,b:20},adjustedLab:{L:54,a:9,b:20},clippedPixelFraction:0};
  const confirmed=confirmTargetAdjustment(editing,preview),record=confirmedTargetAdjustment(confirmed);
  assert.equal(record.scope,'reference_image_hair_mask');assert.equal(record.algorithmVersion,'image-lab-hair-tone-v2');assert.deepEqual(record.hairMask,draft.hairMask);
  const store=memoryJourneyStore(catalog);confirmed.proposals=proposeRecipes(confirmed,catalog);const saved=await store.save(confirmed),loaded=await store.load(saved.id);
  assert.deepEqual(loaded.targetAdjustments[0].hairMask,draft.hairMask);assert.equal(pendingTargetAdjustment(loaded),false);assert.ok(hairImageInput(loaded));
  const changed=structuredClone(loaded);changed.target.adjustmentDraft.hairMask.strokes.push({operation:'erase',diameter:.08,points:[{x:.31,y:.44}]});
  assert.equal(pendingTargetAdjustment(changed),true);assert.notEqual(recipeContext(changed),loaded.proposals[0].context);assert.throws(()=>proposeRecipes(changed,catalog),/確定/);assert.equal(hairImageInput(changed),null);
  assert.throws(()=>confirmTargetAdjustment(changed,preview),/髪の範囲/);
  const wrong=structuredClone(loaded);wrong.target.adjustmentDraft.hairMask.referencePhotoId='other';assert.throws(()=>confirmTargetAdjustment(wrong,preview),/範囲/);
  const blank=structuredClone(editing);blank.target.adjustmentDraft.hairMask=emptyHairMask(draft.referencePhotoId);assert.throws(()=>confirmTargetAdjustment(blank,preview),/髪の範囲/);
  const altered=structuredClone(saved);altered.targetAdjustments[0].hairMask.polygons[0][0].x=.3;await assert.rejects(store.save(altered),/履歴は変更|不正/);
  const legacyDraft={version:'live-tone-draft-v1',referencePhotoId:record.referencePhoto.id,controls:record.controls,samplePoint:record.samplePoint};
  const {hairMask,...withoutMask}=record,legacy={...withoutMask,version:'live-tone-confirmation-v1',algorithmVersion:'image-lab-tone-v1',scope:'reference_image_full_frame',draftContext:targetDraftContext(legacyDraft)};
  assert.doesNotThrow(()=>validateTargetAdjustment(legacy));
  const legacyCase={...loaded,target:{...loaded.target,adjustmentDraft:legacyDraft},targetAdjustments:[legacy]};
  assert.equal(targetDraft(legacyCase).version,'live-tone-draft-v2');assert.equal(pendingTargetAdjustment(legacyCase),true);assert.equal(hairImageInput(legacyCase),null);
  assert.equal(legacyCase.targetAdjustments[0].scope,'reference_image_full_frame');
});
