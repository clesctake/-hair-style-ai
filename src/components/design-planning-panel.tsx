'use client';
import {useState} from 'react';
import type {Journey} from '@/lib/journey';
import {effectiveFaceBoneValues} from '@/lib/effective-face-values';
import {activePlanningRun,selectedPlannedDesign} from '@/lib/design-planning-projection';
import {planningFaceMetricLabels,emptyCurrentHairContext} from '@/lib/design-planning-engine';
import {planBangFaceFrameDesigns,setCurrentHairContext,setPlannedDesignDraft,confirmPlannedDesignCorrection,selectPlannedDesign} from '@/lib/design-planning-session';
import {planningParameterOptions,type PlanningParameters,type PlanningParameter,type CurrentHairContext} from '@/lib/design-planning-types';

export function DesignStructurePreview({parameters:p,label}:{parameters:PlanningParameters;label:string}){
 const width=p.bangWidth==='wide'?59:p.bangWidth==='narrow'?31:44,density=p.bangDensity==='thick'?.86:p.bangDensity==='standard'?.66:.4;
 const length=({above_brow:51,brow:58,below_brow:62,above_eye:65,eye:70,cheekbone:86,long:102} as const)[p.bangLength];
 const frameY=({cheekbone:86,cheek:95,mouth:109,chin:127,clavicle:157} as const)[p.faceFrameLength];
 return <svg viewBox="0 0 180 175" role="img" aria-label={`DESIGN ${label}の構造プレビュー。本人の完成画像ではありません。`}>
  <defs><linearGradient id={`planning-hair-${label}`} x1="0" x2="1"><stop stopColor="#b89877"/><stop offset="1" stopColor="#765948"/></linearGradient></defs>
  <path d="M36 156 Q23 96 42 42 Q56 15 90 16 Q129 17 140 52 Q157 96 145 158" fill={`url(#planning-hair-${label})`} opacity=".75"/>
  <path d="M51 57 Q50 28 90 29 Q130 30 129 60 L122 100 Q111 127 90 135 Q65 126 57 101Z" fill="#f3e4d5" stroke="#c2a488" strokeWidth="1"/>
  <path d="M68 73 Q75 69 82 73 M98 73 Q105 69 112 73 M84 112 Q90 116 97 112" fill="none" stroke="#96765f" strokeWidth="1.5" strokeLinecap="round"/>
  {p.bangPart==='none'?<path d={`M${90-width} 42 Q90 21 ${90+width} 42 L${90+width-5} ${length} Q90 ${length+7} ${95-width} ${length}Z`} fill={`url(#planning-hair-${label})`} opacity={density}/>:<><path d={`M90 30 Q${90-width} 30 ${90-width+6} ${length} Q73 ${length-15} 90 40`} fill={`url(#planning-hair-${label})`} opacity={density}/><path d={`M90 30 Q${90+width} 30 ${90+width-6} ${length} Q107 ${length-15} 90 40`} fill={`url(#planning-hair-${label})`} opacity={density}/></>}
  <path d={`M48 60 Q${p.faceFrameDirection==='inward'?75:33} ${frameY-15} 57 ${frameY} M132 60 Q${p.faceFrameDirection==='inward'?105:147} ${frameY-15} 123 ${frameY}`} fill="none" stroke="#927252" strokeWidth="9" strokeLinecap="round" opacity=".85"/>
  <path d="M42 158 Q90 148 137 158" fill="none" stroke="#d9c7b4" strokeWidth="2"/>
 </svg>;
}
const currentOptions:Record<keyof CurrentHairContext,{label:string;values:Record<string,string>}>= {
 lengthBand:{label:'現在の長さ',values:{PIXIE:'ショート',BOB:'ボブ',MEDIUM:'ミディアム',LONG:'ロング'}},density:{label:'現在の毛量',values:{LOW:'少なめ',MEDIUM:'標準',HIGH:'多め'}},hasBang:{label:'現在の前髪',values:{true:'あり',false:'なし'}},
 bangLength:{label:'現在の前髪の長さ',values:planningParameterOptions.bangLength.values},faceFrameLength:{label:'現在の顔周りの長さ',values:planningParameterOptions.faceFrameLength.values},part:{label:'現在の分け目',values:planningParameterOptions.bangPart.values},hairFlow:{label:'現在の毛流れ',values:planningParameterOptions.bangFlow.values},stylingDirection:{label:'仕上げの方向',values:{SOFT:'やわらかく',CLEAN:'すっきり',AIRY:'軽やかに',MOVEMENT:'動きをつけて'}}
};
export default function DesignPlanningPanel({session,busy,onChange}:{session:Journey;busy:boolean;onChange:(j:Journey)=>void}){
 const [error,setError]=useState(''),[editing,setEditing]=useState<string|null>(null),s=session.diagnosisSession!;
 const state=s.designPlan.planning,run=activePlanningRun(s),selected=selectedPlannedDesign(s),face=effectiveFaceBoneValues(s),hair=state?.currentHair??emptyCurrentHairContext();
 const aspect=face.faceHeightWidthRatio,canPlan=s.faceBoneAnalysis.activeEstimateId&&aspect.value!==null&&aspect.value>0&&aspect.value<=4&&aspect.sourceType!=='MOCK';
 const perform=(fn:()=>Journey)=>{try{onChange(fn());setError('');}catch(e){setError(e instanceof Error?e.message:'設計を確認してください。');}};
 return <section className="planning-panel" aria-label="AI前髪・顔周り提案">
  <div className="planning-heading"><div><p className="salon-kicker">FACE BALANCE → YOUR STYLE</p><h3>あなたのバランスから、5つの方向へ。</h3><p>画像AIの推定値と、美容師が確認した条件から設計する試案です。</p></div><span className="salon-label">ESTIMATE · 要美容師確認</span></div>
  <details className="planning-context"><summary>現在の髪・仕上げの方向を確認する</summary><p>分からない項目は未確認のままにできます。STYLE写真の形状の自動解析は未接続です。</p><div className="planning-input-grid">{(Object.keys(currentOptions) as (keyof CurrentHairContext)[]).map(key=><label key={key}>{currentOptions[key].label}<select aria-label={`設計入力 ${currentOptions[key].label}`} disabled={busy} value={hair[key].value===null?'':String(hair[key].value)} onChange={e=>perform(()=>setCurrentHairContext(session,key,(e.target.value===''?null:key==='hasBang'?e.target.value==='true':e.target.value) as CurrentHairContext[typeof key]['value']))}><option value="">未確認</option>{Object.entries(currentOptions[key].values).map(([v,text])=><option value={v} key={v}>{text}</option>)}</select></label>)}</div></details>
  <div className="planning-action"><button type="button" className="salon-gold-button" disabled={busy||!canPlan} onClick={()=>perform(()=>planBangFaceFrameDesigns(session))}>{run?'この条件で5案を再設計する →':'AI前髪・顔周り5案を設計する →'}</button><p>{!canPlan?'STEP 02で正面の顔解析を行い、取得した縦横比を確認してください。':'学習済みの似合わせモデルではなく、画像推定＋未検証の設計ルールを使います。'}</p></div>
  {error&&<p role="alert" className="planning-alert">{error}</p>}
  {!run&&state?.runs.length?<p className="planning-alert">入力が変わりました。以前の提案は履歴に残っています。現在の条件で再設計してください。</p>:null}
  {run&&<><div className="planning-preview-label">DESIGN STRUCTURE PREVIEW <span>構造の比較 · 構造説明用 · 実写比較はSTEP 04へ</span></div><div className="planning-five-grid">{run.proposals.map(d=>{
    const correction=state?.corrections.findLast(c=>c.designId===d.id&&c.runId===run.id),p=state?.drafts[d.id]??correction?.parameters??d.parameters,isSelected=selected?.design.id===d.id;
    return <article key={d.id} className={`planning-design ${isSelected?'is-selected':''}`} data-design-label={d.label}>
      <div className="planning-card-top"><span>DESIGN {d.label}</span>{isSelected&&<small>採用中</small>}</div><DesignStructurePreview parameters={p} label={d.label}/><h4>{d.name}</h4><p className="planning-effect">{d.visualEffectDescription}</p><div className="planning-tags"><span>{planningParameterOptions.bangLength.values[p.bangLength]}</span><span>{planningParameterOptions.bangWidth.values[p.bangWidth]}</span><span>{planningParameterOptions.bangDensity.values[p.bangDensity]}</span></div>
      <button type="button" className="salon-soft-button" disabled={busy||!!state?.drafts[d.id]} aria-label={`DESIGN ${d.label}を採用`} onClick={()=>perform(()=>selectPlannedDesign(session,d.id))}>{isSelected?'選択したデザイン':'この案を採用'}</button><button type="button" className="salon-text-button" aria-label={`DESIGN ${d.label}を編集`} onClick={()=>setEditing(editing===d.id?null:d.id)}>{editing===d.id?'編集を閉じる':'このデザインを編集'}</button>
      {editing===d.id&&<div className="planning-edit">{(Object.keys(planningParameterOptions) as PlanningParameter[]).map(key=><label key={key}>{planningParameterOptions[key].label}<select aria-label={`DESIGN ${d.label} ${planningParameterOptions[key].label}`} disabled={busy} value={p[key]} onChange={e=>perform(()=>setPlannedDesignDraft(session,d.id,{...p,[key]:e.target.value}))}>{Object.entries(planningParameterOptions[key].values).map(([v,name])=><option key={v} value={v}>{name}</option>)}</select><small>原案：{(planningParameterOptions[key].values as Record<string,string>)[d.parameters[key]]}</small></label>)}<button type="button" className="salon-soft-button" disabled={busy||!state?.drafts[d.id]} aria-label={`DESIGN ${d.label}の変更を保存`} onClick={()=>perform(()=>confirmPlannedDesignCorrection(session,d.id))}>変更を保存</button><small>保存後に「この案を採用」を押してください。</small></div>}
      <details className="planning-basis"><summary>根拠・確認項目</summary><p>使用した画像上の比率</p>{d.usedMetrics.map(m=><p key={m.key}><strong>{planningFaceMetricLabels[m.key]??m.key}</strong> {m.observation.value?.toFixed(3)}<small>{m.observation.sourceType==='STYLIST_CORRECTED'?'美容師確認':'画像AI推定'}</small></p>)}<p>入力充足度 {Math.round(d.confidence*100)}%<small>似合う確率ではありません。未検証の補助指標です。</small></p><p>{d.missingInputs.length}項目が未確認。必要に応じて美容師が調整してください。</p><details><summary>詳細な根拠キー・不足入力</summary><p>{d.basedOnFaceBoneAnalysis.metricKeys.join(', ')}</p><p>{d.missingInputs.join(', ')}</p><p>{d.ruleIds.join(', ')}</p></details></details>
    </article>;
  })}</div>{selected&&<p className="planning-selection-note">DESIGN {selected.design.label} の前髪・顔周りをSTYLEへ保存しました。STEP 04でMAINと5案の実写生成へ進めます（実API未検証）。</p>}</>}
 </section>;
}
