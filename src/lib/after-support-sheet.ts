/** Page 3's approved sheet. Device size changes its display scale, never its layout. */
export const SUPPORT_SHEET = Object.freeze({width:1024,height:1536,pngWidth:2048,pngHeight:3072});
export const SUPPORT_CARD_BOUNDS = Object.freeze({
 finish:[21,128,497,310],next:[526,128,477,310],fade:[21,448,982,232],
 bangs:[21,691,982,200],face:[21,899,598,272],makeup:[625,899,378,272],
 products:[21,1179,600,187],care:[629,1179,374,187],visit:[21,1376,505,150],message:[533,1376,470,150],
} as const);

export function supportSheetLayout(width:number,height:number,zoom=1){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||!Number.isFinite(zoom)||zoom<1)throw new Error('表示領域を確認できません。');
 const fit=Math.min(1,width/SUPPORT_SHEET.width,height/SUPPORT_SHEET.height),scale=fit*zoom;
 return {fit,scale,width:SUPPORT_SHEET.width*scale,height:SUPPORT_SHEET.height*scale};
}

export function supportPngName(now=new Date()){
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now).replaceAll('-','');
 return 'COLOR_FUTURE_AI_AFTER_SUPPORT_'+date+'.png';
}

export async function validateSupportPng(blob:Blob){
 const bytes=new Uint8Array(await blob.arrayBuffer()),magic=[137,80,78,71,13,10,26,10];
 if(blob.type!=='image/png'||bytes.length<24||magic.some((v,i)=>bytes[i]!==v)||String.fromCharCode(...bytes.slice(12,16))!=='IHDR')throw new Error('PNG画像を作成できませんでした。');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(view.getUint32(16)!==SUPPORT_SHEET.pngWidth||view.getUint32(20)!==SUPPORT_SHEET.pngHeight)throw new Error('保存画像のサイズを確認できませんでした。');
 let offset=8,hasData=false,ended=false;
 while(offset+12<=bytes.length){
  const length=view.getUint32(offset),end=offset+12+length;
  if(end>bytes.length)throw new Error('PNG画像が途中で切れています。');
  const kind=String.fromCharCode(...bytes.slice(offset+4,offset+8));
  let crc=0xffffffff;
  for(let i=offset+4;i<end-4;i++){crc^=bytes[i];for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  if(((crc^0xffffffff)>>>0)!==view.getUint32(end-4))throw new Error('PNG画像のデータ検証に失敗しました。');
  if(offset===8&&(kind!=='IHDR'||length!==13))throw new Error('PNG画像のヘッダーを確認できませんでした。');
  if(kind==='IDAT')hasData=true;
  offset=end;
  if(kind==='IEND'){ended=length===0&&offset===bytes.length;break;}
 }
 if(!hasData||!ended)throw new Error('PNG画像の生成が完了していません。');
}

export async function encodeSupportCanvas(canvas:Pick<HTMLCanvasElement,'width'|'height'|'toBlob'>){
 if(canvas.width!==SUPPORT_SHEET.pngWidth||canvas.height!==SUPPORT_SHEET.pngHeight)throw new Error('保存画像のサイズを確認できませんでした。');
 const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('PNG画像を作成できませんでした。')),'image/png'));
 await validateSupportPng(blob);return blob;
}

