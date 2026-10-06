import type { Draft, Observation, Metric, Stage, Zone, Application } from './types.ts';
export const stages: Record<Stage, string> = { initial: '施術前', prepared_base: 'ブリーチ後ベース', after: '仕上がり' };
export const zones: Record<Zone, string> = { root: '根元', mid: '中間', end: '毛先' };
export const metrics: Record<Metric, { label: string; min: number; max: number; step: number; unit: string; scale: string }> = {
  under_level: { label: 'アンダーレベル', min: 0, max: 20, step: .5, unit: 'LV', scale: 'salon-level-proposed-v1' },
  residual_pigment: { label: '人工色素残留', min: 1, max: 5, step: 1, unit: '', scale: 'ordinal-proposed-v1' },
  damage: { label: 'ダメージ', min: 1, max: 5, step: 1, unit: '', scale: 'ordinal-proposed-v1' },
  porosity: { label: '薬剤の吸い込みやすさ', min: 1, max: 5, step: 1, unit: '', scale: 'ordinal-proposed-v1' },
  diameter_um: { label: '毛髪の太さ（実測）', min: 1, max: 300, step: 1, unit: 'μm', scale: 'measured-um-v1' },
  gray_percent: { label: '白髪率', min: 0, max: 100, step: 1, unit: '%', scale: 'percent-v1' }
};
export function emptyDraft(): Draft {
  return { id: null, version: 0, schemaVersion: 'phase2-draft-1', title: '', stylist: '', observations: [], history: [], applications: [], notes: '' };
}
export function latestObservation(draft: Draft, stage: Stage, zone: Zone, metric: Metric, origin?: Observation['origin']) {
  const list = draft.observations.filter(x => x.stage === stage && x.zone === zone && x.metric === metric && (!origin || x.origin === origin));
  return list.at(-1);
}
export function effectiveObservation(draft: Draft, stage: Stage, zone: Zone, metric: Metric) {
  return latestObservation(draft, stage, zone, metric, 'stylist') ?? latestObservation(draft, stage, zone, metric, 'ai');
}
export function addStylistObservation(draft: Draft, stage: Stage, zone: Zone, metric: Metric, value: number, id: string, at: string): Draft {
  const prior = latestObservation(draft, stage, zone, metric);
  return { ...draft, observations: [...draft.observations, { id, stage, zone, metric, origin: 'stylist', value, modelVersion: null, actor: draft.stylist.trim() || '担当美容師', overridesId: prior?.id ?? null, scaleVersion: metrics[metric].scale, createdAt: at }] };
}
function object(x: unknown): x is Record<string, unknown> { return typeof x === 'object' && x !== null && !Array.isArray(x); }
function text(x: unknown, max: number) { return typeof x === 'string' && x.length <= max; }
function num(x: unknown, min: number, max = Infinity) { return typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max; }
function nullableNumber(x: unknown, min: number, max = Infinity) { return x === null || num(x, min, max); }
export function validateDraft(value: unknown, productIds: Set<string>, variants: Map<string, string>, developerIds: Set<string>): asserts value is Draft {
  if (!object(value)) throw new Error('下書きの形式が正しくありません。');
  const d = value;
  if (d.schemaVersion !== 'phase2-draft-1' || !(d.id === null || text(d.id, 80)) || !num(d.version, 0) || !Number.isInteger(d.version)) throw new Error('保存形式・バージョンが不正です。');
  if (!text(d.title, 120) || !String(d.title).trim() || !text(d.stylist, 80) || !text(d.notes, 4000)) throw new Error('記録名は必須です。文字数も確認してください。');
  if (!Array.isArray(d.observations) || d.observations.length > 2000 || !Array.isArray(d.history) || d.history.length > 100 || !Array.isArray(d.applications) || d.applications.length > 100) throw new Error('記録の件数または形式が不正です。');
  const ids = new Set<string>();
  for (const item of d.observations) {
    if (!object(item) || !text(item.id, 80) || !item.id || ids.has(String(item.id)) || !Object.hasOwn(stages,String(item.stage)) || !Object.hasOwn(zones,String(item.zone)) || !Object.hasOwn(metrics,String(item.metric))) throw new Error('診断のID・時点・部位・項目が不正です。');
    const m = metrics[item.metric as Metric];
    if (!num(item.value, m.min, m.max) || Math.abs((Number(item.value) - m.min) / m.step - Math.round((Number(item.value) - m.min) / m.step)) > .00001 || item.scaleVersion !== m.scale) throw new Error(`${m.label}の値・尺度が不正です。`);
    if (!text(item.createdAt, 50) || !Number.isFinite(Date.parse(String(item.createdAt)))) throw new Error('診断日時が不正です。');
    if (item.origin === 'ai' ? !text(item.modelVersion, 120) || !item.modelVersion || item.actor !== null : item.origin !== 'stylist' || !text(item.actor, 80) || !item.actor || item.modelVersion !== null) throw new Error('診断元と担当者／モデル版が不正です。');
    if (item.overridesId !== null) {
      const prev = (d.observations as Observation[]).find(x => x.id === item.overridesId && ids.has(x.id));
      if (!prev || prev.stage !== item.stage || prev.zone !== item.zone || prev.metric !== item.metric || prev.scaleVersion !== item.scaleVersion) throw new Error('補正元は同じ時点・部位・項目・尺度の過去記録にしてください。');
    }
    ids.add(String(item.id));
  }
  for (const h of d.history) {
    if (!object(h) || !text(h.id, 80) || !['color','bleach','straightening','perm','other'].includes(String(h.type)) || !text(h.notes, 2000) || !Array.isArray(h.zones) || !h.zones.length || !h.zones.every(z => Object.hasOwn(zones,String(z))) || (h.date === null ? h.datePrecision !== 'unknown' : h.datePrecision !== 'day' || typeof h.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(h.date) || !Number.isFinite(Date.parse(h.date)) || new Date(h.date).toISOString().slice(0,10)!==h.date)) throw new Error('施術履歴の日付・対象部位・形式が不正です。');
  }
  const applicationIds = new Set<string>();
  for (const a of d.applications) {
    if (!object(a) || !text(a.id, 80) || !a.id || applicationIds.has(String(a.id)) || !num(a.sequence, 1) || !Number.isInteger(a.sequence) || !Object.hasOwn(stages,String(a.stageInput)) || !Object.hasOwn(zones,String(a.zone)) || !['color','bleach'].includes(String(a.process)) || !['mass','volume','unspecified'].includes(String(a.ratioBasis)) || !text(a.notes, 2000) || !nullableNumber(a.developerGrams, .001, 10000) || !nullableNumber(a.durationMin, 0, 600) || !(a.developerId === null || developerIds.has(String(a.developerId))) || !Array.isArray(a.lines) || a.lines.length > 30) throw new Error('配合の工程・第2剤・量・時間が不正です。');
    applicationIds.add(String(a.id)); const lineIds = new Set<string>();
    for (const line of a.lines) {
      if (!object(line) || !text(line.id,80) || !line.id || lineIds.has(String(line.id)) || !productIds.has(String(line.productId)) || !(line.variantId === null || variants.get(String(line.variantId)) === line.productId) || !nullableNumber(line.grams,.001,10000) || !nullableNumber(line.ratioPart,.001,10000) || !nullableNumber(line.additionPercent,0,100) || !['relative_to_base','of_final_total','unspecified'].includes(String(line.percentBasis)) || !['base','additive'].includes(String(line.role))) throw new Error('薬剤と色番の対応、配合量、添加率が不正です。');
      if (line.role === 'base' && line.additionPercent !== null) throw new Error('添加率は添加剤として記録してください。');
      lineIds.add(String(line.id));
    }
    if (a.lines.some(l => l.additionPercent !== null && l.percentBasis !== 'unspecified') && !a.lines.some(l => l.role === 'base')) throw new Error('添加率の基準になるベース薬剤を記録してください。');
  }
}
export function assertAppendOnly(previous: Draft, next: Draft) {
  for (let i = 0; i < previous.observations.length; i++) {
    if (JSON.stringify(previous.observations[i]) !== JSON.stringify(next.observations[i])) throw new Error('保存済み診断値は変更できません。補正を新しい記録として追加してください。');
  }
}
export function mixtureWarnings(a: Application): string[] {
  const warnings: string[] = [];
  if (!a.lines.length) warnings.push('薬剤が未入力です。');
  if (a.lines.some(l => l.grams === null && l.ratioPart === null && l.additionPercent === null)) warnings.push('配合量が未入力の薬剤があります。');
  if (a.lines.some(l => l.additionPercent !== null && l.percentBasis === 'unspecified')) warnings.push('添加％の基準量が未定義です。重量への変換は保留します。');
  if (a.lines.some(l => l.ratioPart !== null) && a.ratioBasis === 'unspecified') warnings.push('部数の質量／体積基準が未定義です。');
  if (a.developerId === null) warnings.push('第2剤の製品が未選択です。');
  return warnings;
}
