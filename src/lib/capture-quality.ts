// Phase 1 pixel heuristics. Guide regions are not segmented hair and are not calibrated colour measurements.
export const captureDirections = ['front','right','left','back'] as const;
export type CaptureDirection = typeof captureDirections[number];
export const captureDirectionLabels: Record<CaptureDirection,string> = {front:'正面',right:'右側',left:'左側',back:'後ろ'};
export const qualityKeys = ['exposure','white_clip','black_clip','backlight','blur','motion','position','framing','lens_haze','color_cast','uneven_light','reflection'] as const;
export type QualityKey = typeof qualityKeys[number];
export type QualityCheck = { state:'pass'|'caution'|'ng'|'not_assessed'; method:string; message:string; metrics:Record<string,number|null> };
export type CaptureQuality = {version:'capture-quality-v1';algorithmVersion:'guide-pixel-heuristic-v1';evaluatedAt:string;grade:'GOOD'|'CAUTION'|'NG';score:number;scoreMeaning:'uncalibrated_demo_heuristic';roi:'guide_head_proxy_not_hair_segmentation';checks:Record<QualityKey,QualityCheck>;warnings:QualityKey[];analysisSize:{width:number;height:number};manualGuideAligned:boolean};
export type OriginalPhoto = {dataUrl:string;mimeType:string;byteSize:number;width:number;height:number;representation:'original_file_bytes'|'browser_video_frame_jpeg';colourProcessing:'none_app_applied';profile:'not_parsed'};
export type CaptureMetadata = {version:'standard-capture-v1';direction:CaptureDirection|'side';source:'web_camera'|'native_camera'|'library'|'demo_sample';capturedAt:string|null;importedAt:string;quality:CaptureQuality;accepted:{at:string;by:'stylist';qualityOverride:boolean};guide:{version:'salon-head-guide-v1';manualAligned:boolean;crop?:{x:number;y:number;width:number;height:number};mirroredPreview?:false};device:{facingMode:string|null;width:number|null;height:number|null;frameRate:number|null};calibration:{status:'uncalibrated';reference:null;correction:null};original:OriginalPhoto};
export type QualityFrame = {data:Uint8ClampedArray;width:number;height:number};
const mean=(a:number[])=>a.length?a.reduce((n,v)=>n+v,0)/a.length:0;
export function analyzeCaptureFrame(frame:QualityFrame, previous?:Float32Array, aligned=false):{quality:CaptureQuality;gray:Float32Array} {
 const {data,width:w,height:h}=frame;if(!Number.isInteger(w)||!Number.isInteger(h)||w<8||h<8||data.length!==w*h*4||w*h>200000)throw new Error('撮影品質の解析画像を確認してください。');
 const gray=new Float32Array(w*h),head:number[]=[],background:number[]=[],lap:number[]=[],foregroundX:number[]=[],foregroundY:number[]=[];
 for(let i=0;i<gray.length;i++)gray[i]=.2126*data[i*4]+.7152*data[i*4+1]+.0722*data[i*4+2];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const v=gray[y*w+x];if(x>w*.17&&x<w*.83&&y>h*.06&&y<h*.73)head.push(v);else if(x<w*.1||x>w*.9||y<h*.035)background.push(v);}
 const level=mean(head),bg=mean(background),spread=Math.sqrt(mean(head.map(v=>(v-level)**2))),bgSpread=Math.sqrt(mean(background.map(v=>(v-bg)**2)));
 const bright=head.filter(v=>v>=248).length/head.length,dark=head.filter(v=>v<=8).length/head.length;
 for(let y=2;y<h*.72;y++)for(let x=2;x<w-2;x++){const i=y*w+x;if(x>w*.17&&x<w*.83&&y>h*.06)lap.push(4*gray[i]-gray[i-1]-gray[i+1]-gray[i-w]-gray[i+w]);
  if(bgSpread<18&&y>h*.04&&Math.abs(gray[i]-bg)>Math.max(28,bgSpread*3)){foregroundX.push(x/w);foregroundY.push(y/h);}}
 const lm=mean(lap),sharpness=mean(lap.map(v=>(v-lm)**2));
 let movement:number|null=null;if(previous?.length===gray.length){let n=0;for(let i=0;i<gray.length;i++)n+=Math.abs(gray[i]-previous[i]);movement=n/gray.length;}
 const checks=Object.fromEntries(qualityKeys.map(key=>[key,{state:'not_assessed',method:'phase2_not_connected',message:'未判定',metrics:{}}])) as Record<QualityKey,QualityCheck>;
 const set=(key:QualityKey,state:QualityCheck['state'],message:string,metrics:QualityCheck['metrics'],method='guide_pixel_heuristic')=>checks[key]={state,message,metrics,method};
 set('exposure',level<28||level>240?'ng':level<48||level>215?'caution':'pass',level<48?'暗すぎます。もう少し明るい場所で撮影してください。':level>215?'明るすぎます。光を少し弱めてください。':'明るさの簡易チェックは良好です。',{mean:level,standardDeviation:spread});
 set('white_clip',bright>.18?'ng':bright>.035?'caution':'pass','明るすぎます。頭の範囲に白飛びの可能性があります。',{fraction:bright});
 set('black_clip',dark>.5?'ng':dark>.18?'caution':'pass','暗すぎます。髪の暗部の情報が失われている可能性があります。',{fraction:dark});
 set('backlight',bg-level>95&&level<45?'ng':bg-level>65&&level<95?'caution':'pass','逆光の可能性があります。光源の位置を変えてください。',{backgroundMean:bg,headMean:level,difference:bg-level});
 set('blur',spread<6?'not_assessed':sharpness<2?'ng':sharpness<12?'caution':'pass',spread<6?'模様が少なく、ピントは未判定です。':'写真がぼやけている可能性があります。静止してピントを確認してください。',{laplacianVariance:sharpness},'downsampled_laplacian_proxy');
 set('motion',movement===null?'not_assessed':movement>24?'caution':'pass','画面が動いています。カメラとお客様を静止してください。',{meanFrameDifference:movement},'temporal_pixel_difference_not_optical_flow');
 const fraction=foregroundX.length/(w*h);
 if(fraction>.07&&fraction<.6&&bgSpread<18){
  const left=foregroundX.reduce((n,v)=>Math.min(n,v),1),right=foregroundX.reduce((n,v)=>Math.max(n,v),0),top=foregroundY.reduce((n,v)=>Math.min(n,v),1),center=(left+right)/2,size=right-left;
  const message=center<.39?'少し右へ移動してください。':center>.61?'少し左へ移動してください。':size<.3?'もう少し近づいてください。':size>.86?'少し後ろに下がってください。':top<.055?'頭頂が枠に収まるよう、少し下に合わせてください。':'中央に合わせてください。';
  const mismatch=center<.39||center>.61||size<.3||size>.86||top<.055;
  set('position',mismatch?'caution':'pass',message,{centerX:center,widthFraction:size,top,backgroundStandardDeviation:bgSpread},'background_contrast_foreground_proxy_not_head_detection');
 }else set('position','not_assessed','中央線に合わせてください。頭の位置・距離はガイドで確認します。',{backgroundStandardDeviation:bgSpread},'guide_manual_check');
 if(aligned)checks.position={...checks.position,state:'pass',method:'stylist_guide_confirmation',message:'美容師がガイドとの位置合わせを確認しました。',metrics:{...checks.position.metrics,autoProxyWarning:checks.position.state==='caution'?1:0}};
 const priority:QualityKey[]=['white_clip','black_clip','exposure','backlight','blur','motion','position'];
 const warnings=priority.filter(key=>checks[key].state==='ng'||checks[key].state==='caution').sort((a,b)=>(checks[b].state==='ng'?2:1)-(checks[a].state==='ng'?2:1));
 const grade=warnings.some(k=>checks[k].state==='ng')?'NG':warnings.length||checks.position.state==='not_assessed'?'CAUTION':'GOOD';
 const score=Math.max(0,100-qualityKeys.reduce((n,k)=>n+(checks[k].state==='ng'?28:checks[k].state==='caution'?12:0),0)-(checks.position.state==='not_assessed'?8:0));
 return {gray,quality:{version:'capture-quality-v1',algorithmVersion:'guide-pixel-heuristic-v1',evaluatedAt:new Date().toISOString(),grade,score,scoreMeaning:'uncalibrated_demo_heuristic',roi:'guide_head_proxy_not_hair_segmentation',checks,warnings,analysisSize:{width:w,height:h},manualGuideAligned:aligned}};
}
export function validateCaptureMetadata(value:CaptureMetadata,view:string){
 if(value.version!=='standard-capture-v1'||value.direction!==view||!['front','right','left','back','side'].includes(value.direction)||!['web_camera','native_camera','library','demo_sample'].includes(value.source)||!Number.isFinite(Date.parse(value.importedAt))||(value.capturedAt!==null&&!Number.isFinite(Date.parse(value.capturedAt)))||!Number.isFinite(Date.parse(value.accepted.at))||value.accepted.by!=='stylist'||typeof value.accepted.qualityOverride!=='boolean'||value.guide.version!=='salon-head-guide-v1'||typeof value.guide.manualAligned!=='boolean'||value.calibration.status!=='uncalibrated'||value.calibration.reference!==null||value.calibration.correction!==null)throw new Error('撮影情報の形式を確認してください。');
 const q=value.quality;
 if(q.version!=='capture-quality-v1'||q.algorithmVersion!=='guide-pixel-heuristic-v1'||!['GOOD','CAUTION','NG'].includes(q.grade)||!Number.isFinite(q.score)||q.score<0||q.score>100||q.roi!=='guide_head_proxy_not_hair_segmentation'||q.scoreMeaning!=='uncalibrated_demo_heuristic'||!Number.isFinite(Date.parse(q.evaluatedAt))||!qualityKeys.every(k=>q.checks[k]&&['pass','caution','ng','not_assessed'].includes(q.checks[k].state)&&Object.values(q.checks[k].metrics).every(n=>n===null||Number.isFinite(n)))||q.warnings.some(k=>!qualityKeys.includes(k)))throw new Error('撮影品質の形式を確認してください。');
 const crop=value.guide.crop;if(crop&&(!Object.values(crop).every(Number.isFinite)||crop.x<0||crop.y<0||crop.width<=0||crop.height<=0||crop.x+crop.width>1.000001||crop.y+crop.height>1.000001))throw new Error('撮影ガイドの切り出し位置を確認してください。');
 validateOriginalPhoto(value.original);
}

export function primaryQualityWarnings(quality:CaptureQuality):QualityKey[]{
 const families=new Set<string>(),shown:QualityKey[]=[];
 for(const key of quality.warnings){const family=['exposure','white_clip','black_clip'].includes(key)?'exposure':['blur','motion'].includes(key)?'detail':key;if(families.has(family))continue;families.add(family);shown.push(key);if(shown.length===2)break;}
 return shown;
}

export function validateOriginalPhoto(o:OriginalPhoto){if(!/^data:image\/(jpeg|png|webp|heic|heif);base64,[A-Za-z0-9+/]+={0,2}$/.test(o.dataUrl)||o.dataUrl.length>28000000||o.byteSize>20*1024*1024||o.byteSize<1||![o.width,o.height].every(n=>Number.isInteger(n)&&n>0)||o.colourProcessing!=='none_app_applied'||o.profile!=='not_parsed'||!['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(o.mimeType)||!['original_file_bytes','browser_video_frame_jpeg'].includes(o.representation))throw new Error('解析用元画像の形式・容量を確認してください。');
}
