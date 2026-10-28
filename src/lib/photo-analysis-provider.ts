'use client';
import type { LandmarkPoint } from './photo-analysis-types.ts';
import {requireVisionContext} from './vision-context.ts';

export type VisionPrediction = { hairConfidence: Float32Array | null; maskWidth: number | null; maskHeight: number | null; faces: LandmarkPoint[][]; errors: string[] };
export interface PhotoVisionProvider { execution: 'WORKER_CPU' | 'MAIN_THREAD_CPU'; predict(pixels: Uint8ClampedArray, width: number, height: number, detectFace: boolean): Promise<VisionPrediction>; close(): void }
/** One bounded worker per analysis run; terminating it cancels model loading/inference and releases WASM memory. */
export function workerVisionProvider(): PhotoVisionProvider {
  const worker = new Worker('/analysis/worker.js'), pending = new Map<string, { resolve: (r: VisionPrediction) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const fail = (message: string) => { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error(message)); } pending.clear(); };
  worker.onmessage = ({ data }) => { const p = pending.get(data.id); if (!p) return; clearTimeout(p.timer); pending.delete(data.id); if (data.error) p.reject(new Error(data.error)); else p.resolve(data as VisionPrediction); };
  worker.onerror = () => fail('解析モデルを開始できませんでした。Safariを更新し、もう一度お試しください。');
  return { execution: 'WORKER_CPU', predict(pixels,width,height,detectFace) { return new Promise((resolve,reject) => {
    const id=crypto.randomUUID(),timer=setTimeout(()=>{pending.delete(id);reject(new Error('解析が時間内に完了しませんでした。写真のサイズや端末を確認してください。'));worker.terminate();fail('解析を終了しました。');},90000);
    pending.set(id,{resolve,reject,timer});const copy=pixels.slice();worker.postMessage({type:'ANALYZE',id,width,height,pixels:copy.buffer,detectFace},[copy.buffer]);
  }); }, close() { worker.terminate(); fail('解析を中止しました。'); } };
}
/** Fallback for browsers without worker OffscreenCanvas. Explicitly recorded, not silently disguised. */
export async function mainThreadVisionProvider(): Promise<PhotoVisionProvider> {
  const probe=document.createElement('canvas');
  const context=requireVisionContext(probe) as WebGL2RenderingContext;
  context.getExtension('WEBGL_lose_context')?.loseContext();
  // Use the same pinned, telemetry-disabled SDK as the worker. Types come from
  // the installed package; inference code and models are served on our origin.
  const modulePath = '/analysis/vision_bundle.mjs';
  const { FilesetResolver, ImageSegmenter, FaceLandmarker } = await import(/* webpackIgnore: true */ modulePath) as typeof import('@mediapipe/tasks-vision');
  const files=await FilesetResolver.forVisionTasks('/analysis/wasm');
  let hair: Awaited<ReturnType<typeof ImageSegmenter.createFromOptions>> | null=null,face:Awaited<ReturnType<typeof FaceLandmarker.createFromOptions>>|null=null; const errors:string[]=[];
  try{hair=await ImageSegmenter.createFromOptions(files,{canvas:document.createElement('canvas'),baseOptions:{modelAssetPath:'/analysis/models/hair_segmenter.tflite',delegate:'CPU'},runningMode:'IMAGE',outputConfidenceMasks:true,outputCategoryMask:false});}catch(e){errors.push(`HAIR_PROVIDER: ${e instanceof Error?e.message:'failed'}`);}
  try{face=await FaceLandmarker.createFromOptions(files,{canvas:document.createElement('canvas'),baseOptions:{modelAssetPath:'/analysis/models/face_landmarker.task',delegate:'CPU'},runningMode:'IMAGE',numFaces:2,outputFaceBlendshapes:false,outputFacialTransformationMatrixes:false});}catch(e){errors.push(`FACE_PROVIDER: ${e instanceof Error?e.message:'failed'}`);}
  return {execution:'MAIN_THREAD_CPU',async predict(pixels,width,height,detectFace){
    // Analysis must finish even when this tab is hidden; rAF can remain suspended.
    await new Promise<void>(resolve=>setTimeout(resolve,0));
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pixels),width,height),0,0);
    const prediction:VisionPrediction={hairConfidence:null,maskWidth:null,maskHeight:null,faces:[],errors:[...errors]};
    if(hair)try{const r=hair.segment(canvas),index=hair.getLabels().findIndex(s=>s.toLowerCase()==='hair'),mask=r.confidenceMasks?.[index];if(!mask)throw new Error('Hair confidence mask is absent');prediction.hairConfidence=new Float32Array(mask.getAsFloat32Array());prediction.maskWidth=mask.width;prediction.maskHeight=mask.height;r.close();}catch(e){prediction.errors.push(`HAIR_INFERENCE: ${e instanceof Error?e.message:'failed'}`);}
    if(face&&detectFace)try{prediction.faces=face.detect(canvas).faceLandmarks.map(points=>points.map(p=>({x:p.x,y:p.y,z:Number.isFinite(p.z)?p.z:null})));}catch(e){prediction.errors.push(`FACE_INFERENCE: ${e instanceof Error?e.message:'failed'}`);}
    canvas.width=canvas.height=1;return prediction;
  },close(){hair?.close();face?.close();}};
}
export async function createVisionProvider(): Promise<PhotoVisionProvider> {
  if(typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined')return mainThreadVisionProvider();
  return boundedVisionFallback(workerVisionProvider(),mainThreadVisionProvider);
}
/** Try the main-thread fallback at most once per analysis run, including across photos. */
export function boundedVisionFallback(initial:PhotoVisionProvider,fallback:()=>Promise<PhotoVisionProvider>):PhotoVisionProvider{
  let current=initial,closed=false,attempted=false,initializationError:Error|null=null;
  return {get execution(){return current.execution;},async predict(pixels,width,height,detectFace){
    if(closed)throw new Error('解析を中止しました。');
    if(initializationError)throw initializationError;
    try{const result=await current.predict(pixels,width,height,detectFace);if(attempted||result.hairConfidence!==null||result.faces.length||!result.errors.length)return result;}catch(e){if(closed||attempted)throw e;}
    if(closed)throw new Error('解析を中止しました。');attempted=true;current.close();
    try{current=await fallback();}catch(e){initializationError=e instanceof Error?e:new Error('解析モデルを開始できませんでした。');throw initializationError;}
    if(closed){current.close();throw new Error('解析を中止しました。');}
    return current.predict(pixels,width,height,detectFace);
  },close(){closed=true;current.close();}};
}
