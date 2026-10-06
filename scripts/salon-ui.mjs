import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {dirname,resolve} from 'node:path';
const root=resolve('..');
const {chromium}=await import('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3110'],{stdio:['ignore','pipe','pipe'],env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'}});let logs='';server.stdout.on('data',x=>logs+=x);server.stderr.on('data',x=>logs+=x);
const inline=createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(readFileSync(root+'/demo-build/salon-preview.html'));});await new Promise(r=>inline.listen(3190,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:root+'/browser-tools/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const output=resolve('journey-screens');mkdirSync(output,{recursive:true});
const fixture=resolve('public/demo/fictional-current-display-v1.jpg');
async function run(mode){
 const page=await browser.newPage({viewport:{width:1448,height:1086}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const font=resolve(root,'browser-tools/node_modules/@fontsource/noto-sans-jp/400.css'),css=readFileSync(font,'utf8').replace(/url\(['"]?(\.\/[^)'" ]+)['"]?\)/g,(_match,path)=>`url(data:font/woff2;base64,${readFileSync(resolve(dirname(font),path)).toString('base64')})`);
 await page.addInitScript(css=>{document.addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);});},css);
 await page.goto(mode==='inline'?'http://127.0.0.1:3190':'http://127.0.0.1:3110/fiole/demo');
 const ui=mode==='inline'?page.frameLocator('iframe'):page,frame=()=>mode==='inline'?page.frames()[1]:page.mainFrame();
 await ui.getByAltText('事前生成した仕上がりイメージ',{exact:true}).waitFor();await frame().evaluate(()=>document.fonts.ready);
 assert.equal(await ui.locator('.salon-four-steps button').count(),4);assert.equal(await ui.locator('.salon-simple-metrics input[type=range]').count(),4);
 assert.equal(await ui.locator('.salon-color-difference').isVisible(),false);
 assert.equal(await ui.locator('.salon-current-photos img').count(),1);assert.equal(await ui.locator('.salon-current input[type=file]').count(),4);
 assert.ok(await ui.getByAltText('事前生成した仕上がりイメージ').evaluate(i=>i.complete&&i.naturalWidth>0));
 await page.screenshot({path:output+'/'+mode+'-salon-overview.png',fullPage:true});
 await ui.getByText('補正・毛髪状態の詳細',{exact:true}).click();
 await ui.getByLabel('中間 ダメージ',{exact:true}).fill('5');assert.match(await ui.locator('.salon-simple-metrics').textContent(),/AI仮値 3 → 美容師 5/);
 await ui.locator('.salon-validation').waitFor();assert.equal(await ui.getByAltText('事前生成した仕上がりイメージ').count(),0);
 await ui.getByRole('button',{name:'レシピを再試算 →',exact:true}).click();await ui.getByText('代替レシピを見る',{exact:true}).click();assert.equal(await ui.locator('.salon-recipe').count(),3);await ui.getByRole('button',{name:'この候補を選ぶ →',exact:true}).first().click();assert.match(await ui.locator('.salon-recipes>.salon-recipe h3').textContent(),/クオルシア/);
 await ui.getByRole('button',{name:'写真入りサンプルを見る',exact:true}).click();await ui.getByAltText('事前生成した仕上がりイメージ').waitFor();
 await ui.getByRole('button',{name:'相談を保存する →',exact:true}).click();await ui.getByRole('status').filter({hasText:'相談を保存しました'}).waitFor();assert.equal(await ui.locator('.salon-recent').count(),1);
 await ui.getByRole('button',{name:'施術実績',exact:true}).click();assert.equal(await ui.locator('.salon-recent').count(),0);
 await ui.getByRole('button',{name:'過去の診断',exact:true}).click();await ui.locator('.salon-recent').click();
 await ui.getByText('施術カルテ・実際の使用内容を記録',{exact:true}).click();await ui.getByRole('button',{name:'選択した試算を実使用欄へコピー',exact:true}).click();
 await ui.getByLabel('実使用総量',{exact:true}).fill('50');await ui.getByLabel('実放置時間',{exact:true}).fill('25');await ui.getByLabel('実使用を確認',{exact:true}).check();
 await ui.getByLabel('After写真（施術後）をアップロード',{exact:true}).setInputFiles(fixture);await ui.getByAltText('After写真（施術後）',{exact:true}).waitFor();await ui.getByLabel('仕上がり一致度',{exact:true}).selectOption('4');await ui.getByLabel('施術後ダメージ評価',{exact:true}).selectOption('3');
 await ui.getByRole('button',{name:'施術カルテを保存する',exact:true}).click();await ui.getByRole('status').filter({hasText:'第2版'}).waitFor();
 if(mode==='app'){
  const stored=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('hair-mirror-color-journey-v1',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('records','readonly').objectStore('records').getAll();q.onsuccess=()=>{resolve(q.result[0].revisions.at(-1));db.close();};q.onerror=reject;};r.onerror=reject;}));
  assert.equal(stored.analyses[0].observations.length,27);assert.equal(stored.corrections.length,3);assert.equal(stored.actual.totalGrams,50);assert.equal(stored.proposals[0].totalGrams,60);assert.equal(stored.actual.durationMin,25);assert.equal(stored.outcome.colorMatch,4);assert.equal(stored.after.view,'after');await page.reload();
 }
 await ui.getByRole('button',{name:'施術実績',exact:true}).click();assert.equal(await ui.locator('.salon-recent').count(),1);await ui.locator('.salon-recent').click();await ui.getByText('施術カルテ・実際の使用内容を記録',{exact:true}).click();assert.equal(await ui.getByLabel('実使用総量',{exact:true}).inputValue(),'50');
 await ui.getByRole('button',{name:'薬剤ライブラリ',exact:true}).click();assert.equal(await ui.locator('.catalog-row').count(),149);await ui.getByRole('button',{name:'資料の記載項目',exact:true}).click();assert.equal(await ui.locator('.catalog-row').count(),73);
 await ui.getByRole('button',{name:'新しい診断',exact:true}).click();assert.equal(await ui.locator('.salon-current-photos img').count(),0);
 for(const label of ['正面','右側','左側','後ろ']){await ui.getByLabel(label+'をアップロード',{exact:true}).setInputFiles(fixture);await ui.getByRole('button',{name:'この写真を使う →',exact:true}).click();await ui.getByAltText(label,{exact:true}).waitFor();}
 await ui.getByRole('button',{name:'デモ診断を表示',exact:true}).click();await ui.getByLabel('希望する髪色',{exact:true}).fill('ベージュ');await ui.getByRole('button',{name:'シミュレーションとレシピへ →',exact:true}).click();await ui.getByRole('button',{name:'相談を保存する →',exact:true}).click();await ui.getByRole('status').filter({hasText:'第1版'}).waitFor();assert.equal(await ui.locator('.salon-recent').count(),2);
 await ui.getByRole('button',{name:'写真入りサンプルを見る',exact:true}).click();
 for(const width of [1024,768,390,320]){await page.setViewportSize({width,height:1086});await frame().evaluate(()=>scrollTo(0,0));assert.ok(await frame().evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);if(width===1024||width===390)await page.screenshot({path:output+'/'+mode+'-salon-'+width+'.png',fullPage:true});}
 assert.deepEqual(errors,[]);await page.close();console.log(JSON.stringify({mode,passed:true,steps:4,before_inputs:4,ai_original_and_override_separate:true,lab_hidden:true,recipe_selection_and_staleness:true,save_reload:true,actual_separate:true,library:[149,73],widths:[1024,768,390,320]}));
}
try{let ready=false;for(let i=0;i<150;i++){try{if((await fetch('http://127.0.0.1:3110/fiole/demo')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}if(!ready)throw new Error(logs);await run('app');await run('inline');}finally{await browser.close();server.kill('SIGTERM');await new Promise(r=>inline.close(r));}
