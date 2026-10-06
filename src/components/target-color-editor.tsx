'use client';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent, PointerEvent } from 'react';
import { colorDifference, currentColor, direction, labHex, lch, type Journey, type Lab } from '@/lib/journey';
import { confirmTargetAdjustment, confirmedTargetAdjustment, pendingTargetAdjustment, targetControlSpecs, targetDraft, targetDraftContext,
  type TargetAdjustmentDraft, type TargetControl, type HairTargetDraft } from '@/lib/target-adjustment';
import { createToneBuffer, renderTone, sampleImageLab, type ToneBuffer } from '@/lib/live-tone';
import { emptyHairMask, rasterizeHairMask, maskHasSelection, type MaskPoint, type MaskStroke } from '@/lib/hair-mask';

const round = (n: number) => Math.round(n * 10) / 10;
const signed = (n: number) => `${n > 0 ? '+' : ''}${round(n)}`;
type LoadedPhoto = { id: string; buffer: ToneBuffer };
export default function TargetColorEditor({ session, busy, hasAnalysis, onDraft, onConfirm, onUpload, onRemove, onCalculate, onSimulation }: {
  session: Journey; busy: boolean; hasAnalysis: boolean;
  onDraft: (draft: TargetAdjustmentDraft) => void; onConfirm: (value: Journey) => void;
  onUpload: (file: File) => void; onRemove: () => void; onCalculate: () => void; onSimulation: () => void;
}) {
  const photo = session.target.reference, draft = targetDraft(session);
  const [loaded, setLoaded] = useState<LoadedPhoto | null>(null), [original, setOriginal] = useState(false);
  const [error, setError] = useState(''), [tone, setTone] = useState<{ source: Lab; adjusted: Lab; durationMs: number } | null>(null);
  const [maskEditor, setMaskEditor] = useState(false), [showMask, setShowMask] = useState(false), [maskReady, setMaskReady] = useState(false);
  const [tool, setTool] = useState<'sample' | 'add' | 'erase'>('sample'), [brush, setBrush] = useState(9);
  const canvas = useRef<HTMLCanvasElement>(null), overlay = useRef<HTMLCanvasElement>(null), frame = useRef(0);
  const maskCache = useRef<{ key: string; weights: Uint8Array } | null>(null);
  const stroke = useRef<{ pointerId: number; base: HairTargetDraft; value: MaskStroke } | null>(null);
  const latest = useRef({ session, draft }); latest.current = { session, draft };
  const confirmed = confirmedTargetAdjustment(session), pending = pendingTargetAdjustment(session);
  const ready = Boolean(photo && loaded?.id === photo.id && draft);
  const fingerprint = draft ? targetDraftContext(draft) : '';

  useEffect(() => {
    let cancelled = false;
    setLoaded(null); setTone(null); setError(''); setOriginal(false);
    maskCache.current = null; stroke.current = null; setMaskReady(false);
    const hasSelection = maskHasSelection(latest.current.draft?.hairMask);
    setTool(hasSelection ? 'sample' : 'add'); setMaskEditor(!hasSelection); setShowMask(!hasSelection);
    if (!photo) return;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      try {
        const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
        const source = document.createElement('canvas');
        source.width = Math.max(1, Math.round(image.naturalWidth * scale)); source.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const ctx = source.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('写真の調整を開始できません。');
        ctx.drawImage(image, 0, 0, source.width, source.height);
        setLoaded({ id: photo.id, buffer: createToneBuffer(ctx.getImageData(0, 0, source.width, source.height).data, source.width, source.height) });
      } catch (err) { setError(err instanceof Error ? err.message : '写真を調整できませんでした。'); }
    };
    image.onerror = () => { if (!cancelled) setError('参考写真を読み込めませんでした。'); };
    image.src = photo.dataUrl;
    return () => { cancelled = true; image.onload = null; image.onerror = null; };
  }, [photo?.id]);

  function weights(value: HairTargetDraft) {
    if (!loaded || loaded.id !== value.referencePhotoId) throw new Error('写真の準備をお待ちください。');
    const { width, height } = loaded.buffer, key = JSON.stringify([loaded.id, width, height, value.hairMask]);
    if (maskCache.current?.key !== key) maskCache.current = { key, weights: rasterizeHairMask(value.hairMask, width, height) };
    return maskCache.current.weights;
  }
  function draw(value: HairTargetDraft) {
    if (!loaded || loaded.id !== value.referencePhotoId || !canvas.current) throw new Error('写真の準備をお待ちください。');
    const { buffer } = loaded, started = performance.now();
    const mask = weights(value), rendered = renderTone(buffer, value.controls, mask), ctx = canvas.current.getContext('2d');
    if (!ctx) throw new Error('写真の表示に失敗しました。');
    canvas.current.width = buffer.width; canvas.current.height = buffer.height;
    const output = ctx.createImageData(buffer.width, buffer.height); output.data.set(rendered.pixels); ctx.putImageData(output, 0, 0);
    canvas.current.dataset.toneContext = targetDraftContext(value);
    setMaskReady(mask.some(v => v > 0));
    if (overlay.current) {
      overlay.current.width = buffer.width; overlay.current.height = buffer.height;
      const overlayContext = overlay.current.getContext('2d');
      if (overlayContext) {
        const tint = overlayContext.createImageData(buffer.width, buffer.height);
        for (let p = 0; p < mask.length; p++) { tint.data[p * 4] = 200; tint.data[p * 4 + 1] = 157; tint.data[p * 4 + 2] = 102; tint.data[p * 4 + 3] = mask[p] * .46; }
        overlayContext.putImageData(tint, 0, 0);
      }
    }
    const pointPixel = Math.min(buffer.height - 1, Math.floor(value.samplePoint.y * buffer.height)) * buffer.width + Math.min(buffer.width - 1, Math.floor(value.samplePoint.x * buffer.width));
    if (!value.samplePoint.selected || mask[pointPixel] < 128) { setTone(null); return null; }
    const source = sampleImageLab(buffer.original, buffer.width, buffer.height, value.samplePoint, mask);
    const adjusted = sampleImageLab(rendered.pixels, buffer.width, buffer.height, value.samplePoint, mask);
    setTone({ source, adjusted, durationMs: performance.now() - started });
    return { sourceLab: source, adjustedLab: adjusted, clippedPixelFraction: rendered.clippedPixelFraction, width: buffer.width, height: buffer.height };
  }
  useEffect(() => {
    cancelAnimationFrame(frame.current);
    if (loaded && loaded.id === photo?.id && draft) frame.current = requestAnimationFrame(() => {
      const current = latest.current.draft;
      if (!current) return;
      try { draw(current); } catch (err) { setError(err instanceof Error ? err.message : '写真を調整できませんでした。'); }
    });
    return () => cancelAnimationFrame(frame.current);
  }, [loaded, fingerprint, showMask]);

  function emit(value: HairTargetDraft) { latest.current.draft = value; onDraft(value); setError(''); }
  function location(event: { clientX: number; clientY: number; currentTarget: HTMLButtonElement }): MaskPoint {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) };
  }
  function beginStroke(event: PointerEvent<HTMLButtonElement>) {
    const current = latest.current.draft;
    if (tool === 'sample' || !ready || busy || !current || !event.isPrimary || event.button !== 0) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    stroke.current = { pointerId: event.pointerId, base: current, value: { operation: tool, diameter: brush / 100, points: [location(event)] } };
    emit({ ...current, hairMask: { ...current.hairMask, strokes: [...current.hairMask.strokes, stroke.current.value] } });
  }
  function moveStroke(event: PointerEvent<HTMLButtonElement>) {
    const active = stroke.current, current = latest.current.draft;
    if (!active || active.pointerId !== event.pointerId || !current) return;
    const point = location(event), previous = active.value.points.at(-1)!;
    if (Math.hypot(point.x - previous.x, point.y - previous.y) < .002 || active.value.points.length >= 2048) return;
    active.value = { ...active.value, points: [...active.value.points, point] };
    emit({ ...current, hairMask: { ...current.hairMask, strokes: [...active.base.hairMask.strokes, active.value] } });
  }
  function finishStroke(event: PointerEvent<HTMLButtonElement>) {
    if (stroke.current?.pointerId !== event.pointerId) return;
    moveStroke(event); stroke.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function pick(event: MouseEvent<HTMLButtonElement>) {
    if (!draft || !ready) return;
    const current = latest.current.draft!;
    if (tool !== 'sample') {
      // Native keyboard activation paints at the current sample location without requiring a pointer.
      if (event.detail === 0) emit({ ...current, hairMask: { ...current.hairMask, strokes: [...current.hairMask.strokes,
        { operation: tool, diameter: brush / 100, points: [{ x: current.samplePoint.x, y: current.samplePoint.y }] }] } });
      return;
    }
    const { x, y } = event.detail ? location(event) : current.samplePoint;
    const mask = weights(current), { width, height } = loaded!.buffer;
    if (mask[Math.min(height - 1, Math.floor(y * height)) * width + Math.min(width - 1, Math.floor(x * width))] < 128) {
      setError('選択した髪の範囲の中をタップしてください。範囲は「塗る／消す」で修正できます。'); return;
    }
    emit({ ...current, samplePoint: { ...current.samplePoint, x, y, selected: true } });
  }
  function confirm() {
    const current = latest.current;
    if (!current.draft) return;
    try {
      const values = draw(current.draft); // Render the current slider values even if an animation frame is still pending.
      if (!values) throw new Error('選択した髪の中をタップして、目標色を選んでください。');
      const dataUrl = canvas.current!.toDataURL('image/png');
      onConfirm(confirmTargetAdjustment(current.session, { ...values, dataUrl })); setError('');
    } catch (err) { setError(err instanceof Error ? err.message : '色味を確定できませんでした。'); }
  }

  return <div className="salon-color-editor">
    <div className="salon-ideal-heading"><div><span className="salon-kicker">COLOR · 色</span><h3>なりたいカラー</h3></div><span className="salon-label">{confirmed && !pending ? '色味を確定済み' : '理想イメージ調整'}</span></div>
    <div className="salon-editor-grid">
      <div className="salon-editor-photo-column">
        {photo ? <>
          <div className="salon-compare-switch" aria-label="希望写真の比較"><button type="button" aria-pressed={!original} onClick={() => setOriginal(false)}>Adjusted · 調整後</button><button type="button" aria-pressed={original} onClick={() => setOriginal(true)}>Before · 元画像</button></div>
          <div className="salon-mask-heading"><span>髪だけに反映</span><button type="button" className="salon-text-button" aria-expanded={maskEditor} disabled={!ready || busy} onClick={() => { const open = !maskEditor; setMaskEditor(open); setShowMask(open); setOriginal(false); if (!open) setTool('sample'); }}>範囲を調整</button></div>
          <button type="button" className={`salon-sample-photo ${tool !== 'sample' ? 'is-painting' : ''}`} aria-label={tool === 'sample' ? '参考写真の髪をタップして採色' : tool === 'add' ? '参考写真の髪の範囲を塗る' : '参考写真の髪の範囲を消す'} onClick={pick} onPointerDown={beginStroke} onPointerMove={moveStroke} onPointerUp={finishStroke} onPointerCancel={finishStroke} onLostPointerCapture={() => { stroke.current = null; }} disabled={!ready || busy}>
            <img src={photo.dataUrl} alt="調整前の希望写真" hidden={!original && ready}/>
            <canvas ref={canvas} role="img" aria-label="ライブ調整後の希望写真" hidden={original || !ready}/>
            <canvas ref={overlay} className="salon-hair-mask-overlay" aria-hidden="true" hidden={!showMask || original || !ready}/>
            {draft?.samplePoint.selected && <span className="salon-sample-ring" aria-hidden="true" style={{ left: `${draft.samplePoint.x * 100}%`, top: `${draft.samplePoint.y * 100}%`, width: `${draft.samplePoint.radius * 2 * Math.min(loaded?.buffer.width ?? photo.width, loaded?.buffer.height ?? photo.height) / (loaded?.buffer.width ?? photo.width) * 100}%` }}/>}
          </button>
          {maskEditor && <div className="salon-mask-tools">
            <div className="salon-mask-modes" aria-label="髪の範囲の編集">{([['add', '塗る'], ['erase', '消す'], ['sample', '色を選ぶ']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={tool === value} disabled={busy} onClick={() => { setTool(value); setShowMask(value !== 'sample'); setOriginal(false); }}>{label}</button>)}</div>
            {tool !== 'sample' && <label className="salon-brush-size">ブラシの大きさ<input type="range" aria-label="髪の範囲 ブラシの大きさ" min="2" max="25" value={brush} onChange={event => setBrush(Number(event.target.value))}/><output>{brush}</output></label>}
            <div className="salon-mask-revision"><button type="button" className="salon-text-button" disabled={busy || !draft?.hairMask.strokes.length} onClick={() => { if (draft) emit({ ...draft, hairMask: { ...draft.hairMask, strokes: draft.hairMask.strokes.slice(0, -1) } }); }}>ひとつ戻す</button><button type="button" className="salon-text-button" disabled={busy} onClick={() => { if (draft) emit({ ...draft, hairMask: emptyHairMask(draft.referencePhotoId), samplePoint: { ...draft.samplePoint, selected: false } }); setTool('add'); setShowMask(true); setOriginal(false); }}>範囲を選び直す</button></div>
          </div>}
          <p className="salon-sample-help">{tool !== 'sample' ? '髪の部分をなぞって、反映する範囲を整えます。' : tone && draft?.samplePoint.selected ? '丸で選んだ髪の色を、目標色として採色。' : '選択した髪の中をタップして、目標色を選びます。'}</p>
          <label className="salon-mask-visibility"><input type="checkbox" aria-label="髪の選択範囲を表示" checked={showMask} disabled={!ready || original} onChange={event => setShowMask(event.target.checked)}/>髪の選択範囲を表示</label>
          <div className="salon-photo-editor-actions"><label className="salon-text-button">COLOR写真を差し替える<input type="file" accept="image/*" aria-label="希望画像をアップロード" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) onUpload(file); event.target.value = ''; }}/></label><button type="button" className="salon-text-button" onClick={onRemove}>削除</button></div>
        </> : <label className="salon-editor-empty"><span>＋</span><strong>COLOR写真を追加</strong><small>髪色を見ながら、理想をすり合わせる。</small><input type="file" accept="image/*" aria-label="希望画像をアップロード" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) onUpload(file); event.target.value = ''; }}/></label>}
      </div>
      <div className="salon-editor-controls">
        <div className="salon-tone-sliders">{(Object.keys(targetControlSpecs) as TargetControl[]).map(key => {
          const spec = targetControlSpecs[key], value = draft?.controls[key] ?? 0;
          return <label key={key} className="salon-tone-slider"><span>{spec.label}<output>{spec.min < 0 ? signed(value) : value}<small> / {spec.max}</small></output></span><input type="range" aria-label={`理想色 ${spec.label}`} min={spec.min} max={spec.max} step="1" disabled={!ready || !maskReady || busy} value={value} style={{ '--tone-fill': `${(value - spec.min) / (spec.max - spec.min) * 100}%` } as CSSProperties} onChange={event => { if (draft) emit({ ...draft, controls: { ...draft.controls, [key]: Number(event.target.value) } }); }}/><small><span>{spec.low}</span><span>{spec.high}</span></small></label>;
        })}</div>
        <p className="salon-live-caption">選択した髪だけ、色味がその場で変わります。<br/>{maskReady ? '顔・肌・背景が範囲に入っていないか、確認してください。' : 'まず「塗る」で髪の範囲を選んでください。'}</p>
        <div className="salon-target-confirm-actions"><button type="button" className="salon-primary" disabled={!ready || !tone || !draft?.samplePoint.selected || busy} onClick={confirm}>この色味で確定 →</button><button type="button" className="salon-soft-button" disabled={!confirmed || pending} onClick={onSimulation}>高精度シミュレーションを見る ↗</button></div>
        <p className="salon-confirmation-status" role="status">{pending ? '調整中です。変更した色味を確定してください。' : confirmed ? `${new Date(confirmed.confirmedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}に確定 · 画像上の推定色` : photo ? '髪を選び、色味を確定してからレシピへ。' : '希望写真を追加すると、ライブ調整できます。'}</p>
        {error && <p className="salon-generation-error" role="alert">{error}</p>}
        <details><summary>採色値と調整方法の詳細</summary><p>髪の選択範囲の内側だけを補正し、範囲外の画素は元のまま残します。サンプルの範囲は手動で作成済みです。アップロードした写真は「塗る／消す」で指定します。自動の髪認識は未接続です。</p><p>採色は選択した髪と円が重なる画素に限定し、明暗端の各10%を除いてCIELAB / D65 / 2°へ換算します。未校正の画像推定で、実毛髪の測色ではありません。</p>{tone && <p>元の採色：L* {round(tone.source.L)} / a* {round(tone.source.a)} / b* {round(tone.source.b)}<br/>調整後：L* {round(tone.adjusted.L)} / a* {round(tone.adjusted.a)} / b* {round(tone.adjusted.b)}<br/>LCh：{round(lch(tone.adjusted).L)} / {round(lch(tone.adjusted).C)} / {lch(tone.adjusted).h === null ? '未定義' : `${round(lch(tone.adjusted).h!)}°`}</p>}<p>透明感は見え方の補正です。毛髪の透過率や薬剤濃度を示しません。{confirmed?.scope === 'reference_image_full_frame' && '以前の全体調整は履歴に残しています。髪の範囲を選んで再確定してください。'}</p></details>
      </div>
    </div>
    {confirmed && <div className={`salon-target-bridge ${pending ? 'is-pending' : ''}`}>
      <div className="salon-bridge-title"><h3>確定した理想から、レシピへ。</h3><span className="salon-label">{pending ? '再確定が必要' : '画像推定 / 試算'}</span></div>
      <div className="salon-bridge-content"><div className="salon-color-pair"><div><span style={{ background: currentColor(session, session.recipeRegion) ? labHex(currentColor(session, session.recipeRegion)!.value) : 'var(--salon-soft)' }}/><small>現在色 · 仮診断</small></div><b aria-hidden="true">→</b><div><span style={{ background: labHex(confirmed.color.value) }}/><small>確定した目標色</small></div></div><TargetDifference session={session}/><button type="button" className="salon-primary" disabled={pending || !hasAnalysis || busy} onClick={onCalculate}>レシピを計算する →</button></div>
      <p>目標は画像上の推定色です。実現できるかは、美容師の毛髪診断と薬剤検証で確認します。{!hasAnalysis && '先に現在の髪を診断してください。'}</p>
    </div>}
  </div>;
}

function TargetDifference({ session }: { session: Journey }) {
  const current = currentColor(session, session.recipeRegion);
  if (!current) return <p>現在色の診断後に、色差を比較します。</p>;
  const difference = colorDifference(current.value, session.target.color.value);
  const labels: Record<string, string> = { F03: 'ベージュのベース', F02: 'くすみ方向', F06: '赤みを抑える方向', F08: 'オレンジを抑える方向', F10: '黄みを抑える方向', F12: '暖色の赤み方向', F15: '暖色の黄み方向' };
  return <div className="salon-target-difference"><div className="salon-difference-values"><span>明度差<strong>{signed(difference.dL)}</strong></span><span>彩度差<strong>{signed(difference.dC)}</strong></span><span>色相差<strong>{difference.dh === null ? '未定義' : `${signed(difference.dh)}°`}</strong></span></div><div className="salon-pigment-directions" aria-label="必要な色素方向の試算">{direction(session).sort((a, b) => b.weight - a.weight).slice(0, 3).map(item => <span key={item.axis}>{labels[item.axis]}</span>)}</div></div>;
}
