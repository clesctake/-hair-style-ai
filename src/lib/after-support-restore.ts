import type {Journey} from './journey.ts';

/** Page 3 reads both existing stores independently; one failed read must not hide the other. */
export async function restoreSupportSources(id:string|null,loadRecord:(id:string)=>Promise<Journey>,loadDraft:()=>Promise<Journey|null>){
 const [record,draft]=await Promise.allSettled([id?loadRecord(id):Promise.resolve(null),loadDraft()]);
 const saved=record.status==='fulfilled'?record.value:null,latest=draft.status==='fulfilled'?draft.value:null;
 const errors=[record,draft].flatMap(result=>result.status==='rejected'?[result.reason instanceof Error?result.reason.message:'保存データを読み込めませんでした。']:[]);
 return {journey:latest&&(!saved||latest.updatedAt>=saved.updatedAt)?latest:saved,errors};
}
