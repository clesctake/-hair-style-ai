import type {Photo} from './journey.ts';

// Two-dimensional photo proportions, not a medical or three-dimensional bone measurement.
export const faceMetricSpecs = {
 face_height_width_ratio:{label:'顔の縦横比',group:'顔全体',unit:'ratio'},
 face_width_ratio:{label:'顔幅 / 画像幅',group:'顔全体',unit:'ratio'},
 face_height_ratio:{label:'顔長 / 画像高さ',group:'顔全体',unit:'ratio'},
 upper_face_ratio:{label:'上顔面 / 顔長',group:'顔全体',unit:'ratio'},
 midface_ratio:{label:'中顔面 / 顔長',group:'顔全体',unit:'ratio'},
 lower_face_ratio:{label:'下顔面 / 顔長',group:'顔全体',unit:'ratio'},
 left_right_balance:{label:'左右幅の比',group:'顔全体',unit:'ratio'},
 forehead_height_ratio:{label:'額高 / 顔長',group:'額',unit:'ratio'},
 forehead_width_ratio:{label:'額幅 / 顔幅',group:'額',unit:'ratio'},
 hairline_y:{label:'生え際の縦位置',group:'額',unit:'normalized_y'},
 brow_y:{label:'眉の縦位置',group:'眉・目',unit:'normalized_y'},
 eye_y:{label:'目の縦位置',group:'眉・目',unit:'normalized_y'},
 eye_height_ratio:{label:'目の高さ / 顔長',group:'眉・目',unit:'ratio'},
 brow_eye_distance_ratio:{label:'眉と目の距離 / 顔長',group:'眉・目',unit:'ratio'},
 cheekbone_y:{label:'頬骨付近の縦位置',group:'頬',unit:'normalized_y'},
 maximum_width_y:{label:'顔の最大幅の縦位置',group:'頬',unit:'normalized_y'},
 cheekbone_width_ratio:{label:'頬骨付近の幅 / 顔幅',group:'頬',unit:'ratio'},
 nose_y:{label:'鼻下の縦位置',group:'鼻・中顔面',unit:'normalized_y'},
 midface_length_ratio:{label:'中顔面長 / 顔長',group:'鼻・中顔面',unit:'ratio'},
 chin_y:{label:'顎先の縦位置',group:'顎・下顔面',unit:'normalized_y'},
 chin_length_ratio:{label:'顎の長さ / 顔長',group:'顎・下顔面',unit:'ratio'},
 jaw_width_ratio:{label:'下顔面幅 / 顔幅',group:'顎・下顔面',unit:'ratio'},
 head_top_y:{label:'頭頂の縦位置',group:'頭部',unit:'normalized_y'},
 parietal_y:{label:'ハチの縦位置',group:'頭部',unit:'normalized_y'},
 head_height_width_ratio:{label:'頭部の縦横比',group:'頭部',unit:'ratio'},
 occipital_depth_ratio:{label:'後頭部の奥行比',group:'頭部',unit:'ratio'},
} as const;
export type FaceMetric=keyof typeof faceMetricSpecs;
export type FaceMeasurement={value:number|null;unit:typeof faceMetricSpecs[FaceMetric]['unit'];status:'not_assessed'|'mock'|'image_estimate'|'stylist_measured';method:string;confidence:number|null};
export type FaceAnalysis={id:string;version:'face-proportions-v1';createdAt:string;inputContext:string;provider:'mock-fixed-example-v1'|'face-landmarks'|'stylist';modelVersion:string|null;coordinateSpace:'normalized_image_2d';measurementBasis:'uncalibrated_image_not_3d_bone';photoIds:string[];qualityInputs:{photoId:string;view:string;grade:string|null}[];metrics:Record<FaceMetric,FaceMeasurement>;landmarks:{photoId:string;key:string;x:number;y:number;origin:'image_estimate'|'stylist_measured'}[];faceLabel:string|null;faceLine:{status:'not_assessed';points:never[]};notes:string};
export interface FaceAnalyzer {analyze(photos:Photo[]):Promise<FaceAnalysis>}
export function faceInputContext(photos:Photo[]){return JSON.stringify(photos.filter(p=>['front','right','left','side'].includes(p.view)).map(p=>({id:p.id,view:p.view})).sort((a,b)=>a.view.localeCompare(b.view)));}
export const mockFaceAnalyzer:FaceAnalyzer={async analyze(photos){
 const inputs=photos.filter(p=>['front','right','left','side'].includes(p.view));
 if(!inputs.some(p=>p.view==='front'))throw new Error('FACE DESIGNには正面写真を追加してください。');
 const example:Partial<Record<FaceMetric,number>>={face_height_width_ratio:1.36,face_width_ratio:.4,face_height_ratio:.48,upper_face_ratio:.32,midface_ratio:.34,lower_face_ratio:.34,forehead_height_ratio:.32,forehead_width_ratio:.86,cheekbone_width_ratio:.97,jaw_width_ratio:.76};
 const metrics=Object.fromEntries(Object.entries(faceMetricSpecs).map(([key,spec])=>[key,{value:example[key as FaceMetric]??null,unit:spec.unit,status:key in example?'mock':'not_assessed',method:key in example?'fixed_example_not_photo_measurement':'phase2_not_connected',confidence:null}])) as Record<FaceMetric,FaceMeasurement>;
 return {id:crypto.randomUUID(),version:'face-proportions-v1',createdAt:new Date().toISOString(),inputContext:faceInputContext(photos),provider:'mock-fixed-example-v1',modelVersion:'mock-fixed-example-v1',coordinateSpace:'normalized_image_2d',measurementBasis:'uncalibrated_image_not_3d_bone',photoIds:inputs.map(p=>p.id),qualityInputs:inputs.map(p=>({photoId:p.id,view:p.view,grade:p.capture?.quality.grade??null})),metrics,landmarks:[],faceLabel:null,faceLine:{status:'not_assessed',points:[]},notes:'DEMO / MOCK：比率は固定例。写真からの顔計測・骨格解析は未接続です。'};
}};
export function validateFaceAnalysis(a:FaceAnalysis){
 if(a.version!=='face-proportions-v1'||!a.id||!Number.isFinite(Date.parse(a.createdAt))||!['mock-fixed-example-v1','face-landmarks','stylist'].includes(a.provider)||a.coordinateSpace!=='normalized_image_2d'||a.measurementBasis!=='uncalibrated_image_not_3d_bone'||!a.photoIds.length||a.photoIds.length>4)throw new Error('顔分析の形式を確認してください。');
 for(const [key,spec] of Object.entries(faceMetricSpecs)){const m=a.metrics[key as FaceMetric];if(!m||m.unit!==spec.unit||!['not_assessed','mock','image_estimate','stylist_measured'].includes(m.status)||m.status==='not_assessed'&&m.value!==null||m.value!==null&&(!Number.isFinite(m.value)||m.value<0||m.value>4)||m.confidence!==null&&(!Number.isFinite(m.confidence)||m.confidence<0||m.confidence>1)||a.provider==='mock-fixed-example-v1'&&(!['mock','not_assessed'].includes(m.status)||m.confidence!==null))throw new Error('顔計測値の出典・範囲を確認してください。');}
 if(a.landmarks.some(p=>!a.photoIds.includes(p.photoId)||![p.x,p.y].every(n=>Number.isFinite(n)&&n>=0&&n<=1))||a.provider==='mock-fixed-example-v1'&&a.landmarks.length)throw new Error('顔ランドマークの出典を確認してください。');
}
