import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deflateSync} from 'node:zlib';
import {validateSupportPng,canShareSupportPng,deliverSupportPng,supportUsesImageFallback,supportPhotoPlacement,assertSupportPhotosFit,assertSupportSheetFits,SUPPORT_CARD_BOUNDS} from '../src/lib/after-support-sheet.ts';
import {restoreSupportSources} from '../src/lib/after-support-restore.ts';
import {ensureAfterSupport,supportView} from '../src/lib/after-support-session.ts';
import {newJourney} from '../src/lib/journey.ts';
import {simulationFixture,fixtureResponse} from './helpers/simulation-fixture.mjs';
import {runSimulationJobs} from '../src/lib/hair-simulation-pipeline.ts';
import {selectSimulationDesign} from '../src/lib/hair-simulation-session.ts';
import {ensureProDesign,calculateProDesignRecipes,currentRecipeSet,selectProRecipe,toggleNextColor,editStylistMessage,editProDesign,confirmProDesign} from '../src/lib/pro-design-session.ts';
import {catalog} from '../src/lib/catalog.ts';

// Transport fixture only: never a rendered Page 3 or an actual iPhone export.
function fixturePng(){
 const chunk=(name,data)=>{const body=Buffer.concat([Buffer.from(name),data]);let crc=0xffffffff;
  for(const byte of body){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  const result=Buffer.alloc(data.length+12);result.writeUInt32BE(data.length);body.copy(result,4);result.writeUInt32BE((crc^0xffffffff)>>>0,result.length-4);return result;};
 const header=Buffer.alloc(13);header.writeUInt32BE(2048);header.writeUInt32BE(3072,4);header[8]=8;header[9]=6;
 const rows=Buffer.alloc(3072*(2048*4+1));
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
const bytes=fixturePng(),blob=data=>new Blob([data],{type:'image/png'});
test('A ready PNG has image data, valid chunk checksums and the complete IEND',async()=>{
 await validateSupportPng(blob(bytes));
 await assert.rejects(()=>validateSupportPng(blob(bytes.subarray(0,24))),/途中|完了/);
 await assert.rejects(()=>validateSupportPng(blob(bytes.subarray(0,-12))),/完了/);
 const corrupt=Buffer.from(bytes);corrupt[45]^=1;await assert.rejects(()=>validateSupportPng(blob(corrupt)),/データ検証/);
 await assert.rejects(()=>validateSupportPng(blob(Buffer.concat([bytes,Buffer.from('tail')]))),/完了/);
});
test('A throwing or missing canShare falls back inside the tap and never reports a share success',async()=>{
 const file=new File([bytes],'sheet.png',{type:'image/png'});let fallback=0;
 const nav={share:()=>{throw Error('must not share');},canShare:()=>{throw Error('not supported in this context');}};
 assert.equal(canShareSupportPng(file,nav),false);
 const result=deliverSupportPng(file,nav,()=>fallback++);assert.equal(fallback,1);assert.equal(await result,'DOWNLOADED');
 assert.equal(canShareSupportPng(file,{share:nav.share}),false);
});
test('iPhone, iPad and iPad desktop mode use the image-open alternative; desktop downloads remain',()=>{
 for(const nav of [{userAgent:'iPhone Safari',platform:'iPhone',maxTouchPoints:5},{userAgent:'iPad',platform:'iPad',maxTouchPoints:5},{userAgent:'Macintosh Safari',platform:'MacIntel',maxTouchPoints:5}])assert.equal(supportUsesImageFallback(nav),true);
 assert.equal(supportUsesImageFallback({userAgent:'Macintosh',platform:'MacIntel',maxTouchPoints:0}),false);
});
test('Every shipped master photo fits its unchanged slot at one aspect ratio without losing source pixels',()=>{
 const sizes={front:[180,222],side:[91,95],back:[91,99],frame:[90,95],'hair-detail':[86,95],texture:[185,97],face:[182,201],...Object.fromEntries(Array.from({length:5},(_,i)=>['bang-'+i,[173,108]])),...Object.fromEntries(Array.from({length:4},(_,i)=>['fade-'+i,[152,133]])),...Object.fromEntries(Array.from({length:3},(_,i)=>['next-'+i,[i?146:147,168]])),...Object.fromEntries(Array.from({length:3},(_,i)=>['makeup-'+i,[108,119]]))};
 for(const [name,[w,h]]of Object.entries(sizes)){
  const data=readFileSync(new URL('../public/after-support-master/'+name+'.jpg',import.meta.url));assert.ok(data.length>0);
  for(const [fw,fh]of [[w,h],[84,84],[190,202],[120,171]]){
   const placed=supportPhotoPlacement(w,h,fw,fh);assert.ok(placed.width<=fw+.001&&placed.height<=fh+.001);assert.ok(placed.left>=-.000001&&placed.top>=-.000001);assert.ok(Math.abs(placed.width/placed.height-w/h)<.00001);
  }
 }
 assert.throws(()=>supportPhotoPlacement(0,100,100,100),/寸法/);
});
const rect=(left,top,width,height)=>({left,top,right:left+width,bottom:top+height,width,height});
test('Photo validation catches overflow, wrong fit and broken sources instead of exporting clipped images',()=>{
 const parent={getBoundingClientRect:()=>rect(0,0,90,95)},image={naturalWidth:800,naturalHeight:1200,alt:'SIDE',parentElement:parent,matches:()=>true,getBoundingClientRect:()=>rect(0,0,90,95)};
 const style={objectFit:'contain'},sheet={querySelectorAll:()=>[image],ownerDocument:{defaultView:{getComputedStyle:()=>style}}};
 assert.doesNotThrow(()=>assertSupportPhotosFit(sheet));style.objectFit='cover';assert.throws(()=>assertSupportPhotosFit(sheet),/枠内/);style.objectFit='contain';
 image.getBoundingClientRect=()=>rect(0,-10,90,115);assert.throws(()=>assertSupportPhotosFit(sheet),/枠内/);
 image.naturalWidth=0;assert.throws(()=>assertSupportPhotosFit(sheet),/読み込めません/);
});
test('Nested text clipping and card overflow identify the section without deleting confirmed text',()=>{
 class Element{};
 const cards=Object.entries(SUPPORT_CARD_BOUNDS).map(([section,[x,y,w,h]])=>({dataset:{section},getBoundingClientRect:()=>rect(x,y,w,h),clientWidth:w-2,scrollWidth:w-2,clientHeight:h-2,scrollHeight:h-2}));
 const target=cards[4],parent=Object.assign(new Element(),{parentElement:target,getBoundingClientRect:()=>rect(21,939,170,202)}),text={textContent:'確定文\n全文を保持',parentElement:parent};
 let line=rect(25,946,100,14);
 target.ownerDocument={defaultView:{HTMLElement:Element,getComputedStyle:()=>({overflowX:'hidden',overflowY:'hidden'})},createTreeWalker:()=>{let read=false;return {nextNode:()=>read?null:(read=true,text)};},createRange:()=>({selectNodeContents:()=>{},getClientRects:()=>[line]})};
 const sheet={getBoundingClientRect:()=>rect(0,0,1024,1536),querySelectorAll:()=>cards};
 assert.doesNotThrow(()=>assertSupportSheetFits(sheet));line=rect(25,1140,100,14);assert.throws(()=>assertSupportSheetFits(sheet),/5：骨格分析/);assert.equal(text.textContent,'確定文\n全文を保持');
 target.scrollHeight=300;assert.throws(()=>assertSupportSheetFits(sheet),/5：骨格分析/);
});
test('A failed last-record load does not hide an existing draft and neither record is mutated',async()=>{
 const draft=ensureAfterSupport(newJourney());draft.title='改行保持\n削除禁止';
 const before=structuredClone(draft),restored=await restoreSupportSources('missing',async()=>{throw Error('記録が見つかりません。');},async()=>draft);
 assert.equal(restored.journey,draft);assert.deepEqual(draft,before);assert.deepEqual(restored.errors,['記録が見つかりません。']);
});
test('Restoring a confirmed handoff after one storage failure keeps Page 1/2 image, values, care and verbatim message',async()=>{
 // Synthetic provider transport, not a live API or customer record.
 let j=await runSimulationJobs(simulationFixture(),{transport:async request=>fixtureResponse(request,'REAL_API'),persist:async next=>next});
 j=selectSimulationDesign(j,j.diagnosisSession.hairSimulation.jobs.find(x=>x.label==='A').id);
 j=calculateProDesignRecipes(ensureProDesign(j,catalog),catalog);j=selectProRecipe(j,currentRecipeSet(j).recipes[0].id);
 for(const family of ['BEIGE','PINK','MATTE'])j=toggleNextColor(j,family);
 j=editStylistMessage(j,'確定したメッセージ\n改行と全文を保持。');
 const p=j.diagnosisSession.proDesign;j=editProDesign(j,{message:{...p.message,reviewedAt:new Date().toISOString()},aftercare:{...p.aftercare,visitWeeks:6,homeCare:['COLOR_RETENTION','UV']}});
 j=ensureAfterSupport(confirmProDesign(j));const before=structuredClone(j),expected=supportView(j);
 const restored=await restoreSupportSources('not-found',async()=>{throw Error('記録が見つかりません。');},async()=>j),actual=supportView(restored.journey);
 assert.deepEqual(actual,expected);assert.deepEqual(j,before);assert.equal(actual.nextColors.length,3);assert.equal(actual.aftercare.visitWeeks,6);assert.equal(actual.message,'確定したメッセージ\n改行と全文を保持。');assert.ok(actual.finalImage);assert.ok(actual.faceValues.faceHeightWidthRatio.value);assert.equal(restored.errors.length,1);
});
test('A failed draft load preserves the saved record; two failures remain explicit rather than empty success',async()=>{
 const record=newJourney();let draftRead=false;
 const restored=await restoreSupportSources('saved',async()=>record,async()=>{draftRead=true;throw Error('下書き読込失敗');});
 assert.equal(restored.journey,record);assert.equal(draftRead,true);assert.deepEqual(restored.errors,['下書き読込失敗']);
 const none=await restoreSupportSources('saved',async()=>{throw Error('保存版読込失敗');},async()=>{throw Error('下書き読込失敗');});assert.equal(none.journey,null);assert.equal(none.errors.length,2);
});
test('Successful restore selects the latest existing store; absent source stays absent without invented data',async()=>{
 const record=newJourney(),draft={...newJourney(),updatedAt:'9999-01-01T00:00:00Z'};
 assert.equal((await restoreSupportSources('saved',async()=>record,async()=>draft)).journey,draft);
 const restored=await restoreSupportSources(null,async()=>{throw Error('must not load');},async()=>null);assert.equal(restored.journey,null);assert.deepEqual(restored.errors,[]);
 const v=supportView(ensureAfterSupport(newJourney()));assert.equal(v.handoff,null);assert.equal(v.finalImage,null);assert.deepEqual(v.nextColors,[]);assert.equal(v.aftercare,null);assert.equal(v.message,'');
});
