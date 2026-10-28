import type {Journey} from './journey.ts';
import type {SimulationTransport} from './hair-simulation-types.ts';
import {simulationClient,SimulationTransportError} from './hair-simulation-client.ts';
import {queueSimulationBatch,beginSimulationJob,completeSimulationJob,failSimulationJob} from './hair-simulation-session.ts';
import {activeSimulationBatch,latestSimulationEvent,simulationJobStatus} from './hair-simulation-context.ts';
export type SimulationPipelineOptions={transport?:SimulationTransport;persist:(j:Journey)=>Promise<Journey>;onChange?:(j:Journey)=>void;onProgress?:(text:string)=>void;signal?:AbortSignal};
/** Browser-owned sequential jobs; no background retries or hidden billable requests. */
export async function runSimulationJobs(initial:Journey,options:SimulationPipelineOptions,onlyJobId?:string):Promise<Journey>{
 let current=initial;
 const save=async(next:Journey)=>{current=await options.persist(next);options.onChange?.(current);};
 if(!onlyJobId)await save(queueSimulationBatch(current));
 const batch=activeSimulationBatch(current.diagnosisSession!);if(!batch)throw new Error('生成ジョブを作成してください。');
 const jobs=current.diagnosisSession!.hairSimulation!.jobs.filter(j=>j.batchId===batch.id&&(!onlyJobId||j.id===onlyJobId));
 const transport=options.transport??simulationClient();
 for(const job of jobs){
  if(options.signal?.aborted)break;
  try{await save(beginSimulationJob(current,job.id));}catch(e){if(job.variantType==='MAIN'||onlyJobId)throw e;continue;}
  const state=current.diagnosisSession!,e=latestSimulationEvent(state,job.id)!,parent=e.request.parentAsset?state.hairSimulation!.generatedAssets.find(a=>a.id===e.request.parentAsset!.imageId)!:null;
  options.onProgress?.(`${job.label==='MAIN'?'MAIN DESIGN':`DESIGN ${job.label}`}生成中`);
  let output:Awaited<ReturnType<SimulationTransport>>;
  try{output=await transport(e.request,e.inputSnapshot,parent,options.signal);}catch(error){
   const x=error instanceof SimulationTransportError?error:new SimulationTransportError(error instanceof Error?error.message:'生成できませんでした。');
   await save(failSimulationJob(current,job.id,x.message,x.code,x.outcomeUnknown,x.providerAttempted));if(job.variantType==='MAIN')break;continue;
  }
  // A save failure must stop the pipeline. Never send a child without a persisted parent.
  await save(completeSimulationJob(current,job.id,output));
 }
 options.onProgress?.('生成結果を確認してください。');return current;
}
export async function resumeSimulationBatch(initial:Journey,options:SimulationPipelineOptions):Promise<Journey>{
 let current=initial;const batch=activeSimulationBatch(current.diagnosisSession!);if(!batch)throw new Error('生成ジョブがありません。');
 for(const job of current.diagnosisSession!.hairSimulation!.jobs.filter(j=>j.batchId===batch.id))if(['FAILED','NOT_STARTED'].includes(simulationJobStatus(current.diagnosisSession!,job)))current=await runSimulationJobs(current,options,job.id);
 return current;
}
