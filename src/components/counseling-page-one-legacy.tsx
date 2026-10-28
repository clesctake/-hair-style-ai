'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import type {CatalogData} from '@/lib/catalog';
import {newJourney,now,validateJourney,type Journey,type Photo} from '@/lib/journey';
import {deviceJourneyStore,readPhoto,type JourneyStore} from '@/lib/journey-store';
import {saveCounselingDraft,loadCounselingDraft} from '@/lib/counseling-draft-store';
import {withDiagnosisSession} from '@/lib/session-adapter';
import {preserveAnalysisOriginals} from '@/lib/analysis-photo-archive';
import {analyzeCurrentPhotos,commitPhotoAnalysis,currentAnalysisRun} from '@/lib/photo-analysis-pipeline';
import {effectiveFaceBoneValues} from '@/lib/effective-face-values';
import {activePlanningRun,selectedPlannedDesign} from '@/lib/design-planning-projection';
import {planBangFaceFrameDesigns,selectPlannedDesign} from '@/lib/design-planning-session';
import {emptyHairMask} from '@/lib/hair-mask';
import {counselingState,counselingRows,editCounseling,setCounselingInput,resetCounselingInputs,reapplyCounselingHairInputs,confirmCounseling} from '@/lib/counseling-session';
import {confirmedTargetAdjustment} from '@/lib/target-adjustment';
import {selectedSimulationAsset} from '@/lib/hair-simulation-context';
import CurrentHairCapture from './current-hair-capture';
import PhotoAnalysisPanel from './photo-analysis-panel';
import StyleReferenceEditor from './style-reference-editor';
import TargetColorEditor from './target-color-editor';
import DesignPlanningPanel from './design-planning-panel';
import FeatureStatePanel from './feature-state-panel';

