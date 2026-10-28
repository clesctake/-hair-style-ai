import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {SUPPORT_SHEET,SUPPORT_CARD_BOUNDS,supportSheetLayout,supportPngName,validateSupportPng,encodeSupportCanvas,assertSupportSheetFits,waitForSupportImage,waitForSupportFonts,withSheetTimeout,deliverSupportPng} from '../src/lib/after-support-sheet.ts';

// A generated transport fixture, not a browser capture or a customer's exported image.
function png(width,height){
 const crc=data=>{let n=0xffffffff;for(const byte of data){n^=byte;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return (n^0xffffffff)>>>0;};
 const chunk=(type,data)=>{const tag=Buffer.from(type),body=Buffer.concat([tag,data]),result=Buffer.alloc(data.length+12);result.writeUInt32BE(data.length,0);body.copy(result,4);result.writeUInt32BE(crc(body),data.length+8);return result;};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;
 const pixels=Buffer.alloc(height*(1+width*4),255);for(let y=0;y<height;y++)pixels[y*(1+width*4)]=0;
 return new Blob([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))],{type:'image/png'});
}
const fullPng=png(2048,3072);
const rect=(left,top,width,height)=>({left,top,width,height});
function sheet(){
 const cards=Object.entries(SUPPORT_CARD_BOUNDS).map(([section,[x,y,width,height]])=>({dataset:{section},getBoundingClientRect:()=>rect(x+7,y+13,width,height),clientWidth:width-2,scrollWidth:width-2,clientHeight:height-2,scrollHeight:height-2}));
 return {getBoundingClientRect:()=>rect(7,13,1024,1536),querySelectorAll:()=>cards,cards};
}

