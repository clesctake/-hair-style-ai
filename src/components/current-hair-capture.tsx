'use client';
import {useEffect,useRef,useState} from 'react';
import type {Photo} from '@/lib/journey';
import {captureDirections,captureDirectionLabels,primaryQualityWarnings,analyzeCaptureFrame,type CaptureDirection,type CaptureQuality,type CaptureMetadata} from '@/lib/capture-quality';
import {readCurrentPhoto} from '@/lib/current-photo';
import sampleAssets from '@/data/journey_sample_assets.json';

type Mode='idle'|'choose'|'camera'|'review'|'summary';
const label=(d:CaptureDirection)=>captureDirectionLabels[d];
const stop=(stream:MediaStream|null)=>stream?.getTracks().forEach(track=>track.stop());
const cropFor=(w:number,h:number)=>{const aspect=3/4;let width=w,height=h;if(w/h>aspect)width=h*aspect;else height=w/aspect;return {x:(w-width)/2/w,y:(h-height)/2/h,width:width/w,height:height/h};};
function drawFrame(video:HTMLVideoElement,canvas:HTMLCanvasElement){const crop=cropFor(video.videoWidth,video.videoHeight),ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('撮影画面を解析できません。');ctx.drawImage(video,crop.x*video.videoWidth,crop.y*video.videoHeight,crop.width*video.videoWidth,crop.height*video.videoHeight,0,0,canvas.width,canvas.height);return {crop,data:ctx.getImageData(0,0,canvas.width,canvas.height).data};}
export default function CurrentHairCapture({photos,busy,onCommit,onRemove}:{photos:Photo[];busy:boolean;onCommit:(photos:Photo[])=>boolean|void;onRemove:(id:string)=>void}){
 const [summaryEditing,setSummaryEditing]=useState(false),[mode,setMode]=useState<Mode>('idle'),[direction,setDirection]=useState<CaptureDirection>('front'),[sequence,setSequence]=useState(false),[staged,setStaged]=useState<Photo[]>([]);
 const [candidate,setCandidate]=useState<Photo|null>(null),[stream,setStream]=useState<MediaStream|null>(null),[starting,setStarting]=useState(false),[working,setWorking]=useState(false),[cameraReady,setCameraReady]=useState(false),[error,setError]=useState('');
 const [quality,setQuality]=useState<CaptureQuality|null>(null),[aligned,setAligned]=useState(false),[facing,setFacing]=useState<'environment'|'user'>('environment'),[demo,setDemo]=useState(false);
 const video=useRef<HTMLVideoElement>(null),streamRef=useRef<MediaStream|null>(null),epoch=useRef(0),alive=useRef(true),gray=useRef<Float32Array|undefined>(undefined),alignedRef=useRef(false);
 alignedRef.current=aligned;
 const libraryInputs=useRef<Partial<Record<CaptureDirection,HTMLInputElement|null>>>({}),native=useRef<HTMLInputElement|null>(null);
 const close=()=>{epoch.current++;stop(streamRef.current);streamRef.current=null;setStream(null);setMode('idle');setCandidate(null);setStaged([]);setQuality(null);setStarting(false);setWorking(false);setSummaryEditing(false);setError('');setDemo(false);};
 useEffect(()=>{alive.current=true;const suspend=()=>{if(document.visibilityState==='hidden'){epoch.current++;stop(streamRef.current);streamRef.current=null;setStream(null);setCameraReady(false);setStarting(false);}};document.addEventListener('visibilitychange',suspend);return()=>{alive.current=false;epoch.current++;stop(streamRef.current);document.removeEventListener('visibilitychange',suspend);};},[]);
 async function openCamera(d:CaptureDirection=direction,all=sequence,newFacing=facing){
  const request=++epoch.current;stop(streamRef.current);streamRef.current=null;setStream(null);setDirection(d);setSequence(all);setMode('camera');setStarting(true);setCameraReady(false);setError('');setCandidate(null);setQuality(null);gray.current=undefined;setAligned(false);setDemo(false);
  try{
   if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw new Error('専用カメラにはHTTPSのWeb画面が必要です。Safariでアプリを開くか、下の端末カメラを使ってください。');
   const media=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:newFacing},width:{ideal:1080},height:{ideal:1440}}});
   if(!alive.current||request!==epoch.current){stop(media);return;}
   streamRef.current=media;setStream(media);
  }catch(e){if(alive.current&&request===epoch.current){const name=e instanceof Error?e.name:'';setError(name==='NotAllowedError'?'カメラの使用が許可されていません。このサイトのカメラ許可を確認するか、端末カメラから追加してください。':name==='NotFoundError'?'使用できるカメラが見つかりません。端末カメラまたは写真ライブラリを使ってください。':e instanceof Error?e.message:'カメラを起動できませんでした。');}}
  finally{if(alive.current&&request===epoch.current)setStarting(false);}
 }
 useEffect(()=>{
  if(mode!=='camera'||!stream||!video.current)return;
  let cancelled=false;const element=video.current;element.srcObject=stream;
  void element.play().then(()=>{if(!cancelled)setCameraReady(true);}).catch(()=>{if(!cancelled)setError('プレビューを再開してください。');});
  const ended=()=>{if(!cancelled){setCameraReady(false);setError('カメラの接続が終了しました。カメラを再開してください。');}};
  stream.getVideoTracks().forEach(t=>t.addEventListener('ended',ended));
  const analysis=document.createElement('canvas');analysis.width=160;analysis.height=213;
  const timer=setInterval(()=>{
   if(cancelled||element.readyState<2||!element.videoWidth||document.visibilityState==='hidden')return;
   try{const frame=drawFrame(element,analysis),result=analyzeCaptureFrame({data:frame.data,width:analysis.width,height:analysis.height},gray.current,alignedRef.current);gray.current=result.gray;setQuality(result.quality);}catch(e){if(!cancelled)setError(e instanceof Error?e.message:'品質チェックを開始できませんでした。');}
  },600);
  return()=>{cancelled=true;clearInterval(timer);stream.getVideoTracks().forEach(t=>t.removeEventListener('ended',ended));element.srcObject=null;};
 },[stream,mode]);
 async function prepare(file:File,source:CaptureMetadata['source'],options?:Parameters<typeof readCurrentPhoto>[2],photoDirection:CaptureDirection=direction){
  const request=++epoch.current;stop(streamRef.current);streamRef.current=null;setStream(null);setCameraReady(false);setStarting(false);setWorking(true);setError('');
  try{const photo=await readCurrentPhoto(file,photoDirection,{source,...options});if(!alive.current||request!==epoch.current)return;stop(streamRef.current);streamRef.current=null;setStream(null);setCandidate(photo);setQuality(photo.capture!.quality);setMode('review');}
  catch(e){if(alive.current&&request===epoch.current)setError(e instanceof Error?e.message:'写真を読み込めませんでした。');}
  finally{if(alive.current&&request===epoch.current)setWorking(false);}
 }
 async function take(){
  const request=epoch.current;const element=video.current;if(!element?.videoWidth||!cameraReady)return;
  const original=document.createElement('canvas');original.width=element.videoWidth;original.height=element.videoHeight;
  original.getContext('2d')!.drawImage(element,0,0);const crop=cropFor(element.videoWidth,element.videoHeight);
  const analysis=document.createElement('canvas');analysis.width=160;analysis.height=213;
  const frame=drawFrame(element,analysis),checked=analyzeCaptureFrame({data:frame.data,width:160,height:213},gray.current,alignedRef.current).quality;
  const settings=streamRef.current?.getVideoTracks()[0]?.getSettings();setWorking(true);
  const blob=await new Promise<Blob|null>(resolve=>original.toBlob(resolve,'image/jpeg',.96));
  if(!alive.current||request!==epoch.current)return;
  if(!blob){setWorking(false);setError('写真を撮影できませんでした。もう一度お試しください。');return;}
  await prepare(new File([blob],`before-${direction}-${Date.now()}.jpg`,{type:'image/jpeg'}),'web_camera',{quality:checked,aligned:alignedRef.current,crop,capturedAt:new Date().toISOString(),device:{facingMode:settings?.facingMode??null,width:settings?.width??element.videoWidth,height:settings?.height??element.videoHeight,frameRate:settings?.frameRate??null}});
 }
 async function useSample(){
  const request=++epoch.current;stop(streamRef.current);streamRef.current=null;setStream(null);setDemo(true);setMode('camera');setQuality(null);setAligned(false);setError('');setStarting(false);setWorking(true);
  try{const image=new Image();image.src=sampleAssets.current.dataUrl;await image.decode();if(!alive.current||request!==epoch.current)return;
   const c=document.createElement('canvas');c.width=160;c.height=213;c.getContext('2d')!.drawImage(image,0,0,160,213);setQuality(analyzeCaptureFrame({data:c.getContext('2d')!.getImageData(0,0,160,213).data,width:160,height:213}).quality);
  }catch(e){if(alive.current&&request===epoch.current)setError('サンプル写真を読み込めませんでした。');}finally{if(alive.current&&request===epoch.current)setWorking(false);}
 }
 async function takeSample(){const parts=sampleAssets.current.dataUrl.split(','),bytes=Uint8Array.from(atob(parts[1]),c=>c.charCodeAt(0));await prepare(new File([bytes],'fictional-camera-demo.jpg',{type:'image/jpeg'}),'demo_sample',{aligned:false});}
 async function adopt(){
  if(!candidate)return;const accepted={...candidate,capture:{...candidate.capture!,accepted:{at:new Date().toISOString(),by:'stylist' as const,qualityOverride:candidate.capture!.quality.grade!=='GOOD'}}};
  if(!sequence){if(onCommit([accepted])===false)return;close();return;}
  const next=[...staged.filter(p=>p.view!==direction),accepted];setStaged(next);setCandidate(null);
  if(summaryEditing){setSummaryEditing(false);setMode('summary');return;}
  const index=captureDirections.indexOf(direction);
  if(index===3){setMode('summary');return;}
  const nextDirection=captureDirections[index+1];setDirection(nextDirection);
  if(demo){setMode('camera');return;}await openCamera(nextDirection,true);
 }
 const choose=(d:CaptureDirection)=>{setDirection(d);setSequence(false);setSummaryEditing(false);setStaged([]);setMode('choose');setError('');};
 const libraryChanged=(file:File,d:CaptureDirection,source:'library'|'native_camera')=>{setDirection(d);setDemo(false);void prepare(file,source,undefined,d);};
 const notices=quality?primaryQualityWarnings(quality).map(key=>quality.checks[key].message):[];
 if(mode==='idle')return <>
  <div className="salon-current-photos">{captureDirections.map(d=>{const photo=photos.find(p=>p.view===d);return <div className="salon-photo" key={d}><button type="button" className={`salon-upload ${photo?'has-photo':''}`} aria-label={`${label(d)}の写真を追加`} disabled={busy} onClick={()=>choose(d)}>{photo?<img src={photo.dataUrl} alt={label(d)}/>:<span><span aria-hidden="true">＋</span><small>写真を追加</small></span>}</button><div className="salon-photo-caption"><span>{label(d)}</span>{photo&&<button type="button" aria-label={`${label(d)}を削除`} onClick={()=>onRemove(photo.id)}>削除</button>}</div>{photo?.capture&&<small className="salon-photo-quality">{photo.capture.source==='demo_sample'?'架空サンプル':photo.capture.quality.grade==='GOOD'?'基本チェック良好':'撮影条件に注意'}</small>}</div>;})}</div>
  <div className="salon-capture-start"><button type="button" className="salon-soft-button" disabled={busy} onClick={()=>{setStaged([]);void openCamera('front',true);}}>4方向を続けて撮影 →</button></div>
  <p className="salon-help">正面・右側・左側・後ろ。1枚から診断できます。</p>
  {photos.some(p=>p.view==='side')&&<div className="salon-legacy-photo"><span>以前のサイド写真</span>{photos.filter(p=>p.view==='side').map(p=><div key={p.id}><img src={p.dataUrl} alt="以前のサイド写真"/><button type="button" className="salon-text-button" onClick={()=>onRemove(p.id)}>削除</button></div>)}</div>}
  {captureDirections.map(d=><input key={d} hidden ref={el=>{libraryInputs.current[d]=el;}} type="file" accept="image/*" aria-label={`${label(d)}をアップロード`} onChange={e=>{const file=e.target.files?.[0];if(file){setDirection(d);setSequence(false);setMode('choose');void prepare(file,'library',undefined,d);}e.target.value='';}}/>)}
 </>;
 return <div className="salon-camera-workflow">
  <div className="salon-camera-heading"><div><span className="salon-kicker">STANDARD BEFORE</span><h3>{mode==='summary'?'4方向の写真を確認':`${captureDirections.indexOf(direction)+1} / 4　${label(direction)}`}</h3></div><button type="button" className="salon-text-button" onClick={close}>撮影を閉じる</button></div>
  {mode==='choose'?<div className="salon-photo-source"><p>いつもの画角で、現在の髪を記録。</p><button type="button" className="salon-primary" onClick={()=>void openCamera(direction,false)}>カメラで撮影</button><label className="salon-soft-button">写真ライブラリから選択<input type="file" accept="image/*" aria-label={`${label(direction)}をアップロード`} disabled={working} onChange={e=>{const f=e.target.files?.[0];if(f)libraryChanged(f,direction,'library');e.target.value='';}}/></label></div>:mode==='summary'?<>
   <div className="salon-capture-summary">{captureDirections.map(d=>{const p=staged.find(p=>p.view===d)!;return <figure key={d}><img src={p.dataUrl} alt={`撮影確認 ${label(d)}`}/><figcaption>{label(d)}<small>{p.capture!.source==='demo_sample'?'架空写真':p.capture!.quality.grade}</small></figcaption><button type="button" className="salon-text-button" onClick={()=>{setDirection(d);setSummaryEditing(true);setCandidate(p);setMode('review');}}>確認・撮り直し</button></figure>;})}</div><p className="salon-help">注意のある写真も、美容師の判断で採用できます。</p>{photos.filter(p=>p.view==='side').map(p=><button key={p.id} type="button" className="salon-text-button" onClick={()=>onRemove(p.id)}>以前のサイド写真を外して4方向へ更新</button>)}<button type="button" className="salon-primary" onClick={()=>{if(onCommit(staged)!==false)close();}}>この4枚を登録する →</button>
  </>:<div className="salon-camera-layout"><div>
   <div className="salon-camera-frame">
    {mode==='review'&&candidate?<img src={candidate.dataUrl} alt={`${label(direction)}の撮影後確認`}/>:demo?<img src={sampleAssets.current.dataUrl} alt="撮影フロー用の架空写真"/>:<video ref={video} autoPlay muted playsInline aria-label="カメラのライブプレビュー"/>}
    {mode==='camera'&&<CameraGuide direction={direction}/>}
    {starting&&<span className="salon-camera-loading" role="status">カメラを準備しています…</span>}
   </div>
   {demo&&<p className="salon-camera-demo-label">架空写真による操作デモ · カメラ映像ではありません</p>}
  </div><div className="salon-camera-controls">
   <div className={`salon-quality-status ${quality?.grade?.toLowerCase()??'pending'}`} role="status"><strong>{quality?.grade==='GOOD'?'✓ 撮影できます':quality?.grade==='NG'?'⚠ 撮り直しをおすすめします':quality?'⚠ 撮影条件を確認してください':'中央に合わせてください'}</strong>{notices.map((message,i)=><p key={i}>{message}</p>)}{quality&&!notices.length&&quality.checks.position.state==='not_assessed'&&<p>頭頂・顎・肩をガイドに合わせてください。</p>}</div>
   {mode==='camera'?<>
    <label className="salon-guide-check"><input type="checkbox" aria-label="頭頂・顎・肩の位置を確認" checked={aligned} onChange={e=>setAligned(e.target.checked)}/>頭頂・顎・肩の位置を確認</label>
    <p className="salon-help">頭頂を上の線へ、顎を下の線へ。肩を水平に合わせます。</p>
    <button type="button" className="salon-primary salon-shutter" disabled={working||starting||(!demo&&!cameraReady)} onClick={()=>void(demo?takeSample():take())}>撮影する</button>
    {(!stream&&!demo&&!starting)&&<button type="button" className="salon-soft-button" onClick={()=>void openCamera()}>カメラを再開する</button>}
    {!demo&&<button type="button" className="salon-text-button" disabled={starting||working} onClick={()=>{const next=facing==='environment'?'user':'environment';setFacing(next);void openCamera(direction,sequence,next);}}>前面 / 背面カメラを切り替える</button>}
   </>:<><p className="salon-help">{quality?.grade==='GOOD'?'写真を確認して採用してください。':'撮り直し推奨。美容師の判断でこの写真を使用できます。'}</p><button type="button" className="salon-primary" disabled={working} onClick={()=>void adopt()}>この写真を使う →</button><button type="button" className="salon-soft-button" disabled={working} onClick={()=>{if(demo){setCandidate(null);setMode('camera');}else void openCamera();}}>撮り直す</button></>}
   <p className="salon-camera-note">明るさ・逆光・ぼやけ・位置は簡易チェックです。髪の自動認識・測色の校正は未接続です。</p>
   {quality&&<details><summary>撮影品質の詳細</summary><p>{quality.grade} · 参考スコア {quality.score} / 100</p><p>頭のガイド範囲で判定しています。髪だけの解析ではありません。</p><p>レンズ汚れ・色かぶり・照明ムラ・反射・髪全体の欠けは未判定です。</p></details>}
  </div></div>}
  {error&&<p className="salon-generation-error" role="alert">{error}</p>}
  {mode!=='summary'&&mode!=='review'&&<div className="salon-camera-fallback">
   <label className="salon-text-button">端末カメラで撮る（ガイドなし）<input ref={native} type="file" accept="image/*" capture="environment" aria-label="端末カメラで撮る" disabled={working} onChange={e=>{const f=e.target.files?.[0];if(f)libraryChanged(f,direction,'native_camera');e.target.value='';}}/></label>
   {mode==='camera'&&<label className="salon-text-button">写真ライブラリから選択<input type="file" accept="image/*" aria-label={`${label(direction)}をアップロード`} disabled={working} onChange={e=>{const f=e.target.files?.[0];if(f)libraryChanged(f,direction,'library');e.target.value='';}}/></label>}
   <button type="button" className="salon-text-button" disabled={working} onClick={()=>void useSample()}>サンプルで撮影の流れを見る</button>
  </div>}
 </div>;
}
function CameraGuide({direction}:{direction:CaptureDirection}){
 const side=direction==='left'||direction==='right';
 return <svg className="salon-camera-guide" viewBox="0 0 100 133.33" preserveAspectRatio="none" role="img" aria-label={`${captureDirectionLabels[direction]}の頭頂・顎・幅・中央線・肩の撮影ガイド`}>
  <g fill="none" stroke="currentColor" strokeWidth=".55"><path d="M50 7V125" strokeDasharray="2 2"/><path d="M27 16H73M31 83H69M10 111H90"/>
   {side?<path transform={direction==='left'?'translate(100 0) scale(-1 1)':undefined} d="M43 17C25 19 25 43 29 62L35 80L56 84L63 70L65 57L75 53L68 48C70 28 59 17 43 17Z"/>:<path d={direction==='back'?'M50 17C24 17 25 37 26 57L29 78Q50 89 71 78L74 57C75 37 76 17 50 17Z':'M50 17C27 17 27 40 29 58Q32 79 50 83Q68 79 71 58C73 40 73 17 50 17Z'}/>}
   <path d="M37 84L36 94L17 103L10 117M63 84L64 94L83 103L90 117"/><path d="M22 41V68M78 41V68" strokeDasharray="2 2"/>
  </g><g fill="currentColor" fontSize="3.2"><text x="50" y="12" textAnchor="middle">頭頂</text><text x="76" y="85">{direction==='back'?'襟足の目安':'顎'}</text><text x="88" y="109" textAnchor="end">肩</text></g>
 </svg>;
}
