import {encodeJourneyRevision,decodeJourneyRevision,storedJourneyVersion,type StoredJourney} from './journey-storage-codec.ts';
import {withDiagnosisSession} from './session-adapter.ts';
import {assertSessionHistory} from './session-validation.ts';
import {APP_VERSION,SPEC_VERSION} from './session-model.ts';
import {featureSnapshot} from './feature-registry.ts';
import {preserveAnalysisOriginals} from './analysis-photo-archive.ts';
import {baseSnapshot} from './base-making.ts';
import {finalDesignParameters} from './design-target.ts';
import type { CatalogData } from './catalog.ts';
import type { Journey } from './journey.ts';
import { validateJourney, assertDiagnosisHistory, uid, now } from './journey.ts';
export interface JourneyStore {list():Promise<Journey[]>;save(value:Journey):Promise<Journey>;load(id:string):Promise<Journey>;mode:'device'|'memory'}
function revision(previous:Journey|undefined,value:Journey,data:CatalogData):Journey {
 value=previous?preserveAnalysisOriginals(previous,value):value;
 validateJourney(value,data);
 if((previous&&!value.id)||(value.id?!previous||previous.version!==value.version:value.version!==0))throw new Error('他の画面で更新されています。保存済み記録を開き直してください。');
 if(value.diagnosisSession&&value.diagnosisSession.revision!==value.version)throw new Error('共通データと既存カルテの保存版が異なります。');
 if(previous)assertDiagnosisHistory(previous,value);
 const current=withDiagnosisSession(value,data,previous?.diagnosisSession);
 if(previous?.diagnosisSession)assertSessionHistory(previous.diagnosisSession,current.diagnosisSession!);
 const next={...current,diagnosisSession:{...current.diagnosisSession!,appVersion:APP_VERSION,specVersion:SPEC_VERSION,featureSnapshot:featureSnapshot()},...(current.baseMaking?{baseMaking:{...current.baseMaking,snapshot:baseSnapshot(current)}}:{}),id:current.id??current.diagnosisSession!.id,version:current.version+1,updatedAt:now(),target:{...current.target,finalDesignParameters:finalDesignParameters(current)}};
 return structuredClone(withDiagnosisSession(next,data));
}
export function memoryJourneyStore(data:CatalogData):JourneyStore {const records=new Map<string,Journey[]>();return {mode:'memory',async list(){return [...records.values()].map(r=>withDiagnosisSession(structuredClone(r.at(-1)!),data)).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));},async load(id){const value=records.get(id)?.at(-1);if(!value)throw new Error('記録が見つかりません。');return withDiagnosisSession(structuredClone(value),data);},async save(value){const revisions=value.id?records.get(value.id)??[]:records.get(value.diagnosisSession?.id??'')??[];const next=revision(revisions.at(-1),value,data);records.set(next.id!,[...revisions,next]);return structuredClone(next);}};}
export function deviceJourneyStore(data:CatalogData):JourneyStore {
 const open=()=>new Promise<IDBDatabase>((resolve,reject)=>{if(typeof indexedDB==='undefined'){reject(new Error('このブラウザでは端末保存を利用できません。'));return;}const r=indexedDB.open('hair-mirror-color-journey-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('records',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(new Error('端末の保存領域を開けませんでした。'));});
 const read=async(id?:string)=>{const db=await open();try{return await new Promise<{id:string;revisions:StoredJourney[]}[]>((resolve,reject)=>{const tx=db.transaction('records','readonly');const r=id?tx.objectStore('records').get(id):tx.objectStore('records').getAll();r.onsuccess=()=>resolve(id?(r.result?[r.result]:[]):r.result);r.onerror=()=>reject(new Error('記録を読み込めませんでした。'));});}finally{db.close();}};
 return {mode:'device',async list(){const values=await Promise.all((await read()).map(async x=>withDiagnosisSession(await decodeJourneyRevision(x.revisions.at(-1)!),data)));return values.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));},async load(id){const value=(await read(id))[0]?.revisions.at(-1);if(!value)throw new Error('記録が見つかりません。');return withDiagnosisSession(await decodeJourneyRevision(value),data);},async save(value){
  validateJourney(value,data);const key=value.id??value.diagnosisSession?.id??'new',record=(await read(key))[0],storedPrevious=record?.revisions.at(-1),previous=storedPrevious?await decodeJourneyRevision(storedPrevious):undefined;
  const next=revision(previous,value,data),encoded=await encodeJourneyRevision(next); // Async compression is outside the write transaction.
  const db=await open();try{return await new Promise<Journey>((resolve,reject)=>{const tx=db.transaction('records','readwrite'),store=tx.objectStore('records');let error:Error|null=null;const get=store.get(key);get.onsuccess=()=>{try{
   const revisions:StoredJourney[]=get.result?.revisions??[],latest=revisions.at(-1);
   if((latest?storedJourneyVersion(latest):null)!==(storedPrevious?storedJourneyVersion(storedPrevious):null))throw new Error('他の画面で更新されています。保存済み記録を開き直してください。');
   store.put({id:next.id,revisions:[...revisions,encoded]});
  }catch(e){error=e instanceof Error?e:new Error('保存に失敗しました。');tx.abort();}};tx.oncomplete=()=>resolve(next);tx.onerror=tx.onabort=()=>reject(error??new Error('端末に保存できませんでした。保存容量や設定を確認してください。'));});}finally{db.close();}
 }};
}
export async function readPhoto(file:File,view:import('./journey.ts').Photo['view']):Promise<import('./journey.ts').Photo>{if(!['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(file.type)||!file.size||file.size>20*1024*1024)throw new Error('20MB以下のJPEG・PNG・WebP写真を選択してください。表示できないHEICはJPEGへ変換してください。');const raw=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('写真を読み込めませんでした。'));reader.readAsDataURL(file);});const image=await new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('この形式の写真を表示できません。JPEG・PNG等へ変換してください。'));img.src=raw;});const scale=Math.min(1,960/Math.max(image.naturalWidth,image.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));const ctx=canvas.getContext('2d');if(!ctx)throw new Error('写真の処理に失敗しました。');ctx.drawImage(image,0,0,canvas.width,canvas.height);return {id:uid(),view,name:file.name,dataUrl:canvas.toDataURL('image/jpeg',.78),width:canvas.width,height:canvas.height,createdAt:now(),original:{dataUrl:raw,mimeType:file.type,byteSize:file.size,width:image.naturalWidth,height:image.naturalHeight,representation:'original_file_bytes',colourProcessing:'none_app_applied',profile:'not_parsed'}};}
