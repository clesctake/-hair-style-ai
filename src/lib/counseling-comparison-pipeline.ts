import {SimulationTransportError} from './hair-simulation-client.ts';
import type {Journey} from './journey.ts';
import {queueSimulationBatch,beginSimulationJob,completeSimulationJob,failSimulationJob} from './hair-simulation-session.ts';
import {activeSimulationBatch,latestSimulationEvent,simulationJobStatus,effectiveJobParameters,simulationCommonSignature} from './hair-simulation-context.ts';
import {requestBangComparison} from './image-comparison-client.ts';
import {comparisonRegions} from './image-comparison.ts';
export async function runCounselingComparison(initial:Journey,options:{persist:(j:Journey)=>Promise<Journey>;onProgress?:(s:string)=>void;signal?:AbortSignal;request?:typeof requestBangComparison}){
 let current=initial;const save=async(j:Journey)=>{current=await options.persist(j);};
 let batch=activeSimulationBatch(current.diagnosisSession!);if(!batch||batch.commonSignature!==simulationCommonSignature(current.diagnosisSession!))await save(queueSimulationBatch(current));
 batch=activeSimulationBatch(current.diagnosisSession!)!;const jobs=current.diagnosisSession!.hairSimulation!.jobs.filter(j=>j.batchId===batch.id),main=jobs.find(j=>j.label==='MAIN')!;
 if(jobs.filter(x=>x.label!=='MAIN').every(x=>simulationJobStatus(current.diagnosisSession!,x)==='COMPLETE'))return current;
 await save(beginSimulationJob(current,main.id));const event=latestSimulationEvent(current.diagnosisSession!,main.id)!;
 options.onProgress?.('A〜Eを1回のリクエストで生成中です。画像の品質確認後に採用してください。');
 let output:Awaited<ReturnType<typeof requestBangComparison>>;
 try{output=await (options.request??requestBangComparison)(event.request,event.inputSnapshot,jobs.filter(j=>j.label!=='MAIN').map(j=>({label:j.label,designId:j.designId,parameters:effectiveJobParameters(current.diagnosisSession!,j)})),options.signal);}catch(e){const x=e instanceof SimulationTransportError?e:null;await save(failSimulationJob(current,main.id,e instanceof Error?e.message:'比較生成失敗',x?.code??'comparison_failed',x?.outcomeUnknown??false,x?.providerAttempted??true));return current;}
 await save(applyCounselingComparison(current,output));
 return current;
}
export function applyCounselingComparison(initial:Journey,output:Awaited<ReturnType<typeof requestBangComparison>>){
 let current=initial;const batch=activeSimulationBatch(current.diagnosisSession!)!;const jobs=current.diagnosisSession!.hairSimulation!.jobs.filter(j=>j.batchId===batch.id),main=jobs.find(j=>j.label==='MAIN')!;
 const regions=comparisonRegions(5,2304,2048);
 if(output.images.length!==5||output.images.some((x,i)=>x.crop.sharedRequestId!==output.result.requestId||x.crop.sourceSha256!==output.result.generation.sha256||x.crop.label!==String.fromCharCode(65+i)||x.crop.sourceWidth!==2304||x.crop.sourceHeight!==2048||x.width!==regions[i].width||x.height!==regions[i].height||Object.entries(regions[i]).some(([k,v])=>x.crop[k as 'x'|'y'|'width'|'height']!==v)))throw new Error('比較画像と5案の切り出し条件が一致しません。');
 const first=output.images[0];current=completeSimulationJob(current,main.id,{...output.result,image:first.dataUrl,width:first.width,height:first.height,generation:{...output.result.generation,sha256:first.sha256,comparisonCrop:first.crop,requiresStylistReview:true,portraitVerification:first.portraitVerification}});
 for(const job of jobs.filter(j=>j.label!=='MAIN')){current=beginSimulationJob(current,job.id);const e=latestSimulationEvent(current.diagnosisSession!,job.id)!,image=output.images[job.label.charCodeAt(0)-65];current=completeSimulationJob(current,job.id,{...output.result,requestId:e.requestId,jobId:job.id,designId:job.designId,parentMode:e.request.parentMode,parentGenerationId:e.request.parentGenerationId,image:image.dataUrl,width:image.width,height:image.height,generation:{...output.result.generation,sha256:image.sha256,usage:null,comparisonCrop:image.crop,requiresStylistReview:true,portraitVerification:image.portraitVerification}});}
 return current;
}
