import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hairImageInput, matchingHairImage,hairImageProvenance } from '../src/lib/hair-images.ts';
import { createHairImageGenerator } from '../src/lib/hair-image-client.ts';
import { newJourney, correct } from '../src/lib/journey.ts';
import { createJourneySample } from '../src/lib/journey-sample.ts';
import { memoryJourneyStore } from '../src/lib/journey-store.ts';
import { catalog as data } from '../src/lib/catalog.ts';

const assets=JSON.parse(readFileSync('src/data/journey_sample_assets.json','utf8'));
const route=await import('../app/api/generate/route.js');
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLXcAAAAASUVORK5CYII=';
const metadata={origin:'openai_images_edit',model:'gpt-image-2',promptVersion:'hair-identity-reference-v2',createdAt:'2026-10-03T01:00:00.000Z',requestId:'test-id'};
function photo(){return new File([Buffer.from(png,'base64')],'photo.png',{type:'image/png'});}
function request(form){return new Request('https://hair.example/api/generate',{method:'POST',body:form,headers:{origin:'https://hair.example'}});}
function validForm(){const f=new FormData();f.append('image',photo());f.append('referenceImage',photo());f.append('request','赤みを抑えたベージュ');return f;}

test('API reports missing configuration truthfully without generating or exposing a key',async()=>{
 const key=process.env.OPENAI_API_KEY,fetcher=globalThis.fetch;
 try{
  delete process.env.OPENAI_API_KEY;
  globalThis.fetch=()=>{throw new Error('must not fetch');};
  const status=await route.GET();assert.equal((await status.json()).configured,false);
  const result=await route.POST(request(validForm()));assert.equal(result.status,503);
  assert.equal((await result.json()).code,'not_configured');assert.equal(result.headers.get('cache-control'),'no-store');
 }finally{globalThis.fetch=fetcher;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});

test('API sends two photos once, preserves identity and rejects invalid inputs before billing',async()=>{
 const key=process.env.OPENAI_API_KEY,fetcher=globalThis.fetch;let calls=0;
 try{
  process.env.OPENAI_API_KEY='test-key';
  globalThis.fetch=async(url,options)=>{
   calls++;assert.equal(url,'https://api.openai.com/v1/images/edits');
   assert.equal(options.body.getAll('image[]').length,2);assert.equal(options.body.getAll('prompt').length,1);
   assert.equal(options.body.get('n'),'1');assert.equal(options.body.get('output_format'),'png');
   assert.match(options.body.get('prompt'),/Keep the identity/);assert.match(options.body.get('prompt'),/not a scientifically calculated/);
   assert.match(options.body.get('prompt'),/赤みを抑えたベージュ/);assert.equal(options.body.has('input_fidelity'),false);
   return Response.json({data:[{b64_json:png}]},{headers:{'x-request-id':'test-id'}});
  };
  assert.equal((await route.GET()).status,200);assert.equal(calls,0);
  const result=await route.POST(request(validForm())),body=await result.json();
  assert.equal(result.status,200);assert.equal(body.image,'data:image/png;base64,'+png);assert.equal(body.generation.requestId,'test-id');
  const bad=validForm();bad.set('referenceImage','not a file');assert.equal((await route.POST(request(bad))).status,400);
  const spoof=validForm();spoof.set('image',new File(['text'],'fake.jpg',{type:'image/jpeg'}));assert.equal((await route.POST(request(spoof))).status,400);
  const blank=validForm();blank.set('request','  ');assert.equal((await route.POST(request(blank))).status,400);
  const tooLong=validForm();tooLong.set('request','x'.repeat(4501));assert.equal((await route.POST(request(tooLong))).status,400);
  const foreign=new Request('https://hair.example/api/generate',{method:'POST',headers:{origin:'https://foreign.example'},body:validForm()});
  assert.equal((await route.POST(foreign)).status,403);assert.equal(calls,1);
 }finally{globalThis.fetch=fetcher;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});

test('API handles provider denial, missing output and timeout without returning secrets or mock success',async()=>{
 const key=process.env.OPENAI_API_KEY,fetcher=globalThis.fetch,logger=console.error;
 try{
  process.env.OPENAI_API_KEY='test-secret';console.error=()=>{};
  globalThis.fetch=async()=>Response.json({error:{message:'sensitive error test-secret'}},{status:401});
  const denied=await route.POST(request(validForm()));assert.equal(denied.status,502);assert.doesNotMatch(JSON.stringify(await denied.json()),/sensitive|test-secret/);
  globalThis.fetch=async()=>Response.json({data:[]});assert.equal((await route.POST(request(validForm()))).status,502);
  globalThis.fetch=async()=>{throw new DOMException('timed out','TimeoutError');};assert.equal((await route.POST(request(validForm()))).status,504);
 }finally{globalThis.fetch=fetcher;console.error=logger;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});

test('generated image context follows real image inputs and remains separate from diagnosis and After',async()=>{
 const sample=await createJourneySample(data,assets),s=sample.session,input=hairImageInput(s);
 assert.ok(input);assert.equal(hairImageInput(newJourney()),null);
 const image={...metadata,id:'generated-1',...hairImageProvenance(input),dataUrl:'data:image/png;base64,'+png,width:1,height:1};
 const value={...s,imageGenerations:[image]},store=memoryJourneyStore(data);
 assert.equal(matchingHairImage(value),image);assert.equal(matchingHairImage(correct(value,'mid','damage',5)),image);
 assert.equal(matchingHairImage({...value,target:{...value.target,text:'違う髪色'}}),undefined);
 assert.equal(matchingHairImage({...value,target:{...value.target,reference:{...value.target.reference,id:'new-ref'}}}),undefined);
 const saved=await store.save(value),loaded=await store.load(saved.id);
 assert.deepEqual(loaded.imageGenerations,[image]);assert.equal(loaded.after,null);assert.equal(loaded.actual,null);
 await assert.rejects(store.save({...loaded,imageGenerations:[]}),/生成画像履歴/);
 await assert.rejects(store.save({...loaded,imageGenerations:[{...image,origin:'demo_fixture'}]}),/生成元/);
});

test('client sends separate STYLE and COLOR multipart inputs and propagates server errors',async()=>{
 const {session}=await createJourneySample(data,assets),input=hairImageInput(session);
 let calls=0;
 const client=createHairImageGenerator(async(url,options)=>{
  calls++;assert.equal(url,'/api/generate');
  if(!options.method)return Response.json({configured:true,model:'gpt-image-2'});
  assert.equal(options.body.getAll('image').length,1);assert.equal(options.body.getAll('styleReferenceImage').length,1);assert.equal(options.body.getAll('colorReferenceImage').length,1);assert.equal(options.body.has('referenceImage'),false);assert.equal(options.body.get('mode'),'style_color');
  assert.equal(options.body.get('request'),input.requestText);assert.ok(options.signal);
  return Response.json({error:'接続設定を確認してください。'},{status:503});
 });
 assert.equal((await client.status()).configured,true);
 await assert.rejects(client.generate(input,new AbortController().signal),/接続設定/);assert.equal(calls,2);
});

test('separated API sends current, STYLE and COLOR in order with independent role constraints; mixed-role submissions are rejected',async()=>{
 const key=process.env.OPENAI_API_KEY,fetcher=globalThis.fetch;let calls=0;
 try{
  process.env.OPENAI_API_KEY='test-key';
  globalThis.fetch=async(url,options)=>{calls++;const files=options.body.getAll('image[]'),prompt=options.body.get('prompt');assert.equal(files.length,3);assert.match(files[0].name,/current-person/);assert.match(files[1].name,/style-shape/);assert.match(files[2].name,/color-tone/);assert.match(prompt,/Ignore its hair color/);assert.match(prompt,/Ignore its hairstyle/);assert.match(prompt,/age, skin, expression, pose/);return Response.json({data:[{b64_json:png}]});};
  const f=new FormData();f.append('image',photo());f.append('styleReferenceImage',photo());f.append('colorReferenceImage',photo());f.append('mode','style_color');f.append('request','STYLEはレイヤー、COLORはグレージュ');assert.equal((await route.POST(request(f))).status,200);assert.equal(calls,1);
  f.set('mode','style_only');assert.equal((await route.POST(request(f))).status,400);assert.equal(calls,1);
  f.set('mode','style_color');f.append('referenceImage',photo());assert.equal((await route.POST(request(f))).status,400);assert.equal(calls,1);
 }finally{globalThis.fetch=fetcher;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});
test('single-axis API preserves the other axis; original two-reference history remains valid',async()=>{
 const key=process.env.OPENAI_API_KEY,fetcher=globalThis.fetch;let prompt='';
 try{
  process.env.OPENAI_API_KEY='test-key';globalThis.fetch=async(url,options)=>{prompt=options.body.get('prompt');assert.equal(options.body.getAll('image[]').length,2);return Response.json({data:[{b64_json:png}]});};
  const f=new FormData();f.append('image',photo());f.append('styleReferenceImage',photo());f.append('mode','style_only');f.append('request','レイヤースタイル');assert.equal((await route.POST(request(f))).status,200);assert.match(prompt,/Preserve the CURRENT PERSON's hair color/);
  f.delete('styleReferenceImage');f.append('colorReferenceImage',photo());f.set('mode','color_only');assert.equal((await route.POST(request(f))).status,200);assert.match(prompt,/Preserve the CURRENT PERSON's haircut/);
  const {validateHairImage}=await import('../src/lib/hair-images.ts');const previous={...metadata,id:'legacy',currentPhotoId:'before',referencePhotoId:'legacy-ref',requestText:'ベージュ',context:JSON.stringify({currentPhotoId:'before',referencePhotoId:'legacy-ref',requestText:'ベージュ'}),dataUrl:'data:image/png;base64,'+png,width:1,height:1};assert.doesNotThrow(()=>validateHairImage(previous));
 }finally{globalThis.fetch=fetcher;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});