/** Reject clipped content rather than silently omitting confirmed text or the last cards. */
export function assertSupportSheetFits(sheet:HTMLElement){
 const page=sheet.getBoundingClientRect(),cards=Array.from(sheet.querySelectorAll<HTMLElement>('[data-section]'));
 if(Math.abs(page.width-SUPPORT_SHEET.width)>1||Math.abs(page.height-SUPPORT_SHEET.height)>1)throw new Error('シートのサイズを確認できませんでした。');
 const names=Object.keys(SUPPORT_CARD_BOUNDS);
 if(cards.length!==names.length||cards.some((card,i)=>card.dataset.section!==names[i]))throw new Error('①〜⑩のシート全体を確認できませんでした。');
 for(const card of cards){
  const name=card.dataset.section as keyof typeof SUPPORT_CARD_BOUNDS,bounds=SUPPORT_CARD_BOUNDS[name],rect=card.getBoundingClientRect();
  const actual=[rect.left-page.left,rect.top-page.top,rect.width,rect.height];
  if(actual.some((n,i)=>Math.abs(n-bounds[i])>1.5))throw new Error('承認済みのカード配置を確認できませんでした。');
  const overflow=()=>new Error('文章が枠に収まりません（'+(names.indexOf(name)+1)+'：'+supportSectionNames[name]+'）。確定文章は保持しています。');
  if(card.scrollHeight>card.clientHeight+2||card.scrollWidth>card.clientWidth+2)throw overflow();
  // Scroll extents alone miss text clipped by an inner overflow:hidden element.
  const doc=card.ownerDocument;
  if(doc?.createTreeWalker){
   const walker=doc.createTreeWalker(card,4),range=doc.createRange();let text:Node|null;
   while((text=walker.nextNode())){
    if(!text.textContent?.trim()||!(text.parentElement instanceof doc.defaultView!.HTMLElement))continue;
    range.selectNodeContents(text);
    for(const line of Array.from(range.getClientRects())){
     if(line.width===0||line.height===0)continue;
     if(line.left<rect.left-2||line.right>rect.right+2||line.top<rect.top-2||line.bottom>rect.bottom+2)throw overflow();
     for(let parent:HTMLElement|null=text.parentElement;parent&&parent!==card;parent=parent.parentElement){
      const style=doc.defaultView!.getComputedStyle(parent),box=parent.getBoundingClientRect();
      if((style.overflowY==='hidden'||style.overflowY==='clip')&&(line.top<box.top-2||line.bottom>box.bottom+2)||
         (style.overflowX==='hidden'||style.overflowX==='clip')&&(line.left<box.left-2||line.right>box.right+2))throw overflow();
     }
    }
   }
  }
 }
}

const supportSectionNames={finish:'仕上がり',next:'次回カラー',fade:'退色予測',bangs:'前髪5案',face:'骨格分析',makeup:'メイク',products:'商品',care:'ホームケア',visit:'次回来店',message:'美容師メッセージ'};

/** Verify image element sizing; contain preserves all source pixels without stretching. */
export function supportPhotoPlacement(sourceWidth:number,sourceHeight:number,width:number,height:number){
 if([sourceWidth,sourceHeight,width,height].some(v=>!Number.isFinite(v)||v<=0))throw new Error('写真の寸法を確認できませんでした。');
 const scale=Math.min(width/sourceWidth,height/sourceHeight);
 return {width:sourceWidth*scale,height:sourceHeight*scale,left:(width-sourceWidth*scale)/2,top:(height-sourceHeight*scale)/2};
}

export function assertSupportPhotosFit(sheet:HTMLElement){
 for(const image of Array.from(sheet.querySelectorAll<HTMLImageElement>('img'))){
  if(!image.naturalWidth||!image.naturalHeight)throw new Error('写真を読み込めませんでした：'+image.alt);
  if(!image.matches('.as-photo img,.as-face-image>img,.as-stylist-avatar>img,.as-product-image>img'))continue;
  const rect=image.getBoundingClientRect(),parent=image.parentElement!.getBoundingClientRect(),style=sheet.ownerDocument.defaultView!.getComputedStyle(image);
  supportPhotoPlacement(image.naturalWidth,image.naturalHeight,rect.width,rect.height);
  if(style.objectFit!=='contain'||rect.left<parent.left-1||rect.top<parent.top-1||rect.right>parent.right+1||rect.bottom>parent.bottom+1)throw new Error('写真が枠内に収まりません：'+image.alt);
 }
}

export function withSheetTimeout<T>(task:Promise<T>,message:string,timeout=15000):Promise<T>{
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error(message)),timeout);
  task.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
 });
}

