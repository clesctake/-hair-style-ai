import type {Journey} from './journey.ts';
import {withDiagnosisSession} from './session-adapter.ts';
import type {CatalogData} from './catalog.ts';
/** Equal timestamps are NOT equal state: two iPhone taps may share the same millisecond. */
export function reconcileSavedSnapshot(current:Journey,snapshot:Journey,saved:Journey,data:CatalogData):Journey{
 if(current===snapshot)return saved;
 return withDiagnosisSession({...current,id:saved.id,version:saved.version,diagnosisSession:{...current.diagnosisSession!,revision:saved.version}},data);
}
