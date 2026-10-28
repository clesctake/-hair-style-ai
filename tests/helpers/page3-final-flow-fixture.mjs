import {readFileSync} from 'node:fs';
import {newJourney} from '../../src/lib/journey.ts';
import {withDiagnosisSession} from '../../src/lib/session-adapter.ts';
import {catalog} from '../../src/lib/catalog.ts';
import {targetDraft,confirmTargetAdjustment} from '../../src/lib/target-adjustment.ts';
import {newBasePlan,fact} from '../../src/lib/base-making.ts';
import {setCounselingInput} from '../../src/lib/counseling-session.ts';
import {faceMetricNames,unknownValue,sourcedValue} from '../../src/lib/session-model.ts';
import {ensureProDesign,calculateProDesignRecipes,currentRecipeSet,selectProRecipe,toggleNextColor,setNextTone,editProDesign,editStylistMessage,confirmProDesign,defaultSalonConfiguration} from '../../src/lib/pro-design-session.ts';
import {ensureAfterSupport} from '../../src/lib/after-support-session.ts';

/** Fictional form input. Real JPEG bytes from the existing approved MOCK reference,
 * manually entered test values; NO AI transport, customer, or external API. */
export function page3FinalFlow(){
 let j=newJourney();j.title='TEST ONLY：架空顧客・検証花子';j.stylist='TEST ONLY：架空美容師・検証太郎';
 const bytes=readFileSync(new URL('../../public/after-support-master/front.jpg',import.meta.url)),url='data:image/jpeg;base64,'+bytes.toString('base64');
 const photo={id:'final-test-front',view:'front',name:'TEST_ONLY_MASTER_REFERENCE.jpg',createdAt:j.createdAt,dataUrl:url,width:180,height:222,original:{dataUrl:url,mimeType:'image/jpeg',byteSize:bytes.length,width:180,height:222,representation:'original_file_bytes',colourProcessing:'none_app_applied',profile:'not_parsed'}};
 j.photos=[photo];j.target.styleReference={...photo,id:'final-test-style',view:'style_reference'};j.target.reference={...photo,id:'final-test-color',view:'reference'};j.target.style='TEST ONLY：顔周りの確認';j.target.simulationMode='style_color';
 const draft=targetDraft(j);draft.samplePoint={x:.5,y:.5,radius:.05,selected:true,method:'manual_circle'};draft.hairMask.polygons=[[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]];j.target.adjustmentDraft=draft;
 j=confirmTargetAdjustment(j,{dataUrl:url,width:180,height:222,sourceLab:{L:48,a:11,b:22},adjustedLab:{L:58,a:3,b:18},clippedPixelFraction:0});
 j.target.level=8;j.baseMaking={...newBasePlan(),targetFinishLevel:fact(8,'STYLIST_CORRECTED',['final-test-input'],'TEST_ONLY_manual_level')};j=withDiagnosisSession(j,catalog);
 j=setCounselingInput(j,'colorHistory','あり');j=setCounselingInput(j,'bleachHistory','1回');j=setCounselingInput(j,'damage','中');
 const f=j.diagnosisSession.faceBoneAnalysis,id='final-test-manual-face';f.activeEstimateId=id;
 f.aiEstimate.push({id,inputPhotoIds:[photo.id],createdAt:j.createdAt,featureState:'PARTIAL',modelVersion:null,metrics:Object.fromEntries(faceMetricNames.map(key=>[key,unknownValue()])),additionalMeasurements:{nosePosition:sourcedValue(.59,'STYLIST_CORRECTED',photo.id,j.createdAt,'TEST_ONLY_manual_value')},coordinateSpace:'NORMALIZED_IMAGE_2D',landmarks:[]});
 for(const [metric,value]of [['faceHeightWidthRatio',1.25],['foreheadHeightRatio',.31],['lowerFaceRatio',.38]])f.stylistCorrection.push({id:'final-test-'+metric,estimateId:id,metric,value:sourcedValue(value,'STYLIST_CORRECTED',photo.id,j.createdAt,'TEST_ONLY_manual_value'),actor:j.stylist,createdAt:j.createdAt});
 const products=[{productId:'test-salon-milk',brand:'TEST ONLY：架空メーカー',productName:'TEST ONLY：架空ケアミルク',category:'MILK',image:{imageId:'test-product',imageUrl:null,localReference:'/after-support-master/texture.jpg',width:185,height:97},price:null,targetConcerns:[],features:['TEST ONLY：登録した特徴'],usageTiming:'乾かす前',usageMethod:'TEST ONLY：使用方法\n全文と改行を保持',salonMemo:'TEST ONLY',active:true}];
 const settings={...defaultSalonConfiguration(catalog),id:'TEST_ONLY_FICTIONAL_SALON',menus:[{id:'test-menu',name:'TEST ONLY：カット＋カラー',active:true}],productCatalog:{catalogId:'test-catalog',salonId:'TEST_ONLY_FICTIONAL_SALON',schemaVersion:'product-catalog-v1',revision:1,products}};
 j=calculateProDesignRecipes(ensureProDesign(j,catalog,settings),catalog);j=selectProRecipe(j,currentRecipeSet(j).recipes[0].id);
 for(const family of ['BEIGE','PINK','MATTE'])j=toggleNextColor(j,family);j=setNextTone(j,'PINK','DOWN');j=setNextTone(j,'MATTE','UP');
 j=editStylistMessage(j,'TEST ONLY：架空美容師の確定メッセージ。\n改行と全文を保持します。');
 const p=j.diagnosisSession.proDesign;j=editProDesign(j,{aftercare:{visitWeeks:6,customWeeks:null,menuId:'test-menu',menuSnapshot:{id:'test-menu',name:'TEST ONLY：カット＋カラー'},homeCare:['COLOR_RETENTION','UV'],productIds:products.map(p=>p.productId),productSnapshots:products},message:{...p.message,reviewedAt:j.createdAt}});
 return ensureAfterSupport(confirmProDesign(j));
}
