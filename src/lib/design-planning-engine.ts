import {effectiveHairZone,unknownValue,type DiagnosisSession,type FaceMetric,type SourcedValue} from './session-model.ts';
import {effectiveFaceBoneValues,effectiveFaceCorrectionIds} from './effective-face-values.ts';
import {DESIGN_PLANNING_SCHEMA,DESIGN_ENGINE_VERSION,planningParameterOptions,type CurrentHairContext,type DesignPlanningInput,type DesignPlanningRun,type PlannedDesign,type PlanningParameters,type UsedFaceMetric} from './design-planning-types.ts';

export const emptyCurrentHairContext=():CurrentHairContext=>({lengthBand:unknownValue(),density:unknownValue(),hasBang:unknownValue(),bangLength:unknownValue(),faceFrameLength:unknownValue(),part:unknownValue(),hairFlow:unknownValue(),stylingDirection:unknownValue()});
/** No pixel analysis or inferred STYLE-image semantics here. Only known values/structured stylist inputs. */
export function designPlanningInput(session:DiagnosisSession):DesignPlanningInput {
  const style=structuredClone(session.styleTarget);
  // A previous selection is an output, not an input: prevent recursive planning/invalidation.
  style.bang=null;style.faceFrame=null;style.selectedBangDecisionId=null;
  return {parentSessionId:session.id,parentDesignId:session.designPlan.mainDesign.designId,currentPhotoIds:session.currentPhotos.map(p=>p.imageId),
    faceAnalysisId:session.faceBoneAnalysis.id,faceEstimateId:session.faceBoneAnalysis.activeEstimateId,
    faceValues:effectiveFaceBoneValues(session),faceCorrectionIds:effectiveFaceCorrectionIds(session),
    hairAnalysisId:session.hairAnalysis.id,hairEstimateId:session.hairAnalysis.activeEstimateId,
    hairZones:{ROOT:effectiveHairZone(session,'ROOT'),MID:effectiveHairZone(session,'MID'),END:effectiveHairZone(session,'END')},
    hairCorrectionIds:session.hairAnalysis.stylistCorrection.filter(c=>c.estimateId===session.hairAnalysis.activeEstimateId).map(c=>c.id),
    currentHair:structuredClone(session.designPlan.planning?.currentHair??emptyCurrentHairContext()),styleTarget:style};
}
export const designInputContext=(input:DesignPlanningInput)=>JSON.stringify(input);
const validObservation=(m:SourcedValue<number>)=>m.value!==null&&Number.isFinite(m.value)&&['AI_ESTIMATE','STYLIST_CORRECTED','EMPIRICAL'].includes(m.sourceType??'');
export class DesignPlanningInputError extends Error {
  missingInputs:string[];
  constructor(missingInputs:string[]){super('STEP 02で正面の顔解析を確認してください。取得済みの顔縦横比が必要です。固定MOCK値では設計しません。');this.missingInputs=missingInputs;}
}
type Goal='horizontal'|'vertical'|'diagonal'|'cheek'|'eye'|'jaw'|'airy'|'curve'|'graphic'|'outward';
const goals:Goal[]=['horizontal','vertical','diagonal','cheek','eye','jaw','airy','curve','graphic','outward'];
const goalsText:Record<Goal,string>={horizontal:'横へ視線をつなぐ',vertical:'縦のラインを添える',diagonal:'斜めに流れる',cheek:'顔周りに動きをつくる',eye:'目元を引き立てる',jaw:'顎へつながる',airy:'軽やかに開く',curve:'やわらかい曲線',graphic:'前髪のラインを楽しむ',outward:'外へ開く動き'};
const parameterLabel=(key:keyof PlanningParameters,value:string)=>(planningParameterOptions[key].values as Record<string,string>)[value];
export const planningFaceMetricLabels:Partial<Record<FaceMetric,string>>={faceHeightWidthRatio:'顔の縦横比',jawWidthRatio:'顎周辺の横幅比',cheekbonePosition:'頬付近の位置',lowerFaceRatio:'下顔面の比率',midfaceRatio:'眉から鼻底の比率',browEyeDistance:'眉・目の間隔',eyePosition:'目の位置'};

