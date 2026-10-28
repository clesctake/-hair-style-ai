import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE,args:JSON.parse(process.env.CHROMIUM_ARGS??'["--no-sandbox"]')});
const out=process.env.FIOLE_SCREENSHOT_DIR??'test-output';await mkdir(out,{recursive:true});
const page=await browser.newPage({viewport:{width:1440,height:1050}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
page.on('dialog',d=>d.accept());
// Optional Japanese fonts for stripped-down CI browser environments only.
if(process.env.TEST_FONT_CSS){
  const filename=process.env.TEST_FONT_CSS;
  const css=readFileSync(filename,'utf8').replace(/url\(['"]?(\.\/[^)'"]+)['"]?\)/g,(_match,path)=>`url(data:font/woff2;base64,${readFileSync(resolve(dirname(filename),path)).toString('base64')})`)+"body{font-family:Arial,'Noto Sans JP',sans-serif!important}";
  await page.addInitScript(css=>{document.addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent=css;document.head.append(style);});},css);
}

try {
  await page.goto(process.env.FIOLE_TEST_URL??'http://127.0.0.1:3000',{waitUntil:'networkidle'});
  assert.equal(await page.locator('h1').textContent(),'HAIR MIRROR AI');
  await page.getByRole('link',{name:'FIOLE薬剤資料・診断と配合記録 →'}).click();
  await page.goto(new URL('/fiole/records',page.url()).href,{waitUntil:'networkidle'});
  assert.equal(await page.locator('.catalog-row').count(),149);
  await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:out+'/library-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'低アルカリ',exact:true}).click();assert.equal(await page.locator('.catalog-row').count(),2);
  await page.getByRole('button',{name:'BLカラー',exact:true}).click();assert.equal(await page.locator('.catalog-row').count(),89);
  await page.getByLabel('薬剤検索').fill('4MT');assert.equal(await page.locator('.catalog-row').count(),1);
  await page.getByRole('button',{name:'＋ 新しい記録',exact:true}).click();
  const title='ブラウザ検証 '+Date.now();await page.getByLabel('記録名',{exact:true}).fill(title);await page.getByLabel('担当美容師').fill('検証用担当');
  await page.getByLabel('アンダーレベル',{exact:true}).fill('10');
  await page.getByLabel('ダメージ',{exact:true}).focus();await page.getByLabel('ダメージ',{exact:true}).press('End');
  await page.getByRole('button',{name:'毛先',exact:true}).click();await page.getByLabel('ダメージ',{exact:true}).focus();await page.getByLabel('ダメージ',{exact:true}).press('End');
  await page.getByRole('button',{name:'＋ 履歴を追加',exact:true}).click();
  await page.getByRole('button',{name:'工程・部位を追加',exact:true}).click();
  await page.getByLabel('工程1 塗布部位').selectOption('end');
  await page.getByLabel('配合薬剤').selectOption('v:BL_alkali_002_L4');await page.getByRole('button',{name:'追加',exact:true}).click();
  await page.getByLabel('4MT 重量',{exact:true}).fill('20');await page.getByLabel('第2剤の製品').selectOption('DEV_AC3');await page.getByLabel('第2剤の重量').fill('20');await page.getByLabel('放置時間').fill('15');
  await page.getByRole('button',{name:'下書きを保存',exact:true}).click();await page.getByRole('status').filter({hasText:'保存しました'}).waitFor();
  const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('hair-mirror-fiole-revisions-v1')).at(-1));
  const record={id:data.id};
  assert.equal(data.version,1);assert.equal(data.observations.length,3);assert.equal(data.observations[0].value,10);assert.equal(data.observations[1].zone,'root');assert.equal(data.observations[2].zone,'end');assert.equal(data.applications[0].developerId,'DEV_AC3');
  await page.getByLabel('通知を閉じる').click();await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:out+'/record-desktop.png',fullPage:true});
  await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'診断と配合記録',exact:true}).click();await page.getByLabel('保存済み記録',{exact:true}).selectOption(record.id);
  await page.getByRole('status').filter({hasText:'第1版を開きました'}).waitFor();assert.equal(await page.getByLabel('記録名',{exact:true}).inputValue(),title);assert.equal(await page.getByLabel('第2剤の製品').inputValue(),'DEV_AC3');
  await page.getByLabel('通知を閉じる').click();await page.getByRole('button',{name:'出典と施術条件',exact:true}).click();assert.equal(await page.locator('.issue').count(),6);assert.equal(await page.locator('.reference-case').count(),4);assert.equal(await page.locator('.rule').count(),9);
  await page.locator('.rule summary').first().click();await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:out+'/evidence-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'薬剤ライブラリ',exact:true}).click();await page.getByLabel('薬剤検索').fill('');await page.getByRole('button',{name:'すべて',exact:true}).click();await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:out+'/library-mobile.png',fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Mobile horizontal overflow');
  await page.getByRole('button',{name:'診断と配合記録',exact:true}).click();await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:out+'/record-mobile.png',fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Record mobile horizontal overflow');
  await page.getByRole('link',{name:'← 写真シミュレーションへ'}).click();
  assert.equal(await page.locator('h1').textContent(),'HAIR MIRROR AI');
  await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:out+'/home-mobile.png',fullPage:true});
  const pixels=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV0sAAAAASUVORK5CYII=','base64');
  await page.locator('input[type=file]').nth(0).setInputFiles({name:'before.png',mimeType:'image/png',buffer:pixels});
  await page.locator('input[type=file]').nth(1).setInputFiles({name:'goal.png',mimeType:'image/png',buffer:pixels});
  await page.locator('textarea').fill('オリーブベージュ');
  await page.locator('img[alt=Before]').waitFor();await page.locator('img[alt=Reference]').waitFor();
  await page.route('**/api/generate',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({image:'data:image/png;base64,'+pixels.toString('base64')})}));
  await page.getByRole('button',{name:'仕上がりを生成する',exact:true}).click();
  await page.getByRole('link',{name:'生成画像を保存'}).waitFor();
  await page.goto(new URL('/diagram',page.url()).href,{waitUntil:'networkidle'});
  await page.getByRole('heading',{name:'AI CUT DESIGN'}).waitFor();
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,checks:['149 catalog rows','filter BL/Low','search 4MT','three separate observations','developer identity preserved','draft save/reload','sources/rules/cases','390px layouts','home navigation and mock generation', 'diagram loads', 'no browser errors']},null,2));
} finally {await browser.close();}
