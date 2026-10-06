import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {resolve,dirname} from 'node:path';
const root=resolve('..');
const {chromium}=await import('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3106'],{stdio:['ignore','pipe','pipe'],env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'}});
let logs='';server.stdout.on('data',x=>logs+=x);server.stderr.on('data',x=>logs+=x);
const inline=createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(readFileSync(root+'/demo-build/sample-preview.html'));});
await new Promise(resolve=>inline.listen(3189,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,executablePath:root+'/browser-tools/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const output=resolve('journey-screens');mkdirSync(output,{recursive:true});
async function verify(mode){
 const page=await browser.newPage({viewport:{width:1280,height:1320}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const font=resolve(root,'browser-tools/node_modules/@fontsource/noto-sans-jp/400.css');
 const css=readFileSync(font,'utf8').replace(/url\(['"]?(\.\/[^)'" ]+)['"]?\)/g,(_match,path)=>`url(data:font/woff2;base64,${readFileSync(resolve(dirname(font),path)).toString('base64')})`);
 await page.addInitScript(css=>{document.addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);});},css);
 await page.goto(mode==='inline'?'http://127.0.0.1:3189':'http://127.0.0.1:3106/fiole/demo');
 const ui=mode==='inline'?page.frameLocator('iframe'):page;
 const frame=()=>mode==='inline'?page.frames()[1]:page.mainFrame();
 await ui.getByAltText('事前生成したデモの仕上がりイメージ',{exact:true}).waitFor();
 const imageInfo=await ui.locator('.sample-photo-comparison img').evaluateAll(images=>images.map(i=>({loaded:i.complete&&i.naturalWidth>0,url:i.src})));
 assert.equal(imageInfo.length,3);assert.ok(imageInfo.every(i=>i.loaded));assert.equal(new Set(imageInfo.map(i=>i.url)).size,3);
 await frame().evaluate(()=>document.fonts.ready);
 await page.screenshot({path:output+'/'+mode+'-sample-result.png',fullPage:false});
 await ui.getByRole('button',{name:'診断・補正を確認',exact:true}).click();
 assert.equal(await ui.getByLabel('中間 ダメージ',{exact:true}).inputValue(),'4');
 assert.match(await ui.locator('.correction-field').filter({hasText:'ダメージ'}).textContent(),/AIデモ：3/);
 await ui.locator('.stepper button').nth(4).click();assert.equal(await ui.locator('.difference-grid strong').nth(2).textContent(),'+18');
 await ui.locator('.stepper button').nth(5).click();assert.equal(await ui.locator('.proposal-card').count(),3);
 await ui.locator('.proposal-card').first().locator('details').evaluate(el=>el.open=true);
 await page.screenshot({path:output+'/'+mode+'-sample-recipe.png',fullPage:false});
 await ui.locator('.stepper button').nth(6).click();assert.equal(await ui.locator('.sample-photo-comparison img').count(),3);
 await ui.locator('.stepper button').nth(7).click();assert.equal(await ui.locator('.actual-line').count(),0);assert.equal(await ui.getByLabel('仕上がり一致度').inputValue(),'');
 await ui.getByRole('button',{name:'施術カルテを保存する',exact:true}).click();await ui.getByRole('status').filter({hasText:'カルテを保存しました'}).waitFor();
 await ui.getByRole('button',{name:'過去の診断',exact:true}).click();assert.equal(await ui.locator('.record-row').count(),1);await ui.locator('.record-row').click();
 assert.match(await ui.getByLabel('カルテ名',{exact:true}).inputValue(),/サンプル相談/);
 await ui.getByRole('button',{name:'施術実績',exact:true}).click();assert.equal(await ui.locator('.record-row').count(),0);
 await ui.getByRole('button',{name:'カラー診断',exact:true}).click();await ui.getByRole('button',{name:'写真入りサンプルで完成形を見る →',exact:true}).click();
 for(const width of [1024,390,320]){await page.setViewportSize({width,height:1080});assert.ok(await frame().evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:output+'/'+mode+'-sample-mobile.png',fullPage:true});
 await page.setViewportSize({width:1280,height:1080});
 await ui.locator('.stepper button').nth(5).click();await ui.locator('.proposal-card').nth(1).getByRole('button',{name:'この試算を選ぶ',exact:true}).click();await ui.locator('.stepper button').nth(6).click();
 assert.equal(await ui.locator('.sample-photo-comparison').count(),0);assert.equal(await ui.locator('.generation-empty').count(),1);
 await ui.getByRole('button',{name:'薬剤ライブラリ',exact:true}).click();assert.equal(await ui.locator('.catalog-row').count(),149);
 assert.deepEqual(errors,[]);await page.close();console.log(JSON.stringify({mode,passed:true,images:3,steps:'diagnosis/correction/difference/recipes/preview/save',illustration_is_not_actual:true,sample_invalidation:true,library:149,mobile:[320,390,1024]}));
}
try{
 let ready=false;for(let i=0;i<150;i++){try{if((await fetch('http://127.0.0.1:3106/fiole/demo')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}
 if(!ready)throw new Error(logs);
 await verify('app');await verify('inline');
}finally{await browser.close();server.kill('SIGTERM');await new Promise(resolve=>inline.close(resolve));}