/**
 * Real deterministic calculation, unvalidated aesthetic heuristics (not an LLM
 * or a learned suitability model). Goals form a pool, not fixed A–E templates.
 * Measurements influence parameters AND pool ranking; diversity is selected last.
 */
export function generateDesignPlanningRun(input:DesignPlanningInput,options:{id?:string;createdAt?:string}={}):DesignPlanningRun {
  const aspect=input.faceValues.faceHeightWidthRatio;
  if(!input.faceEstimateId||!validObservation(aspect)||aspect.value!<=0||aspect.value!>4)throw new DesignPlanningInputError(['faceBoneAnalysis.faceHeightWidthRatio']);
  const runId=options.id??crypto.randomUUID(),createdAt=options.createdAt??new Date().toISOString();
  const candidates=goals.map((goal,index)=>{
    const used=new Map<FaceMetric,UsedFaceMetric>(),missing=new Set<string>(),inputs=new Set<string>(),rules=new Set<string>();
    const metric=(key:FaceMetric,rule:string):number|null=>{rules.add(rule);const m=input.faceValues[key];if(!validObservation(m)){missing.add(`faceBoneAnalysis.${key}`);return null;}
      const entry=used.get(key)??{key,observation:structuredClone(m),correctionId:input.faceCorrectionIds[key]??null,rules:[]};if(!entry.rules.includes(rule))entry.rules.push(rule);used.set(key,entry);return m.value;};
    const hair=<K extends keyof CurrentHairContext>(key:K):CurrentHairContext[K]['value']=>{const v=input.currentHair[key];if(v.value===null||v.sourceType==='MOCK'){missing.add(`currentHair.${key}`);return null;}inputs.add(`currentHair.${key}`);return v.value;};
    const r=metric('faceHeightWidthRatio','surface-aspect-span-v1')!;
    // These thresholds are design controls, not validated face-category boundaries.
    const horizontal=r>1.35,slim=r<1.2;
    let p:PlanningParameters={bangLength:'above_eye',bangWidth:horizontal?'wide':slim?'narrow':'standard',bangDensity:'thin',bangPart:'none',bangFlow:'straight',
      sideBangLength:'cheekbone',faceFrameStart:'cheekbone',faceFrameLength:'mouth',faceFrameDirection:'side',faceFrameVolumePosition:'cheekbone'};
    let score=1;
    const part=hair('part'),density=hair('density'),length=hair('lengthBand'),hasBang=hair('hasBang'),currentBang=hair('bangLength'),currentFrame=hair('faceFrameLength'),flow=hair('hairFlow'),direction=hair('stylingDirection');
    const sidePart=part==='left'||part==='right'?part:input.styleTarget.part==='left'||input.styleTarget.part==='right'?input.styleTarget.part:'left';
    if(part===null&&!(input.styleTarget.part==='left'||input.styleTarget.part==='right'))missing.add('sidePartDirectionStylistConfirmation');
    switch(goal){
      case 'horizontal':p.bangWidth='wide';p.bangLength=horizontal?'above_eye':'brow';p.bangDensity='standard';p.faceFrameLength=horizontal?'cheek':'mouth';score+=(r-1.35)*2;break;
      case 'vertical':p.bangLength='long';p.bangWidth='narrow';p.bangPart='center';p.bangFlow='outward';p.sideBangLength='mouth';p.faceFrameLength='chin';p.faceFrameDirection='inward';p.faceFrameVolumePosition='jaw';score+=(1.35-r)*2;break;
      case 'diagonal':p.bangLength='cheekbone';p.bangPart=sidePart;p.bangFlow='side';p.bangWidth='narrow';p.faceFrameLength='chin';score+=Math.abs(r-1.35)+.35;break;
      case 'cheek':{const cheek=metric('cheekbonePosition','cheek-point-motion-v1');p.bangLength='below_brow';p.bangFlow='inward';p.faceFrameLength=cheek!==null&&cheek>.48?'mouth':'cheek';p.faceFrameDirection='outward';score+=cheek===null?0:Math.abs(cheek-.43)*5+.2;break;}
      case 'eye':{const gap=metric('browEyeDistance','eye-brow-fringe-v1'),eye=metric('eyePosition','eye-axis-fringe-v1');p.bangLength=gap!==null&&gap<.09?'brow':'above_eye';p.bangWidth=slim?'narrow':'standard';p.faceFrameLength='cheek';p.faceFrameVolumePosition='eye';score+=(gap??0)*3+(eye===null?0:eye*.5);break;}
      case 'jaw':{const lower=metric('lowerFaceRatio','lower-face-connection-v1'),jaw=metric('jawWidthRatio','jaw-width-flow-v1');p.bangLength='eye';p.bangPart=sidePart;p.bangFlow='side';p.sideBangLength='chin';p.faceFrameStart=lower!==null&&lower>.36?'mouth':'cheek';p.faceFrameLength='chin';p.faceFrameDirection=jaw!==null&&jaw>.8?'inward':'side';p.faceFrameVolumePosition='jaw';score+=(lower??0)*1.4+(jaw===null?0:Math.abs(jaw-.78)*3);break;}
      case 'airy':{const gap=metric('browEyeDistance','open-fringe-eye-v1');p.bangLength=gap!==null&&gap>.12?'cheekbone':'eye';p.bangPart='center';p.bangWidth=horizontal?'wide':'standard';p.bangFlow='side';p.faceFrameLength='mouth';p.faceFrameDirection='outward';score+=hasBang===false?.7:.15;break;}
      case 'curve':{const mid=metric('midfaceRatio','midface-soft-connection-v1');p.bangLength='below_brow';p.bangFlow='inward';p.bangWidth=slim?'narrow':'standard';p.sideBangLength='cheek';p.faceFrameStart='cheek';p.faceFrameLength=mid!==null&&mid>.4?'chin':'mouth';p.faceFrameDirection='inward';p.faceFrameVolumePosition='cheek';score+=(mid??0)+.1;break;}
      case 'graphic':{const gap=metric('browEyeDistance','graphic-eye-spacing-v1');p.bangLength=gap!==null&&gap>.1?'above_brow':'brow';p.bangDensity='standard';p.bangWidth=horizontal?'wide':'standard';p.sideBangLength='mouth';p.faceFrameStart='mouth';p.faceFrameLength='chin';p.faceFrameVolumePosition='jaw';score+=horizontal?.3:-.1;break;}
      case 'outward':{const cheek=metric('cheekbonePosition','outward-cheek-motion-v1');p.bangLength='cheekbone';p.bangPart=sidePart;p.bangFlow='outward';p.bangWidth=horizontal?'wide':'standard';p.sideBangLength='cheek';p.faceFrameStart='cheek';p.faceFrameLength='mouth';p.faceFrameDirection='outward';p.faceFrameVolumePosition=cheek!==null&&cheek>.48?'cheek':'cheekbone';score+=(cheek??0)*.8+.15;break;}
    }
    rules.add(`goal-${goal}-v1`);
    if(['diagonal','jaw','outward'].includes(goal)&&part!== 'left'&&part!=='right'&&['left','right'].includes(input.styleTarget.part??''))inputs.add('styleTarget.part');
    // Observable/confirmed hair information modifies density, feasibility and style direction only.
    if(density==='LOW')p.bangDensity='thin';else if(density==='HIGH'&&goal==='graphic')p.bangDensity='thick';
    const thickness=input.hairZones.MID.hairThickness;if(thickness.value!==null&&thickness.sourceType!=='MOCK'){inputs.add('hairAnalysis.MID.hairThickness');if(thickness.value>=4)p.bangDensity='thin';rules.add('confirmed-fiber-density-v1');}
    if(length==='PIXIE'||length==='BOB'){if(['long','cheekbone'].includes(p.bangLength))missing.add('feasibility.lengthForLongBang');if(['chin','clavicle'].includes(p.faceFrameLength))missing.add('feasibility.lengthForFaceFrame');}
    if(hasBang===false&&['horizontal','eye','graphic'].includes(goal))missing.add('stylistConfirmation.createNewBang');
    if(currentBang===p.bangLength)score+=.1;if(currentFrame===p.faceFrameLength)score+=.1;if(flow===p.bangFlow)score+=.12;
    if(direction==='SOFT'&&['curve','cheek','diagonal'].includes(goal)||direction==='CLEAN'&&['graphic','horizontal','vertical'].includes(goal)||direction==='AIRY'&&['airy','vertical'].includes(goal)||direction==='MOVEMENT'&&['outward','cheek','diagonal'].includes(goal))score+=.7;
    if(input.styleTarget.referenceImage){inputs.add('styleTarget.referenceImage');missing.add('styleTarget.referenceShapeAnalysis');}
    if(input.styleTarget.requestText.trim()){inputs.add('styleTarget.requestText');missing.add('styleTarget.freeTextShapeInterpretation');}
    const layer=input.styleTarget.layer;if(layer.amount){inputs.add('styleTarget.layer.amount');if(layer.amount==='light'&&['cheek','outward'].includes(goal))score-=.35;else if(layer.amount==='more'&&['cheek','outward'].includes(goal))score+=.4;}
    if(layer.start&&['cheekbone','chin'].includes(layer.start)){p.faceFrameStart=layer.start as PlanningParameters['faceFrameStart'];inputs.add('styleTarget.layer.start');rules.add('preserve-structured-style-layer-v1');}
    if(input.styleTarget.volume){inputs.add('styleTarget.volume');if(input.styleTarget.volume==='side')p.faceFrameVolumePosition='cheekbone';else if(input.styleTarget.volume==='lower')p.faceFrameVolumePosition='jaw';}
    if(input.styleTarget.hairFlow&&['straight','inward','side','outward'].includes(input.styleTarget.hairFlow)){inputs.add('styleTarget.hairFlow');p.faceFrameDirection=input.styleTarget.hairFlow==='straight'?'side':input.styleTarget.hairFlow as PlanningParameters['faceFrameDirection'];}
    if(input.styleTarget.overallLength.value!==null&&input.styleTarget.overallLength.sourceType!=='MOCK'){
      inputs.add('styleTarget.overallLength');rules.add('confirmed-style-length-feasibility-v1');
      if(input.styleTarget.overallLength.value<15&&['chin','clavicle'].includes(p.faceFrameLength))missing.add('feasibility.styleLengthForFaceFrame');
    }
    const usedMetrics=[...used.values()],contextFilled=Object.values(input.currentHair).filter(v=>v.value!==null&&v.sourceType!=='MOCK').length;
    const confidence=Math.max(.1,Math.min(.7,.18+usedMetrics.length*.045+contextFilled*.025-(missing.has('styleTarget.referenceShapeAnalysis')?.06:0)));
    const start=parameterLabel('faceFrameStart',p.faceFrameStart),end=parameterLabel('faceFrameLength',p.faceFrameLength),width=parameterLabel('bangWidth',p.bangWidth),fringe=parameterLabel('bangLength',p.bangLength);
    const effect=goal==='horizontal'?`${width}の${fringe}前髪で、視線を横方向へつなぎやすい設計です。`:goal==='vertical'?`中央を開く長めの前髪と${end}までの顔周りで、縦に流れるラインを添えます。`:goal==='eye'||goal==='graphic'?`${fringe}の前髪と${width}の幅で、眉・目元の表情を引き立てる設計です。`:`${start}から${end}へ顔周りをつなぎ、${goal==='diagonal'?'斜めの流れ':goal==='airy'?'軽やかな抜け感':goal==='curve'?'内側のやわらかい曲線':'顔周辺の動き'}をつくる設計です。`;
    return {goal,index,score,parameters:p,usedMetrics,usedInputs:[...inputs],ruleIds:[...rules],confidence,missingInputs:[...missing],effect};
  });
  candidates.sort((a,b)=>b.score-a.score||a.index-b.index);
  const selected:typeof candidates=[];
  const difference=(a:PlanningParameters,b:PlanningParameters)=>Object.keys(a).filter(k=>a[k as keyof PlanningParameters]!==b[k as keyof PlanningParameters]).length;
  for(const candidate of candidates)if(selected.every(d=>difference(d.parameters,candidate.parameters)>=2)){selected.push(candidate);if(selected.length===5)break;}
  if(selected.length<5)for(const candidate of candidates)if(!selected.includes(candidate)&&selected.every(d=>difference(d.parameters,candidate.parameters)>=1)){selected.push(candidate);if(selected.length===5)break;}
  if(selected.length!==5)throw new Error('条件を保った5方向を分けられませんでした。STYLE条件を美容師が確認してください。');
  const proposals:PlannedDesign[]=selected.map((c,index)=>{
    const label=(['A','B','C','D','E'] as const)[index],metricKeys=c.usedMetrics.map(m=>m.key);
    const rationale=c.usedMetrics.map(m=>`${planningFaceMetricLabels[m.key]??m.key} ${m.observation.value!.toFixed(3)} (${m.observation.sourceType}) → ${m.rules.join(', ')}`).join('／');
    return {id:`planned:${runId}:${label}`,parentSessionId:input.parentSessionId,parentDesignId:input.parentDesignId,label,name:`${goalsText[c.goal]} · ${parameterLabel('bangLength',c.parameters.bangLength)}`,
      visualEffectDescription:c.effect,parameters:c.parameters,rationale,basedOnFaceBoneAnalysis:{analysisId:input.faceEstimateId,metricKeys,valuesWereUsed:c.usedMetrics.length>0},
      sourceType:'AI_ESTIMATE',featureState:'ESTIMATE',generatedImage:null,generationStatus:'NOT_REQUESTED',generationMetadata:null,stylistCorrection:[],draftParameters:null,selectedCorrectionId:null,
      variantType:'BANG_FACE_FRAME',confidence:c.confidence,confidenceMethod:'UNVALIDATED_INPUT_COVERAGE_NOT_PROBABILITY',missingInputs:c.missingInputs,needsStylistConfirmation:true,
      usedMetrics:c.usedMetrics,usedInputs:c.usedInputs,ruleIds:c.ruleIds,planningMetadata:{engineVersion:DESIGN_ENGINE_VERSION,method:'MEASUREMENT_DRIVEN_RULES',validation:'UNVALIDATED',goal:c.goal,rankScore:c.score},
      generationSeedMetadata:{strategy:'INHERIT_MAIN_PERSON_STYLE_COLOR',seed:null,parentRequestId:null},sourceAnalysisIds:{faceEstimateId:input.faceEstimateId!,hairEstimateId:input.hairEstimateId,faceCorrectionIds:c.usedMetrics.flatMap(m=>m.correctionId?[m.correctionId]:[]),hairCorrectionIds:[...input.hairCorrectionIds]}};
  });
  return {id:runId,parentSessionId:input.parentSessionId,createdAt,schemaVersion:DESIGN_PLANNING_SCHEMA,engineVersion:DESIGN_ENGINE_VERSION,specVersion:'1.1',inputContext:designInputContext(input),input:structuredClone(input),proposals};
}
