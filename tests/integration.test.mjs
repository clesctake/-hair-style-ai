import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { emptyDraft, addStylistObservation } from '../src/lib/domain.ts';
import { saveDraft, loadDraft, listDrafts } from '../src/lib/browser-store.ts';
const route = await import('../app/api/generate/route.js');
function memoryStorage(){const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};}
test('browser records retain original observations, reject stale saves and survive reload',()=>{
  const storage=memoryStorage();
  let draft={...emptyDraft(),title:'診断記録'};
  draft=addStylistObservation(draft,'initial','root','damage',2,'a','2026-10-01T00:00:00Z');
  const first=saveDraft(draft,storage);
  const edited=addStylistObservation(first,'initial','root','damage',4,'b','2026-10-01T01:00:00Z');
  const second=saveDraft(edited,storage);
  assert.equal(loadDraft(first.id,storage).observations[0].value,2);
  assert.equal(second.observations[1].overridesId,'a');
  assert.equal(listDrafts(storage).length,1);
  assert.throws(()=>saveDraft(first,storage),/更新/);
  assert.throws(()=>saveDraft({...second,observations:[]},storage),/変更/);
  assert.throws(()=>saveDraft({...emptyDraft(),title:'bad',observations:[{...draft.observations[0],value:2.5}]},storage),/不正/);
});
test('storage failures do not report successful persistence',()=>{
  const storage=memoryStorage();storage.setItem=()=>{throw new Error('quota');};
  assert.throws(()=>saveDraft({...emptyDraft(),title:'容量検証'},storage),/保存できません/);
});
test('image generation sends two images and one identity-preserving prompt',async()=>{
  const priorKey=process.env.OPENAI_API_KEY,priorFetch=globalThis.fetch;
  process.env.OPENAI_API_KEY='unit-test-placeholder';
  try{
    let calls=0;
    globalThis.fetch=async(url,options)=>{
      calls++;
      assert.equal(url,'https://api.openai.com/v1/images/edits');
      assert.equal(options.body.getAll('image[]').length,2);
      assert.equal(options.body.getAll('prompt').length,1);
      assert.match(options.body.get('prompt'),/Keep the identity/);
      assert.match(options.body.get('prompt'),/オリーブベージュ/);
      return Response.json({data:[{b64_json:'dGVzdA=='}]});
    };
    const bytes=Uint8Array.from([255,216,255,224,0,16]);
    const form=new FormData();form.append('image',new File([bytes],'hair.jpg',{type:'image/jpeg'}));form.append('referenceImage',new File([bytes],'reference.jpg',{type:'image/jpeg'}));form.append('request','オリーブベージュ');
    const result=await route.POST(new Request('http://localhost/api/generate',{method:'POST',body:form}));
    assert.equal(result.status,200);assert.equal(calls,1);assert.equal((await result.json()).image,'data:image/png;base64,dGVzdA==');
    const missing=await route.POST(new Request('http://localhost/api/generate',{method:'POST',body:new FormData()}));assert.equal(missing.status,400);assert.equal(calls,1);
  }finally{globalThis.fetch=priorFetch;if(priorKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=priorKey;}
});
