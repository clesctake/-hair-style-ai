import type {HairZoneValues,FaceBoneAnalysis,ColorTarget,StyleTarget,SourceType,SourcedValue,HairZone,LiftRoute,RecipeProposal} from './session-model.ts';
import type {SalonProduct,ProductCatalog} from './takeaway-contract.ts';

export const PRO_DESIGN_MASTER_ID='file_0000000039ec81fd894d833f5e3b914b' as const;
export const nextColorFamilies=['BEIGE','GREIGE','BROWN','MATTE','ASH','LAVENDER','PINK','ORANGE','RED'] as const;
export type NextColorFamily=typeof nextColorFamilies[number];
export const familyNames:Record<NextColorFamily,string>={BEIGE:'ベージュ',GREIGE:'グレージュ',BROWN:'ブラウン',MATTE:'マット',ASH:'アッシュ',LAVENDER:'ラベンダー',PINK:'ピンク',ORANGE:'オレンジ',RED:'レッド'};
export const toneValues=['DOWN','BASE','UP'] as const;
export type NextTone=typeof toneValues[number];
export const homeCareFocuses=['COLOR_RETENTION','DAMAGE','HEAT','DRYNESS','UV'] as const;
export type HomeCareFocus=typeof homeCareFocuses[number];
export const careNames:Record<HomeCareFocus,string>={COLOR_RETENTION:'色持ち',DAMAGE:'ダメージケア',HEAT:'熱ダメージ対策',DRYNESS:'乾燥対策',UV:'UV対策'};
/** System Settings may supply this contract; no settings editor or invented catalogue is added. */
export type SalonConfiguration={id:string;revision:number;enabledFirstAgentIds:string[];enabledDeveloperIds:string[];menus:{id:string;name:string;active:boolean}[];productCatalog:ProductCatalog|null;source:'EXISTING_REGISTERED_DATA'|'SYSTEM_SETTINGS'};
export type NextColorSelection={family:NextColorFamily;tone:NextTone;order:number;reason:string;sourceType:'STYLIST_CORRECTED'|'AI_ESTIMATE'|'MOCK';sourceId:string|null;needsStylistConfirmation:boolean};
export type ProDesignRecipe={id:string;label:'A'|'B'|'C';objective:'REPRODUCTION'|'CONDITION'|'RETENTION';name:string;proposal:RecipeProposal;route:SourcedValue<LiftRoute>;predictedFinish:null;reproductionScore:null;developerId:string|null;mixingRatio:SourcedValue<number>;requiresStylistReview:true;missingData:string[]};
export type ProDesignInput={sessionId:string;currentPhotoIds:string[];styleTarget:StyleTarget;colorTarget:ColorTarget;hairZones:Record<HairZone,HairZoneValues>;hairHistoryIds:string[];faceEstimateId:string|null;faceBoneSnapshot:FaceBoneAnalysis;designId:string|null;finalImageId:string|null;counselingConfirmationId:string|null;requestNote:string;settingsId:string;settingsRevision:number};
export type AssistRecord={id:string;kind:'NEXT_COLORS'|'MESSAGE';createdAt:string;sourceType:SourceType;provider:string;model:string;requestId:string|null;inputFingerprint:string;usage:{inputTokens:number|null;outputTokens:number|null};text:string|null;options:NextColorSelection[]|null};
export type ProDesignState={
 schemaVersion:'pro-design-v1';visualMasterId:typeof PRO_DESIGN_MASTER_ID;parentSessionId:string;createdAt:string;updatedAt:string;
 settings:SalonConfiguration;inputSnapshot:ProDesignInput;inputFingerprint:string;
 recipeSets:{id:string;createdAt:string;inputFingerprint:string;settingsSnapshot:SalonConfiguration;recipes:ProDesignRecipe[]}[];activeRecipeSetId:string|null;selectedRecipeId:string|null;
 nextColors:NextColorSelection[];aiHistory:AssistRecord[];
 aftercare:{visitWeeks:4|6|8|null;customWeeks:number|null;menuId:string|null;menuSnapshot:{id:string;name:string}|null;homeCare:HomeCareFocus[];productIds:string[];productSnapshots:SalonProduct[]};
 message:{notes:string;text:string;aiProposalId:string|null;reviewedAt:string|null;confirmedAt:string|null;sourceType:'STYLIST_CORRECTED'|'AI_ESTIMATE'|'MOCK'|null};
 handoffs:{id:string;createdAt:string;sourceInputFingerprint:string;selectedRecipeId:string;nextColors:NextColorSelection[];aftercare:ProDesignState['aftercare'];message:string;generationStatus:'REAL'|'PARTIAL';finalImageReference:{assetId:string;generationId:string;designId:string;origin:'REAL_API'}|null;targetConfirmationId:string|null;selectedDesignId:string|null;status:'READY_FOR_PAGE_3_UI'}[];
};
