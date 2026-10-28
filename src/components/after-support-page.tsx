'use client';
import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import type {CatalogData} from '@/lib/catalog';
import {newJourney,validateJourney,type Journey} from '@/lib/journey';
import {withDiagnosisSession} from '@/lib/session-adapter';
import {deviceJourneyStore} from '@/lib/journey-store';
import {reconcileSavedSnapshot} from '@/lib/save-reconciliation';
import {counselingSaveQueue} from '@/lib/counseling-save-queue';
import {loadCounselingDraft,saveCounselingDraft} from '@/lib/counseling-draft-store';
import {ensureAfterSupport,supportView,supportBangImage,visibleSupportAsset,supportSlot,queueSupportImage,startSupportImage,finishSupportImage,failSupportImage,appendSupportPlan,reconcileSupport} from '@/lib/after-support-session';
import {makeupThemes,makeupNames,type SupportPurpose,type SupportPlan,type FinishPhotoRole} from '@/lib/after-support-types';
import {supportFinishPhotos,supportProductCopy,supportStylist,supportPaletteSlots,supportDesignPoints,supportFaceRows,supportNextToneLabel} from '@/lib/after-support-presentation';
import {familyNames,type HomeCareFocus} from '@/lib/pro-design-types';
import {requestSupportComparison} from '@/lib/support-comparison-client';
import {supportImageClient} from '@/lib/after-support-client';
import {requestSupportPlan} from '@/lib/after-support-plan';
import {SimulationTransportError} from '@/lib/hair-simulation-client';
import CounselingFaceOverlay from './counseling-face-overlay';
import AfterSupportSheet from './after-support-sheet';
import {fitSupportNextCopy} from '@/lib/support-text-fit';
import {restoreSupportSources} from '@/lib/after-support-restore';
const asset=(name:string)=>'/after-support-master/'+name+'.jpg';
const designNames=['前髪あり','シースルーバング','センターバング','顔まわりレイヤー','ワイドバング'];
const designCaptions=['やわらか・ナチュラル','抜け感・上品','大人・落ち着き','小顔・くびれ感','モード・おしゃれ'];
const careText:Record<HomeCareFocus,string>={COLOR_RETENTION:'色持ちに配慮し、ぬるま湯でやさしく洗いましょう。',DAMAGE:'髪の状態に合わせて、サロンで選んだケアを続けましょう。',HEAT:'熱を当てすぎず、サロンで案内された温度を目安にしましょう。',DRYNESS:'毛先の乾燥に合わせて、選んだ保湿ケアを取り入れましょう。',UV:'屋外では帽子などで、髪を強い日差しから守りましょう。'};
const demoNext=[['柔らかベージュ','やわらかく透明感のある上品なベージュカラー'],['ピンクベージュ','血色感とツヤのあるやさしいピンクベージュ'],['オリーブベージュ','赤みを抑えた大人のオリーブベージュ']];
const demoPalettes=[['#ddc3ac','#c99f7e','#ad7755','#77513d','#4e372d'],['#e4c7c8','#ce979e','#c56d7a','#a84f62','#86364c'],['#eab890','#d69568','#ab6f47','#955133','#6e3d2a']];
function Title({n,children,note}:{n:number;children:ReactNode;note?:ReactNode}){return <div className="as-heading"><h2><b>{n}</b>{children}</h2>{note&&<small>{note}</small>}</div>;}
function CheckList({items,minSlots=0}:{items:string[];minSlots?:number}){return <ul className="as-check-list">{Array.from({length:Math.max(items.length,minSlots)},(_,i)=>{const text=items[i];return <li key={i} data-missing={!text||undefined}><b>{text?'✓':'—'}</b><span>{text??'説明未確定'}</span></li>;})}</ul>;}
function VisitIcon({kind}:{kind:'calendar'|'scissors'|'note'}){return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.7" aria-hidden="true">{kind==='calendar'?<><rect x="7" y="10" width="34" height="32" rx="3"/><path d="M7 19h34M16 5v11M33 5v11M14 26h4m7 0h4m5 0h1M14 33h4m7 0h4"/></>:kind==='scissors'?<><circle cx="13" cy="37" r="6"/><circle cx="34" cy="37" r="6"/><path d="m17 33 21-26c6 4-2 13-13 21M30 33 10 7c-7 4 1 13 14 21"/></>:<><rect x="12" y="7" width="25" height="35" rx="2"/><path d="M18 15h13M18 22h13M18 29h9M18 36h9"/></>}</svg>;}
export default function AfterSupportPage({data,onCounseling,onProDesign}:{data:CatalogData;onCounseling?:()=>void;onProDesign?:()=>void}){
 const sheet=useRef<HTMLElement>(null);
 const [store]=useState(()=>deviceJourneyStore(data)),[queue]=useState(counselingSaveQueue);
 const [journey,setJourney]=useState<Journey>(()=>ensureAfterSupport({...newJourney(),title:'カラー・デザインカウンセリング'}));
 const ref=useRef(journey),busyRef=useRef(false);ref.current=journey;
 useLayoutEffect(()=>{let cancelled=false;const fit=()=>{if(!cancelled&&sheet.current)fitSupportNextCopy(sheet.current);};fit();void document.fonts.ready.then(fit);return()=>{cancelled=true;};},[journey.updatedAt]);
 const [loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[imageConnection,setImageConnection]=useState<'CHECKING'|'READY'|'NOT_CONFIGURED'|'UNAVAILABLE'>('CHECKING'),[textConnection,setTextConnection]=useState<'CHECKING'|'READY'|'NOT_CONFIGURED'|'UNAVAILABLE'>('CHECKING');
 const [restoreError,setRestoreError]=useState('');
 const v=supportView(journey),s=journey.diagnosisSession!,a=s.afterSupport!,person=journey.photos.find(x=>x.view==='front'),demo=!restoreError&&!v.handoff&&!journey.photos.some(x=>['front','right','left','side','back'].includes(x.view));
 function change(next:Journey){ref.current=next;setJourney(next);}
 const save=()=>queue.run(async()=>{const snapshot=ref.current;let complete=false;try{validateJourney(snapshot,data);complete=true;}catch{/* Incomplete counseling stays in its existing draft store. */}
  const saved=complete?await store.save(snapshot):snapshot,current=ref.current,next=reconcileSavedSnapshot(current,snapshot,saved,data);
  await saveCounselingDraft(next);if(saved.id)localStorage.setItem('color-future-ai-counseling-page1:last-session',saved.id);change(next);return next;});
 useEffect(()=>{let cancelled=false;void(async()=>{try{const id=localStorage.getItem('color-future-ai-counseling-page1:last-session'),restored=await restoreSupportSources(id,key=>store.load(key),loadCounselingDraft),previous=restored.journey;
  if(!cancelled){setRestoreError(restored.errors.join('／'));const next=reconcileSupport(previous??ref.current);change(next);if(previous&&!restored.errors.length)await saveCounselingDraft(next);}
 }catch(e){if(!cancelled)setRestoreError(e instanceof Error?e.message:'保存データを読み込めませんでした。');}finally{if(!cancelled)setLoaded(true);}})();return()=>{cancelled=true;};},[store]);
 useEffect(()=>{let cancelled=false;for(const [url,update]of [['/api/after-support/generate',setImageConnection],['/api/after-support/plan',setTextConnection]] as const)void fetch(url,{cache:'no-store'}).then(async r=>{const x=await r.json();if(!cancelled)update(r.ok?x.configured?'READY':'NOT_CONFIGURED':'UNAVAILABLE');}).catch(()=>{if(!cancelled)update('UNAVAILABLE');});return()=>{cancelled=true;};},[]);
 useEffect(()=>{if(loaded&&v.handoff&&!v.source)setNotice('Page 2の確定情報は読み込み済みです。人物画像はPage 1で顔・色・境界を確認して完成案を採用した後、Page 2で再確定してください。');},[loaded,v.handoff?.id,v.source?.finalAssetId]);
 async function navigate(page:1|2){try{await save();if(page===1&&onCounseling)onCounseling();else if(page===2&&onProDesign)onProDesign();else window.location.assign(page===1?'/fiole/counseling-page1':'/fiole/pro-design');}catch{setNotice('保存に失敗しました。画面を移動せず内容を保持しています。');}}
 async function acquirePlan(task:SupportPlan['task']){
  const current=ref.current,view=supportView(current),existing=current.diagnosisSession!.afterSupport!.plans.findLast(x=>x.task===task&&x.handoffId===view.handoff?.id&&x.sourceType==='AI_ESTIMATE');if(existing)return existing;
  if(textConnection!=='READY')throw new Error('APIキー未設定または接続不能のため、AI提案は未取得です。');
  const plan=await requestSupportPlan(current,task);change(appendSupportPlan(ref.current,plan));await save();return plan;
 }
 async function generate(purpose:SupportPurpose,index:number){
  if(busyRef.current||!loaded)return;
  if(visibleSupportAsset(ref.current,purpose,index))return;
  if(imageConnection!=='READY'){setNotice('APIキー未設定または接続不能のため、実画像生成はできません。保存情報は保持しています。');return;}
  if(!supportView(ref.current).source){setNotice('Page 1の本人実写完成画像を生成し、Page 2で内容を確定してください。');return;}
  busyRef.current=true;let jobId:string|null=null;const batchJobIds:string[]=[];
  try{if(purpose!=='NEXT_COLOR')await acquirePlan(purpose==='MAKEUP'?'MAKEUP':'FADE');
   const indices=purpose==='FADE_COLOR'?[1,2,3]:[0,1,2];
   if(indices.every(i=>!visibleSupportAsset(ref.current,purpose,i))){
    const requests=[];let next=ref.current;
    for(const i of indices){const queued=queueSupportImage(next,purpose,i);if(queued.cached)throw new Error('この条件は生成中です。完了または手動再試行をお待ちください。');next=startSupportImage(queued.journey,queued.request.jobId);requests.push(queued.request);batchJobIds.push(queued.request.jobId);}
    change(next);await save();setNotice('同じ本人の3案を1回で生成中です。シートと保存済み情報は操作できます。');
    const results=await requestSupportComparison(requests,supportView(ref.current).finalImage!);
    next=ref.current;for(let i=0;i<requests.length;i++)next=finishSupportImage(next,requests[i],results[i],results[i].width,results[i].height);
    change(next);await save();setNotice('3案を保存しました。本人・色・境界の見え方を確認してください。');return;
   }
   const prepared=queueSupportImage(ref.current,purpose,index);if(prepared.cached){setNotice('この条件の生成結果は保存済み、または生成中です。');return;}
   jobId=prepared.request.jobId;change(startSupportImage(prepared.journey,jobId));await save();setNotice('同じ本人の確定デザインから、指定範囲の色だけを生成中です。');
   const result=await supportImageClient()(prepared.request,supportView(ref.current).finalImage!);change(finishSupportImage(ref.current,prepared.request,result,result.width,result.height));await save();setNotice('生成画像を保存しました。見え方は参考シミュレーションです。');
  }catch(e){for(const id of batchJobIds){const x=e instanceof SimulationTransportError?e:null;change(failSupportImage(ref.current,id,{code:x?.code??'comparison_failed',message:e instanceof Error?e.message:'比較生成失敗',providerAttempted:x?.providerAttempted??false,outcomeUnknown:x?.outcomeUnknown??false}));}if(batchJobIds.length){try{await save();}catch{/* Keep local selection for retry. */}}if(jobId){const x=e instanceof SimulationTransportError?e:null;change(failSupportImage(ref.current,jobId,{code:x?.code??'generation_error',message:e instanceof Error?e.message:'生成できませんでした。',providerAttempted:x?.providerAttempted??false,outcomeUnknown:x?.outcomeUnknown??false}));try{await save();}catch{/* Keep the visible session if persistence is unavailable. */}}
   setNotice(e instanceof Error?e.message:'生成できませんでした。');
  }finally{busyRef.current=false;setBusy(false);}
 }
 useEffect(()=>{if(loaded&&imageConnection==='READY'&&v.source&&!v.sourceStale&&!a.jobs.some(job=>job.purpose==='NEXT_COLOR'&&job.source.handoffId===v.handoff?.id))void generate('NEXT_COLOR',0);},[loaded,imageConnection,v.handoff?.id,v.source?.finalAssetId,a.jobs.length]);
 async function productReason(){if(busyRef.current)return;busyRef.current=true;setBusy(true);try{await acquirePlan('PRODUCT');setNotice('AI参考文を保存しました。美容師による確認が必要です。');}catch(e){setNotice(e instanceof Error?e.message:'AI提案を取得できませんでした。');}finally{busyRef.current=false;setBusy(false);}}
 function photo(name:string,label:string,src:string|null=null,onClick?:()=>void,extra='',generationState?:string,origin:'REAL_API'|'EMPIRICAL'='REAL_API'){
  const status=src?origin:demo?'MOCK':generationState==='GENERATING'||generationState==='QUEUED'?'生成中':generationState==='FAILED'?'生成失敗・再試行':imageConnection==='NOT_CONFIGURED'?'APIキー未設定・未生成':'未生成';
  return <div className={'as-photo '+extra}>{src||demo?<img src={src??asset(name)} alt={label+(src?'':'（MOCK：Visual Masterの表示例）')}/>:<span className="as-empty">{status}</span>}<small>{status}</small>{onClick&&<button type="button" aria-label={label+'を生成または再試行'} title={src?'保存済み画像':label+'を生成'} disabled={busy||!loaded} onClick={onClick}/>}</div>;
 }
 function generated(purpose:SupportPurpose,index:number,name:string,label:string){const img=visibleSupportAsset(journey,purpose,index),job=a.jobs.findLast(x=>x.slot===supportSlot(purpose,index));return <div className="as-generated" data-job-status={job?.status??'NOT_STARTED'}>{photo(name,label,img?.dataUrl??null,()=>void generate(purpose,index),'',job?.status)}{!demo&&!img&&job?.status==='FAILED'&&<span className="as-image-status">生成失敗・タップで再試行</span>}</div>;}
 const plan=(task:SupportPlan['task'])=>a.plans.findLast(p=>p.task===task&&p.handoffId===v.handoff?.id&&p.sourceType==='AI_ESTIMATE');
 const faceEstimateId=v.faceEstimateId,run=s.photoAnalysis?.runs.find(r=>r.faceEstimateId===faceEstimateId),facePhoto=run?.photos.find(p=>p.direction==='FRONT'&&p.faceLandmarks.length>0),faceOriginal=facePhoto?journey.photos.concat(journey.analysisPhotoArchive??[]).find(p=>p.id===facePhoto.imageId):person;
 const metric=(key:keyof typeof v.faceValues)=>{const f=v.faceValues[key];return f?.value!==null&&f?.value!==undefined&&f.sourceType!=='MOCK'?f.value:null;},ratio=metric('faceHeightWidthRatio');
 const faceRows=supportFaceRows(v,Boolean(facePhoto));
 const selectedProducts=(v.aftercare?.productSnapshots??[]).filter(p=>v.aftercare!.productIds.includes(p.productId));
 const currentMessage=v.message;
 const finishPhotos=supportFinishPhotos(journey,v),stylist=supportStylist(journey,v),designPoints=supportDesignPoints(journey,v),nextVisitWeeks=v.aftercare?.visitWeeks??v.aftercare?.customWeeks;
 const finishPhoto=(role:FinishPhotoRole,name:string,label:string)=>{const image=finishPhotos[role];return photo(name,label,image?.src??null,undefined,'',undefined,image?.origin);};
 const caption=restoreError||notice||(v.sourceStale?'確定後に条件が変更されています。Page 2で再確認してください。':demo?'MOCK：Visual Masterの写真による表示例。本人生成・診断結果ではありません。':!v.handoff?'Page 2で確定した内容がまだありません。':imageConnection==='NOT_CONFIGURED'?'APIキー未設定：実画像生成は未検証。確定済みの内容を表示しています。':'');
 return <AfterSupportSheet revision={journey.updatedAt+'|'+imageConnection+'|'+textConnection+'|'+caption} ready={loaded} busy={busy}><link rel="stylesheet" href="/counseling-master/fonts/font.css" precedence="cfa-font"/><main ref={sheet} className="as-page" data-testid="after-support-page-3" data-visual-master="file_00000000f32482119c3b33f882402882" aria-busy={busy}>
 <header className="as-header"><div className="as-brand"><img src="/counseling-final/brand-mark.png" alt=""/><span><strong>COLOR FUTURE AI</strong><small>HAIR DESIGN LAB</small></span></div><nav aria-label="診断の進行"><button type="button" onClick={()=>void navigate(1)}><b>1</b>カウンセリング</button><i/><button type="button" onClick={()=>void navigate(2)}><b>2</b>施術設計</button><i/><button type="button" className="as-current-step" aria-current="page" onClick={()=>window.scrollTo({top:0,behavior:'smooth'})}><b>3</b>アフターサポート</button></nav></header>
 <div className="as-lead"><h1>3. AFTER SUPPORT <span>（お客様のためのアフターサポート）</span></h1><p>今回の施術内容と今後のご提案をまとめました。ヘアスタイル・カラーをもっと楽しむための情報をご紹介します。</p>{caption&&<small role="status" data-html2canvas-ignore>{caption}</small>}</div>
 <div className="as-top-grid">
 <section className="as-card as-finish" data-section="finish"><Title n={1}>今回の仕上がり</Title><div className="as-finish-grid"><figure className="as-front">{finishPhoto('FRONT','front','今回の仕上がり FRONT')}<figcaption>FRONT</figcaption></figure><figure className="as-side">{finishPhoto('SIDE','side','今回の仕上がり SIDE')}<figcaption>SIDE</figcaption></figure><figure className="as-back">{finishPhoto('BACK','back','今回の仕上がり BACK')}<figcaption>BACK</figcaption></figure><figure className="as-frame">{finishPhoto('FACE_FRAME','frame','顔まわり')}<figcaption>顔まわり</figcaption></figure><figure className="as-detail">{finishPhoto('HAIR_DETAIL','hair-detail','髪まわり')}<figcaption>髪まわり</figcaption></figure><figure className="as-texture">{finishPhoto('COLOR_TEXTURE','texture','カラーの質感')}<figcaption>カラーの質感</figcaption></figure></div></section>
 <section className="as-card as-next" data-section="next"><Title n={2}>次回おすすめカラー（3パターン）</Title><div className="as-three">{[0,1,2].map(i=>{const option=v.nextColors[i];return <article key={i}>{generated('NEXT_COLOR',i,'next-'+i,'次回カラー '+String.fromCharCode(65+i))}<div className="as-option-title"><b>{String.fromCharCode(65+i)}</b><strong>{option?familyNames[option.family]:demo?demoNext[i][0]:'Page 2で未確定'}</strong></div><p className="as-tone">{supportNextToneLabel(option,v.targetLevel)}</p><p className="as-description">{option?.reason??(demo?demoNext[i][1]:'美容師の確定内容を引き継ぎます。')}</p></article>;})}</div></section>
 </div>
 <section className="as-card as-fade" data-section="fade"><Title n={3}>カラーの色落ち予測（今回のカラー）</Title><div className="as-fade-body"><div className="as-four">{[0,1,2,3].map(i=><article key={i}>{i===0?photo('fade-0','施術直後',v.finalImage):generated('FADE_COLOR',i,'fade-'+i,2*i+'週間後の参考予測')}<strong>{i===0?'施術直後':2*i+'週間後'}</strong><p>{i===0?v.targetLevel!==null?v.targetLevel+' Lv':'明るさ 未算出':'AI視覚予測・未検証'}</p>{i<3&&<span className="as-arrow" aria-hidden="true">›</span>}</article>)}</div><aside className="as-soft as-fade-points"><h3>色落ちのポイント</h3><CheckList items={plan('FADE')?.items.map(x=>x.key+'週間後：'+x.description)??['色の変化は、髪の状態やお手入れで異なります。','時間経過の色味は未検証の参考予測として表示します。','正確な退色率や明るさは、実測データが不足しています。','美容師が選んだホームケアをご確認ください。']}/></aside></div></section>
 <section className="as-card as-bangs" data-section="bangs"><Title n={4} note="今回のスタイルから選べるバリエーション">前髪・顔まわりデザイン（5案）</Title><div className="as-five">{(['A','B','C','D','E'] as const).map((label,i)=>{const img=supportBangImage(journey,label);return <article key={label}>{photo('bang-'+i,'DESIGN '+label,img?.dataUrl??null)}<div className="as-option-title"><b>{label}</b><div><strong>{designNames[i]}</strong><p>{designCaptions[i]}</p></div></div></article>;})}</div></section>
 <div className="as-face-makeup-grid">
 <section className="as-card as-face" data-section="face"><Title n={5}>AIによる骨格・顔型・パーソナル分析（再掲）</Title><div className="as-face-body"><div className="as-face-image">{faceOriginal?<img src={faceOriginal.original?.dataUrl??faceOriginal.dataUrl} alt="Page 1の本人正面写真"/>:demo?<img src={asset('face')} alt="MOCK：分析カードの表示例"/>:<span className="as-empty">分析用正面写真未取得</span>}{facePhoto&&faceOriginal&&<CounselingFaceOverlay points={facePhoto.faceLandmarks} width={facePhoto.originalWidth} height={facePhoto.originalHeight} ratio={ratio}/>}<small>{facePhoto?'画像上の推定・再掲':demo?'MOCK・分析値未取得':'分析値未取得'}</small></div><div className="as-analysis-table"><h3>分析結果</h3><table><tbody>{faceRows.map(([label,value])=><tr key={label}><th>{label}</th><td>{value}</td></tr>)}</tbody></table></div><aside className="as-soft as-design-points"><h3>似合うデザインのポイント</h3><CheckList items={designPoints} minSlots={4}/></aside></div></section>
 <section className="as-card as-makeup" data-section="makeup"><Title n={6}>似合うメイクカラー（3パターン）</Title><div className="as-three">{makeupThemes.map((theme,i)=>{const item=plan('MAKEUP')?.items.find(x=>x.key===theme);return <article key={theme}>{generated('MAKEUP',i,'makeup-'+i,'メイク '+makeupNames[theme])}<div className="as-option-title"><b>{String.fromCharCode(65+i)}</b><strong>{makeupNames[theme]}</strong></div><p className="as-description">{item?.description??(demo?['透明感のある上品な印象','やさしく可愛い女性らしい印象','ヘルシーで明るい印象'][i]:'AI提案未取得')}</p><div className="as-palette" aria-label="メイクのカラーパレット">{supportPaletteSlots(item?.palette??(demo?demoPalettes[i]:[])).map((c,index)=><span key={index} data-missing={!c||undefined} style={c?{backgroundColor:c}:undefined} title={c??'カラー未取得'}/>)}</div></article>;})}</div></section>
 </div>
 <div className="as-products-care-grid">
 <section className="as-card as-products" data-section="products"><Title n={7}>おすすめホームケア商品（サロンで選んだ商品）</Title><div className="as-product-list">{Array.from({length:3},(_,i)=>{const product=selectedProducts[i],copy=product?supportProductCopy(journey,v,product):null;return <article key={product?.productId??i}>{product?<><div className="as-product-image">{copy?.image?<img src={copy.image} alt={product.productName}/>:<span>商品画像未登録</span>}</div><div className="as-product-copy"><span>{product.brand}</span><strong>{product.productName}</strong><small>{({SHAMPOO:'シャンプー',TREATMENT:'トリートメント',OIL:'オイル',MILK:'ミルク',MIST:'ミスト',STYLING:'スタイリング',SCALP:'スカルプ',OTHER:'その他'}[product.category])}</small><button type="button" disabled={busy} title="美容師確認用のAI参考文を保存" onClick={()=>void productReason()}>{copy?.reason||'おすすめ理由は美容師確認待ちです。'}</button><p>{copy?.usageAdvice??'使用方法未登録'}</p></div></>:<div className="as-product-empty">Page 2で商品未選択<br/><small>登録商品だけを表示します。</small></div>}</article>;})}</div></section>
 <section className="as-card as-homecare" data-section="care"><Title n={8}>ホームケアのポイント</Title><CheckList items={v.aftercare?.homeCare.map(x=>careText[x])??[]}/>{!v.aftercare?.homeCare.length&&<p className="as-unselected">Page 2でホームケアを選択してください。</p>}</section>
 </div>
 <div className="as-bottom-grid">
 <section className="as-card as-visit" data-section="visit"><Title n={9}>次回来店提案</Title><div className="as-visit-items"><article><VisitIcon kind="calendar"/><div><small>次回来店の目安</small><strong>{nextVisitWeeks!==null&&nextVisitWeeks!==undefined?nextVisitWeeks+'週間後':'未設定'}</strong></div></article><article><VisitIcon kind="scissors"/><div><small>次回おすすめメニュー</small><strong>{v.aftercare?.menuSnapshot?.name??'メニュー未選択'}</strong></div></article><article><VisitIcon kind="note"/><div><small>次回カラー提案</small>{v.nextColors.length?v.nextColors.map((c,i)=><p key={c.family}>{String.fromCharCode(65+i)}：{familyNames[c.family]}</p>):<p>Page 2で未確定</p>}</div></article></div></section>
 <section className="as-card as-message" data-section="message"><Title n={10}>担当美容師からのメッセージ</Title><div className="as-message-body"><figure><div className="as-stylist-avatar">{stylist.photo?<img src={stylist.photo} alt={'担当美容師 '+stylist.name}/>:stylist.name.slice(0,1)||'—'}</div><figcaption>{stylist.name?'担当 '+stylist.name:'担当者未登録'}</figcaption></figure><div><p data-testid="confirmed-stylist-message">{currentMessage||'Page 2で確認・確定したメッセージをそのまま表示します。'}</p><small>スタイリスト</small></div></div></section>
 </div>
 </main></AfterSupportSheet>;
}