test('The approved master and all ten card bounds remain authoritative',()=>{
 const source=new URL('../docs/visual-master/page3/',import.meta.url),identity=JSON.parse(readFileSync(new URL('IDENTITY.json',source)));
 assert.equal(createHash('sha256').update(readFileSync(new URL('AFTER_SUPPORT_VISUAL_MASTER.jpeg',source))).digest('hex'),identity.sha256);
 assert.deepEqual(SUPPORT_CARD_BOUNDS,identity.canonicalCards);assert.deepEqual([SUPPORT_SHEET.width,SUPPORT_SHEET.height],identity.size);
});
test('Phone portrait, landscape, short viewports and iPad fit the whole sheet with the same ratio',()=>{
 for(const [width,height] of [[320,480],[375,756],[390,788],[414,840],[812,319],[1024,680],[1366,936]]){
  const layout=supportSheetLayout(width,height);assert.ok(layout.width<=width+.000001);assert.ok(layout.height<=height+.000001);assert.ok(layout.scale<=1);
  assert.equal(layout.width/layout.height,1024/1536);
 }
 assert.equal(supportSheetLayout(375,756).scale,375/1024);
 assert.equal(supportSheetLayout(812,319).scale,319/1536);
 assert.equal(supportSheetLayout(2000,3000).scale,1);
});
test('Zoom changes only the sheet scale; fit is restored and invalid sizes are rejected',()=>{
 const fit=supportSheetLayout(375,756),zoom=supportSheetLayout(375,756,3);
 assert.equal(zoom.width,fit.width*3);assert.equal(zoom.height,fit.height*3);assert.equal(zoom.fit,fit.fit);
 assert.deepEqual(supportSheetLayout(375,756,1),fit);
 for(const args of [[0,500],[375,0],[NaN,500],[375,Infinity],[375,756,0]])assert.throws(()=>supportSheetLayout(...args));
});
test('Export refuses omitted, moved or reordered cards and overflowing confirmed content',()=>{
 const s=sheet();assert.doesNotThrow(()=>assertSupportSheetFits(s));
 s.cards[9].scrollHeight+=40;assert.throws(()=>assertSupportSheetFits(s),/文章が枠に収まりません/);s.cards[9].scrollHeight-=40;
 s.cards[9].getBoundingClientRect=()=>rect(540,1500,470,150);assert.throws(()=>assertSupportSheetFits(s),/カード配置/);
 const order=sheet();order.cards.reverse();assert.throws(()=>assertSupportSheetFits(order),/①〜⑩/);
 const missing=sheet();missing.cards.pop();assert.throws(()=>assertSupportSheetFits(missing),/①〜⑩/);
});
test('The PNG is exactly 2048×3072, independent of screen scale or device pixel ratio',async()=>{
 for(const [width,height,zoom]of [[375,756,1],[812,319,1],[1024,1536,3]]){
  supportSheetLayout(width,height,zoom);
  const value=await encodeSupportCanvas({width:2048,height:3072,toBlob:done=>done(fullPng)});assert.equal(value,fullPng);await validateSupportPng(value);
 }
 await assert.rejects(()=>validateSupportPng(png(1024,1536)),/サイズ/);
 await assert.rejects(()=>validateSupportPng(new Blob(['broken'],{type:'image/png'})),/PNG/);
 await assert.rejects(()=>encodeSupportCanvas({width:2048,height:3072,toBlob:done=>done(null)}),/PNG/);
 await assert.rejects(()=>encodeSupportCanvas({width:375,height:563,toBlob:()=>{throw Error('must not encode');}}),/サイズ/);
});
test('Saved filenames use the user’s Japan date, without customer information',()=>{
 assert.equal(supportPngName(new Date('2026-10-10T15:10:00Z')),'COLOR_FUTURE_AI_AFTER_SUPPORT_20261011.png');
});
test('A loaded photograph is decoded; broken photographs and failed decoding stop export',async()=>{
 let decoded=false;await waitForSupportImage({complete:true,naturalWidth:100,naturalHeight:120,decode:async()=>{decoded=true;}});assert.equal(decoded,true);
 await assert.rejects(()=>waitForSupportImage({complete:true,naturalWidth:0,naturalHeight:0}),/読み込めません/);
 await assert.rejects(()=>waitForSupportImage({complete:true,naturalWidth:100,naturalHeight:120,decode:async()=>{throw Error('decode failed');}}),/decode failed/);
 await assert.rejects(()=>withSheetTimeout(new Promise(()=>{}),'timeout fixture',5),/timeout fixture/);
});
test('Japanese fonts load for the actual confirmed text; missing styles or failed fonts stop export',async()=>{
 const loads=[],link={href:'https://unit.test/counseling-master/fonts/font.css',sheet:{}},fonts={ready:Promise.resolve(),load:async(font,text)=>{loads.push([font,text]);return [];}};
 const node={textContent:'美容師の確定文\nそのまま保持',ownerDocument:{querySelectorAll:()=>[link],fonts}};
 await waitForSupportFonts(node);assert.equal(loads.length,3);assert.ok(loads.every(([,text])=>text===node.textContent));assert.ok(loads.some(([font])=>font.includes('Noto Serif JP')));
 const events=new Map();link.sheet=null;link.addEventListener=(name,handler)=>events.set(name,handler);link.removeEventListener=name=>events.delete(name);loads.length=0;
 const pending=waitForSupportFonts(node);assert.equal(loads.length,0);link.sheet={};events.get('load')();await pending;assert.equal(loads.length,3);assert.equal(events.size,0);
 node.ownerDocument.querySelectorAll=()=>[];await assert.rejects(()=>waitForSupportFonts(node),/フォント設定/);
 node.ownerDocument.querySelectorAll=()=>[link];fonts.load=async()=>{throw Error('font failure');};await assert.rejects(()=>waitForSupportFonts(node),/font failure/);
});
test('File sharing starts synchronously inside the second tap, before an asynchronous boundary',async()=>{
 const file=new File([fullPng],'sheet.png',{type:'image/png'});let started=false,downloads=0,finish;
 const nav={canShare:data=>{assert.equal(data.files[0],file);return true;},share:data=>{started=true;assert.equal(data.files[0],file);return new Promise(resolve=>{finish=resolve;});}};
 const outcome=deliverSupportPng(file,nav,()=>downloads++);assert.equal(started,true);assert.equal(downloads,0);finish();assert.equal(await outcome,'SHARED');
});
test('Unsupported sharing downloads once; cancelling a share never triggers an unwanted download',async()=>{
 const file=new File([fullPng],'sheet.png',{type:'image/png'});let downloads=0;
 assert.equal(await deliverSupportPng(file,{canShare:()=>false,share:()=>{throw Error('unused');}},()=>downloads++),'DOWNLOADED');assert.equal(downloads,1);
 assert.equal(await deliverSupportPng(file,{},()=>downloads++),'DOWNLOADED');assert.equal(downloads,2);
 const cancel={canShare:()=>true,share:async()=>{throw new DOMException('cancel','AbortError');}};
 assert.equal(await deliverSupportPng(file,cancel,()=>downloads++),'CANCELLED');assert.equal(downloads,2);
 await assert.rejects(()=>deliverSupportPng(file,{canShare:()=>true,share:async()=>{throw Error('not allowed');}},()=>downloads++),/not allowed/);assert.equal(downloads,2);
});
