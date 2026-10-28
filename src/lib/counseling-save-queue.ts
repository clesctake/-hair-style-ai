/** The lock covers BOTH clinical revision storage and the counseling draft write.
 * A resolved first-stage promise must never spin recursively while IndexedDB is pending.
 */
export function counselingSaveQueue(){
 let tail:Promise<void>=Promise.resolve();
 return {run<T>(operation:()=>Promise<T>):Promise<T>{const result=tail.then(operation);tail=result.then(()=>undefined,()=>undefined);return result;}};
}
