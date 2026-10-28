export type SavePhase='IDLE'|'DIRTY'|'SAVING'|'SAVED'|'FAILED';
export type SaveState={phase:SavePhase;pending:number;error:string|null};
/** Tracks acknowledgements, not optimistic UI confirmation. Never stores photographs. */
export function createSaveLifecycle(){
 let revision=0,acknowledged=0,pending=0,error:string|null=null,attempted=false;
 const listeners=new Set<()=>void>();
 const state=():SaveState=>({phase:pending?'SAVING':error?'FAILED':revision!==acknowledged?'DIRTY':attempted?'SAVED':'IDLE',pending,error});
 const notify=()=>listeners.forEach(fn=>fn());
 return {state,subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};},edited(){revision++;notify();},
  shouldBlock(){return pending>0||revision!==acknowledged||error!==null;},
  async run<T>(operation:()=>Promise<T>):Promise<T>{const snapshot=revision;pending++;error=null;attempted=true;notify();try{const value=await operation();acknowledged=Math.max(acknowledged,snapshot);error=null;return value;}catch(e){error=e instanceof Error?e.message:'保存できませんでした。';throw e;}finally{pending--;notify();}}
 };
}
