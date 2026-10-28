import type {Journey,Photo} from './journey.ts';
import {withDiagnosisSession} from './session-adapter.ts';
/** Reference roles are independent; old confirmations remain append-only history. */
export function replaceReference(j:Journey,role:'STYLE'|'COLOR',photo:Photo):Journey{
 return withDiagnosisSession({...j,updatedAt:new Date().toISOString(),target:role==='STYLE'?{...j.target,simulationMode:'auto',styleReference:{...photo,view:'style_reference'}}:{...j.target,simulationMode:'auto',reference:{...photo,view:'reference'},referenceHairMask:null,adjustmentDraft:null,confirmedAdjustmentId:null}});
}
export function copyStyleToColor(j:Journey){if(!j.target.styleReference)throw new Error('STYLE写真を登録してください。');return replaceReference(j,'COLOR',{...structuredClone(j.target.styleReference),id:crypto.randomUUID()});}
