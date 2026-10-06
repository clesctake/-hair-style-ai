import {createHash} from 'node:crypto';
import {newJourney} from '../../src/lib/journey.ts';
import {catalog} from '../../src/lib/catalog.ts';
import {withDiagnosisSession} from '../../src/lib/session-adapter.ts';
import {resolveAnalysisInput} from '../../src/lib/analysis-contract.ts';
import {photoPredictionResult,commitPhotoAnalysis} from '../../src/lib/photo-analysis-pipeline.ts';
import {PHOTO_ANALYSIS_SCHEMA,ANALYSIS_PROVIDER,HAIR_MODEL,FACE_MODEL} from '../../src/lib/photo-analysis-types.ts';
import {planBangFaceFrameDesigns} from '../../src/lib/design-planning-session.ts';
import {targetDraft,confirmTargetAdjustment} from '../../src/lib/target-adjustment.ts';
import {SIMULATION_PROMPT_VERSION} from '../../src/lib/hair-simulation-instructions.ts';

export const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLXcAAAAASUVORK5CYII=';
export const pngHash=createHash('sha256').update(Buffer.from(png.split(',')[1],'base64')).digest('hex');
// Deterministic synthetic provider outputs, NOT evidence of model or image-generation accuracy.
export function simulationFixture(mode='STYLE_COLOR'){
 let j=newJourney();j.title='Phase 4 MOCK通信検証';j.stylist='検証';j.target.style='顔周りをやわらかく';j.target.simulationMode=mode.toLowerCase();
 const photo={id:'simulation-front',view:'front',name:'fixture.png',createdAt:j.createdAt,dataUrl:png,width:60,height:90,original:{dataUrl:png,mimeType:'image/png',byteSize:Buffer.from(png.split(',')[1],'base64').length,width:320,height:480,representation:'original_file_bytes',colourProcessing:'none_app_applied',profile:'not_parsed'}};
 j.photos=[photo];
 if(mode!=='COLOR_ONLY')j.target.styleReference={...structuredClone(photo),id:'simulation-style',view:'style_reference'};
 if(mode!=='STYLE_ONLY'){
  j.target.reference={...structuredClone(photo),id:'simulation-color',view:'reference'};
  const draft=targetDraft(j);draft.samplePoint={x:.5,y:.5,radius:.05,selected:true,method:'manual_circle'};
  draft.hairMask.polygons=[[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]];
  draft.controls.target_lightness=15;draft.controls.target_redness=-20;
  j.target.adjustmentDraft=draft;j=confirmTargetAdjustment(j,{dataUrl:png,width:60,height:90,sourceLab:{L:48,a:11,b:22},adjustedLab:{L:58,a:3,b:18},clippedPixelFraction:0});
 }
 j=withDiagnosisSession(j,catalog);
 const width=60,height=90,pixels=new Uint8ClampedArray(width*height*4),mask=new Float32Array(width*height);
 for(let i=0;i<width*height;i++){pixels.set([93,70,49,255],i*4);mask[i]=i%width>10&&i%width<50?.99:.01;}
 const points=Array.from({length:478},()=>({x:.5,y:.4,z:0}));
 for(const [i,x,y] of [[10,.5,.2],[152,.5,.8],[234,.3,.45],[454,.7,.45],[172,.37,.7],[397,.63,.7],[1,.5,.5],[2,.5,.58],[168,.5,.4],[33,.37,.42],[133,.43,.42],[362,.57,.42],[263,.63,.42],[70,.39,.35],[300,.61,.35]])points[i]={x,y,z:0};
 const input=resolveAnalysisInput(j),id='phase4-synthetic-analysis',photoResult=photoPredictionResult(input.photos[0],{pixels,width,height,originalWidth:320,originalHeight:480,originalSha256:pngHash},{hairConfidence:mask,maskWidth:width,maskHeight:height,faces:[points],errors:[]},id,j.createdAt);
 j=commitPhotoAnalysis(j,{id,parentSessionId:j.diagnosisSession.id,createdAt:j.createdAt,schemaVersion:PHOTO_ANALYSIS_SCHEMA,provider:ANALYSIS_PROVIDER,hairModel:HAIR_MODEL,faceModel:FACE_MODEL,execution:'WORKER_CPU',status:'SUCCEEDED',inputPhotoIds:[photo.id],skipped:[],photos:[photoResult],hairEstimateId:`hair-estimate:${id}`,faceEstimateId:`face-estimate:${id}`,representativeColorPhotoId:photo.id,representativeFacePhotoId:photo.id});
 return mode==='COLOR_ONLY'?j:planBangFaceFrameDesigns(j);
}
export function fixtureResponse(request,origin='MOCK_TRANSPORT_FIXTURE'){
 return {requestId:request.requestId,jobId:request.jobId,designId:request.designId,parentGenerationId:request.parentGenerationId,parentMode:request.parentMode,image:png,width:1,height:1,generation:{origin,provider:'OPENAI_IMAGES_EDIT',model:'TEST_TRANSPORT_NOT_REAL_GENERATION',promptVersion:SIMULATION_PROMPT_VERSION,providerRequestId:'mock-provider-request',generatedAt:new Date().toISOString(),sha256:pngHash,usage:null,seed:null,providerAttempted:true}};
}
