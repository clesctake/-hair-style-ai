'use client';
import { useEffect, useRef, useState } from 'react';
import type { Journey } from '@/lib/journey';
import { effectiveHairZone, hairZones, type HairZone, type HairMetric, type FaceMetric } from '@/lib/session-model';
import { currentAnalysisRun, correctObservedHair, correctObservedFace, correctHairRegion } from '@/lib/photo-analysis-pipeline';
import { decodeMask, encodeMask } from '@/lib/photo-analysis-math';
import { analysisQualityWarnings } from '@/lib/segmented-photo-quality';
import type { AnalysisPhotoResult, ZoneBands } from '@/lib/photo-analysis-types';
import { resolveSessionImage } from '@/lib/session-adapter';

export function observedHairZone(session: Journey, zone: HairZone) {
  const s=session.diagnosisSession;if(!s)return null;const run=currentAnalysisRun(session);if(!run?.hairEstimateId)return null;
  const v=effectiveHairZone(s,zone),photo=run.photos.find(p=>p.imageId===run.representativeColorPhotoId);
  const region=s.photoAnalysis?.regionCorrections.findLast(c=>c.runId===run.id&&c.imageId===photo?.imageId);
  if(region)v.color=region.zoneValues[zone]?.color??null;return v;
}
const zones:Record<HairZone,string>={ROOT:'根元',MID:'中間',END:'毛先'};
const number=(v:number|null,unit='')=>v===null?'未取得':`${Math.round(v*10)/10}${unit}`;
const faceLabels:Partial<Record<FaceMetric,string>>={faceHeightWidthRatio:'顔の縦横比',faceWidthRatio:'画像に対する顔幅',faceHeightRatio:'画像に対する顔高さ',foreheadHeightRatio:'額の高さ',foreheadWidthRatio:'額の幅',midfaceRatio:'眉〜鼻の比率',lowerFaceRatio:'鼻〜顎の比率',cheekbonePosition:'頬付近の位置',cheekboneWidthRatio:'頬付近の幅',jawWidthRatio:'顎付近の幅',chinPosition:'顎位置',browPosition:'眉位置',eyePosition:'目位置',browEyeDistance:'目と眉の距離',hairlinePosition:'生え際',crown:'頭頂',occipital:'後頭部'};
export default function PhotoAnalysisPanel({session,busy,progress,onAnalyze,onCancel,onChange}:{session:Journey;busy:boolean;progress:string;onAnalyze:()=>void;onCancel:()=>void;onChange:(s:Journey)=>void}){
  const [zone,setZone]=useState<HairZone>('MID'),[photoId,setPhotoId]=useState(''),[error,setError]=useState('');
  const run=currentAnalysisRun(session),s=session.diagnosisSession!,values=observedHairZone(session,zone),ai=s.hairAnalysis.aiEstimate.find(a=>a.id===run?.hairEstimateId);
  const photo=run?.photos.find(p=>p.imageId===photoId)??run?.photos.find(p=>p.imageId===run.representativeColorPhotoId)??run?.photos[0];
  const face=s.faceBoneAnalysis.aiEstimate.find(a=>a.id===run?.faceEstimateId),faceMetricCount=face?Object.values(face.metrics).filter(v=>v.value!==null).length:0;
  const correction=(metric:HairMetric,value:number|null)=>{try{onChange(correctObservedHair(session,zone,metric,value));}catch(e){setError(e instanceof Error?e.message:'補正できませんでした。');}};
  const manual=(metric:HairMetric,label:string,min:number,max:number,step=1)=><label key={metric} className="salon-metric"><span>{label}<strong>{values?.[metric].value!==null&&values?.[metric].value!==undefined?`${values[metric].value}`:'美容師確認'}</strong></span><input type="number" aria-label={`${zones[zone]} ${label} 確認値`} min={min} max={max} step={step} disabled={!ai} placeholder="未確認" value={values?.[metric].value??''} onChange={e=>{const n=e.target.value===''?null:Number(e.target.value);if(n===null||Number.isFinite(n)&&n>=min&&n<=max)correction(metric,n);}}/><small>AI原本：{ai?.zones[zone][metric].value??'未取得'} · 美容師入力を別保存</small></label>;
  return <div className="photo-analysis-panel" data-testid="real-photo-analysis">
    <div className="salon-diagnosis-caption"><p className="salon-kicker">HAIR CONDITION</p><span className="salon-label">{run?.hairEstimateId?'AI推定 · 画像の色':run?'解析結果を確認':'未解析'}</span></div>
    <button className="salon-primary" disabled={busy||!session.photos.length} onClick={onAnalyze}>{run?'写真を再解析する':'写真から髪・顔を解析する'} →</button>
    {progress&&<p role="status" className="photo-analysis-progress">{progress}{busy&&<button type="button" className="salon-text-button" onClick={onCancel}>中止</button>}</p>}
    {error&&<p role="alert">{error}</p>}
    <label className="photo-analysis-zone">確認する部位<select aria-label="実解析の部位" value={zone} onChange={e=>setZone(e.target.value as HairZone)}>{hairZones.map(z=><option key={z} value={z}>{zones[z]}</option>)}</select></label>
    <div className="photo-analysis-observed">
      <div><small>明るさ</small><strong>{number(values?.lightness.value??null,' L*')}</strong>{values?.lightness.value!=null&&<input type="range" aria-label={`${zones[zone]} 実解析の明るさ`} min={0} max={100} step={.1} value={values.lightness.value} onChange={e=>correction('lightness',Number(e.target.value))}/>}</div>
      <div><small>色味</small><span className="photo-analysis-swatch" style={{background:values?.color?.display.hex??'#eee9e3'}}/><strong>{values?.color?.display.hex??'未取得'}</strong></div>
      <div><small>画像上の色のばらつき</small><strong>{number(values?.unevenness.value??null)}</strong><small>照明・ハイライトの影響も含みます</small></div>
    </div>
    <div className="photo-analysis-manual">{manual('underLevel','アンダー',0,20,.5)}{manual('grayPercentage','白髪率',0,100)}{manual('porosity','薬剤の吸い込みやすさ',1,5)}</div>
    <small className="photo-analysis-note">画像の明るさはサロンLvと別の尺度です。白髪率・毛髪内部の状態は写真から確定しません。</small>
    <div className="photo-analysis-face-summary"><p className="salon-kicker">FACE / BONE</p><strong>{faceMetricCount?'顔の位置関係を取得しました':face?.landmarks.length?'側面ランドマーク取得 · 比率は未取得':'顔・骨格は未取得'}</strong><small>{face?`AI推定 · ${face.landmarks.length}点／画像上の2D関係`:'正面写真をご用意ください'}</small></div>
    <details><summary>詳細を見る · AI原本／美容師確認</summary>
      <p>髪領域と顔ランドマークは実モデルのAI推定です。色はその領域内の未校正sRGB画素から計算しています。物理的な骨格寸法・生え際・ダメージ・染料量は取得していません。</p>
      {run&&<><div className="photo-analysis-photo-tabs">{run.photos.map(p=><button type="button" className="salon-soft-button" aria-pressed={photo?.imageId===p.imageId} key={p.imageId} onClick={()=>setPhotoId(p.imageId)}>{({FRONT:'正面',RIGHT:'右側',LEFT:'左側',BACK:'後ろ'} as Record<string,string>)[p.direction??'']??'方向未確認'}</button>)}</div>{photo&&<>
        <p>元画像 {photo.originalWidth}×{photo.originalHeight} → 解析 {photo.analysisWidth}×{photo.analysisHeight} · 元画像を保存。品質 {photo.quality.status}（簡易ルール）</p>
        {analysisQualityWarnings(photo.quality).map(w=><p className="salon-validation" key={w}>{w}</p>)}
        {photo.faceStatus==='MULTIPLE_FACES'&&<p>複数のお顔が検出されました。お客様お一人の写真で再解析してください。</p>}
        {photo.hairRegion?<HairRegionEditor key={`${run.id}:${photo.imageId}`} session={session} photo={photo} onChange={onChange}/>:<p>この写真の髪領域は取得できませんでした。</p>}
      </>}{run.skipped.map(p=><p className="salon-validation" key={p.imageId}>{p.reason}</p>)}</>}
      <div className="photo-analysis-source-grid">{hairZones.map(z=>{const v=observedHairZone(session,z),original=ai?.zones[z];return <article key={z}><h3>{zones[z]}</h3>{(['lightness','hue','chroma','unevenness'] as const).map(k=><p key={k}>{({lightness:'明るさ L*',hue:'色相 h°',chroma:'彩度 C*',unevenness:'Labばらつき'})[k]}<br/><small>AI {number(original?.[k].value??null)} → 確認値 {number(v?.[k].value??null)} · {v?.[k].sourceType??'未取得'}</small></p>)}</article>;})}</div>
      <h3>美容師による毛髪確認</h3><div className="photo-analysis-manual">{manual('damage','ダメージ',1,5)}{manual('hairThickness','毛髪の太さ',1,5)}{manual('baseLevel','現在レベル',0,20,.5)}{manual('residualRed','残留赤み',0,5)}{manual('residualOrange','残留オレンジ',0,5)}{manual('residualYellow','残留黄み',0,5)}</div>
      <h3>顔プロポーション · 画像上の推定</h3><p>眉〜鼻／鼻〜顎の比率は顔表面の基準です。医学的な顔面三分割ではありません。頬・顎も表面ランドマークの目安です。</p>
      <dl className="photo-analysis-face-values">{Object.entries(faceLabels).map(([key,label])=>{const aiValue=face?.metrics[key as FaceMetric]?.value??null,corrected=s.faceBoneAnalysis.stylistCorrection.findLast(c=>c.estimateId===face?.id&&c.metric===key),effective=corrected?corrected.value.value:aiValue;return <div key={key}><dt>{label}</dt><dd>{number(aiValue)} · AI</dd><label>美容師確認<input type="number" aria-label={`${label} 美容師確認`} min={0} max={10} step={.01} disabled={!face} value={effective??''} placeholder="未取得" onChange={e=>{const value=e.target.value===''?null:Number(e.target.value);try{onChange(correctObservedFace(session,key as FaceMetric,value));}catch(err){setError(err instanceof Error?err.message:'補正できませんでした。');}}}/></label></div>;})}</dl>
      <p>額・生え際・頭部形状は未取得。骨格からのA〜E設計／画像生成にはまだ接続していません。</p>
      {run&&<small>provider: {run.provider} · {run.execution} · 解析schema: {run.schemaVersion}<br/>{run.status==='PARTIAL'?'PARTIAL · 一部の方向／項目が未取得':run.status==='FAILED'?'取得できませんでした':'実モデルの処理完了 · 推定精度は要確認'}</small>}
    </details>
  </div>;
}

