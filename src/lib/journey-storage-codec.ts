import type {Journey} from './journey.ts';
export const JOURNEY_STORAGE_CODEC='journey-json-gzip-v1' as const;
export type CompressedJourney={storageCodec:typeof JOURNEY_STORAGE_CODEC;id:string;version:number;dataSchemaVersion:'diagnosis-session-v1';uncompressedBytes:number;sha256:string;payload:Uint8Array};
export type StoredJourney=Journey|CompressedJourney;
const maximum=256*1024*1024;
const hash=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes).buffer)),b=>b.toString(16).padStart(2,'0')).join('');
export function storedJourneyVersion(value:StoredJourney):number {if('storageCodec' in value&&value.storageCodec!==JOURNEY_STORAGE_CODEC)throw new Error('未対応の保存形式です。原本を保持してください。');return value.version;}
export async function encodeJourneyRevision(j:Journey,compressionAvailable=true):Promise<StoredJourney>{
 if(!j.diagnosisSession?.hairSimulation||!compressionAvailable||typeof CompressionStream==='undefined'||typeof DecompressionStream==='undefined')return structuredClone(j);
 const bytes=new TextEncoder().encode(JSON.stringify(j));if(bytes.length>maximum)throw new Error('保存データが大きすぎます。原本は変更していません。');
 const compressed=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
 return {storageCodec:JOURNEY_STORAGE_CODEC,id:j.id!,version:j.version,dataSchemaVersion:'diagnosis-session-v1',uncompressedBytes:bytes.length,sha256:await hash(bytes),payload:compressed};
}
export async function decodeJourneyRevision(value:StoredJourney):Promise<Journey>{
 if(!('storageCodec' in value))return structuredClone(value);
 if(value.storageCodec!==JOURNEY_STORAGE_CODEC||value.dataSchemaVersion!=='diagnosis-session-v1'||!(value.payload instanceof Uint8Array)||value.uncompressedBytes>maximum||value.uncompressedBytes<1)throw new Error('未対応または破損した保存形式です。原本を保持してください。');
 if(typeof DecompressionStream==='undefined')throw new Error('このブラウザでは圧縮カルテを読めません。原本を保持して対応ブラウザで開いてください。');
 let bytes:Uint8Array;try{
  const reader=new Blob([new Uint8Array(value.payload)]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),chunks:Uint8Array[]=[];let size=0;
  for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>maximum||size>value.uncompressedBytes){await reader.cancel();throw new Error('展開サイズ不一致');}chunks.push(chunk.value);}
  bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 }catch{throw new Error('圧縮カルテが破損しています。原本を保持してください。');}
 if(bytes.length!==value.uncompressedBytes||await hash(bytes)!==value.sha256)throw new Error('カルテの整合性を確認できません。原本を保持してください。');
 const j=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as Journey;
 if(j.id!==value.id||j.version!==value.version||j.diagnosisSession?.revision!==value.version||j.diagnosisSession?.dataSchemaVersion!==value.dataSchemaVersion)throw new Error('保存版・カルテIDが一致しません。原本を保持してください。');
 return j;
}
