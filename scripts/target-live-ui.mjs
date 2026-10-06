import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
const root=resolve('..');
const {chromium}=await import('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3120'],{stdio:['ignore','pipe','pipe'],env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'}});
let logs='';server.stdout.on('data',x=>logs+=x);server.stderr.on('data',x=>logs+=x);
const inline=createServer((_req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(readFileSync(root+'/demo-build/salon-preview.html'));});
await new Promise(r=>inline.listen(3191,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:root+'/browser-tools/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const output=resolve('journey-screens');mkdirSync(output,{recursive:true});
async function run(mode){
 const page=await browser.newPage({viewport:{width:1448,height:1086}}),errors=[],apiPosts=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/api/generate'))apiPosts.push(r.url());});
 const font=resolve(root,'browser-tools/node_modules/@fontsource/noto-sans-jp/400.css'),css=readFileSync(font,'utf8').replace(/url\(['"]?(\.\/[^)'" ]+)['"]?\)/g,(_match,path)=>`url(data:font/woff2;base64,${readFileSync(resolve(dirname(font),path)).toString('base64')})`);
 await page.addInitScript(css=>{document.addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);});},css);
 await page.goto(mode==='inline'?'http://127.0.0.1:3191':'http://127.0.0.1:3120/fiole/demo');
 const ui=mode==='inline'?page.frameLocator('iframe'):page,frame=()=>mode==='inline'?page.frames()[1]:page.mainFrame();
 await ui.locator('.salon-sample-photo canvas[data-tone-context]').waitFor();await frame().evaluate(()=>document.fonts.ready);
 assert.equal(await ui.locator('.salon-tone-slider input[type=range]').count(),7);
 assert.equal(await ui.getByLabel('中間 薬剤の吸い込みやすさ',{exact:true}).count(),1);
 assert.equal(await ui.getByText('ポロシティ',{exact:true}).count(),0);
 assert.equal(await ui.getByRole('button',{name:'この色味で確定 →',exact:true}).isDisabled(),true);
 const signature=()=>ui.locator('.salon-sample-photo canvas[data-tone-context]').evaluate(canvas=>{const bytes=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let hash=2166136261;for(let i=0;i<bytes.length;i+=17)hash=Math.imul(hash^bytes[i],16777619);return hash>>>0;});
 await frame().evaluate(()=>{const canvas=document.querySelector('canvas[data-tone-context]');window.toneOriginalPixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;});
 let last=await signature();const originalPhoto=await ui.getByAltText('調整前の希望写真',{exact:true}).getAttribute('src');
 const changes=[['明るさ','target_lightness',30],['彩度','target_saturation',8],['赤み','target_redness',-18],['黄み','target_yellowness',-10],['くすみ','target_mutedness',18],['ベージュ感','target_beige',46],['透明感','target_transparency',28]];
 for(const [label,key,value]of changes){
  await ui.getByLabel('理想色 '+label,{exact:true}).fill(String(value));
  await frame().waitForFunction(({key,value})=>JSON.parse(document.querySelector('.salon-sample-photo canvas').dataset.toneContext).controls[key]===value,{key,value});
  const next=await signature();assert.notEqual(next,last,`${label} did not change actual pixels`);last=next;
  const protection=await frame().evaluate(()=>{
   const canvas=document.querySelector('canvas[data-tone-context]'),overlay=document.querySelector('.salon-hair-mask-overlay');
   const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,mask=overlay.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,original=window.toneOriginalPixels;
   let protectedCount=0,changedOutside=0,changedHair=0;
   for(let p=0;p<pixels.length;p+=4){const changed=pixels[p]!==original[p]||pixels[p+1]!==original[p+1]||pixels[p+2]!==original[p+2]||pixels[p+3]!==original[p+3];if(!mask[p+3]){protectedCount++;if(changed)changedOutside++;}else if(changed)changedHair++;}
   return {protectedCount,changedOutside,changedHair};
  });
  assert.equal(protection.changedOutside,0,label+' leaked outside hair');assert.ok(protection.protectedCount>100000);assert.ok(protection.changedHair>10000);
 }
 await ui.getByRole('button',{name:'Before · 元画像',exact:true}).click();assert.equal(await ui.getByAltText('調整前の希望写真').isVisible(),true);assert.equal(await ui.getByAltText('調整前の希望写真').getAttribute('src'),originalPhoto);
 await ui.getByRole('button',{name:'Adjusted · 調整後',exact:true}).click();assert.equal(await ui.getByRole('img',{name:'ライブ調整後の希望写真'}).isVisible(),true);
 const bounds=await ui.getByRole('button',{name:'参考写真の髪をタップして採色',exact:true}).boundingBox();
 await ui.getByRole('button',{name:'参考写真の髪をタップして採色',exact:true}).click({position:{x:bounds.width*.31,y:bounds.height*.44}});
 await ui.getByRole('button',{name:'この色味で確定 →',exact:true}).click();await ui.locator('.salon-target-bridge').waitFor();
 assert.equal(await ui.getByRole('button',{name:'レシピを計算する →',exact:true}).isEnabled(),true);
 // Editing a mask invalidates both the target and the recipe. Erasing the sampling spot disables confirmation.
 await ui.getByRole('button',{name:'範囲を調整',exact:true}).click();await ui.getByRole('button',{name:'消す',exact:true}).click();
 const eraser=ui.getByRole('button',{name:'参考写真の髪の範囲を消す',exact:true}),eraseBounds=await eraser.boundingBox();
 await eraser.click({position:{x:eraseBounds.width*.31,y:eraseBounds.height*.44}});
 await frame().waitForFunction(()=>JSON.parse(document.querySelector('canvas[data-tone-context]').dataset.toneContext).hairMask.strokes.length===1);
 assert.equal(await ui.getByRole('button',{name:'レシピを計算する →',exact:true}).isDisabled(),true);
 assert.equal(await ui.getByRole('button',{name:'この色味で確定 →',exact:true}).isDisabled(),true);
 await ui.getByRole('button',{name:'ひとつ戻す',exact:true}).click();
 await frame().waitForFunction(()=>JSON.parse(document.querySelector('canvas[data-tone-context]').dataset.toneContext).hairMask.strokes.length===0);
 assert.equal(await ui.getByRole('button',{name:'レシピを計算する →',exact:true}).isEnabled(),true);
 await ui.getByRole('button',{name:'範囲を調整',exact:true}).click();
 assert.equal(await ui.locator('.salon-difference-values>span').count(),3);assert.ok(await ui.locator('.salon-pigment-directions>span').count()>0);
 await ui.getByRole('button',{name:'レシピを計算する →',exact:true}).click();await ui.locator('.salon-recipes>.salon-recipe').waitFor();
 await ui.getByText('代替レシピを見る',{exact:true}).click();assert.equal(await ui.locator('.salon-recipe').count(),3);
 assert.match(await ui.locator('.salon-recipes').textContent(),/BLカラー/);assert.match(await ui.locator('.salon-recipes').textContent(),/クオルシア/);assert.match(await ui.locator('.salon-recipes').textContent(),/低アルカリ/);
 assert.equal(await ui.getByAltText('事前生成した仕上がりイメージ').count(),0);
 await ui.getByRole('button',{name:'通知を閉じる',exact:true}).click();
 await frame().evaluate(()=>scrollTo(0,0));await page.screenshot({path:output+'/'+mode+'-live-target-overview.png',fullPage:true});
 await ui.locator('.salon-target').screenshot({path:output+'/'+mode+'-live-target-editor.png'});
 await ui.getByRole('button',{name:'相談を保存する →',exact:true}).click();await ui.getByRole('status').filter({hasText:'相談を保存しました'}).waitFor();
 if(mode==='app'){
  const stored=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('hair-mirror-color-journey-v1',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('records','readonly').objectStore('records').getAll();q.onsuccess=()=>{resolve(q.result[0].revisions.at(-1));db.close();};q.onerror=reject;};r.onerror=reject;}));
  assert.equal(stored.targetAdjustments.length,1);const item=stored.targetAdjustments[0];
  assert.equal(item.referencePhoto.dataUrl,originalPhoto);assert.notEqual(item.previewPhoto.dataUrl,originalPhoto);
  assert.equal(item.controls.target_lightness,30);assert.equal(item.normalizedControls.target_lightness,.6);
  assert.equal(item.color.origin,'image_preview_estimate');assert.equal(item.color.measurement,'not_measured');
  assert.equal(item.scope,'reference_image_hair_mask');assert.equal(item.algorithmVersion,'image-lab-hair-tone-v2');assert.equal(item.hairMask.origin,'demo_hand_traced');
  assert.ok(item.sourceLab.L<75,'the fixture sample must be on hair, not the bright background');
  assert.deepEqual(stored.target.color,item.color);assert.equal(stored.after,null);assert.equal(stored.actual,null);
  assert.equal(item.previewPhoto.width<=512&&item.previewPhoto.height<=512,true);assert.equal(stored.proposals[0].algorithmVersion,'image-target-direction-demo-v2');
 }
 await ui.getByLabel('理想色 明るさ',{exact:true}).fill('41');
 assert.equal(await ui.getByRole('button',{name:'レシピを計算する →',exact:true}).isDisabled(),true);
 assert.equal(await ui.getByRole('button',{name:'高精度シミュレーションを見る ↗',exact:true}).isDisabled(),true);
 await ui.locator('.salon-validation').waitFor();
 // Immediately confirm after an input event; the saved preview must use the latest value, not a previous frame.
 await ui.getByRole('button',{name:'この色味で確定 →',exact:true}).click();
 await ui.getByRole('button',{name:'レシピを計算する →',exact:true}).click();
 await ui.getByRole('button',{name:'相談を保存する →',exact:true}).click();await ui.getByRole('status').filter({hasText:'第2版'}).waitFor();
 if(mode==='app')await page.reload();
 await ui.getByRole('button',{name:'過去の診断',exact:true}).click();await ui.locator('.salon-recent').click();
 await ui.locator('.salon-sample-photo canvas[data-tone-context]').waitFor();
 assert.equal(await ui.getByLabel('理想色 明るさ',{exact:true}).inputValue(),'41');assert.equal(await ui.getByLabel('理想色 ベージュ感',{exact:true}).inputValue(),'46');
 assert.equal(await ui.locator('.salon-target-bridge').count(),1);assert.equal(await ui.locator('.salon-ideal-heading').getByText('色味を確定済み',{exact:true}).count(),1);
 for(const width of[1024,768,390,320]){
  await page.setViewportSize({width,height:1086});await frame().evaluate(()=>scrollTo(0,0));
  assert.ok(await frame().evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);
  if(width===1024||width===390)await page.screenshot({path:output+'/'+mode+'-live-target-'+width+'.png',fullPage:true});
 }
 await ui.getByLabel('希望画像をアップロード',{exact:true}).setInputFiles(resolve('public/demo/fictional-current-display-v1.jpg'));
 await frame().waitForFunction(()=>document.querySelector('.salon-sample-photo canvas')?.dataset.toneContext&&JSON.parse(document.querySelector('.salon-sample-photo canvas').dataset.toneContext).controls.target_lightness===0);
 assert.equal(await ui.getByLabel('理想色 明るさ',{exact:true}).inputValue(),'0');assert.equal(await ui.locator('.salon-target-bridge').count(),0);
 assert.equal(await ui.getByRole('button',{name:'この色味で確定 →',exact:true}).isDisabled(),true);
 assert.equal(await ui.getByLabel('理想色 明るさ',{exact:true}).isDisabled(),true);
 assert.equal(await ui.getByLabel('髪の選択範囲を表示',{exact:true}).isChecked(),true);
 const brushPhoto=ui.getByRole('button',{name:'参考写真の髪の範囲を塗る',exact:true});await brushPhoto.scrollIntoViewIfNeeded();
 const paintBounds=await brushPhoto.boundingBox();
 await page.mouse.move(paintBounds.x+paintBounds.width*.25,paintBounds.y+paintBounds.height*.27);await page.mouse.down();
 await page.mouse.move(paintBounds.x+paintBounds.width*.28,paintBounds.y+paintBounds.height*.47,{steps:10});await page.mouse.up();
 await frame().waitForFunction(()=>JSON.parse(document.querySelector('canvas[data-tone-context]').dataset.toneContext).hairMask.strokes.length===1);
 assert.equal(await ui.getByLabel('理想色 明るさ',{exact:true}).isEnabled(),true);
 await ui.getByLabel('理想色 明るさ',{exact:true}).fill('35');
 await ui.getByRole('button',{name:'色を選ぶ',exact:true}).click();
 const sampleButton=ui.getByRole('button',{name:'参考写真の髪をタップして採色',exact:true}),sampleBounds=await sampleButton.boundingBox();
 await sampleButton.click({position:{x:sampleBounds.width*.27,y:sampleBounds.height*.42}});
 await ui.getByRole('button',{name:'この色味で確定 →',exact:true}).click();
 assert.equal(await ui.getByRole('button',{name:'レシピを計算する →',exact:true}).isEnabled(),true);
 // Native keyboard controls provide selection and sampling without dragging.
 await ui.getByRole('button',{name:'範囲を選び直す',exact:true}).click();await brushPhoto.focus();await brushPhoto.press('Enter');
 await frame().waitForFunction(()=>JSON.parse(document.querySelector('canvas[data-tone-context]').dataset.toneContext).hairMask.strokes.length===1);
 await ui.getByRole('button',{name:'色を選ぶ',exact:true}).click();await sampleButton.focus();await sampleButton.press('Enter');
 await ui.getByRole('button',{name:'この色味で確定 →',exact:true}).waitFor();await frame().waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='この色味で確定 →'&&!b.disabled));assert.equal(await ui.getByRole('button',{name:'この色味で確定 →',exact:true}).isEnabled(),true);
 assert.equal(apiPosts.length,0);assert.deepEqual(errors,[]);
 await page.close();console.log(JSON.stringify({mode,passed:true,slider_count:7,actual_pixels_change:true,all_unselected_pixels_preserved:true,brush_erase_undo:true,upload_manual_selection:true,keyboard_mask_selection:true,absorption_label:true,original_preserved:true,manual_hair_sample:true,confirmed_target_used_by_recipe:true,save_reload:true,reconfirmation_invalidates:true,reference_replace_resets:true,AI_generation_posts:0,widths:[1024,768,390,320]}));
}
try{
 let ready=false;for(let i=0;i<150;i++){try{if((await fetch('http://127.0.0.1:3120/fiole/demo')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}if(!ready)throw new Error(logs);
 await run('app');await run('inline');
}finally{await browser.close();server.kill('SIGTERM');await new Promise(r=>inline.close(r));}