function HairRegionEditor({session,photo,onChange}:{session:Journey;photo:AnalysisPhotoResult;onChange:(s:Journey)=>void}){
  const original=photo.hairRegion!,run=currentAnalysisRun(session)!,correction=session.diagnosisSession?.photoAnalysis?.regionCorrections.findLast(c=>c.runId===run.id&&c.imageId===photo.imageId);
  const [bands,setBands]=useState<ZoneBands>(correction?.zoneBands??original.zoneBands??{rootEnd:.33,midEnd:.66}),[tool,setTool]=useState<'paint'|'erase'>('paint'),[working,setWorking]=useState(false),[error,setError]=useState('');
  const canvas=useRef<HTMLCanvasElement>(null),base=useRef<ImageData|null>(null),mask=useRef(decodeMask(correction?.mask??original.mask)),drawing=useRef(false),bandsRef=useRef(bands);bandsRef.current=bands;
  const redraw=()=>{const c=canvas.current,ctx=c?.getContext('2d');if(!c||!ctx||!base.current)return;ctx.putImageData(base.current,0,0);const overlay=ctx.createImageData(c.width,c.height);for(let i=0;i<mask.current.length;i++)if(mask.current[i]){overlay.data[i*4]=188;overlay.data[i*4+1]=147;overlay.data[i*4+2]=82;overlay.data[i*4+3]=85;}const off=document.createElement('canvas');off.width=c.width;off.height=c.height;off.getContext('2d')!.putImageData(overlay,0,0);ctx.drawImage(off,0,0);ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.setLineDash([8,6]);for(const y of [bandsRef.current.rootEnd,bandsRef.current.midEnd]){ctx.beginPath();ctx.moveTo(0,y*c.height);ctx.lineTo(c.width,y*c.height);ctx.stroke();}off.width=off.height=1;};
  useEffect(()=>{let alive=true;const ref=session.diagnosisSession?.currentPhotos.find(p=>p.imageId===photo.imageId);if(!ref)return;const image=new Image();image.src=resolveSessionImage(session,ref,'original').dataUrl;void image.decode().then(()=>{if(!alive||!canvas.current)return;const c=canvas.current;c.width=photo.analysisWidth;c.height=photo.analysisHeight;const ctx=c.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(image,0,0,c.width,c.height);base.current=ctx.getImageData(0,0,c.width,c.height);redraw();image.src='';}).catch(()=>{if(alive)setError('元画像を表示できませんでした。');});return()=>{alive=false;image.src='';};},[photo.imageId]);
  useEffect(()=>{redraw();},[bands]);
  const stroke=(e:React.PointerEvent<HTMLCanvasElement>)=>{if(!drawing.current)return;const c=canvas.current!,r=c.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*c.width,y=(e.clientY-r.top)/r.height*c.height,brush=Math.max(4,c.width*.025);for(let yy=Math.max(0,Math.floor(y-brush));yy<Math.min(c.height,y+brush);yy++)for(let xx=Math.max(0,Math.floor(x-brush));xx<Math.min(c.width,x+brush);xx++)if(Math.hypot(xx-x,yy-y)<=brush)mask.current[yy*c.width+xx]=tool==='paint'?1:0;redraw();};
  const save=async()=>{setWorking(true);setError('');try{onChange(await correctHairRegion(session,photo,encodeMask(mask.current,photo.analysisWidth,photo.analysisHeight),bands));}catch(e){setError(e instanceof Error?e.message:'領域を保存できませんでした。');}finally{setWorking(false);}};
  return <div className="photo-analysis-region"><h3>髪領域と部位を確認</h3><p>金色が髪の候補です。上下の区切りは画像上の目安。分け目や毛流れに合わせて修正してください。</p><canvas ref={canvas} aria-label="現在写真の髪領域修正" onPointerDown={e=>{drawing.current=true;e.currentTarget.setPointerCapture(e.pointerId);stroke(e);}} onPointerMove={stroke} onPointerUp={()=>{drawing.current=false;}} onPointerCancel={()=>{drawing.current=false;}}/>
    <div className="photo-analysis-region-tools"><button type="button" className="salon-soft-button" aria-pressed={tool==='paint'} onClick={()=>setTool('paint')}>髪を追加</button><button type="button" className="salon-soft-button" aria-pressed={tool==='erase'} onClick={()=>setTool('erase')}>除外する</button><button type="button" className="salon-text-button" onClick={()=>{mask.current=decodeMask(original.mask);setBands(original.zoneBands??{rootEnd:.33,midEnd:.66});redraw();}}>AI候補に戻す</button></div>
    <label>根元の区切り<input aria-label="根元領域の区切り" type="range" min={.02} max={bands.midEnd-.02} step={.01} value={bands.rootEnd} onChange={e=>setBands({...bands,rootEnd:Number(e.target.value)})}/></label>
    <label>中間の区切り<input aria-label="中間領域の区切り" type="range" min={bands.rootEnd+.02} max={.98} step={.01} value={bands.midEnd} onChange={e=>setBands({...bands,midEnd:Number(e.target.value)})}/></label>
    <button type="button" className="salon-soft-button" disabled={working} onClick={()=>void save()}>この領域で確認する</button><small>美容師の領域・色計算を別保存。AIマスクとAI診断原本は維持します。</small>{error&&<p role="alert">{error}</p>}
  </div>;
}