const asset=(s:string)=>`/counseling-master/${s}.png`;
const previewNames=['前髪あり','シースルーバング','センターバング','顔まわりレイヤー','ワイドバング'];
const colorNames=['ベージュ','グレージュ','ブラウン','マット','アッシュ','ラベンダー','ピンク','オレンジ','レッド'];
const lastSessionKey='color-future-ai-counseling-page1:last-session';
type DialogView='photos'|'style'|'color'|'analysis'|'design'|'final'|'handoff'|'states'|null;
function SectionTitle({n,children,action,onOpen}:{n:number;children:ReactNode;action?:ReactNode;onOpen?:()=>void}){
 return <div className="cfa-section-title"><h2><span>{n}</span>{onOpen?<button type="button" onClick={onOpen}>{children}</button>:children}</h2>{action}</div>;
}
function FaceIcon({kind}:{kind:'face'|'bone'|'balance'|'skin'}){return <img src={asset('icon-'+kind)} alt="" aria-hidden="true"/>;}
export default function CounselingPageOne({data,store:providedStore}:{data:CatalogData;store?:JourneyStore}){
 const [store]=useState(()=>providedStore??deviceJourneyStore(data));
 const [session,setSession]=useState<Journey>(()=>{const j=newJourney();j.title='カラー・デザインカウンセリング';return withDiagnosisSession(j,data);});
 const sessionRef=useRef(session);sessionRef.current=session;
 const [dialog,setDialog]=useState<DialogView>(null),[busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[notice,setNotice]=useState(''),[dirty,setDirty]=useState(false),[loaded,setLoaded]=useState(false),[selectedPreview,setSelectedPreview]=useState(0);
 const abort=useRef<AbortController|null>(null),saving=useRef<Promise<Journey>|null>(null);
 const state=counselingState(session),s=session.diagnosisSession!,run=currentAnalysisRun(session),face=effectiveFaceBoneValues(s),planning=activePlanningRun(s),selected=selectedPlannedDesign(s),confirmed=confirmedTargetAdjustment(session),generated=selectedSimulationAsset(s);
 const front=session.photos.find(p=>p.view==='front'),side=session.photos.find(p=>p.view==='right'||p.view==='side'),back=session.photos.find(p=>p.view==='back'),left=session.photos.find(p=>p.view==='left');
 const change=(next:Journey)=>{const value=withDiagnosisSession({...preserveAnalysisOriginals(sessionRef.current,next),updatedAt:now()},data);sessionRef.current=value;setSession(value);setDirty(true);};
 const save=async():Promise<Journey>=>{
  if(saving.current){await saving.current;return save();}
  const snapshot=sessionRef.current;
  let ready=false;try{validateJourney(snapshot,data);ready=true;}catch{/* Retain incomplete counseling in its separate draft store. */}
  const task=ready?store.save(snapshot):Promise.resolve(snapshot);saving.current=task;
  try{const saved=await task;const current=sessionRef.current;
   const next=current.updatedAt===snapshot.updatedAt?saved:withDiagnosisSession({...current,id:saved.id,version:saved.version,diagnosisSession:{...current.diagnosisSession!,revision:saved.version}},data);
   sessionRef.current=next;setSession(next);setDirty(current.updatedAt!==snapshot.updatedAt);
   if(store.mode==='device'){await saveCounselingDraft(next);if(saved.id)localStorage.setItem(lastSessionKey,saved.id);}return saved;
  }finally{saving.current=null;}
 };
 useEffect(()=>{let disposed=false;void(async()=>{try{const id=store.mode==='device'?localStorage.getItem(lastSessionKey):null;const record=id?await store.load(id):null;const draft=store.mode==='device'?await loadCounselingDraft():null;const j=draft&&(!record||draft.updatedAt>=record.updatedAt)?draft:record;if(j&&!disposed){sessionRef.current=j;setSession(j);setDirty(false);}}catch{if(!disposed)setNotice('保存済みの記録は変更していません。新しい相談から始めます。');}finally{if(!disposed)setLoaded(true);}})();return()=>{disposed=true;abort.current?.abort();};},[store]);
 useEffect(()=>{if(!loaded||!dirty||busy)return;const t=setTimeout(()=>void save().catch(e=>setNotice(e instanceof Error?e.message:'保存できませんでした。')),1300);return()=>clearTimeout(t);},[session.updatedAt,loaded,dirty,busy]);
 useEffect(()=>{if(!dialog)return;const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy)close();};const previous=document.body.style.overflow;document.body.style.overflow='hidden';document.addEventListener('keydown',key);return()=>{document.body.style.overflow=previous;document.removeEventListener('keydown',key);};},[dialog,busy]);
 function close(){setDialog(null);if(dirty)void save().catch(e=>setNotice(e instanceof Error?e.message:'保存できませんでした。'));}
 async function upload(file:File,view:'style_reference'|'reference'){
  setBusy(true);try{const p=await readPhoto(file,view),j=sessionRef.current;
   change({...j,target:view==='style_reference'?{...j.target,styleReference:p}:{...j.target,reference:p,referenceHairMask:null,adjustmentDraft:null,confirmedAdjustmentId:null}});
  }catch(e){setNotice(e instanceof Error?e.message:'写真を読み込めませんでした。');}finally{setBusy(false);}
 }
 async function analyze(){
  if(!sessionRef.current.photos.length){setDialog('photos');setNotice('現在の本人写真を追加すると、髪と顔の分析を開始できます。');return;}
  abort.current?.abort();const controller=new AbortController();abort.current=controller;setBusy(true);setProgress('髪とお顔を確認しています。');
  try{const result=await analyzeCurrentPhotos(sessionRef.current,{signal:controller.signal,onProgress:setProgress});if(controller.signal.aborted)return;
   let j=reapplyCounselingHairInputs(commitPhotoAnalysis(sessionRef.current,result));
   if(j.diagnosisSession?.faceBoneAnalysis.activeEstimateId){try{j=planBangFaceFrameDesigns(j);}catch{/* Missing measured values remain unknown; do not seed a mock result. */}}
   change(j);setProgress(result.status==='FAILED'?'取得できた値がありません。写真を確認してください。':'髪と顔の分析を保存しました。');setNotice(result.status==='FAILED'?'解析を完了できませんでした。詳細をご確認ください。':'画像上の推定値です。骨格・毛髪状態は美容師が確認してください。');
  }catch(e){setProgress(e instanceof Error?e.message:'解析できませんでした。');}finally{setBusy(false);abort.current=null;}
 }
 async function openColor(index:number){
  setDialog('color');change(editCounseling(sessionRef.current,{selectedColorFamily:colorNames[index]}));
  if(!sessionRef.current.target.reference){setBusy(true);try{
   const response=await fetch(asset('current-front'));if(!response.ok)throw new Error('サンプル画像を読み込めませんでした。');
   const p=await readPhoto(new File([await response.blob()],'MOCK-visual-master-color.png',{type:'image/png'}),'reference');
   // Manual tracing of this specific design sample. Never classify it as automatic segmentation.
   const mask={...emptyHairMask(p.id),origin:'demo_hand_traced' as const,polygons:[[[.09,.18],[.24,.03],[.54,.01],[.77,.05],[.94,.24],[.98,.57],[.98,.99],[.76,.99],[.83,.77],[.81,.54],[.67,.38],[.57,.25],[.48,.31],[.35,.33],[.24,.5],[.21,.75],[.31,.96],[.15,1],[.01,.94],[.01,.48]].map(([x,y])=>({x,y}))]};
   change({...sessionRef.current,target:{...sessionRef.current.target,reference:p,referenceHairMask:mask,adjustmentDraft:null,confirmedAdjustmentId:null}});
  }catch(e){setNotice(e instanceof Error?e.message:'画像を確認してください。');}finally{setBusy(false);}}
 }
 async function handoff(){setBusy(true);try{change(confirmCounseling(sessionRef.current,selected?.design.id??null));await save();setDialog('handoff');}catch(e){setNotice(e instanceof Error?e.message:'相談を保存できませんでした。');}finally{setBusy(false);}}
 function chooseDesign(i:number){setSelectedPreview(i);if(planning?.proposals[i]){try{change(selectPlannedDesign(sessionRef.current,planning.proposals[i].id));}catch(e){setNotice(e instanceof Error?e.message:'採用する案を確認してください。');}}else change(editCounseling(sessionRef.current,{selectedMockPreview:String.fromCharCode(65+i)}));setDialog('design');}
 const chosenIndex=selected?selected.design.label.charCodeAt(0)-65:state.selectedMockPreview?state.selectedMockPreview.charCodeAt(0)-65:selectedPreview;
 const photoButton=(src:string,label:string,onClick:()=>void,classes='',mock=true)=><button className={`cfa-photo ${classes}`} type="button" onClick={onClick} title={mock?'MOCK · 正式デザイン画像から切り出した表示例':'登録した写真 · REAL'}><img src={src} alt={label+(mock?'（MOCK表示例）':'')} draggable="false"/></button>;
 const faceDone=Boolean(run?.faceEstimateId);
 const points=planning?.proposals.slice(0,4).map(d=>d.visualEffectDescription)??['ひし形シルエットで小顔効果','前髪と顔周りのレイヤーで柔らかい印象に','中間～毛先に動きをつけて女性らしさを演出','肌トーンに合うベージュ系で透明感アップ'];
 return <div className="cfa-counseling-outer"><link rel="stylesheet" href="/counseling-master/fonts/font.css" precedence="cfa-font"/><main className="cfa-counseling" data-visual-master="COUNSELING-APPROVED-20261007" data-testid="counseling-page-1">
  <header className="cfa-header"><button className="cfa-brand" type="button" onClick={()=>setDialog('states')} title="機能の状態とサンプルの出典を確認"><img src={asset('brand-mark')} alt=""/><span><strong>COLOR FUTURE AI</strong><small>HAIR DESIGN LAB</small></span></button><nav aria-label="カウンセリングの進行"><button aria-current="page" onClick={()=>window.scrollTo({top:0,behavior:'smooth'})}><b>1</b>カウンセリング</button><span aria-disabled="true"><b>2</b>施術設計</span><span aria-disabled="true"><b>3</b>アフターサポート</span></nav></header>
  <div className="cfa-page-lead"><h1>1. COUNSELING <span>（お客様と一緒に決める）</span></h1><p>現在の状態・なりたいイメージを確認し、AIが分析して最適なデザインをご提案します。</p></div>
  <div className="cfa-reference-grid">
   <section className="cfa-card cfa-current-card"><SectionTitle n={1} action={<button className="cfa-mini-button" onClick={()=>setDialog('photos')}>◯ 写真を変更</button>}>現在の髪の写真</SectionTitle><div className="cfa-current-photos">
    {photoButton(front?.dataUrl??asset('current-front'),'現在の髪・正面',()=>setDialog('photos'),'cfa-current-main',!front)}
    <div className="cfa-current-thumbs"><figure>{photoButton(front?.dataUrl??asset('current-front-small'),'正面',()=>setDialog('photos'),'',!front)}<figcaption>FRONT</figcaption></figure><figure>{photoButton(side?.dataUrl??asset('current-side'),'右側',()=>setDialog('photos'),'',!side)}<figcaption>SIDE</figcaption></figure><figure>{photoButton(back?.dataUrl??asset('current-back'),'後ろ',()=>setDialog('photos'),'',!back)}<figcaption>BACK</figcaption></figure><figure>{left?photoButton(left.dataUrl,'左側',()=>setDialog('photos'),'',false):<button type="button" className="cfa-blank-photo" aria-label="左側の写真を追加" onClick={()=>setDialog('photos')}/>}</figure></div>
   </div></section>
   <section className="cfa-card cfa-style-card"><SectionTitle n={2} onOpen={()=>setDialog('style')}>なりたいスタイルの写真</SectionTitle><div className="cfa-style-photos">{photoButton(session.target.styleReference?.dataUrl??asset('style-front'),'STYLE参考写真',()=>setDialog('style'),'cfa-style-main',!session.target.styleReference)}<div className="cfa-style-thumbs"><figure>{photoButton(session.target.styleReference?.dataUrl??asset('style-front-small'),'STYLE・正面',()=>setDialog('style'),'',!session.target.styleReference)}<figcaption>FRONT</figcaption></figure><figure>{photoButton(asset('style-back'),'STYLE・後ろの表示例',()=>setDialog('style'))}<figcaption>BACK</figcaption></figure></div></div></section>
  </div>
  <section className="cfa-card cfa-history-card"><SectionTitle n={4} action={<button className="cfa-mini-button" onClick={()=>change(resetCounselingInputs(sessionRef.current))}>◯ 入力をリセット</button>}>美容師による履歴・毛髪情報入力</SectionTitle>
   <div className="cfa-history-columns"><div className="cfa-segmented-form">{counselingRows.map(row=><fieldset key={row.key}><legend title={row.key==='porosity'?'薬剤の吸い込みやすさを美容師が確認':''}>{row.label}</legend><div>{row.options.map(option=><button type="button" key={option} aria-pressed={state.inputs[row.key]===option} className={(state.inputs[row.key]??row.preview)===option?'is-active':''} title={state.inputs[row.key]===null?'表示例。選択すると美容師の確認値として保存します。':`美容師確認: ${option}`} onClick={()=>change(setCounselingInput(sessionRef.current,row.key,option))}>{option}</button>)}</div></fieldset>)}</div>
    <div className="cfa-notes-form"><label>過去の施術履歴・使用薬剤など<textarea aria-label="過去の施術履歴・使用薬剤など" value={state.historyNote} maxLength={4000} placeholder={'例）2年前に縮毛矯正、1年前にハイライトとカラー'} onChange={e=>change(editCounseling(sessionRef.current,{historyNote:e.target.value,confirmation:null}))}/></label><label>お客様のご要望・お悩み<textarea aria-label="お客様のご要望・お悩み" value={state.requestNote} maxLength={4000} placeholder={'例）赤みを抑えたい、柔らかく見せたいなど'} onChange={e=>change(editCounseling(sessionRef.current,{requestNote:e.target.value,confirmation:null}))}/></label></div>
   </div><div className="cfa-analysis-action"><button type="button" className="cfa-gold-button" disabled={busy} onClick={()=>void analyze()}>{busy?'AIで総合分析中…':'AIで総合分析する'} <span>→</span></button></div>
  </section>
  <section className="cfa-card cfa-face-card"><SectionTitle n={5} action={<button className="cfa-mini-button" onClick={()=>setDialog('analysis')}>◯ 顔型傾向確認</button>}>AIによる骨格・顔型・パーソナル分析</SectionTitle><div className="cfa-face-content">{photoButton(front?.dataUrl??asset('face-front'),'顔・骨格分析',()=>setDialog('analysis'),'cfa-face-photo',!front)}<div className="cfa-face-results"><div className="cfa-trait-grid">
   <button onClick={()=>setDialog('analysis')} className="cfa-trait" title={faceDone?'AI画像推定・2D顔縦横比':'MOCK: 顔型の表示例'}><FaceIcon kind="face"/><span><small>顔型</small><strong>{faceDone?`縦横比 ${face.faceHeightWidthRatio.value?.toFixed(2)??'未取得'}`:front?'未解析':'卵型'}</strong></span></button>
   <button onClick={()=>setDialog('analysis')} className="cfa-trait" title="物理的な骨格分類は未実装"><FaceIcon kind="bone"/><span><small>骨格</small><strong>{front?'美容師確認':'バランス型'}</strong></span></button>
   <button onClick={()=>setDialog('analysis')} className="cfa-trait" title={front?'顔ランドマークの詳細':'MOCK: 印象の表示例'}><FaceIcon kind="balance"/><span><small>パーツバランス</small><strong>{faceDone?'位置関係を確認':front?'未解析':'大人可愛い'}</strong></span></button>
   </div><div className="cfa-point-grid"><button onClick={()=>setDialog('analysis')} className="cfa-trait cfa-skin" title="パーソナルカラー判定はMOCK／未実装"><FaceIcon kind="skin"/><span><small>肌トーン</small><strong>{front?'美容師確認':'イエベ春'}</strong></span></button><div className="cfa-face-points" title={planning?'実測ではない設計試案。美容師確認':'MOCK · 参考デザインに記載された表示例'}><h3>似合わせのポイント</h3><ul>{points.map((p,i)=><li key={i}>{p}</li>)}</ul></div></div></div></div></section>
  <section className="cfa-card cfa-bang-card"><SectionTitle n={6} onOpen={()=>setDialog('design')}>前髪・顔まわりデザイン提案</SectionTitle><div className="cfa-five-designs">{previewNames.map((name,i)=>{
   const job=s.hairSimulation?.jobs.findLast(j=>j.label===String.fromCharCode(65+i));const event=job?s.hairSimulation?.events.findLast(e=>e.jobId===job.id&&e.status==='COMPLETE'):null;const real=event?s.hairSimulation?.generatedAssets.find(a=>a.id===event.assetId&&a.origin==='REAL_API'):null;
   return <figure key={name}><button className={`cfa-photo ${state.selectedMockPreview===String.fromCharCode(65+i)||selected?.design.label===String.fromCharCode(65+i)?'is-selected':''}`} type="button" aria-label={`DESIGN ${String.fromCharCode(65+i)} ${name}`} onClick={()=>chooseDesign(i)} title={real?'REAL_API · 保存された生成画像':front?'実写生成は保留。写真は本人原本です。':'MOCK · デザインマスターの表示例'}><img src={real?.dataUrl??front?.dataUrl??asset(`bang-${String.fromCharCode(97+i)}`)} alt={real?'本人実写の生成画像':front?'本人原本・未生成':'MOCKの前髪表示例'}/></button><figcaption>{planning?.proposals[i]?.name??name}</figcaption></figure>;
  })}</div></section>
  <section className="cfa-card cfa-color-card"><SectionTitle n={7} onOpen={()=>void openColor(0)}>カラー微調整のプレビュー</SectionTitle><div className="cfa-color-swatches">{colorNames.map((name,i)=><figure key={name}><button className="cfa-photo" type="button" aria-label={`${name}のカラー微調整`} title="MOCK色見本。顔写真の髪だけをライブ調整する画面を開きます。" onClick={()=>void openColor(i)}><img src={asset(`color-${i}`)} alt={`${name}の表示例`}/></button><figcaption>{name}</figcaption></figure>)}</div></section>
  <section className="cfa-final-strip"><SectionTitle n={8} onOpen={()=>setDialog('final')}>仕上がりイメージ <small>（カウンセリング確定案）</small></SectionTitle><button className="cfa-gold-button" type="button" disabled={busy} onClick={()=>void handoff()}>このデザインで施術設計に進む <span>→</span></button></section>
 </main>
 {dialog&&<div className="cfa-dialog-backdrop" onClick={e=>{if(e.target===e.currentTarget&&!busy)close();}}><div role="dialog" aria-modal="true" aria-labelledby="cfa-dialog-title" className="cfa-dialog fiole-scope"><header><div><small>COLOR FUTURE AI · COUNSELING</small><h2 id="cfa-dialog-title">{{photos:'現在の髪の写真',style:'STYLE / COLOR を選ぶ',color:'顔写真で、髪色をすり合わせる',analysis:'髪とお顔の分析を確認',design:'前髪・顔まわり5案',final:'仕上がりイメージ',handoff:'カウンセリングを保存しました',states:'表示と機能の状態'}[dialog]}</h2></div><button type="button" className="cfa-close" aria-label="閉じる" disabled={busy} onClick={close}>×</button></header><div className="cfa-dialog-body">
  {dialog==='photos'&&<CurrentHairCapture photos={session.photos} busy={busy} onCommit={incoming=>{const directions=new Set(incoming.map(p=>p.view));change({...sessionRef.current,photos:[...sessionRef.current.photos.filter(p=>!directions.has(p.view)),...incoming],activeAnalysisId:null});return true;}} onRemove={id=>change({...sessionRef.current,photos:sessionRef.current.photos.filter(p=>p.id!==id),activeAnalysisId:null})}/>}
  {dialog==='style'&&<><nav className="cfa-editor-tabs"><button aria-current="page">STYLE｜なりたい髪型</button><button onClick={()=>void openColor(0)}>COLOR｜なりたいカラー →</button></nav><StyleReferenceEditor session={session} busy={busy} onUpload={file=>void upload(file,'style_reference')} onChange={change}/><label className="cfa-dialog-field">髪型の希望<textarea aria-label="髪型の希望" value={session.target.style} maxLength={2000} onChange={e=>change({...sessionRef.current,target:{...sessionRef.current.target,style:e.target.value}})}/></label><DesignPlanningPanel session={session} busy={busy} onChange={change}/></>}
  {dialog==='color'&&<><nav className="cfa-editor-tabs"><button onClick={()=>setDialog('style')}>STYLE｜なりたい髪型</button><button aria-current="page">COLOR｜なりたいカラー</button></nav>{session.target.reference?.name.startsWith('MOCK')&&<p className="cfa-trust-note">MOCK写真 · 手で指定した髪の範囲です。スライダーの画像補正・確定・保存は実際に動作します。</p>}<TargetColorEditor session={session} busy={busy} hasAnalysis={false} onUpload={file=>void upload(file,'reference')} onRemove={()=>change({...sessionRef.current,target:{...sessionRef.current.target,reference:null,referenceHairMask:null,adjustmentDraft:null,confirmedAdjustmentId:null}})} onDraft={draft=>change({...sessionRef.current,target:{...sessionRef.current.target,adjustmentDraft:draft}})} onConfirm={j=>{change(j);setNotice('調整後の髪色を独立したCOLORターゲットに保存しました。');}} onCalculate={()=>setNotice('施術設計はPage 1の承認後です。既存のレシピ機能とデータは保持しています。')} onSimulation={()=>setDialog('final')}/><label className="cfa-dialog-field">カラーの希望<textarea aria-label="カラーの希望" value={session.target.text} maxLength={2000} onChange={e=>change({...sessionRef.current,target:{...sessionRef.current.target,text:e.target.value}})}/></label></>}
  {dialog==='analysis'&&<><p className="cfa-trust-note">{front?'画像で取得した顔表面の位置と髪の色はAI ESTIMATEです。3D骨格・肌トーン・性格の診断は行いません。':'現在のカード写真・卵型・バランス型・肌トーン・似合わせ文章はMOCKの表示例です。本人写真の登録後、取得できた解析値だけを保存します。'}</p><PhotoAnalysisPanel session={session} busy={busy} progress={progress} onAnalyze={()=>void analyze()} onCancel={()=>abort.current?.abort()} onChange={change}/></>}
  {dialog==='design'&&<><p className="cfa-trust-note">{planning?'ESTIMATE · 顔の画像推定値から設計した試案です。実写生成はPhase 4.1で検証予定です。':'MOCK · 5枚の写真は承認画像の表示例です。本人写真の分析後、取得した値からA〜Eを設計します。'}</p><div className="cfa-dialog-five">{previewNames.map((name,i)=><button key={name} aria-pressed={chosenIndex===i} onClick={()=>{setSelectedPreview(i);if(planning?.proposals[i])change(selectPlannedDesign(sessionRef.current,planning.proposals[i].id));else change(editCounseling(sessionRef.current,{selectedMockPreview:String.fromCharCode(65+i)}));}}><img src={front?.dataUrl??asset(`bang-${String.fromCharCode(97+i)}`)} alt={front?'本人原本・未生成':'MOCKの前髪表示例'}/><span>DESIGN {String.fromCharCode(65+i)}</span><small>{planning?.proposals[i]?.name??name}</small></button>)}</div><DesignPlanningPanel session={session} busy={busy} onChange={change}/></>}
  {dialog==='final'&&<><div className="cfa-final-preview"><img src={generated?.dataUrl??confirmed?.previewPhoto.dataUrl??front?.dataUrl??asset('style-front')} alt={generated?.origin==='REAL_API'?'保存済み実生成画像':'理想イメージのプレビュー・実写生成前'}/><div><span className="salon-kicker">YOUR DESIGN</span><h3>{selected?.design.name??previewNames[chosenIndex]}</h3><p>STYLE｜{session.target.styleReference?session.target.styleReference.name:'参考写真の表示例'}</p><p>COLOR｜{confirmed?'調整後のターゲットを確定済み':'未確定'}</p><p>{generated?.origin==='REAL_API'?'REAL_API · 保存済みの生成画像':'PARTIAL · 本人への髪型とカラーの実写統合生成は未検証です。ここに表示する調整画像は完成保証ではありません。'}</p><button className="cfa-gold-button" onClick={()=>void handoff()}>このデザインで施術設計に進む →</button></div></div></>}
  {dialog==='handoff'&&<><p>写真・美容師入力・解析・STYLE・COLOR・選択案を、同じDiagnosisSessionに保存しました。</p><p>Page 2「施術設計」は、Page 1をご確認いただいた後に進めます。</p><p className="cfa-trust-note">現在はPage 1のデモです。実画像生成は保留。必要アンダー・FIOLE最適処方は未実装です。</p><button className="cfa-gold-button" onClick={close}>カウンセリングへ戻る</button></>}
  {dialog==='states'&&<><p className="cfa-trust-note">復旧版 b94d6b2 を基準にしたPage 1です。初期写真・前髪写真・色見本・人物分類は、正式Visual MasterからのMOCK表示例です。画像生成APIは今回呼び出していません。</p><FeatureStatePanel session={s}/></>}
 </div></div></div>}
 {(notice||busy&&progress)&&<div className="cfa-notice" role="status"><span>{busy&&progress?progress:notice}</span>{!busy&&<button aria-label="通知を閉じる" onClick={()=>setNotice('')}>×</button>}</div>}
 </div>;
}
