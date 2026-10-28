'use client';
import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {supportSheetLayout,supportPngName,renderSupportPng,deliverSupportPng,supportUsesImageFallback} from '@/lib/after-support-sheet';

type Prepared={file:File;url:string;revision:string};
export default function AfterSupportSheet({children,revision,ready,busy}:{children:ReactNode;revision:string;ready:boolean;busy:boolean}){
 const viewport=useRef<HTMLDivElement>(null),stage=useRef<HTMLDivElement>(null),preparedRef=useRef<Prepared|null>(null),current=useRef({revision,ready,busy});current.current={revision,ready,busy};
 const [space,setSpace]=useState({width:0,height:0}),[zoom,setZoom]=useState(1),[exporting,setExporting]=useState(false),[delivering,setDelivering]=useState(false),[prepared,setPrepared]=useState<Prepared|null>(null),[notice,setNotice]=useState('');
 const layout=space.width>0&&space.height>0?supportSheetLayout(space.width,space.height,zoom):{fit:0,scale:0,width:0,height:0};
 useLayoutEffect(()=>{
  const node=viewport.current;if(!node)return;
  const measure=()=>{const {width,height}=node.getBoundingClientRect();if(width>0&&height>0)setSpace(previous=>previous.width===width&&previous.height===height?previous:{width,height});};
  measure();const observer=new ResizeObserver(measure);observer.observe(node);window.addEventListener('resize',measure);window.visualViewport?.addEventListener('resize',measure);
  return()=>{observer.disconnect();window.removeEventListener('resize',measure);window.visualViewport?.removeEventListener('resize',measure);};
 },[]);
 useEffect(()=>{
  const existing=preparedRef.current;
  if(existing&&(existing.revision!==revision||busy)){URL.revokeObjectURL(existing.url);preparedRef.current=null;setPrepared(null);setNotice('');}
 },[revision,busy]);
 useEffect(()=>()=>{if(preparedRef.current)URL.revokeObjectURL(preparedRef.current.url);},[]);
 async function prepare(){
  const sheet=stage.current?.querySelector<HTMLElement>('.as-page');if(!sheet||!ready||busy||exporting)return;
  const snapshot=revision;setExporting(true);setNotice('シート全体の画像を準備しています。');
  try{
   const blob=await renderSupportPng(sheet,phase=>setNotice({RESOURCES:'写真・フォントを読み込んでいます。',LAYOUT:'①〜⑩の配置・文字・写真を確認しています。',RASTER:'1024×1536シート全体を画像化しています。',PNG:'2048×3072 PNGの生成完了を検証しています。'}[phase]));
   if(current.current.revision!==snapshot||current.current.busy||!stage.current){setNotice('表示内容が変わりました。もう一度「画像を保存」を押してください。');return;}
   const next={file:new File([blob],supportPngName(),{type:'image/png'}),url:URL.createObjectURL(blob),revision:snapshot};
   if(preparedRef.current)URL.revokeObjectURL(preparedRef.current.url);preparedRef.current=next;setPrepared(next);
   setNotice('2048×3072 PNGの準備ができました。「② PNGを保存」を押してください。');
  }catch(error){setNotice(error instanceof Error?error.message:'画像を保存できませんでした。');}
  finally{setExporting(false);}
 }
 function save(){
  if(!prepared||prepared.revision!==revision){void prepare();return;}
  setDelivering(true);
  const imageFallback=supportUsesImageFallback(navigator);
  void deliverSupportPng(prepared.file,navigator,()=>{
   const link=document.createElement('a');link.href=prepared.url;
   if(imageFallback){link.target='_blank';link.rel='noopener';}else link.download=prepared.file.name;
   document.body.appendChild(link);link.click();link.remove();
  }).then(result=>setNotice(result==='SHARED'?'PNGを共有メニューへ渡しました。「画像を保存」を選んでください。写真アプリへの保存は未確認です。':result==='CANCELLED'?'共有をキャンセルしました。PNGは引き続き保存できます。':imageFallback?'PNGを新しい画面で開く操作を行いました。画像を長押しして保存してください。開かない場合は「画像を開く」を押してください。':'PNGのダウンロードを開始しました。')).catch(error=>setNotice('保存先の表示：'+(error instanceof Error?error.name+'：'+error.message:'共有に失敗しました。')+'「画像を開く」から長押し保存できます。')).finally(()=>setDelivering(false));
 }
 function setMagnification(value:number){setZoom(value);if(viewport.current){viewport.current.scrollLeft=0;viewport.current.scrollTop=0;}}
 return <div className="as-outer" data-zoomed={zoom>1} onClickCapture={event=>{if(event.target instanceof Element&&event.target.closest('.as-header button[aria-current="page"]'))viewport.current?.scrollTo({top:0,left:0,behavior:'smooth'});}}>
  <div className="as-toolbar" data-html2canvas-ignore aria-label="シートの表示と画像保存">
   <div className="as-toolbar-actions">
    <button type="button" onClick={()=>setMagnification(1)} aria-pressed={zoom===1}>全体表示</button>
    <button type="button" onClick={()=>setMagnification(Math.max(1,zoom/1.5))} disabled={zoom<=1||!layout.fit} aria-label="シートを縮小">−</button>
    <span className="as-zoom-label">{Math.round(layout.scale*100)}%</span>
    <button type="button" onClick={()=>setMagnification(Math.min(zoom*1.5,Math.max(1,2/layout.fit)))} disabled={!layout.fit||layout.scale>=2} aria-label="シートを拡大">＋</button>
    <button type="button" className="as-save-image" onClick={save} disabled={!ready||busy||exporting||delivering}>{exporting?'PNGを準備中…':delivering?'保存先を開いています…':prepared?'② PNGを保存':'① PNGを作成'}</button>
   </div>
   {notice&&<p className="as-save-notice" role="status">{notice}</p>}
   {prepared&&prepared.revision===revision&&<div className="as-save-links"><a href={prepared.url} target="_blank" rel="noopener">画像を開く</a><a href={prepared.url} download={prepared.file.name}>PNGをダウンロード</a><small>iPhoneでは共有メニューの「画像を保存」、または開いた画像を長押しして保存できます。</small></div>}
  </div>
  <div className="as-sheet-viewport" ref={viewport} tabIndex={zoom>1?0:undefined} aria-label={zoom>1?'拡大したシート。スクロールして移動できます。':'アフターサポートの1枚シート全体'}>
   <div className="as-sheet-positioner" style={{width:Math.max(space.width,layout.width),height:Math.max(space.height,layout.height)}}>
    <div ref={stage} className="as-sheet-stage" data-exporting={exporting} aria-busy={exporting} style={{width:layout.width,height:layout.height,'--as-sheet-scale':layout.scale,visibility:layout.fit?'visible':'hidden'} as CSSProperties}>{children}</div>
   </div>
  </div>
 </div>;
}
