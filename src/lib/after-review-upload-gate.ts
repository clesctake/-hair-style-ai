import type {ReviewDirection} from './after-review-analysis.ts';

export type ReviewUploadSlot=`AFTER:${ReviewDirection}`|`TARGET:${ReviewDirection}`;
/** Decode independently by photo slot. New reads replace only the same slot;
 * clear/unmount invalidates every pending callback without persisting photos. */
export function reviewPhotoUploadGate(onPendingChange:(count:number)=>void=()=>{}){
 const latest=new Map<ReviewUploadSlot,object>(),pending=new Set<object>();
 const notify=()=>onPendingChange(pending.size);
 return {
  get pendingCount(){return pending.size;},
  clear(){latest.clear();pending.clear();notify();},
  async read<T>(slot:ReviewUploadSlot,reader:()=>Promise<T>,publish:(value:T)=>void,onFailure:(error:unknown)=>void){
   if(!/^(AFTER|TARGET):(FRONT|SIDE|BACK)$/.test(slot))throw Error('撮影方向を確認してください。');
   const previous=latest.get(slot);if(previous)pending.delete(previous);
   const token={};latest.set(slot,token);pending.add(token);notify();
   try{const value=await reader();if(latest.get(slot)===token)publish(value);}
   catch(error){if(latest.get(slot)===token)onFailure(error);}
   finally{pending.delete(token);notify();}
  },
 };
}
