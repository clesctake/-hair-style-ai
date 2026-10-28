import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=await import('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const browser=await chromium.launch({headless:true,executablePath:resolve(project,'../browser-tools/chromium'),args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const assets={};mkdirSync(resolve(project,'public/demo'),{recursive:true});
try{
 const page=await browser.newPage();
 for(const [index,key] of ['current','target','result'].entries()){
  const filename=process.argv[index+2];if(!filename)throw new Error('Supply current, target, and result PNG paths.');
  copyFileSync(filename,resolve(project,`public/demo/fictional-${key}-v1.png`));
  const raw='data:image/png;base64,'+readFileSync(filename).toString('base64');
  // Only display-size encoding; no hair/face edits or colour adjustments.
  assets[key]=await page.evaluate(async raw=>{const image=new Image();image.src=raw;await image.decode();const canvas=document.createElement('canvas');const scale=Math.min(1,560/Math.max(image.width,image.height));canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);return {dataUrl:canvas.toDataURL('image/jpeg',.8),width:canvas.width,height:canvas.height};},raw);
  writeFileSync(resolve(project,`public/demo/fictional-${key}-display-v1.jpg`),Buffer.from(assets[key].dataUrl.split(',')[1],'base64'));
 }
 writeFileSync(resolve(project,'src/data/journey_sample_assets.json'),JSON.stringify(assets));
 console.log(JSON.stringify({bytes:JSON.stringify(assets).length,assets:Object.keys(assets)}));
}finally{await browser.close();}
