import type {ColorRepresentation,BangFaceFrameParameters,ImageReference,SourcedValue} from './session-model.ts';
/** MASTER v1.1 future contracts ONLY. No catalogue CRUD, recommender, UI tab, export or sharing implementation. */
export type RecommendationLayers<T> = {
  aiProposed:{id:string;state:'AI_PROPOSED';value:T;createdAt:string}|null;
  stylistSelected:{id:string;state:'STYLIST_SELECTED';proposalId:string|null;value:T;actor:string;createdAt:string}[];
  stylistEdited:{id:string;state:'STYLIST_EDITED';selectionId:string;value:T;actor:string;createdAt:string}[];activeSelectionId:string|null;activeEditId:string|null;
};
export type ProductCategory='SHAMPOO'|'TREATMENT'|'OIL'|'MILK'|'MIST'|'STYLING'|'SCALP'|'OTHER';
/** Salon-owned product assets do not belong to a person's DiagnosisSession. */
export type ProductImage={imageId:string;imageUrl:string|null;localReference:string|null;width:number|null;height:number|null};
export type SalonProduct = {
  productId:string;brand:string;productName:string;category:ProductCategory;image:ProductImage|null;
  price:{amount:number;currency:string;taxIncluded:boolean|null}|null;targetConcerns:string[];features:string[];
  usageTiming:string|null;usageMethod:string|null;salonMemo:string;active:boolean;
};
export type ProductCatalog={catalogId:string;salonId:string;schemaVersion:'product-catalog-v1';revision:number;products:SalonProduct[]};
export type NextColorOption={id:string;target:ColorRepresentation|null;finishLevel:SourcedValue<number>;requiredUnderLevel:SourcedValue<number>;requiredUnderTone:string|null;rationale:string|null;
  sourceTreatmentResultId:string;sourceHairAnalysisId:string;historyIds:string[];feasibility:'UNKNOWN'|'ESTIMATE'|'STYLIST_CONFIRMED';needsStylistConfirmation:boolean};
export type NextDesignOption={id:string;parameters:BangFaceFrameParameters;anticipatedLength:SourcedValue<number>;sourceDesignId:string|null;reevaluationRequired:true;reason:string|null};
export type MakeupSuggestion={id:string;category:'lip'|'cheek'|'eye';colorFamily:string|null;visualEffect:string|null;reason:string|null;priority:number|null;previewImage:ImageReference|null};
export type ProductRecommendation={id:string;productId:string;catalogId:string;catalogRevision:number;sourceHairAnalysisId:string;sourceTreatmentResultId:string;sourceFinalDesignId:string|null;
  recommendationReason:string|null;usageAdvice:string|null;usageTiming:string|null;selectedProductSnapshot:SalonProduct};
export type CustomerTakeaway={
  id:string;parentSessionId:string;schemaVersion:'customer-takeaway-v1';specVersion:'1.1';sourceRevision:number;createdAt:string;updatedAt:string;
  currentResult:{designId:string|null;color:ColorRepresentation|null;bangFaceFrame:BangFaceFrameParameters|null;finishPoints:string[];generationReferences?:{mainGenerationId:string|null;selectedGenerationId:string|null;imageIds:string[]}};
  nextColorOptions:RecommendationLayers<NextColorOption[]>;nextDesignOptions:RecommendationLayers<NextDesignOption[]>;
  makeupSuggestions:RecommendationLayers<MakeupSuggestion[]>;productRecommendations:RecommendationLayers<ProductRecommendation[]>;
  nextVisitProposal:{timing:string|null;reason:string|null};outputs:{format:'APP'|'PDF'|'IMAGE'|'QR'|'LINE_READY';assetId:string|null;state:'UNIMPLEMENTED'}[];
};
export type TakeawayInputReferences={sessionId:string;treatmentResultId:string;selectedDesignId:string|null;colorResultId:string|null;productCatalogId:string|null;generationReferences?:{mainGenerationId:string|null;selectedGenerationId:string|null;imageIds:string[]}};
