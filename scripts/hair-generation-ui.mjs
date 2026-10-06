// UI transport tests use intercepted API responses. They do not call or bill OpenAI.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
const root=resolve('..');
const {chromium}=await import('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3114'],{stdio:['ignore','pipe','pipe'],env:{...process.env,OPENAI_API_KEY:'',NEXT_TELEMETRY_DISABLED:'1'}});
let logs='';server.stdout.on('data',x=>logs+=x);server.stderr.on('data',x=>logs+=x);
const browser=await chromium.launch({headless:true,executablePath:root+'/browser-tools/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const output=resolve('journey-screens');mkdirSync(output,{recursive:true});
const page=await browser.newPage({viewport:{width:1448,height:1086}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
const font=resolve(root,'browser-tools/node_modules/@fontsource/noto-sans-jp/400.css');
const css=readFileSync(font,'utf8').replace(/url\(['"]?(\.\/[^)'" ]+)['"]?\)/g,(_match,path)=>`url(data:font/woff2;base64,${readFileSync(resolve(dirname(font),path)).toString('base64')})`);
await page.addInitScript(css=>{document.addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);});},css);
try{
 let ready=false;for(let i=0;i<150;i++){try{if((await fetch('http://127.0.0.1:3114/api/generate')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}if(!ready)throw new Error(logs);
 const status=await fetch('http://127.0.0.1:3114/api/generate');assert.equal((await status.json()).configured,false);
 await page.goto('http://127.0.0.1:3114/fiole/demo');
 await page.getByText('画像生成の接続設定が必要です。',{exact:true}).waitFor();
 const generate=()=>page.getByRole('button',{name:/この写真と希望から画像を生成する|この条件でもう一度生成する/});
 assert.equal(await generate().isDisabled(),true);
 await page.locator('.salon-sample-photo canvas[data-tone-context]').waitFor();
 const sampleBounds=await page.getByRole('button',{name:'参考写真の髪をタップして採色',exact:true}).boundingBox();
 await page.getByRole('button',{name:'参考写真の髪をタップして採色',exact:true}).click({position:{x:sampleBounds.width*.31,y:sampleBounds.height*.44}});
 await page.getByLabel('理想色 明るさ',{exact:true}).fill('20');
 await page.getByRole('button',{name:'この色味で確定 →',exact:true}).click();
 await page.locator('.salon-target-bridge').waitFor();
 const adjustedReference=await page.locator('.salon-sample-photo canvas[data-tone-context]').evaluate(canvas=>canvas.toDataURL('image/png'));
 await page.evaluate(()=>document.fonts.ready);
 await page.screenshot({path:output+'/generation-screen-needs-connection.png',fullPage:true});

 // Create a PNG from the fictional display asset for transport validation only.
 const asset=JSON.parse(readFileSync('src/data/journey_sample_assets.json','utf8')).result.dataUrl;
 const png=await page.evaluate(dataUrl=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>{const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;c.getContext('2d').drawImage(image,0,0);resolve(c.toDataURL('image/png'));};image.onerror=reject;image.src=dataUrl;}),asset);
 let calls=0,mode='success',release;
 await page.route('**/api/generate',async route=>{
  if(route.request().method()==='GET'){await route.fulfill({json:{configured:true,model:'transport-mock-only'}});return;}
  calls++;
  const req=route.request();const parsed=await new Request(req.url(),{method:'POST',headers:{'content-type':req.headers()['content-type']},body:req.postDataBuffer()}).formData();
  assert.equal(parsed.getAll('image').length,1);assert.equal(parsed.getAll('styleReferenceImage').length,1);assert.equal(parsed.has('referenceImage'),false);assert.equal(parsed.get('mode'),'style_color');assert.equal(parsed.getAll('colorReferenceImage').length,1);assert.match(parsed.get('request'),/ベージュ/);
  assert.ok(parsed.get('image') instanceof File);assert.ok(parsed.get('colorReferenceImage') instanceof File);
  assert.equal(parsed.get('colorReferenceImage').type,'image/png');
  assert.equal(Buffer.from(await parsed.get('colorReferenceImage').arrayBuffer()).toString('base64'),adjustedReference.split(',')[1]);
  assert.match(parsed.get('request'),/調整後の希望写真/);
  if(mode==='hold')await new Promise(r=>release=r);
  if(mode==='error'){await route.fulfill({status:502,json:{error:'API利用権限の確認が必要です。'}});return;}
  try{await route.fulfill({json:{image:png,generation:{origin:'openai_images_edit',model:'transport-mock-only',promptVersion:'transport-test',createdAt:new Date().toISOString(),requestId:'transport-test-'+calls}}});}catch{}
 });
 await page.getByRole('button',{name:'接続を再確認',exact:true}).click();await generate().waitFor();
 await page.waitForFunction(()=>!document.querySelector('.salon-generate').disabled);
 await generate().click();await page.getByAltText('今回AIが生成した仕上がりイメージ',{exact:true}).waitFor();
 assert.equal(calls,1);assert.equal(await page.locator('.salon-download').count(),1);
 assert.equal(await page.getByAltText('After写真（施術後）',{exact:true}).count(),0);
 await page.getByRole('button',{name:'相談を保存する →',exact:true}).click();
 await page.getByRole('status').filter({hasText:'相談を保存しました'}).waitFor();
 const stored=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('hair-mirror-color-journey-v1',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('records','readonly').objectStore('records').getAll();q.onsuccess=()=>{resolve(q.result[0].revisions.at(-1));db.close();};q.onerror=reject;};r.onerror=reject;}));
 assert.equal(stored.imageGenerations.length,1);assert.equal(stored.imageGenerations[0].model,'transport-mock-only');assert.equal(stored.after,null);assert.equal(stored.actual,null);
 await page.reload();await page.getByRole('button',{name:'過去の診断',exact:true}).click();await page.locator('.salon-recent').click();
 await page.getByAltText('今回AIが生成した仕上がりイメージ').waitFor();
 // A stylist damage correction changes recipe validity, not the generated design image.
 await page.getByLabel('中間 ダメージ',{exact:true}).fill('5');assert.equal(await page.getByAltText('今回AIが生成した仕上がりイメージ').count(),1);
 await page.getByLabel('希望する髪色',{exact:true}).fill('赤みを抑えたベージュ。もう少し短く。');
 assert.equal(await page.getByAltText('今回AIが生成した仕上がりイメージ').count(),0);
 mode='error';await generate().click();await page.getByRole('alert').filter({hasText:'API利用権限の確認が必要です。'}).waitFor();
 assert.equal(await page.getByAltText('今回AIが生成した仕上がりイメージ').count(),0);
 mode='hold';await generate().click();await page.getByText('仕上がりイメージを生成中…',{exact:true}).waitFor();
 while(!release)await new Promise(r=>setTimeout(r,10));
 await page.getByLabel('希望する髪色',{exact:true}).fill('ベージュ。条件を変更したので古い応答は表示しない。');release();
 await page.waitForFunction(()=>!document.querySelector('.salon-generate').disabled);
 assert.equal(await page.getByAltText('今回AIが生成した仕上がりイメージ').count(),0);
 mode='success';await generate().click();await page.getByAltText('今回AIが生成した仕上がりイメージ').waitFor();
 for(const width of [1024,768,390,320]){await page.setViewportSize({width,height:1086});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);}
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,api_calls_intercepted:calls,actual_OpenAI_calls:0,checks:['truthful_missing_key','confirmed_adjusted_reference_sent','current_STYLE_COLOR_and_prompt','generated_download','append_only_generation_record','actual_After_separate','save_reload','real_input_invalidation','provider_error','discard_stale_response','no_horizontal_overflow']}));
}finally{await browser.close();server.kill('SIGTERM');}
