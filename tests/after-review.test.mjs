import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {observeReviewPhoto,compareReviewPhotos,reviewPose,alignReviewFaces,mapReviewPoint,inverseReviewTransform,REVIEW_WEIGHTS,reviewFlow} from '../src/lib/after-review-analysis.ts';
import {reviewFeedbackInput,validateReviewFeedbackInput,handleReviewFeedback,validReviewFeedback} from '../src/lib/after-review-feedback.ts';
import worker from '../site-worker/index.ts';

function face(){const p=Array.from({length:478},()=>({x:.5,y:.4,z:0}));for(const [i,x,y]of [[33,.35,.4],[263,.65,.4],[1,.5,.48],[10,.5,.2],[152,.5,.75],[234,.28,.45],[454,.72,.45]])p[i]={x,y,z:0};return p;}
function observation({width=64,height=96,points=face(),color=0,shift=0,direction='FRONT',white=false}={}){
 const pixels=new Uint8ClampedArray(width*height*4),mask=new Uint8Array(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const n=y*width+x,v=(x%6<3?95:130)+color;pixels.set(white?[255,255,255,255]:[v,v*.7,v*.5,255],n*4);if(x>=5+shift&&x<width-5+shift&&y>=8&&y<height-6)mask[n]=1;}
 return observeReviewPhoto(direction,pixels,width,height,mask,points);
}
test('Measured identical inputs produce evidence-based scores; dimensions and weights are explicit',()=>{
 const obs=observation(),result=compareReviewPhotos(obs,obs);assert.equal(result.comparable,true);assert.equal(result.metrics.silhouetteIoU,1);assert.equal(result.metrics.deltaE76,0);assert.equal(result.scores.style.value,100);assert.equal(result.scores.color.value,100);assert.equal(result.calibrated,false);assert.ok(Math.abs(Object.values(REVIEW_WEIGHTS).reduce((a,b)=>a+b)-1)<1e-12);assert.ok(result.actualContour.length>10);
});
test('Changing the actual hair silhouette lowers IoU; the hair bounding box is not normalized away',()=>{
 const a=observation(),b=observation({shift:8}),result=compareReviewPhotos(a,b);assert.ok(result.metrics.silhouetteIoU<.95);assert.ok(result.improvements.some(x=>x.includes('輪郭')));assert.ok(result.scores.style.value<100);
});
test('Unknown face anchors and excessive yaw/pitch cause no invented style or overall percentage',()=>{
 const target=observation(),unknown=observation({points:[]}),result=compareReviewPhotos(target,unknown);assert.equal(result.comparable,false);assert.equal(result.scores.style.value,null);assert.equal(result.scores.overall.value,null);assert.equal(result.transform,null);
 const turned=face();turned[263].z=.8;const angle=compareReviewPhotos(target,observation({points:turned}));assert.equal(angle.comparable,false);assert.match(angle.reason,/視点|2D/);
});
test('Face-only translation/roll/scale preserve image geometry and inverse point mapping',()=>{
 const target=observation(),points=face().map(p=>({...p,x:p.x*.8+.08,y:p.y*.8+.1})),actual=observation({points}),alignment=alignReviewFaces(target,actual);assert.ok(alignment.transform);
 const t=alignment.transform,p={x:.23,y:.62},restored=mapReviewPoint(mapReviewPoint(p,t),inverseReviewTransform(t));assert.ok(Math.abs(restored.x-p.x)<1e-10);assert.ok(Math.abs(restored.y-p.y)<1e-10);
 const pose=reviewPose(points,64,96),aligned=mapReviewPoint(pose.center,t),original=reviewPose(target.landmarks,64,96);assert.ok(Math.abs(aligned.x-original.center.x)<1e-8);assert.ok(Math.abs(aligned.y-original.center.y)<1e-8);
});
test('Different image aspect ratios still yield a pixel similarity transform, without anisotropic hair deformation',()=>{
 const target=observation({width:64,height:96}),actual=observation({width:96,height:96}),m=alignReviewFaces(target,actual).transform;assert.ok(m);
 const sx=Math.hypot(m.a*target.width/actual.width,m.b*target.height/actual.width),sy=Math.hypot(m.c*target.width/actual.height,m.d*target.height/actual.height);assert.ok(Math.abs(sx-sy)<1e-9);
});
test('Missing directions do not borrow another angle; BACK has no fabricated face pose',()=>{
 const front=observation(),back=observation({direction:'BACK',points:[]});assert.equal(compareReviewPhotos(front,back).comparable,false);assert.equal(compareReviewPhotos(front,back).scores.color.value,null);assert.equal(compareReviewPhotos(back,back).scores.overall.value,null);
});
test('Clipped hair photos cannot produce a physical color measurement or color score',()=>{
 const result=compareReviewPhotos(observation(),observation({white:true}));assert.equal(result.metrics.deltaE76,null);assert.equal(result.scores.color.value,null);assert.equal(result.scores.overall.value,null);assert.ok(result.education.some(x=>x.cause.includes('クリッピング')));
});
test('Color difference changes with actual pixels and remains explicitly uncalibrated',()=>{
 const result=compareReviewPhotos(observation(),observation({color:30}));assert.ok(result.metrics.deltaE76>0);assert.ok(result.scores.color.value<100);assert.equal(result.scores.color.confidence,'LOW');assert.match(result.scores.color.reason,/未校正/);assert.ok(result.improvements.length);
});
test('Structure-tensor directions require textured masked pixels; flat images have no invented arrows',()=>{
 const pixels=new Uint8ClampedArray(64*96*4).fill(128),mask=new Uint8Array(64*96).fill(1);assert.deepEqual(reviewFlow(pixels,mask,64,96),[]);const obs=observation();assert.ok(obs.flow.length);assert.ok(obs.flow.every(v=>v.coherence>=.25));
});
test('Analyzing and building overlays never modifies source bytes or analysis values',()=>{
 const a=observation(),b=observation({shift:3}),beforeA=structuredClone(a),beforeB=structuredClone(b);compareReviewPhotos(a,b);assert.deepEqual(a,beforeA);assert.deepEqual(b,beforeB);
});
test('Feedback input omits photos, file names, customer identities and face landmarks',()=>{
 const result=compareReviewPhotos(observation(),observation()),input=reviewFeedbackInput([result]);validateReviewFeedbackInput(input);assert.doesNotMatch(JSON.stringify(input),/data:image|landmarks|contour|providerRequestId|stylist|customer|fileName/);
 for(const bad of [{...input,photo:'data:image/png;base64,x'},{results:[{...input.results[0],name:'private'}]}])assert.throws(()=>validateReviewFeedbackInput(bad));
 input.results[0].scores.style=NaN;assert.throws(()=>validateReviewFeedbackInput(input));
});
const request=body=>new Request('https://unit.test/api/after-review/feedback',{method:'POST',headers:{'oai-authenticated-user-id':'TEST_ONLY',origin:'https://unit.test'},body:JSON.stringify(body)});
test('No API key, unauthenticated calls and foreign origins stop before a paid provider call',async()=>{
 let calls=0;const transport=async()=>{calls++;throw Error('must not call');};const input=reviewFeedbackInput([compareReviewPhotos(observation(),observation())]);
 assert.equal((await handleReviewFeedback(request(input),{},transport)).status,503);
 assert.equal((await handleReviewFeedback(new Request('https://unit.test/api/after-review/feedback',{method:'POST',body:'{}'}),{apiKey:'TEST_ONLY'},transport)).status,401);
 assert.equal((await handleReviewFeedback(new Request('https://unit.test/api/after-review/feedback',{method:'POST',headers:{'oai-authenticated-user-id':'TEST_ONLY',origin:'https://other.test'},body:'{}'}),{apiKey:'TEST_ONLY'},transport)).status,403);assert.equal(calls,0);
});
test('Feedback API sends numeric-only context with store:false and accepts a schema-checked reference response',async()=>{
 const input=reviewFeedbackInput([compareReviewPhotos(observation(),observation({shift:4}))]),feedback={improvements:['TEST_ONLY：輪郭差のある部分を確認してください。'],education:[{category:'カット・セクション設計',cause:'TEST_ONLY：差分あり。原因は推定。',check:'TEST_ONLY：施術情報を確認。'}]};let sent;
 const response=await handleReviewFeedback(request(input),{apiKey:'TEST_ONLY_NOT_REAL'},async(url,options)=>{sent=JSON.parse(options.body);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(feedback)}}],model:'TEST_TRANSPORT_ONLY'});});assert.equal(response.status,200);assert.equal(sent.store,false);assert.doesNotMatch(JSON.stringify(sent),/data:image|landmarks/);assert.equal((await response.json()).feedback.model,'TEST_TRANSPORT_ONLY');assert.equal(validReviewFeedback({...feedback,photos:[]}),false);
});
test('Malformed or refused provider text is not converted to a successful AI result',async()=>{
 const input=reviewFeedbackInput([compareReviewPhotos(observation(),observation())]);for(const message of [{refusal:'TEST_ONLY'},{content:'broken'}])assert.equal((await handleReviewFeedback(request(input),{apiKey:'TEST_ONLY'},async()=>Response.json({choices:[{finish_reason:'stop',message}]}))).status,502);
});
test('Worker serves Page 4 and preserves all old routes; new API uses the same private auth',async()=>{
 for(const path of ['/fiole/counseling-page1','/fiole/pro-design','/fiole/after-support','/fiole/after-review']){const r=await worker.fetch(new Request('https://unit.test'+path),{ASSETS:{fetch:async req=>new Response(new URL(req.url).pathname)}});assert.equal(await r.text(),'/');}
 const r=await worker.fetch(new Request('https://unit.test/api/after-review/feedback'),{});assert.equal((await r.json()).configured,false);
});
test('The actual Page 4 component renders exactly six master sections, no fake score, and no seventh section',async()=>{
 mkdirSync('test-artifacts',{recursive:true});await build({entryPoints:['src/components/after-review-page.tsx'],bundle:true,platform:'node',format:'esm',outfile:'test-artifacts/after-review-ssr.mjs',external:['react','react-dom','react-dom/server'],loader:{'.css':'empty'},tsconfig:'tsconfig.json'});
 const {default:Page}=await import('../test-artifacts/after-review-ssr.mjs');const html=renderToStaticMarkup(createElement(Page));assert.equal((html.match(/data-section=/g)??[]).length,6);assert.match(html,/判定不可/);assert.doesNotMatch(html,/88%|91%|次回の改善アクション/);
});
test('The new master files are byte-preserved, and Page 4 upload/export have no permanent write calls',()=>{
 const root=new URL('../docs/visual-master/20261013-page4-color/',import.meta.url);assert.equal(createHash('sha256').update(readFileSync(new URL('COLOR_MODAL_MASTER.jpeg',root))).digest('hex'),'ee54dc359ef4dc41e7e0bf40d017cdbfa1d5af32199507c4291c9f89bff13c08');assert.equal(createHash('sha256').update(readFileSync(new URL('PAGE4_MASTER.jpeg',root))).digest('hex'),'fbdb698e701fd71a04999981ddea6b18215c6d9150306774cd7980ae8cea47bf');
 const files=['../src/lib/after-review-client.ts','../src/components/after-review-page.tsx'];for(const file of files)assert.doesNotMatch(readFileSync(new URL(file,import.meta.url),'utf8'),/saveCounselingDraft|localStorage\.setItem|indexedDB\.open|store\.save|console\.log/);
 const css=readFileSync(new URL('../src/components/counseling-color-modal.css',import.meta.url),'utf8');assert.match(css,/\.cc-adjustment-panel\{min-height:0;overflow-y:auto/);assert.match(css,/\.cfa-dialog\[data-editor=color\]/);
});
