import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeCaptureFrame,primaryQualityWarnings,validateCaptureMetadata,captureDirections} from '../src/lib/capture-quality.ts';
import {demoAnalyzer} from '../src/lib/journey.ts';
import {catalog} from '../src/lib/catalog.ts';
import {createJourneySample} from '../src/lib/journey-sample.ts';
import assets from '../src/data/journey_sample_assets.json' with {type:'json'};
import {memoryJourneyStore} from '../src/lib/journey-store.ts';
const frame=(paint)=>{const width=100,height=134,data=new Uint8ClampedArray(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const c=paint(x/width,y/height,x,y);data.set([c,c,c,255],(y*width+x)*4);}return {width,height,data};};
const check=(paint,previous,aligned=false)=>analyzeCaptureFrame(frame(paint),previous,aligned);
test('exposure clipping and backlight are detected independently and prioritized without duplicate warnings',()=>{
 const bright=check(()=>255).quality;assert.equal(bright.grade,'NG');assert.equal(bright.checks.white_clip.state,'ng');assert.equal(bright.checks.exposure.state,'ng');assert.deepEqual(primaryQualityWarnings(bright),['white_clip']);
 const dark=check(()=>0).quality;assert.equal(dark.checks.black_clip.state,'ng');assert.equal(dark.checks.blur.state,'not_assessed');
 const back=check((x,y)=>x>.15&&x<.85&&y>.045&&y<.8?20:240).quality;assert.equal(back.checks.backlight.state,'ng');assert.equal(back.checks.white_clip.state,'pass');assert.ok(primaryQualityWarnings(back).includes('backlight'));assert.ok(primaryQualityWarnings(back).length<=2);
});
test('blur proxy distinguishes textured sharp detail from smooth blurred gradients; motion is a temporal proxy',()=>{
 const sharp=check((x,y,px,py)=>(px+py)%2?150:90);assert.equal(sharp.quality.checks.blur.state,'pass');assert.equal(sharp.quality.checks.motion.state,'not_assessed');
 const smooth=check(x=>80+80*x);assert.equal(smooth.quality.checks.blur.state,'ng');
 const moving=check((x,y,px,py)=>(px+py)%2?210:150,sharp.gray);assert.equal(moving.quality.checks.motion.state,'caution');
 assert.equal(check((x,y,px,py)=>(px+py)%2?150:90,sharp.gray).quality.checks.motion.state,'pass');
});
test('position is a foreground proxy, manual alignment is separate, and future checks never silently pass',()=>{
 const offset=(x,y)=>x>.08&&x<.32&&y>.15&&y<.7?100:180;
 const q=check(offset).quality;assert.equal(q.checks.position.state,'caution');assert.match(q.checks.position.message,/右/);assert.match(q.checks.position.method,/not_head_detection/);
 const manual=check(offset,undefined,true).quality;assert.equal(manual.checks.position.state,'pass');assert.equal(manual.checks.position.method,'stylist_guide_confirmation');assert.equal(manual.checks.position.metrics.autoProxyWarning,1);
 for(const k of ['framing','lens_haze','color_cast','uneven_light','reflection'])assert.equal(manual.checks[k].state,'not_assessed');
 const natural=check(()=>110).quality;assert.equal(natural.grade,'CAUTION');assert.equal(natural.checks.position.state,'not_assessed');
 assert.throws(()=>analyzeCaptureFrame({width:2,height:2,data:new Uint8ClampedArray(16)}),/解析画像/);
});
test('four-direction records retain original bytes, per-check results and stylist overrides; legacy records stay readable',async()=>{
 const {session}=await createJourneySample(catalog,assets),original=session.photos[0],at=new Date().toISOString(),quality=check(()=>0).quality;
 session.photos=captureDirections.map(direction=>({...original,id:crypto.randomUUID(),view:direction,capture:{version:'standard-capture-v1',direction,source:'library',capturedAt:null,importedAt:at,quality,accepted:{at,by:'stylist',qualityOverride:true},guide:{version:'salon-head-guide-v1',manualAligned:false},device:{facingMode:null,width:null,height:null,frameRate:null},calibration:{status:'uncalibrated',reference:null,correction:null},original:{dataUrl:original.dataUrl,mimeType:'image/jpeg',byteSize:Buffer.from(original.dataUrl.split(',')[1],'base64').length,width:original.width,height:original.height,representation:'original_file_bytes',colourProcessing:'none_app_applied',profile:'not_parsed'}}}));
 const analysis=await demoAnalyzer.analyze(session.photos);session.analyses.push(analysis);session.activeAnalysisId=analysis.id;session.proposals=[];session.selectedProposalId=null;
 const store=memoryJourneyStore(catalog),saved=await store.save(session),loaded=await store.load(saved.id);assert.deepEqual(loaded.photos.map(p=>p.view),captureDirections);assert.deepEqual(loaded.photos[0].capture,session.photos[0].capture);assert.equal(loaded.photos[0].capture.quality.grade,'NG');assert.equal(loaded.photos[0].capture.original.dataUrl,original.dataUrl);
 const wrong=structuredClone(loaded);wrong.photos[0].capture.direction='back';await assert.rejects(store.save(wrong),/撮影情報/);
 const invalid=structuredClone(loaded);invalid.photos[0].capture.guide.crop={x:.9,y:0,width:.5,height:1};assert.throws(()=>validateCaptureMetadata(invalid.photos[0].capture,'front'),/切り出し/);
 const legacy=(await createJourneySample(catalog,assets)).session;legacy.photos[0].view='side';const legacySaved=await store.save(legacy);assert.equal((await store.load(legacySaved.id)).photos[0].view,'side');assert.equal((await store.load(legacySaved.id)).photos[0].capture,undefined);
});
