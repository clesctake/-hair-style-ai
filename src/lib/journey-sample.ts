import {addFaceAnalysis} from './bang-design.ts';
import {mockFaceAnalyzer} from './face-measurements.ts';
import {hairImageInput} from './hair-images.ts';
import { demoHairMask } from './hair-mask.ts';
import type { CatalogData } from './catalog.ts';
import { type Journey, type Photo, newJourney, demoAnalyzer, correct, proposeRecipes, recipeContext, uid } from './journey.ts';

export type SampleAssets = Record<'current'|'target'|'result', { dataUrl:string; width:number; height:number }>;
export type JourneySample = {
 session:Journey;
 preview:{dataUrl:string; origin:'pre_generated_sample'; context:string; proposalId:string; beforePhotoIds:string[];designContext?:string|null};
};

// The illustrative image is deliberately outside the treatment record and its After field.
export async function createJourneySample(data:CatalogData, assets:SampleAssets):Promise<JourneySample>{
 let session=newJourney();
 const photo=(key:'current'|'target',view:Photo['view']):Photo=>({id:uid(),view,name:`fictional-${key}.jpg`,...assets[key],createdAt:session.createdAt});
 session.title='サンプル相談：赤みブラウン → 透明感ベージュ';
 session.stylist='デモ担当';
 session.photos=[photo('current','front')];
 const analysis=await demoAnalyzer.analyze(session.photos);
 session.analyses=[analysis];session.activeAnalysisId=analysis.id;
 session=correct(session,'mid','damage',4);
 session=correct(session,'mid','orange',3);
 session=correct(session,'end','porosity',5);
 session.history=[{id:uid(),type:'color',date:'2026-08-10',region:'all',notes:'サンプル履歴：暖色ブラウン。実際のお客様の履歴ではありません。'}];
 session.target.styleReference={...photo('current','style_reference'),...assets.result,name:'fictional-style-reference.jpg'};
 session.target.reference=photo('target','reference');
 session=addFaceAnalysis(session,await mockFaceAnalyzer.analyze(session.photos));
 session.target.referenceHairMask=demoHairMask(session.target.reference!.id);
 session.target.text='赤みを抑えた透明感のあるベージュ';
 session.target.style='鎖骨付近のレイヤーロブ。現在より約8cm短く、薄めの前髪と柔らかい顔周り。長さはデモ指定で未計測。';
 session.proposals=proposeRecipes(session,data);
 session.selectedProposalId=session.proposals[0].id;
 session.step=7;
 session.preview={state:'requested',context:recipeContext(session)};
 return {session,preview:{dataUrl:assets.result.dataUrl,origin:'pre_generated_sample',context:recipeContext(session),proposalId:session.selectedProposalId,beforePhotoIds:session.photos.map(p=>p.id),designContext:hairImageInput(session)?.context??null}};
}

export function samplePreviewMatches(sample:JourneySample|undefined,session:Journey):boolean{
 return Boolean(sample&&(sample.preview.designContext===undefined||sample.preview.designContext===hairImageInput(session)?.context)&&sample.preview.context===recipeContext(session)&&sample.preview.proposalId===session.selectedProposalId&&JSON.stringify(sample.preview.beforePhotoIds)===JSON.stringify(session.photos.map(p=>p.id)));
}
