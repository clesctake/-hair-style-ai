'use client';
import { useEffect, useRef, useState } from 'react';
import type { Journey } from '@/lib/journey';
import type { JourneySample } from '@/lib/journey-sample';
import { hairImageInput, matchingHairImage, type GeneratedHairImage, type HairImageGenerator } from '@/lib/hair-images';
import { confirmedTargetAdjustment, pendingTargetAdjustment } from '@/lib/target-adjustment';
import {simulationMode,simulationModeLabels} from '@/lib/design-target';

type Connection = 'checking' | 'ready' | 'not_configured' | 'error' | 'offline_preview';
export default function HairImagePanel({ session, sampleCase, matchingSample, generator, onGenerated }: {
  session: Journey;
  sampleCase?: JourneySample;
  matchingSample: boolean;
  generator?: HairImageGenerator;
  onGenerated: (image: GeneratedHairImage) => void;
}) {
  const [connection, setConnection] = useState<Connection>(generator ? 'checking' : 'offline_preview');
  const [generating, setGenerating] = useState(false), [error, setError] = useState('');
  const [checkVersion, setCheckVersion] = useState(0);
  const pending = useRef<AbortController | null>(null), attempt = useRef(0);
  const input = hairImageInput(session), image = matchingHairImage(session);
  const sample = !image && matchingSample ? sampleCase?.preview : undefined;
  const mode=simulationMode(session);
  const phase3Design=Boolean(session.diagnosisSession?.designPlan.planning?.runs.length);
  const adjustedTarget = mode!=='style_only'&&!image && !sample && !pendingTargetAdjustment(session) ? confirmedTargetAdjustment(session) : undefined;

  useEffect(() => {
    let cancelled = false;
    if (!generator) { setConnection('offline_preview'); return; }
    setConnection('checking');
    void generator.status().then(status => {
      if (!cancelled) setConnection(status.configured ? 'ready' : 'not_configured');
    }).catch(() => { if (!cancelled) setConnection('error'); });
    return () => { cancelled = true; };
  }, [generator, checkVersion]);

  useEffect(() => {
    attempt.current++;
    pending.current?.abort();
    pending.current = null;
    setGenerating(false);
    setError('');
    return () => { attempt.current++; pending.current?.abort(); };
  }, [input?.context]);

  async function generate() {
    if (!generator || !input || generating || connection !== 'ready') return;
    const sequence = ++attempt.current, controller = new AbortController();
    pending.current = controller;
    setGenerating(true); setError('');
    const timeout = setTimeout(() => controller.abort(new DOMException('待ち時間を超えました。', 'TimeoutError')), 300000);
    try {
      const result = await generator.generate(input, controller.signal);
      if (sequence === attempt.current && !controller.signal.aborted) onGenerated(result);
    } catch (err) {
      if (sequence === attempt.current) setError(controller.signal.aborted
        ? '生成の待ち時間を超えました。時間をおいて再試行してください。'
        : err instanceof Error ? err.message : '画像を生成できませんでした。');
    } finally {
      clearTimeout(timeout);
      if (sequence === attempt.current) { setGenerating(false); pending.current = null; }
    }
  }

  function cancel() {
    attempt.current++;
    pending.current?.abort(); pending.current = null;
    setGenerating(false);
    setError('表示の待機を止めました。送信済みの生成はサーバー側で完了する場合があります。');
  }

  return <><div className="salon-input-roles"><div className="salon-reference-heading"><div><span className="salon-kicker">YOUR DESIGN</span><h3>本人 × 形 × 色</h3></div><span className="salon-label">{mode?simulationModeLabels[mode]:'写真から、はじめる'}</span></div><div className="salon-role-pictures">
   <figure>{session.photos[0]?<img src={(session.photos.find(p=>p.view==='front')??session.photos[0]).dataUrl} alt="YOUR DESIGN 本人写真"/>:<div>本人写真</div>}<figcaption>YOU · 本人</figcaption></figure><span aria-hidden="true">＋</span>
   <figure className={mode==='color_only'?'is-unused':''}>{session.target.styleReference?<img src={session.target.styleReference.dataUrl} alt="YOUR DESIGN STYLE 形の参考"/>:<div>STYLEの希望文・前髪案</div>}<figcaption>STYLE · {mode==='color_only'?'現在の形を維持':'形'}</figcaption></figure><span aria-hidden="true">＋</span>
   <figure className={mode==='style_only'?'is-unused':''}>{session.target.reference?<img src={(confirmedTargetAdjustment(session)?.previewPhoto??session.target.reference).dataUrl} alt="YOUR DESIGN COLOR 色の参考"/>:<div>COLORの希望文</div>}<figcaption>COLOR · {mode==='style_only'?'現在色を維持':'色'}</figcaption></figure>
  </div><p className="salon-help">以前の単枚生成・互換機能です。MAIN→A〜Eの正式生成と別に、過去の画像履歴を保持します。</p>{phase3Design&&<p className="planning-alert">Phase 3のA〜Eは、STEP 04のMAIN DESIGNと前髪5案から生成します（PARTIAL・実API未検証）。この旧単枚ルートには設計5案を混ぜません。</p>}</div><div className="salon-simulation">
    <div className="salon-before-after">
      <figure>{(input?.current ?? session.photos[0])
        ? <img src={(input?.current ?? session.photos[0]).dataUrl} alt="シミュレーションのBefore"/>
        : <div className="salon-image-empty">現在写真</div>}<figcaption>Before</figcaption></figure>
      <span className="salon-transition" aria-hidden="true">→</span>
      <figure aria-busy={generating}>{image
        ? <img src={image.dataUrl} alt="今回AIが生成した仕上がりイメージ"/>
        : sample ? <img src={sample.dataUrl} alt="事前生成した仕上がりイメージ"/>
        : adjustedTarget ? <img src={adjustedTarget.previewPhoto.dataUrl} alt="確定した調整後の目標写真"/>
        : <div className="salon-image-empty">{generating ? <span className="salon-generation-spinner" aria-hidden="true"/> : null}
          {generating ? '髪のイメージを生成中' : 'あなたの次のスタイル'}<small>{generating ? 'このままお待ちください' : '本人写真と希望を入力'}</small></div>}
        <figcaption>{image ? 'AI生成イメージ' : sample ? 'サンプル' : adjustedTarget ? '目標（調整後）' : 'イメージ'}</figcaption></figure>
    </div>
    <div className="salon-simulation-copy">
      <h3>{session.target.text || 'あなたの理想を、ここから。'}</h3>
      <p>{mode==='style_only'?'本人の髪色を保ち、STYLEと前髪・顔周りの希望を反映。':mode==='color_only'?'本人の髪型を保ち、COLORの色味だけを反映。':'本人の顔・表情・背景を保ち、STYLEの形とCOLORの色を組み合わせます。'}</p>
      {image && <span className="salon-label">今回の入力からAI生成</span>}
      {sample && <span className="salon-label">事前生成したサンプル画像</span>}
      {adjustedTarget && <span className="salon-label">理想の参考画像 · AI合成前</span>}
      <button className="salon-primary salon-generate" disabled={!input || connection !== 'ready' || generating} onClick={() => void generate()}>
        {generating ? '仕上がりイメージを生成中…' : image ? 'この条件でもう一度生成する →' : 'この写真と希望から画像を生成する →'}
      </button>
      <p className="salon-generation-status" role="status">{generating ? '生成中です。完了すると右側の写真が切り替わります。'
        : connection === 'checking' ? '画像生成の接続を確認しています…'
        : connection === 'not_configured' ? '画像生成の接続設定が必要です。'
        : connection === 'error' ? '画像生成の接続状態を確認できません。'
        : connection === 'offline_preview' ? 'この埋め込みプレビューでは画像生成を利用できません。'
        : !input ? '本人写真と、選んだ対象の参考写真または希望文を入力してください。' : `${1+(input.styleReference?1:0)+(input.colorReference?1:0)}枚の写真と、役割を分けた希望から画像を生成します。`}</p>
      {(connection === 'not_configured' || connection === 'error') && <button className="salon-text-button" onClick={() => setCheckVersion(v => v + 1)}>接続を再確認</button>}
      {generating && <button className="salon-text-button" onClick={cancel}>待機を止める</button>}
      {error && <p className="salon-generation-error" role="alert">{error}</p>}
      {image && <a className="salon-download" href={image.dataUrl} download={`hair-simulation-${image.id}.png`}>生成画像をダウンロード ↓</a>}
      <details><summary>仕上がりイメージについて</summary>
        <p>画像生成時に本人写真と、選んだSTYLE・COLOR写真および希望文を外部AIへ送信します。生成処理にはAPI利用料がかかります。</p>
        <p>髪の見え方を相談するためのイメージです。薬剤の配合から発色を実測予測した画像ではありません。生成画像と実際の施術後写真は別に保存します。</p>
        {image && <small>生成元：{image.model} · {new Date(image.createdAt).toLocaleString('ja-JP')}</small>}
        {connection === 'not_configured' && <p>管理者：サーバーの環境変数 OPENAI_API_KEY を設定し、再デプロイしてください。キーはこの画面には入力しません。</p>}
      </details>
      {Boolean(session.imageGenerations?.length)&&<details><summary>過去の生成画像を見る</summary><p>生成時の条件と現在の条件は異なる場合があります。実際の施術後写真とは別の記録です。</p><div className="salon-generation-history">{session.imageGenerations!.slice(-6).map(previous=><figure key={previous.id}><img src={previous.dataUrl} alt="過去のAI生成イメージ"/><figcaption>{new Date(previous.createdAt).toLocaleString('ja-JP')}<br/>{previous.roles?simulationModeLabels[previous.roles.mode]:'旧版の生成 · 参考画像の役割未分離'}</figcaption></figure>)}</div></details>}
    </div>
  </div></>;
}