export async function waitForSupportImage(image:HTMLImageElement){
 if(!image.complete){
  await new Promise<void>((resolve,reject)=>{
   const done=()=>{cleanup();image.naturalWidth>0?resolve():reject(new Error('写真を読み込めませんでした。'));};
   const failed=()=>{cleanup();reject(new Error('写真を読み込めませんでした。'));};
   const timer=setTimeout(()=>{cleanup();reject(new Error('写真の読み込みが完了しませんでした。'));},15000);
   const cleanup=()=>{clearTimeout(timer);image.removeEventListener('load',done);image.removeEventListener('error',failed);};
   image.addEventListener('load',done,{once:true});image.addEventListener('error',failed,{once:true});
   if(image.complete)done();
  });
 }
 if(!image.naturalWidth||!image.naturalHeight)throw new Error('写真を読み込めませんでした。');
 if(image.decode)await withSheetTimeout(image.decode(),'写真の読み込みが完了しませんでした。');
}

export async function waitForSupportFonts(sheet:HTMLElement){
 const doc=sheet.ownerDocument,link=Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).find(item=>item.href.includes('/counseling-master/fonts/font.css'));
 if(!link)throw new Error('シートのフォント設定を確認できませんでした。');
 if(!link.sheet)await new Promise<void>((resolve,reject)=>{
  const done=()=>{cleanup();resolve();},failed=()=>{cleanup();reject(new Error('フォントを読み込めませんでした。'));};
  const timer=setTimeout(()=>{cleanup();reject(new Error('フォントの読み込みが完了しませんでした。'));},15000);
  const cleanup=()=>{clearTimeout(timer);link.removeEventListener('load',done);link.removeEventListener('error',failed);};
  link.addEventListener('load',done,{once:true});link.addEventListener('error',failed,{once:true});if(link.sheet)done();
 });
 const text=sheet.textContent||'アフターサポート';
 await withSheetTimeout(Promise.all([
  doc.fonts.load('400 12px "Noto Sans JP"',text),doc.fonts.load('600 18px "Noto Sans JP"',text),doc.fonts.load('400 18px "Noto Serif JP"',text),
 ]),'フォントの読み込みが完了しませんでした。');
 await withSheetTimeout(doc.fonts.ready,'フォントの読み込みが完了しませんでした。');
}

