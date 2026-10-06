// Optional real-model browser integration. No paid API or image generation calls.
// Build first. PHASE2_START_SERVER=1 runs Next in this test process's network namespace.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import assets from '../src/data/journey_sample_assets.json' with {type:'json'};
const { chromium }=await import(process.env.PHASE2_PLAYWRIGHT_MODULE||'playwright');
const baseUrl=process.env.PHASE2_BASE_URL||'http://127.0.0.1:3152',output=path.resolve(process.env.PHASE2_TEST_OUTPUT||'test-artifacts/photo-analysis');
await mkdir(output,{recursive:true});
const server=process.env.PHASE2_START_SERVER==='1'?spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',new URL(baseUrl).port||'3152'],{stdio:['ignore','pipe','pipe']}):null;
let serverLog='';if(server){server.stdout.on('data',b=>serverLog+=b);server.stderr.on('data',b=>serverLog+=b);process.on('exit',()=>server.kill('SIGTERM'));let ready=false;for(let i=0;i<80;i++){try{ready=(await fetch(`${baseUrl}/fiole`)).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,250));}if(!ready){server.kill('SIGTERM');throw new Error('Test server is not ready');}}
const browser=await chromium.launch({executablePath:process.env.PHASE2_TEST_CHROMIUM||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
const context=await browser.newContext({viewport:{width:1194,height:834},isMobile:true,hasTouch:true,permissions:['camera']}),page=await context.newPage(),errors=[],externalPhotoRequests=[];
const sdkLoads=[],telemetryInitiators=[];
page.on('response',async r=>{if(r.url().endsWith('/analysis/vision_bundle.mjs')){const text=await r.text();sdkLoads.push({url:r.url(),telemetryDisabled:text.startsWith('/* COLOR FUTURE AI modification:'),hasLoggerInitializer:text.includes('t.m=new Dh')});}});
const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');cdp.on('Network.requestWillBeSent',r=>{if(r.request.url.includes('odml.pa.googleapis.com'))telemetryInitiators.push(r.initiator);});
let generationPosts=0;page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>void d.accept());
await context.route('**/api/generate',async route=>{if(route.request().method()==='POST'){generationPosts++;await route.abort();}else await route.continue();});
context.on('request',r=>{if(['POST','PUT'].includes(r.method())&&!r.url().startsWith(baseUrl))externalPhotoRequests.push(r.url());});
if(process.env.PHASE2_FORCE_MAIN_THREAD==='1')await context.addInitScript(()=>{Object.defineProperty(globalThis,'OffscreenCanvas',{value:undefined,configurable:true});});
const readRecord=()=>page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('hair-mirror-color-journey-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{return await new Promise((resolve,reject)=>{const r=db.transaction('records').objectStore('records').getAll();r.onsuccess=()=>resolve(r.result.at(-1));r.onerror=()=>reject(r.error);});}finally{db.close();}});
const openAnalysis=()=>page.getByRole('button',{name:'AI診断',exact:true}).click();
const saveHome=async()=>{await page.getByRole('button',{name:'← ホームに戻る',exact:true}).click();await page.getByRole('button',{name:'この相談を保存する →',exact:true}).click();await page.getByText(/相談を保存しました/).waitFor();};
try{
  await page.goto(`${baseUrl}/fiole`);await page.getByRole('region',{name:'カウンセリングホーム'}).waitFor();
  // Optional headless-only Japanese font injection. It does not modify production CSS/assets.
  if(process.env.PHASE2_TEST_FONT_CSS){await page.addStyleTag({content:await readFile(process.env.PHASE2_TEST_FONT_CSS,'utf8')});}
  assert.equal(await page.locator('.salon-four-steps > button').count(),4);
  await page.getByRole('button',{name:/新しいカラー診断を始める/}).click();
  // Large, explicitly synthetic resolution fixture: confirms original/preview separation, not large-photo accuracy.
  const largeData=await page.evaluate(async data=>{const img=new Image();img.src=data;await img.decode();const c=document.createElement('canvas');c.width=3200;c.height=4000;c.getContext('2d').drawImage(img,0,0,3200,4000);return c.toDataURL('image/jpeg',.92);},assets.current.dataUrl);
  const large=Buffer.from(largeData.split(',')[1],'base64'),normal=Buffer.from(assets.current.dataUrl.split(',')[1],'base64');
  // EXIF Orientation 6 tag. Bytes remain untouched when imported; browser performs the display orientation.
  const exif=Buffer.from('ffe100224578696600004d4d002a00000008000101120003000000010006000000000000','hex');
  const oriented=Buffer.concat([normal.subarray(0,2),exif,normal.subarray(2)]);
  for(const [index,label] of ['正面','右側','左側','後ろ'].entries()){
    const bytes=index===0?large:index===1?oriented:normal;
    await page.locator(`input[aria-label="${label}をアップロード"]`).first().setInputFiles({name:`phase2-fixture-${index}.jpg`,mimeType:'image/jpeg',buffer:bytes});
    await page.getByRole('button',{name:'この写真を使う →',exact:true}).click();
  }
  assert.equal(await page.locator('.salon-current-photos .has-photo').count(),4);
  await openAnalysis();await page.getByRole('button',{name:'写真から髪・顔を解析する →',exact:true}).click();
  await page.getByText('顔の位置関係を取得しました',{exact:true}).waitFor({timeout:120000});
  await page.getByRole('spinbutton',{name:'中間 薬剤の吸い込みやすさ 確認値',exact:true}).fill('4');
  await page.screenshot({path:path.join(output,'step02-summary.png'),fullPage:true});
  await page.getByText('詳細を見る · AI原本／美容師確認',{exact:true}).click();
  await page.getByRole('spinbutton',{name:'顔の縦横比 美容師確認',exact:true}).fill('1.5');
  const band=page.getByRole('slider',{name:'根元領域の区切り',exact:true});await band.focus();await band.press('ArrowRight');
  await page.getByRole('button',{name:'この領域で確認する',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.photo-analysis-region button.salon-soft-button:disabled'));
  await page.screenshot({path:path.join(output,'step02-real-analysis.png'),fullPage:true});
  await saveHome();const record=await readRecord(),j=record.revisions.at(-1),s=j.diagnosisSession,run=s.photoAnalysis.runs.at(-1);
  assert.deepEqual(s.currentPhotos.map(p=>p.direction),['FRONT','RIGHT','LEFT','BACK']);
  assert.ok(j.photos[0].capture.original.width>j.photos[0].width);assert.equal(j.photos[0].capture.original.width,3200);assert.equal(j.photos[0].capture.original.dataUrl,largeData);
  assert.equal(run.photos[0].originalSha256,createHash('sha256').update(large).digest('hex'));
  assert.equal(j.photos[1].capture.original.dataUrl,`data:image/jpeg;base64,${oriented.toString('base64')}`);
  assert.equal(j.photos[1].capture.original.width,560);assert.equal(j.photos[1].capture.original.height,448);
  assert.equal(run.photos.length,4);assert.ok(run.photos[0].hairRegion.mask.runs.length>10);
  assert.ok(run.photos[0].faceLandmarks.length===478);assert.equal(run.photos[3].faceStatus,'NOT_APPLICABLE');
  const hair=s.hairAnalysis.aiEstimate.find(a=>a.id===run.hairEstimateId),face=s.faceBoneAnalysis.aiEstimate.find(a=>a.id===run.faceEstimateId);
  for(const zone of ['ROOT','MID','END']){assert.equal(hair.zones[zone].lightness.sourceType,'AI_ESTIMATE');assert.equal(hair.zones[zone].damage.value,null);assert.equal(hair.zones[zone].porosity.value,null);assert.equal(hair.zones[zone].grayPercentage.value,null);}
  assert.equal(face.metrics.faceHeightWidthRatio.sourceType,'AI_ESTIMATE');assert.equal(face.metrics.hairlinePosition.value,null);assert.equal(face.metrics.foreheadHeightRatio.value,null);
  assert.ok(s.hairAnalysis.stylistCorrection.some(c=>c.metric==='porosity'&&c.value.value===4));assert.ok(s.faceBoneAnalysis.stylistCorrection.some(c=>c.metric==='faceHeightWidthRatio'&&c.value.value===1.5));
  assert.equal(s.photoAnalysis.regionCorrections.length,1);assert.equal(s.designPlan.inputs.faceEstimateId,face.id);assert.ok(s.designPlan.bangFaceFrameDesigns.every(d=>d.generatedImage===null&&d.basedOnFaceBoneAnalysis.valuesWereUsed===false));
  const originalHair=JSON.stringify(hair),originalFace=JSON.stringify(face),originalRevision=JSON.stringify(record.revisions[0]);
  await page.screenshot({path:path.join(output,'home-real-analysis-1194.png'),fullPage:true});
  await page.reload();await page.getByRole('region',{name:'カウンセリングホーム'}).waitFor();await page.getByRole('button',{name:/過去の診断/}).first().click();await page.getByRole('button',{name:/新しいカラー相談/}).first().click();await page.getByText('保存した相談を開きました。',{exact:true}).waitFor();
  assert.equal(Number(await page.getByRole('slider',{name:'ホーム 薬剤の吸い込みやすさ',exact:true}).inputValue()),4);await page.setViewportSize({width:1024,height:768});await page.screenshot({path:path.join(output,'home-real-analysis-1024.png'),fullPage:true});
  await page.getByRole('button',{name:/新しいカラー相談/}).count();
  await page.getByRole('button',{name:'正面の撮影を開く',exact:true}).click();await page.locator('input[aria-label="正面をアップロード"]').first().setInputFiles({name:'replacement.jpg',mimeType:'image/jpeg',buffer:normal});await page.getByRole('button',{name:'この写真を使う →',exact:true}).click();
  await openAnalysis();await page.getByRole('button',{name:'写真から髪・顔を解析する →',exact:true}).click();await page.getByText('顔の位置関係を取得しました',{exact:true}).waitFor({timeout:120000});await saveHome();
  const second=await readRecord(),j2=second.revisions.at(-1),s2=j2.diagnosisSession;assert.equal(second.revisions.length,2);assert.equal(JSON.stringify(second.revisions[0]),originalRevision);
  assert.equal(JSON.stringify(s2.hairAnalysis.aiEstimate.find(a=>a.id===run.hairEstimateId)),originalHair);assert.equal(JSON.stringify(s2.faceBoneAnalysis.aiEstimate.find(a=>a.id===run.faceEstimateId)),originalFace);
  assert.equal(j2.analysisPhotoArchive.find(p=>p.id===j.photos[0].id).capture.original.dataUrl,largeData);
  // Camera control regression: a virtual getUserMedia camera, not iPhone/iPad hardware.
  await page.getByRole('button',{name:'正面の撮影を開く',exact:true}).click();await page.getByRole('button',{name:'4方向を続けて撮影 →',exact:true}).click();
  for(const label of ['正面','右側','左側','後ろ']){await page.getByRole('img',{name:new RegExp(`${label}の頭頂`)}).waitFor();await page.getByRole('button',{name:'撮影する',exact:true}).click();await page.getByRole('button',{name:'この写真を使う →',exact:true}).click();}
  assert.equal(await page.locator('.salon-capture-summary figure').count(),4);await page.getByRole('button',{name:'この4枚を登録する →',exact:true}).click();await page.getByRole('button',{name:'STYLE/COLOR設定',exact:true}).click();await page.getByRole('textbox',{name:'希望する髪色',exact:true}).fill('撮影確認の記録');await saveHome();const cameraRecord=(await readRecord()).revisions.at(-1);assert.ok(cameraRecord.photos.every(p=>p.capture.source==='web_camera'&&p.capture.original.representation==='browser_video_frame_jpeg'));assert.ok(cameraRecord.diagnosisSession.currentPhotos.every(p=>p.source==='CAMERA'));assert.equal(cameraRecord.diagnosisSession.photoAnalysis.activeRunId,null);
  if(externalPhotoRequests.length)await writeFile(path.join(output,'network-debug.json'),JSON.stringify({sdkLoads,telemetryInitiators},null,2));
  assert.deepEqual(errors,[]);assert.equal(generationPosts,0);assert.deepEqual(externalPhotoRequests,[]);
  if(run.execution==='MAIN_THREAD_CPU')assert.ok(sdkLoads.length>0&&sdkLoads.every(s=>s.telemetryDisabled&&!s.hasLoggerInitializer));
  const result={status:'PASS',provider:run.provider,hairModel:run.hairModel,faceModel:run.faceModel,execution:run.execution,realModelInference:true,
    viewportWidths:[1194,1024],physicalIOSDevice:false,realIndexedDB:true,originalBytesPreserved:true,largeImage:[3200,4000],exifOrientation6:true,
    hairPixels:run.photos[0].hairRegion.mask.runs.reduce((n,v,i)=>n+((i%2===run.photos[0].hairRegion.mask.startsWith)?0:v),0),faceLandmarks:run.photos[0].faceLandmarks.length,
    faceMetrics:Object.fromEntries(Object.entries(face.metrics).map(([k,v])=>[k,v.value])),hairValues:Object.fromEntries(Object.entries(hair.zones).map(([k,v])=>[k,{lightness:v.lightness.value,hue:v.hue.value,chroma:v.chroma.value,unevenness:v.unevenness.value}])),
    preservedAIOriginals:true,stylistCorrectionsPersisted:true,regionCorrectionPersisted:true,oldSourceBytesArchived:true,virtualCameraFourDirections:true,
    generationPosts,externalPhotoRequests,pageErrors:errors};await writeFile(path.join(output,'browser-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await context.close();await browser.close();if(server){server.kill('SIGTERM');await writeFile(path.join(output,'server.log'),serverLog);}}
