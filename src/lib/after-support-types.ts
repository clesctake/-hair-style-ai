import type {ComparisonCrop} from './image-comparison.ts';
import type {Lab} from './journey.ts';
import type {ProDesignState,NextColorSelection} from './pro-design-types.ts';
import type {FaceMetric,SourcedValue,ImageReference} from './session-model.ts';
import type {ProductImage} from './takeaway-contract.ts';
export const AFTER_SUPPORT_MASTER_ID='file_00000000f32482119c3b33f882402882' as const;
export const supportPurposes=['NEXT_COLOR','FADE_COLOR','MAKEUP'] as const;
export type SupportPurpose=typeof supportPurposes[number];
export const makeupThemes=['NATURAL','PINK','ORANGE'] as const;
export const makeupNames={NATURAL:'ナチュラル',PINK:'ピンク',ORANGE:'オレンジ'} as const;
export const fadeWeeks=[0,2,4,6] as const;
export type SupportSource={sessionId:string;handoffId:string;finalAssetId:string;finalDesignId:string;targetConfirmationId:string|null;selectedDesignId:string|null;sha256:string;inputFingerprint:string};
export type SupportParameters={nextColor:NextColorSelection|null;weeks:2|4|6|null;makeupTheme:typeof makeupThemes[number]|null;description:string;palette:string[];targetLab:Lab|null;targetLevel:null;prediction:'VISUAL_ESTIMATE_NOT_MEASURED'};
export type SupportRequest={schemaVersion:'after-support-request-v1';requestId:string;jobId:string;purpose:SupportPurpose;source:SupportSource;parameters:SupportParameters};
export type SupportImageResult={requestId:string;jobId:string;image:string;generation:{origin:'REAL_API'|'MOCK_TRANSPORT_FIXTURE';provider:string;model:string;providerRequestId:string|null;generatedAt:string;sha256:string;seed:null;promptVersion:string;providerAttempted:true;usage?:unknown;comparisonCrop?:ComparisonCrop;postprocessing?:{version:'support-local-color-only-v1';maskSource:'AI_ESTIMATE';geometryPreserved:true;unselectedPixelsPreserved:true};providerOriginalSha256?:string}};
export type SupportJob={id:string;requestId:string;purpose:SupportPurpose;slot:string;source:SupportSource;parameters:SupportParameters;inputSnapshot:SupportRequest;status:'QUEUED'|'GENERATING'|'COMPLETE'|'FAILED'|'STALE';assetId:string|null;attempts:number;createdAt:string;updatedAt:string;error:{code:string;message:string;providerAttempted:boolean;outcomeUnknown:boolean}|null};
export type SupportAsset={id:string;jobId:string;sourceImageId:string;confirmedDesignId:string;purpose:SupportPurpose;dataUrl:string;width:number;height:number;generation:SupportImageResult['generation'];createdAt:string;usage:'DISPLAY_ONLY';learningImageStorage:false};
export type SupportPlan={id:string;task:'FADE'|'MAKEUP'|'PRODUCT';handoffId:string;inputFingerprint:string;sourceType:'AI_ESTIMATE'|'MOCK';provider:string;model:string;requestId:string|null;createdAt:string;items:{key:string;description:string;palette:string[];usageAdvice:string|null}[];needsStylistReview:true};
/** Optional display references. The pixels remain in the existing session store. */
export const finishPhotoRoles=['FRONT','SIDE','BACK','FACE_FRAME','HAIR_DETAIL','COLOR_TEXTURE'] as const;
export type FinishPhotoRole=typeof finishPhotoRoles[number];
export type SupportFinishReference={id:string;handoffId:string;designId:string;targetConfirmationId:string|null;role:FinishPhotoRole;image:ImageReference;confirmedAt:string;actor:string};
/** An explicitly registered profile, never a stock or generated person. */
export type SupportStylistProfile={id:string;handoffId:string;name:string;photo:ProductImage|null;source:'SALON_REGISTERED';confirmedAt:string};
export type AfterSupportState={schemaVersion:'after-support-v1';visualMasterId:typeof AFTER_SUPPORT_MASTER_ID;parentSessionId:string;sourceHandoffId:string|null;createdAt:string;updatedAt:string;jobs:SupportJob[];assets:SupportAsset[];plans:SupportPlan[];generationJobCount:number;finishReferences?:SupportFinishReference[];stylistProfiles?:SupportStylistProfile[]};
export type SupportView={handoff:ProDesignState['handoffs'][number]|null;sourceStale:boolean;source:SupportSource|null;finalImage:string|null;nextColors:NextColorSelection[];aftercare:ProDesignState['aftercare']|null;message:string;faceValues:Partial<Record<FaceMetric,SourcedValue<number>>>;faceAdditionalValues?:Record<string,SourcedValue<number>>;faceEstimateId?:string|null;targetLab:Lab|null;targetLevel:number|null;colorText:string;designPoints:string[]};

