import {faceInputContext,validateFaceAnalysis,type FaceAnalysis} from './face-measurements.ts';
import type {Journey,Photo} from './journey.ts';
export const bangOptions={
 kind:{label:'デザイン',values:{none:'前髪なし',center:'センター分け',swept_up:'かきあげ',swept:'流し前髪',see_through:'シースルーバング',soft:'薄め前髪',classic:'ベーシックバング'}},
 length:{label:'長さ',values:{above_brow:'オン眉',brow:'眉ライン',below_brow:'眉下',above_eye:'目上',eye:'目にかかる',cheekbone:'頬骨付近',long:'長め'}},
 width:{label:'幅',values:{narrow:'狭め',standard:'標準',wide:'広め'}},
 density:{label:'厚さ',values:{thin:'薄め',standard:'標準',thick:'厚め'}},
 part:{label:'分け目',values:{none:'なし',center:'センター',left:'左',right:'右'}},
 flow:{label:'毛流れ',values:{straight:'ストレート',inward:'内側',side:'サイドへ流す',outward:'外へ流す'}},
 sideBang:{label:'サイドバング長',values:{cheekbone:'頬骨',cheek:'頬',mouth:'口元',chin:'顎'}},
 faceFrame:{label:'顔周りの接続位置',values:{cheekbone:'頬骨',cheek:'頬',mouth:'口元',chin:'顎'}},
} as const;
export type BangParameters={[K in keyof typeof bangOptions]:keyof typeof bangOptions[K]['values']};
export type BangProposal={id:string;label:'A'|'B'|'C'|'D'|'E';title:string;parameters:BangParameters;intent:string;emphasis:string;basisMetrics:string[];origin:'mock_design_template'};
export type BangSet={id:string;analysisId:string;createdAt:string;ruleVersion:'bang-template-demo-v1';proposals:BangProposal[]};
export type BangDecision={id:string;setId:string;proposalId:string;analysisId:string;parameters:BangParameters;origin:'stylist_final';actor:string;createdAt:string};
export type BangTrial={id:string;proposalId:string;analysisId:string;currentPhotoId:string;parameters:BangParameters;context:string;requestText:string;createdAt:string;state:'not_connected';generatedImage:null};
export type FaceDesignState={version:'face-design-v1';analyses:FaceAnalysis[];activeAnalysisId:string|null;sets:BangSet[];activeSetId:string|null;drafts:Record<string,BangParameters>;decisions:BangDecision[];selectedDecisionId:string|null;trials:BangTrial[];outcomes:{id:string;decisionId:string;afterPhotoId:string|null;rating:number|null;notes:string;createdAt:string;origin:'stylist_actual'}[]};
const stamp=()=>new Date().toISOString();
export const newFaceDesign=():FaceDesignState=>({version:'face-design-v1',analyses:[],activeAnalysisId:null,sets:[],activeSetId:null,drafts:{},decisions:[],selectedDecisionId:null,trials:[],outcomes:[]});
export interface BangDesigner {suggest(analysis:FaceAnalysis):BangSet}
export const demoBangDesigner:BangDesigner={suggest(analysis){
 const make=(label:BangProposal['label'],title:string,parameters:BangParameters,intent:string,emphasis:string,basisMetrics:string[]):BangProposal=>({id:crypto.randomUUID(),label,title,parameters,intent,emphasis,basisMetrics,origin:'mock_design_template'});
 const common:BangParameters={kind:'see_through',length:'below_brow',width:'narrow',density:'thin',part:'none',flow:'straight',sideBang:'cheekbone',faceFrame:'cheek'};
 return {id:crypto.randomUUID(),analysisId:analysis.id,createdAt:stamp(),ruleVersion:'bang-template-demo-v1',proposals:[
 make('A','透ける、軽やかなバング',common,'額にほどよい透け感を残し、顔の縦の見え方をやわらかく。','眉と目元の表情を引き立てる。',['upper_face_ratio','face_height_width_ratio']),
 make('B','長めに流すサイドバング',{...common,kind:'swept',length:'cheekbone',part:'left',flow:'side',sideBang:'cheekbone',faceFrame:'mouth'},'斜めの毛流れと頬骨につながるラインで、視線の流れをつくる。','頬から口元へ、なめらかなつながり。',['cheekbone_width_ratio','midface_ratio']),
 make('C','前髪なしのセンターライン',{...common,kind:'none',length:'long',width:'standard',part:'center',flow:'outward',sideBang:'cheek',faceFrame:'chin'},'額を見せ、顔周りに縦のラインを添える。','左右に開くラインで、輪郭の印象を整える。',['left_right_balance','jaw_width_ratio']),
 make('D','眉ラインのベーシックバング',{...common,kind:'classic',length:'brow',width:'standard',density:'standard',sideBang:'cheek',faceFrame:'cheek'},'横のラインをつくり、額と目元の見え方を調整。','自然な厚みで、目元に視線を集める。',['forehead_height_ratio','forehead_width_ratio']),
 make('E','オン眉で軽やかなアクセント',{...common,kind:'soft',length:'above_brow',width:'narrow',flow:'inward',sideBang:'mouth',faceFrame:'chin'},'眉上に余白をつくり、表情を明るく見せる。','短い前髪と長い顔周りのコントラスト。',['brow_eye_distance_ratio','lower_face_ratio']),
 ]};
}};
export function faceAnalysisFor(s:Journey){const f=s.faceDesign,a=f?.analyses.find(x=>x.id===f.activeAnalysisId);return a&&a.inputContext===faceInputContext(s.photos)?a:undefined;}
export function activeBangSet(s:Journey){const a=faceAnalysisFor(s);return a?s.faceDesign?.sets.find(x=>x.id===s.faceDesign?.activeSetId&&x.analysisId===a.id):undefined;}
export function selectedBangDecision(s:Journey){const a=faceAnalysisFor(s);return a?s.faceDesign?.decisions.find(x=>x.id===s.faceDesign?.selectedDecisionId&&x.analysisId===a.id):undefined;}
export function addFaceAnalysis(s:Journey,a:FaceAnalysis):Journey{if(a.inputContext!==faceInputContext(s.photos))throw new Error('写真が変更されました。顔分析をやり直してください。');const previous=s.faceDesign??newFaceDesign(),set=demoBangDesigner.suggest(a);return {...s,faceDesign:{...previous,analyses:[...previous.analyses,a],activeAnalysisId:a.id,sets:[...previous.sets,set],activeSetId:set.id,selectedDecisionId:null,drafts:{}}};}
export function bangDraft(s:Journey,p:BangProposal){return s.faceDesign?.drafts[p.id]??p.parameters;}
export function validateBangParameters(p:BangParameters){if(!p||Object.entries(bangOptions).some(([key,spec])=>!(String(p[key as keyof BangParameters]) in spec.values)))throw new Error('前髪パラメータの選択値を確認してください。');}
export function changeBangDraft(s:Journey,p:BangProposal,parameters:BangParameters):Journey{validateBangParameters(parameters);if(!s.faceDesign||!activeBangSet(s)?.proposals.some(x=>x.id===p.id))throw new Error('現在のデザイン案を選択してください。');return {...s,faceDesign:{...s.faceDesign,drafts:{...s.faceDesign.drafts,[p.id]:parameters}}};}
export function adoptBangDesign(s:Journey,p:BangProposal):Journey{const set=activeBangSet(s);if(!set||!s.faceDesign||!set.proposals.some(x=>x.id===p.id))throw new Error('現在写真に対応したデザイン案を選択してください。');const parameters=structuredClone(bangDraft(s,p));validateBangParameters(parameters);const decision:BangDecision={id:crypto.randomUUID(),setId:set.id,proposalId:p.id,analysisId:set.analysisId,parameters,origin:'stylist_final',actor:s.stylist.trim()||'担当美容師',createdAt:stamp()};return {...s,faceDesign:{...s.faceDesign,decisions:[...s.faceDesign.decisions,decision],selectedDecisionId:decision.id}};}
export function bangDescription(p:BangParameters){return Object.entries(bangOptions).map(([key,spec])=>`${spec.label}: ${(spec.values as Record<string,string>)[p[key as keyof BangParameters]]}`).join(' / ');}
export function requestBangTrial(s:Journey,p:BangProposal):Journey{const a=faceAnalysisFor(s),photo=s.photos.find(x=>x.view==='front'),f=s.faceDesign;if(!a||!photo||!f)throw new Error('正面写真とFACE DESIGNを確認してください。');const parameters=structuredClone(bangDraft(s,p));validateBangParameters(parameters);const requestText=`本人の顔・表情・年齢・肌・背景・服装・ポーズ・髪色と全体の長さを維持。前髪と顔周りだけを変更。${bangDescription(parameters)}`;const context=JSON.stringify({currentPhotoId:photo.id,analysisId:a.id,proposalId:p.id,parameters});return {...s,faceDesign:{...f,trials:[...f.trials,{id:crypto.randomUUID(),proposalId:p.id,analysisId:a.id,currentPhotoId:photo.id,parameters,context,requestText,createdAt:stamp(),state:'not_connected',generatedImage:null}]}};}
export function validateFaceDesign(f:FaceDesignState,photos:Photo[]){
 if(f.version!=='face-design-v1')throw new Error('FACE DESIGNの形式を確認してください。');
 f.analyses.forEach(validateFaceAnalysis);const analyses=new Map(f.analyses.map(a=>[a.id,a])),sets=new Map(f.sets.map(s=>[s.id,s]));
 for(const set of f.sets){if(!analyses.has(set.analysisId)||set.proposals.length!==5||new Set(set.proposals.map(p=>p.label)).size!==5||set.ruleVersion!=='bang-template-demo-v1')throw new Error('前髪提案の出典を確認してください。');set.proposals.forEach(p=>validateBangParameters(p.parameters));}
 Object.values(f.drafts).forEach(validateBangParameters);
 for(const d of f.decisions){if(d.origin!=='stylist_final'||!sets.get(d.setId)?.proposals.some(p=>p.id===d.proposalId)||sets.get(d.setId)?.analysisId!==d.analysisId||!Number.isFinite(Date.parse(d.createdAt)))throw new Error('美容師のデザイン確定元を確認してください。');validateBangParameters(d.parameters);}
 for(const t of f.trials){validateBangParameters(t.parameters);if(t.state!=='not_connected'||t.generatedImage!==null||!analyses.has(t.analysisId)||t.context!==JSON.stringify({currentPhotoId:t.currentPhotoId,analysisId:t.analysisId,proposalId:t.proposalId,parameters:t.parameters}))throw new Error('前髪プレビューの状態を確認してください。');}
 if(f.activeAnalysisId&&!analyses.has(f.activeAnalysisId)||f.activeSetId&&!sets.has(f.activeSetId)||f.selectedDecisionId&&!f.decisions.some(d=>d.id===f.selectedDecisionId))throw new Error('選択中のFACE DESIGNを確認してください。');
 for(const o of f.outcomes)if(o.origin!=='stylist_actual'||!f.decisions.some(d=>d.id===o.decisionId)||o.rating!==null&&(!Number.isInteger(o.rating)||o.rating<1||o.rating>5))throw new Error('デザインの実績評価を確認してください。');
}
export function assertFaceHistory(previous:Journey,next:Journey){for(const key of ['analyses','sets','decisions','trials','outcomes'] as const){const items=previous.faceDesign?.[key]??[];for(let i=0;i<items.length;i++)if(JSON.stringify(items[i])!==JSON.stringify(next.faceDesign?.[key]?.[i]))throw new Error('保存済みの顔分析・前髪提案・美容師判断の履歴は変更できません。');}}
