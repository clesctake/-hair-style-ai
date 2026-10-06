import type {Journey} from './journey.ts';
import {withDiagnosisSession} from './session-adapter.ts';
import {sourcedValue,unknownValue,SPEC_VERSION,APP_VERSION,type DiagnosisSession} from './session-model.ts';
import {DESIGN_PLANNING_SCHEMA,validatePlanningParameters,type CurrentHairContext,type PlanningParameters} from './design-planning-types.ts';
import {emptyCurrentHairContext,designPlanningInput,generateDesignPlanningRun} from './design-planning-engine.ts';
import {activePlanningRun,projectDesignPlanning} from './design-planning-projection.ts';
import {featureSnapshot} from './feature-registry.ts';

const stamp=(session:DiagnosisSession)=>{session.specVersion=SPEC_VERSION;session.appVersion=APP_VERSION;session.updatedAt=new Date().toISOString();session.featureSnapshot=featureSnapshot();};
const finish=(next:Journey)=>{projectDesignPlanning(next.diagnosisSession!);return withDiagnosisSession(next);};
function editable(journey:Journey){
  const next=withDiagnosisSession(structuredClone(journey)),session=next.diagnosisSession!;
  session.designPlan.planning??={schemaVersion:DESIGN_PLANNING_SCHEMA,currentHair:emptyCurrentHairContext(),runs:[],activeRunId:null,drafts:{},corrections:[],selections:[],selectedSelectionId:null};
  stamp(session);next.updatedAt=session.updatedAt;return {next,session,state:session.designPlan.planning};
}
export function planBangFaceFrameDesigns(journey:Journey):Journey {
  const {next,session,state}=editable(journey);
  const run=generateDesignPlanningRun(designPlanningInput(session));
  state.runs.push(run);state.activeRunId=run.id;state.selectedSelectionId=null;
  session.designPlan.featureState='PARTIAL';return finish(next);
}
export function setCurrentHairContext<K extends keyof CurrentHairContext>(journey:Journey,key:K,value:CurrentHairContext[K]['value']):Journey {
  const {next,state}=editable(journey);
  state.currentHair[key]=(value===null?unknownValue():sourcedValue(value,'STYLIST_CORRECTED',null,new Date().toISOString(),'stylist_confirmed_design_input')) as CurrentHairContext[K];
  return finish(next);
}
export function setPlannedDesignDraft(journey:Journey,designId:string,parameters:PlanningParameters):Journey {
  validatePlanningParameters(parameters);
  const {next,session,state}=editable(journey),run=activePlanningRun(session);
  if(!run?.proposals.some(d=>d.id===designId))throw new Error('現在の入力から設計した案を選択してください。');
  state.drafts[designId]=structuredClone(parameters);return finish(next);
}
export function confirmPlannedDesignCorrection(journey:Journey,designId:string,actor='美容師'):Journey {
  const {next,session,state}=editable(journey),run=activePlanningRun(session),design=run?.proposals.find(d=>d.id===designId);
  if(!run||!design)throw new Error('入力を変更したため再設計が必要です。');
  const parameters=state.drafts[designId];if(!parameters)throw new Error('変更するパラメータを選択してください。');validatePlanningParameters(parameters);
  state.corrections.push({id:`planning-correction:${crypto.randomUUID()}`,parentSessionId:session.id,runId:run.id,designId,parameters:structuredClone(parameters),actor,createdAt:new Date().toISOString(),sourceType:'STYLIST_CORRECTED'});
  delete state.drafts[designId];return finish(next);
}
export function selectPlannedDesign(journey:Journey,designId:string,actor='美容師'):Journey {
  const {next,session,state}=editable(journey),run=activePlanningRun(session),design=run?.proposals.find(d=>d.id===designId);
  if(!run||!design)throw new Error('入力を変更したため再設計が必要です。');
  if(state.drafts[designId])throw new Error('変更を保存してから、この案を採用してください。');
  const correction=state.corrections.findLast(c=>c.runId===run.id&&c.designId===designId);
  const selection={id:`planning-selection:${crypto.randomUUID()}`,parentSessionId:session.id,runId:run.id,designId,correctionId:correction?.id??null,parameters:structuredClone(correction?.parameters??design.parameters),actor,createdAt:new Date().toISOString(),sourceType:'STYLIST_CORRECTED' as const};
  state.selections.push(selection);state.selectedSelectionId=selection.id;return finish(next);
}