/** All displayed photos are checked and embedded into the export clone, including CORS. */
async function supportImageCopies(sheet:HTMLElement){
 const images=Array.from(sheet.querySelectorAll('img')),copies=new Map<string,string>();
 await Promise.all(images.map(waitForSupportImage));
 for(const original of images){
  const src=original.currentSrc||original.src;if(copies.has(src))continue;
  const same=images.filter(img=>(img.currentSrc||img.src)===src);
  const needed=Math.max(1,...same.map(img=>Math.max(img.clientWidth,img.clientHeight)*2));
  const image=new Image();image.crossOrigin='anonymous';image.src=src;await waitForSupportImage(image);
  const scale=Math.min(1,needed/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  try{
   const ctx=canvas.getContext('2d');if(!ctx)throw new Error('写真を展開できませんでした。');
   ctx.drawImage(image,0,0,canvas.width,canvas.height);copies.set(src,canvas.toDataURL('image/png'));
  }catch{throw new Error('この写真は画像保存に利用できません。写真の読み込み設定をご確認ください。');}
  finally{canvas.width=canvas.height=1;image.src='';}
 }
 return {sources:images.map(img=>img.currentSrc||img.src),copies};
}

export type SupportPngPhase='RESOURCES'|'LAYOUT'|'RASTER'|'PNG';
export async function renderSupportPng(sheet:HTMLElement,progress?:(phase:SupportPngPhase)=>void):Promise<Blob>{
 let phase:SupportPngPhase='RESOURCES';
 try{
 progress?.(phase);await waitForSupportFonts(sheet);
 const {sources,copies}=await supportImageCopies(sheet),{default:html2canvas}=await import('html2canvas-pro');
 const failures:unknown[]=[];
 phase='RASTER';progress?.(phase);
 const canvas=await html2canvas(sheet,{
  width:SUPPORT_SHEET.width,height:SUPPORT_SHEET.height,scale:2,
  windowWidth:SUPPORT_SHEET.width,windowHeight:SUPPORT_SHEET.height,scrollX:0,scrollY:0,
  backgroundColor:'#ffffff',allowTaint:false,useCORS:true,logging:false,normalizeDom:false,
  imageTimeout:15000,foreignObjectRendering:false,onError:error=>failures.push(error),
  onclone:async(doc,clone)=>{
   phase='LAYOUT';progress?.(phase);
   // Only the cloned document is changed. The user's zoom, scroll and original images stay intact.
   doc.body.replaceChildren(clone);
   doc.body.style.cssText='margin:0;padding:0;width:1024px;height:1536px;overflow:visible;background:#fff';
   doc.documentElement.style.cssText='width:1024px;height:1536px;overflow:visible';
   clone.style.cssText='--a:1px;width:1024px;height:1536px;max-width:1024px;margin:0;position:relative;left:0;top:0;transform:none;overflow:hidden';
   const clonedImages=Array.from(clone.querySelectorAll('img'));
   if(clonedImages.length!==sources.length)throw new Error('写真の状態が変わりました。もう一度保存してください。');
   clonedImages.forEach((img,i)=>{img.removeAttribute('srcset');img.removeAttribute('sizes');img.src=copies.get(sources[i])!;});
   // Scroll positions from an enlarged screen must not omit the start of a card.
   clone.querySelectorAll<HTMLElement>('[data-section]').forEach(card=>{card.scrollTop=0;card.scrollLeft=0;});
   // Preserve the master's labels and registered product text without action elements.
   clone.querySelectorAll<HTMLButtonElement>('button').forEach(button=>{
    if(!button.textContent?.trim()){button.remove();return;}
    const text=doc.createElement('span');text.style.cssText=doc.defaultView!.getComputedStyle(button).cssText;
    const style=doc.defaultView!.getComputedStyle(button);
    for(const property of Array.from(style))text.style.setProperty(property,style.getPropertyValue(property));
    text.className=button.className;text.append(...Array.from(button.childNodes));button.replaceWith(text);
   });
   await waitForSupportFonts(clone);
   await Promise.all(clonedImages.map(waitForSupportImage));
   assertSupportSheetFits(clone);assertSupportPhotosFit(clone);
   phase='RASTER';progress?.(phase);
  },
 });
 try{
  if(failures.length)throw new Error('写真またはフォントを読み込めませんでした。もう一度保存してください。');
  phase='PNG';progress?.(phase);return await encodeSupportCanvas(canvas);
 }finally{canvas.width=canvas.height=1;}
 }catch(error){
  const label={RESOURCES:'写真・フォント読込',LAYOUT:'シート配置検査',RASTER:'シート画像化',PNG:'PNG生成検証'}[phase];
  throw new Error(label+'：'+(error instanceof Error?error.message:'処理に失敗しました。'));
 }
}

export function canShareSupportPng(file:File,nav:Pick<Navigator,'canShare'|'share'>){
 try{return typeof nav.share==='function'&&typeof nav.canShare==='function'&&nav.canShare({files:[file]});}catch{return false;}
}

export function supportUsesImageFallback(nav:Pick<Navigator,'userAgent'|'platform'|'maxTouchPoints'>){
 return /iPhone|iPad|iPod/.test(nav.userAgent)||(nav.platform==='MacIntel'&&nav.maxTouchPoints>1);
}

/** Call from a fresh tap with an already prepared File; no encoding precedes navigator.share. */
export async function deliverSupportPng(file:File,nav:Pick<Navigator,'canShare'|'share'>,download:()=>void):Promise<'SHARED'|'CANCELLED'|'DOWNLOADED'>{
 if(canShareSupportPng(file,nav)){
  try{await nav.share({files:[file],title:'COLOR FUTURE AI アフターサポート'});return 'SHARED';}
  catch(error){if(error instanceof Error&&error.name==='AbortError')return 'CANCELLED';throw error;}
 }
 download();return 'DOWNLOADED';
}
