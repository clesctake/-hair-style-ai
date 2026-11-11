/** Explicit browser-only MOCK workspace. This never grants server/API permission. */
import type {Journey} from './journey.ts';
export function currentLocalMockScope(search?:string):boolean{
 const value=search??(typeof window==='undefined'?'':window.location.search);
 return new URLSearchParams(value).get('simulation')==='mock';
}
export const scopedDatabaseName=(name:string)=>currentLocalMockScope()?name+':mock-local-v1':name;
export const consultationStorageKey=()=>currentLocalMockScope()?'color-future-ai-counseling-page1:last-session:mock-local-v1':'color-future-ai-counseling-page1:last-session';
export function assertConsultationScope(j:Journey,mock=currentLocalMockScope()){
 if((j.diagnosisSession?.counseling?.generationMode==='MOCK_LOCAL_V1')!==mock)throw new Error('通常相談とMOCK相談の保存領域が一致しません。原記録は変更していません。');
}
export function localScopePath(path:string){
 if(!path.startsWith('/fiole/')||path.includes('?')||path.includes('#'))throw new Error('画面の移動先を確認してください。');
 return currentLocalMockScope()?path+'?simulation=mock':path;
}
