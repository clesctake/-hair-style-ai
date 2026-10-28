import type {DiagnosisSession} from './session-model.ts';
import type {DesignPlanningRun,PlannedDesign,PlanningParameters} from './design-planning-types.ts';
import {designInputContext,designPlanningInput} from './design-planning-engine.ts';

export function activePlanningRun(session:DiagnosisSession):DesignPlanningRun|null {
  const state=session.designPlan.planning;
  const run=state?.runs.find(r=>r.id===state.activeRunId);
  return run&&run.inputContext===designInputContext(designPlanningInput(session))?run:null;
}
export function selectedPlannedDesign(session:DiagnosisSession):{design:PlannedDesign;parameters:PlanningParameters;selectionId:string}|null {
  const state=session.designPlan.planning,run=activePlanningRun(session);
  const selection=state?.selections.find(s=>s.id===state.selectedSelectionId&&s.runId===run?.id);
  const design=run?.proposals.find(d=>d.id===selection?.designId);
  return selection&&design?{design,parameters:structuredClone(selection.parameters),selectionId:selection.id}:null;
}
/** Rebuild the active view from immutable proposal/edit/selection histories. */
export function projectDesignPlanning(session:DiagnosisSession):void {
  const plan=session.designPlan,state=plan.planning;
  if(!state)return;
  const run=activePlanningRun(session);
  if(!run){
    state.activeRunId=null;state.selectedSelectionId=null;
    if(plan.selectedDesignId?.startsWith('planned:'))plan.selectedDesignId=null;
    if(session.styleTarget.selectedBangDecisionId?.startsWith('planning-selection:')){
      session.styleTarget.bang=null;session.styleTarget.faceFrame=null;session.styleTarget.selectedBangDecisionId=null;
    }
    if(plan.bangFaceFrameDesigns.some(d=>d.id.startsWith('planned:')))plan.selectedDesignId=null;
    if(plan.mainDesign.generationStatus==='NOT_REQUESTED')plan.mainDesign.styleParameters=session.simulationMode==='COLOR_ONLY'||session.simulationMode===null?null:structuredClone(session.styleTarget);
    return;
  }
  plan.featureState='PARTIAL';
  plan.bangFaceFrameDesigns=run.proposals.map(d=>{
    const corrections=state.corrections.filter(c=>c.runId===run.id&&c.designId===d.id);
    const selection=state.selections.find(s=>s.id===state.selectedSelectionId&&s.runId===run.id&&s.designId===d.id);
    return {...structuredClone(d),draftParameters:structuredClone(state.drafts[d.id]??null),
      stylistCorrection:corrections.map(c=>({id:c.id,proposalId:d.id,parameters:structuredClone(c.parameters),actor:c.actor,createdAt:c.createdAt,sourceType:c.sourceType})),
      selectedCorrectionId:selection?.correctionId??null};
  });
  const selected=selectedPlannedDesign(session);
  plan.selectedDesignId=selected?.design.id??null;
  if(selected){
    session.styleTarget.bang=structuredClone(selected.parameters);session.styleTarget.faceFrame=structuredClone(selected.parameters);
    session.styleTarget.selectedBangDecisionId=selected.selectionId;
    // Selecting a shape is a STYLE input; keep explicit COLOR_ONLY mode intact.
    if(session.simulationMode!== 'COLOR_ONLY'&&session.simulationMode!=='STYLE_ONLY')session.simulationMode=session.colorTarget.color?'STYLE_COLOR':'STYLE_ONLY';
  }else if(session.styleTarget.selectedBangDecisionId?.startsWith('planning-selection:')){
    session.styleTarget.bang=null;session.styleTarget.faceFrame=null;session.styleTarget.selectedBangDecisionId=null;
  }
  if(plan.mainDesign.generationStatus==='NOT_REQUESTED'){
    plan.mainDesign.styleParameters=session.simulationMode==='COLOR_ONLY'||session.simulationMode===null?null:structuredClone(session.styleTarget);
    plan.mainDesign.colorParameters=session.simulationMode==='STYLE_ONLY'||session.simulationMode===null?null:structuredClone(session.colorTarget);
  }
}
