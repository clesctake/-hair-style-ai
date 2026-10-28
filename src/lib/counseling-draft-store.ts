import type {Journey} from './journey.ts';
import {validateDiagnosisSession} from './session-validation.ts';

/** Zero-photo drafts never bypass the existing clinical-record photo validation.
 * They use a separate device store, but retain the same DiagnosisSession id.
 */
const open=()=>new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('cfa-counseling-page1-drafts',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(new Error('カウンセリングの下書きを開けませんでした。'));});
export async function saveCounselingDraft(journey:Journey):Promise<void>{
 if(!journey.diagnosisSession)throw new Error('共通セッションがありません。');validateDiagnosisSession(journey.diagnosisSession);
 const db=await open();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put({key:'latest',schemaVersion:'counseling-draft-v1',sessionId:journey.diagnosisSession!.id,journey:structuredClone(journey)});tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(new Error('下書きを保存できませんでした。'));});}finally{db.close();}
}
export async function loadCounselingDraft():Promise<Journey|null>{
 const db=await open();try{return await new Promise<Journey|null>((resolve,reject)=>{const r=db.transaction('drafts','readonly').objectStore('drafts').get('latest');r.onsuccess=()=>{try{const v=r.result;if(!v){resolve(null);return;}if(v.schemaVersion!=='counseling-draft-v1'||!v.journey?.diagnosisSession||v.sessionId!==v.journey.diagnosisSession.id)throw new Error('未対応の下書きです。');validateDiagnosisSession(v.journey.diagnosisSession);resolve(v.journey);}catch(e){reject(e);}};r.onerror=()=>reject(new Error('下書きを読み込めませんでした。'));});}finally{db.close();}
}
