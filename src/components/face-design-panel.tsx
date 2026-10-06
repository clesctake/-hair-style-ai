'use client';
import {useEffect,useRef,useState} from 'react';
import type {Journey} from '@/lib/journey';
import {mockFaceAnalyzer,faceInputContext,faceMetricSpecs,type FaceMetric,type FaceAnalyzer} from '@/lib/face-measurements';
import {addFaceAnalysis,faceAnalysisFor,activeBangSet,selectedBangDecision,bangOptions,bangDraft,changeBangDraft,adoptBangDesign,requestBangTrial,type BangParameters,type BangProposal} from '@/lib/bang-design';

export default function FaceDesignPanel({session,busy,onChange,analyzer=mockFaceAnalyzer}:{session:Journey;busy:boolean;onChange:(s:Journey)=>void;analyzer?:FaceAnalyzer}){
 const [working,setWorking]=useState(false),[error,setError]=useState(''),[compare,setCompare]=useState<string|null>(null);
 const latest=useRef(session);latest.current=session;const request=useRef(0);
 useEffect(()=>()=>{request.current++;},[]);
 const analysis=faceAnalysisFor(session),set=activeBangSet(session),decision=selectedBangDecision(session),front=session.photos.find(p=>p.view==='front');
 const inputs=faceInputContext(session.photos);
 useEffect(()=>{request.current++;setWorking(false);setError('');setCompare(null);},[inputs]);
 async function analyze(){const attempt=++request.current,start=latest.current;setWorking(true);setError('');try{const result=await analyzer.analyze(start.photos);if(attempt!==request.current)return;onChange(addFaceAnalysis(latest.current,result));}catch(e){if(attempt===request.current)setError(e instanceof Error?e.message:'FACE DESIGNを開けませんでした。');}finally{if(attempt===request.current)setWorking(false);}}
 const action=(callback:()=>void)=>{try{callback();setError('');}catch(e){setError(e instanceof Error?e.message:'デザインを更新できませんでした。');}};
 const trial=set?.proposals.find(p=>p.id===compare),latestTrial=trial?session.faceDesign?.trials.findLast(t=>t.proposalId===trial.id&&t.currentPhotoId===front?.id&&t.analysisId===analysis?.id):undefined;
 return <div className="salon-face-design">
  <div className="salon-face-heading"><div><span className="salon-kicker">FACE DESIGN</span><h3>あなたのバランスと、5つのデザイン。</h3></div><span className="salon-label">{analysis?.provider==='face-landmarks'?'画像推定':'DEMO / MOCK'}</span></div>
  <div className="salon-face-balance"><div className="salon-face-photos">{(['front','right','left'] as const).map(view=>{const photo=session.photos.find(p=>p.view===view);return <figure key={view}>{photo?<img src={photo.dataUrl} alt={`FACE DESIGN ${view==='front'?'正面':view==='right'?'右側':'左側'}`}/>:<div className="salon-face-photo-empty">{view==='front'?'正面':view==='right'?'右側':'左側'}写真</div>}<figcaption>{view==='front'?'正面':view==='right'?'右側':'左側'}</figcaption></figure>;})}</div>
   <div className="salon-face-intro"><h4>輪郭の名前より、<br/>表情とラインのバランスを。</h4><p>{analysis?'比率は固定サンプル。現在の写真から計測した結果ではありません。':'この5案は固定のDEMOです。実画像の顔解析はSTEP 02で確認できます。'}</p><button type="button" className="salon-soft-button" disabled={busy||working||!front} onClick={()=>void analyze()}>{working?'準備中…':analysis?'デモ分析と5案を再作成':'デモ分析と5案を見る →'}</button>{!front&&<small>まず正面写真を追加してください。</small>}{front?.capture?.quality.grade&&front.capture.quality.grade!=='GOOD'&&<small>正面写真に撮影条件の注意があります。</small>}</div>
  </div>
  {analysis&&<details className="salon-face-measurements"><summary>顔プロポーションの詳細を見る</summary><p>{analysis.notes} 実測済み項目：0。ランドマーク：未接続。写真の比率と3Dの骨格計測は別です。</p><div className="salon-face-measure-grid">{Object.entries(faceMetricSpecs).map(([key,spec])=>{const m=analysis.metrics[key as FaceMetric];return <div key={key}><span>{spec.label}</span><strong>{m.value===null?'未判定':`${m.value.toFixed(2)} · MOCK`}</strong></div>;})}</div></details>}
  {set&&<><div className="salon-face-candidates-heading"><h4>5つの方向から、いちばん心地よい前髪へ。</h4><p>固定テンプレートによる提案例です。写真に対する似合わせ判定ではありません。</p></div>
   <div className="salon-bang-grid">{set.proposals.map(p=>{const params=bangDraft(session,p),chosen=decision?.proposalId===p.id,changed=JSON.stringify(params)!==JSON.stringify(p.parameters),dirty=chosen&&JSON.stringify(params)!==JSON.stringify(decision?.parameters);return <article key={p.id} className={`salon-bang-card ${chosen?'is-selected':''}`} data-design={p.label}>
    <div className="salon-bang-letter">DESIGN {p.label}<span>{chosen?'美容師採用':'MOCK'}</span></div><BangConcept parameters={params} label={p.label}/><small className="salon-concept-label">CONCEPT · 概念図</small><h4>{p.title}</h4><div className="salon-bang-tags"><span>{(bangOptions.length.values as Record<string,string>)[params.length]}</span><span>{bangOptions.width.values[params.width]}</span><span>{bangOptions.density.values[params.density]}</span></div><p>{p.intent}</p><p className="salon-bang-emphasis">{p.emphasis}</p>
    <details><summary>美容師が微調整する</summary><div className="salon-bang-edit">{Object.entries(bangOptions).map(([key,spec])=><label key={key}>{spec.label}<select aria-label={`DESIGN ${p.label} ${spec.label}`} value={params[key as keyof BangParameters]} onChange={e=>action(()=>onChange(changeBangDraft(latest.current,p,{...bangDraft(latest.current,p),[key]:e.target.value})))}>{Object.entries(spec.values).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select><small>AI提案例：{(spec.values as Record<string,string>)[p.parameters[key as keyof BangParameters]]}</small></label>)}</div><p>{changed?'美容師の変更を編集中。採用ボタンで確定します。':'AI提案原本と美容師の確定値を別々に保存します。'}</p></details>
    <button type="button" className="salon-bang-try salon-soft-button" onClick={()=>action(()=>{onChange(requestBangTrial(latest.current,p));setCompare(p.id);})}>この前髪を試す →</button>
    <button type="button" className="salon-text-button" onClick={()=>action(()=>onChange(adoptBangDesign(latest.current,p)))}>{dirty?'変更を再採用する →':chosen?'もう一度この案を採用':'この案をSTYLEへ採用 →'}</button>
   </article>;})}</div>
   {decision&&<p className="salon-bang-selected" role="status">DESIGN {set.proposals.find(p=>p.id===decision.proposalId)?.label} を採用。STYLE写真の全体の形に、この前髪・顔周りを組み合わせます。</p>}
   {trial&&<div className="salon-bang-comparison"><div className="salon-face-heading"><h4>本人写真で、デザインを比べる。</h4><button type="button" className="salon-text-button" onClick={()=>setCompare(null)}>比較を閉じる</button></div><div className="salon-bang-comparison-tabs" aria-label="前髪比較">{set.proposals.map(p=><button type="button" key={p.id} aria-pressed={compare===p.id} onClick={()=>setCompare(p.id)}>DESIGN {p.label}</button>)}</div><div className="salon-bang-comparison-pictures"><figure>{front&&<img src={front.dataUrl} alt="前髪比較の本人写真"/>}<figcaption>Before · 本人写真</figcaption></figure><figure><div className="salon-bang-preview-empty"><BangConcept parameters={latestTrial?.parameters??bangDraft(session,trial)} label={trial.label}/><strong>DESIGN {trial.label}</strong><span>本人写真への生成は未接続</span><small>{latestTrial?'試す条件を記録しました':'この案を試すと条件を記録します'}</small></div><figcaption>MOCK · 写真シミュレーション前</figcaption></figure></div><p className="salon-help">顔・表情・年齢・背景・ポーズを維持する条件で、画像生成へ接続予定です。ここでは生成画像を表示していません。</p></div>}
  </>}
  {error&&<p className="salon-generation-error" role="alert">{error}</p>}
 </div>;
}
function BangConcept({parameters:p,label}:{parameters:BangParameters;label:string}){
 const short=p.length==='above_brow',center=p.kind==='none'||p.part==='center',side=p.kind==='swept'||p.kind==='swept_up';
 return <svg className="salon-bang-concept" viewBox="0 0 140 140" role="img" aria-label={`DESIGN ${label} 前髪の概念図・写真シミュレーションではありません`}>
 <g fill="none" stroke="#ae9680" strokeWidth="1.1" strokeLinecap="round"><path d="M44 58C43 87 52 107 70 109C88 107 97 87 96 58M54 106L52 122L29 137M86 106L88 122L111 137M54 77Q60 74 66 77M75 77Q81 74 87 77M65 93Q70 96 75 93"/><path d="M34 124C26 106 24 76 30 52C35 26 50 18 70 18C94 18 109 34 111 58C114 86 111 107 107 125"/></g>
 <g fill="none" stroke="#927c68" strokeWidth={p.density==='thick'?4:2} strokeLinecap="round">{center?<><path d="M70 25C56 35 43 48 39 86M70 25C85 34 97 55 102 94"/><path d="M53 48L33 104M85 50L104 109" opacity=".45"/></>:side?<><path d="M84 26C67 41 49 60 39 89M88 30C70 54 59 72 42 99"/><path d="M41 48C31 73 31 92 34 112M95 48C105 73 108 89 107 113" opacity=".5"/></>:<>{[43,51,60,69,78,87,95].map((x,i)=><path key={x} d={`M${x} ${35+Math.abs(i-3)*2}Q${x-3} 50 ${x+(i%2?2:-2)} ${short?55:66+(i%2?2:-2)}`} opacity={p.density==='thin'&&i%2?.45:1}/>)}</>}<path d="M36 76Q33 108 43 122M103 73Q106 108 97 124" opacity=".5"/></g>
 </svg>;
}
