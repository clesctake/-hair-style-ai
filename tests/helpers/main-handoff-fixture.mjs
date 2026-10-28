// Synthetic contracts only; no provider request or recovered consultation is represented.
import {simulationFixture,fixtureResponse} from './simulation-fixture.mjs';
import {planBangFaceFrameDesigns,selectPlannedDesign} from '../../src/lib/design-planning-session.ts';
import {queueSimulationBatch,beginSimulationJob,completeSimulationJob} from '../../src/lib/hair-simulation-session.ts';
import {ensureProDesign,calculateProDesignRecipes,currentRecipeSet,selectProRecipe,toggleNextColor,editStylistMessage,editProDesign,confirmProDesign} from '../../src/lib/pro-design-session.ts';
import {ensureAfterSupport} from '../../src/lib/after-support-session.ts';
import {catalog} from '../../src/lib/catalog.ts';
export const testReview={decision:'ACCEPTED',identity:'CONFIRMED',background:'CONFIRMED',color:'CONFIRMED',design:'CONFIRMED',note:'TEST ONLY: protocol validation, not real API proof'};
export function completedMainWithRetainedPlan(image){
 let j=planBangFaceFrameDesigns(simulationFixture('COLOR_ONLY'));
 j=selectPlannedDesign(j,j.diagnosisSession.designPlan.planning.runs.at(-1).proposals[0].id);
 j=queueSimulationBatch(j);const job=j.diagnosisSession.hairSimulation.jobs[0];j=beginSimulationJob(j,job.id);
 const e=j.diagnosisSession.hairSimulation.events.at(-1),response=fixtureResponse(e.request,'REAL_API');
 if(image){response.image=image.dataUrl;response.width=image.width;response.height=image.height;response.generation.sha256=image.sha256;}
 response.generation.requiresStylistReview=true;response.generation.portraitVerification='UNAVAILABLE';
 return completeSimulationJob(j,job.id,response);
}
export function confirmTestSupport(j){
 j=calculateProDesignRecipes(ensureProDesign(j,catalog),catalog);j=selectProRecipe(j,currentRecipeSet(j).recipes[0].id);
 for(const family of ['BEIGE','PINK','MATTE'])j=toggleNextColor(j,family);
 j=editStylistMessage(j,'TEST ONLY: MAIN transfer\nKeep the complete message.');
 j=editProDesign(j,{message:{...j.diagnosisSession.proDesign.message,reviewedAt:j.createdAt}});
 return ensureAfterSupport(confirmProDesign(j));
}
