import type { Journey } from './journey.ts';
import type { JourneyStore } from './journey-store.ts';
import type { CatalogData } from './catalog.ts';
import type { DiagnosisSession } from './session-model.ts';
import { attachDiagnosisSession, withDiagnosisSession } from './session-adapter.ts';

export type DiagnosisSessionRecord = { session: DiagnosisSession; legacyJourney: Journey };
export interface DiagnosisSessionStore {
  mode: JourneyStore['mode'];
  list(): Promise<DiagnosisSessionRecord[]>;
  load(id: string): Promise<DiagnosisSessionRecord>;
  save(record: DiagnosisSessionRecord): Promise<DiagnosisSessionRecord>;
}
/** Both interfaces address the SAME record/revisions; no second database or customer-data copy. */
export function diagnosisSessionStore(store: JourneyStore, data: CatalogData): DiagnosisSessionStore {
  const record = (journey: Journey): DiagnosisSessionRecord => {
    const legacyJourney = withDiagnosisSession(journey, data);
    return { session: structuredClone(legacyJourney.diagnosisSession!), legacyJourney };
  };
  return { mode: store.mode,
    async list() { return (await store.list()).map(record); },
    async load(id) { return record(await store.load(id)); },
    async save(value) { return record(await store.save(attachDiagnosisSession(value.legacyJourney, value.session))); },
  };
}
