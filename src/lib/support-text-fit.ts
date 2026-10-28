/** Preserve card/photo geometry and full copy; condense only overflowing next-colour copy. */
export function fitSupportNextCopy(sheet:HTMLElement){
 for(const text of sheet.querySelectorAll<HTMLElement>('.as-next .as-description')){
  const card=text.closest<HTMLElement>('.as-next'),article=text.closest('article');if(!card||!article)continue;
  text.style.removeProperty('font-size');text.style.removeProperty('line-height');
  // offset coordinates are canonical sheet pixels, independent of the display transform/DPR.
  const top=(node:HTMLElement)=>{let y=0;for(let n:HTMLElement|null=node;n;n=n.offsetParent as HTMLElement|null)y+=n.offsetTop;return y;};
  const available=top(card)+card.clientHeight-top(text)-10;
  if(text.scrollHeight<=available+.5)continue;
  const metrics=[{size:12,line:1.2},{size:12,line:1.05},...Array.from({length:8},(_,i)=>({size:11.75-i*.25,line:1.05})),{size:10,line:1}];
  for(const metric of metrics){text.style.fontSize=metric.size+'px';text.style.lineHeight=String(metric.line);if(text.scrollHeight<=available+.5)break;}
  // No clipping/truncation: the existing export audit rejects text still too long at the floor.
 }
}
