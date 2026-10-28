import type {Photo} from './journey.ts';
export const batchDirections=['front','right','left','back'] as const;
export type PhotoDirection=typeof batchDirections[number];
export type DirectionGuess={id:string;direction:PhotoDirection|'unknown';confidence:number;reason:string};
export type BatchPhoto={photo:Photo;hash:string;guess:DirectionGuess;direction:PhotoDirection|'';duplicate:boolean};
/** Stable hash ordering, duplicate exclusion, and no silent slot collisions. */
export function arrangePhotoBatch(items:{photo:Photo;hash:string}[],guesses:DirectionGuess[]):BatchPhoto[]{
 const sorted=items.toSorted((a,b)=>a.hash.localeCompare(b.hash)||a.photo.id.localeCompare(b.photo.id)),seen=new Set<string>(),slots=new Set<string>();
 return sorted.map(item=>{const duplicate=seen.has(item.hash);seen.add(item.hash);const guess=guesses.find(x=>x.id===item.photo.id)??{id:item.photo.id,direction:'unknown',confidence:0,reason:'方向判定未取得'};
  const confident=guess.confidence>=.85&&batchDirections.includes(guess.direction as PhotoDirection)&&!duplicate&&!slots.has(guess.direction);const direction=confident?guess.direction as PhotoDirection:'';if(direction)slots.add(direction);return {...item,guess,direction,duplicate};});
}
export function commitPhotoBatch(items:BatchPhoto[]):Photo[]{
 const active=items.filter(x=>!x.duplicate);if(!active.length||active.length>4||active.some(x=>!x.direction)||new Set(active.map(x=>x.direction)).size!==active.length)throw new Error('確認が必要な写真の方向を指定し、重複する方向を入れ替えるか写真を外してください。');
 return active.map(x=>({...x.photo,view:x.direction as PhotoDirection,capture:x.photo.capture?{...x.photo.capture,direction:x.direction as PhotoDirection,accepted:{at:new Date().toISOString(),by:'stylist',qualityOverride:x.photo.capture.quality.grade!=='GOOD'}}:undefined}));
}
/** Manual direction correction swaps occupied slots; it never drops a registered original. */
export function reassignCurrentDirection(photos:Photo[],id:string,to:PhotoDirection):Photo[]{
 const source=photos.find(p=>p.id===id);if(!source||!batchDirections.includes(to))throw Error('写真と撮影方向を確認してください。');
 const occupant=photos.find(p=>p.view===to&&p.id!==id);
 const updated=(p:Photo,d:Photo['view'])=>({...p,view:d,capture:p.capture?{...p.capture,direction:d as PhotoDirection}:undefined});
 return [updated(source,to),...(occupant?[updated(occupant,source.view)]:[])];
}
