import type { Draft } from './types.ts';
import { assertAppendOnly, validateDraft } from './domain.ts';
import { productIds, variantProducts, developerIds } from './catalog.ts';

const key = 'hair-mirror-fiole-revisions-v1';
type Revision = Draft & { id: string; updatedAt: string };
function read(storage: Storage): Revision[] {
  const raw = storage.getItem(key);
  if (raw === null) return [];
  const rows: unknown = JSON.parse(raw);
  if (!Array.isArray(rows)) throw new Error('保存データの形式が不正です。');
  for (const row of rows) {
    validateDraft(row, productIds, variantProducts, developerIds);
    if (!row.id || row.version < 1 || !('updatedAt' in row) || typeof row.updatedAt !== 'string') throw new Error('保存データの形式が不正です。');
  }
  return rows as Revision[];
}
export function listDrafts(storage: Storage = window.localStorage) {
  const latest = new Map<string, Revision>();
  for (const row of read(storage)) latest.set(row.id, row);
  return [...latest.values()].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(({id,version,title,updatedAt})=>({id,version,title,updatedAt}));
}
export function loadDraft(id: string, storage: Storage = window.localStorage): Revision {
  const row = read(storage).filter(r=>r.id===id).at(-1);
  if (!row) throw new Error('記録が見つかりません。');
  return row;
}
export function saveDraft(draft: Draft, storage: Storage = window.localStorage): Revision {
  validateDraft(draft, productIds, variantProducts, developerIds);
  const rows = read(storage);
  const previous = draft.id ? rows.filter(r=>r.id===draft.id).at(-1) : undefined;
  if (draft.id ? !previous || previous.version !== draft.version : draft.version !== 0) throw new Error('別の画面で更新されています。保存済み記録を開き直してください。');
  if (previous) assertAppendOnly(previous, draft);
  const next = { ...draft, id: draft.id ?? crypto.randomUUID(), version: draft.version + 1, updatedAt: new Date().toISOString() };
  try { storage.setItem(key, JSON.stringify([...rows, next])); }
  catch { throw new Error('ブラウザに保存できませんでした。容量・設定を確認し、JSON出力で保管してください。'); }
  return next;
}
