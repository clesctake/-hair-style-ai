import { qualityFlagKeys, type PhotoQuality } from './session-model.ts';
import { decodeMask, maskBounds } from './photo-analysis-math.ts';
import type { BinaryMask, LandmarkPoint } from './photo-analysis-types.ts';

/** Observable pixels + ML geometry. Thresholds are uncalibrated screening rules, never a colour-accuracy guarantee. */
export function segmentedPhotoQuality(imageId: string, pixels: Uint8ClampedArray, width: number, height: number, mask: BinaryMask | null,
  landmarks: LandmarkPoint[], createdAt: string, captureQuality?: PhotoQuality): PhotoQuality {
  if (pixels.length !== width * height * 4) throw new Error('品質解析の画像サイズが不正です。');
  const flags = Object.fromEntries(qualityFlagKeys.map(key => [key, { state: 'NOT_ASSESSED', method: 'not_observable_from_single_photo', message: '未判定', metrics: {} }])) as PhotoQuality['flags'];
  const q: PhotoQuality = { imageId, status: 'CAUTION', score: null, flags, featureState: 'PARTIAL', evaluatedAt: createdAt,
    algorithmVersion: 'segmented-original-quality-v1', assessmentScope: 'MODEL_HAIR_MASK_AND_FACE_2D_UNCALIBRATED_RULES', stylistOverride: captureQuality?.stylistOverride ?? null };
  const set = (key: keyof typeof flags, state: 'PASS' | 'CAUTION' | 'NG' | 'NOT_ASSESSED', message: string, metrics: Record<string, number | null>, method = 'segmented_original_pixel_rule_uncalibrated') => { flags[key] = { state, message, metrics, method }; };
  const selected = mask ? decodeMask(mask) : new Uint8Array(width * height), gray = new Float32Array(width * height), values: number[] = [], bg: number[] = [], left: number[] = [], right: number[] = [], lap: number[] = [];
  let white = 0, black = 0;
  for (let i = 0; i < gray.length; i++) {
    const [r,g,b] = [pixels[i*4],pixels[i*4+1],pixels[i*4+2]], v = .2126*r+.7152*g+.0722*b; gray[i] = v;
    if (selected[i]) { values.push(v); if (Math.max(r,g,b)>=250) white++; if (Math.max(r,g,b)<=8) black++; (i%width<width/2?left:right).push(v); }
    else if (i%width<width*.08||i%width>width*.92||i<width*height*.04) bg.push(v);
  }
  const mean = (x: number[]) => x.length ? x.reduce((n,v)=>n+v,0)/x.length : 0;
  if (values.length >= 32) {
    const m = mean(values), spread = Math.sqrt(mean(values.map(v=>(v-m)**2))), fraction = white/values.length, dark = black/values.length, b = mean(bg);
    set('overexposed', m>240?'NG':m>215?'CAUTION':'PASS', '明るすぎます。光を少し弱めてください。', {meanHair:m});
    set('underexposed', m<18?'NG':m<38?'CAUTION':'PASS', '暗すぎる可能性があります。髪の暗部を確認してください。', {meanHair:m});
    set('whiteClipping', fraction>.18?'NG':fraction>.035?'CAUTION':'PASS', '髪に白飛びの可能性があります。', {fraction});
    set('blackClipping', dark>.5?'NG':dark>.18?'CAUTION':'PASS', '髪の暗部が黒つぶれしている可能性があります。', {fraction:dark});
    set('backlight', b-m>95&&m<45?'NG':b-m>65&&m<95?'CAUTION':'PASS', '逆光の可能性があります。光源の位置を変えてください。', {hairMean:m,edgeBackgroundMean:b,difference:b-m});
    for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){const i=y*width+x;if(selected[i]&&selected[i-1]&&selected[i+1]&&selected[i-width]&&selected[i+width])lap.push(4*gray[i]-gray[i-1]-gray[i+1]-gray[i-width]-gray[i+width]);}
    const lm=mean(lap), variance=mean(lap.map(v=>(v-lm)**2));
    set('blur', spread<6||lap.length<32?'NOT_ASSESSED':variance<2?'NG':variance<12?'CAUTION':'PASS', spread<6?'模様が少なくピントは未判定です。':'髪がぼやけている可能性があります。', {laplacianVariance:variance,contrast:spread}, 'original_resampled_hair_laplacian_proxy_not_focus_certification');
    if(left.length>=32&&right.length>=32)set('unevenLighting', Math.abs(mean(left)-mean(right))>65?'CAUTION':'PASS', '光が片側に偏っている、または髪色に差がある可能性があります。', {leftMean:mean(left),rightMean:mean(right)}, 'hair_left_right_luminance_proxy_cannot_separate_design_color');
    set('strongReflection', fraction>.035&&spread>40?'CAUTION':'PASS', '髪表面の強い反射、または明るい色の毛を確認してください。', {brightFraction:fraction,contrast:spread}, 'hair_clipping_contrast_reflection_suspected');
    const bounds=maskBounds(selected,width,height);
    if(bounds){const center=(bounds.left+bounds.right)/2,size=bounds.right-bounds.left;
      const msg=center<.39?'少し右へ移動してください。':center>.61?'少し左へ移動してください。':size<.25?'もう少し近づいてください。':size>.9?'少し後ろに下がってください。':'中央に合っています。';
      set('positioning',center<.39||center>.61||size<.25||size>.9?'CAUTION':'PASS',msg,{centerX:center,hairWidthFraction:size},'hair_mask_image_size_proxy_NOT_physical_distance');
      const edge=bounds.top<=.015||bounds.left<=.015||bounds.right>=.985||bounds.bottom>=.985;
      set('framing',edge?'CAUTION':'PASS',edge?'髪が画面の端に触れています。毛先まで収まっているか確認してください。':'検出した髪領域は画面内です。',{...bounds},'mask_edge_contact_suspected_cutoff_NOT_complete_hair_guarantee');
    }
  }
  if(!values.length)set('framing','NOT_ASSESSED','髪領域を検出できませんでした。写真を確認してください。',{});
  // A still image cannot distinguish camera motion from defocus. Retain only actual temporal capture evidence.
  const motion=captureQuality?.flags.motionBlur;
  if(motion && motion.state!=='NOT_ASSESSED' && motion.method?.includes('temporal')) flags.motionBlur=structuredClone(motion);
  if(landmarks.length){const xs=landmarks.map(p=>p.x),ys=landmarks.map(p=>p.y), cx=(Math.min(...xs)+Math.max(...xs))/2;
    if(cx<.35||cx>.65)set('positioning','CAUTION',cx<.35?'少し右へ移動してください。':'少し左へ移動してください。',{faceCenterX:cx},'face_landmarks_image_position_NOT_physical_distance');
    if(Math.min(...xs)<.005||Math.max(...xs)>.995||Math.min(...ys)<.005||Math.max(...ys)>.995)set('framing','CAUTION','顔・頭の全体がフレームに入るようにしてください。',{},'face_landmark_edge_contact');
  }
  // No neutral reference: natural hair colour cannot be separated from light colour. Lens fog also stays unassessed.
  const states=Object.values(flags).map(f=>f.state); q.status=states.includes('NG')?'NG':states.includes('CAUTION')||states.filter(s=>s==='NOT_ASSESSED').length>3?'CAUTION':'GOOD';
  q.score=values.length>=32?Math.max(0,100-states.reduce((n,s)=>n+(s==='NG'?28:s==='CAUTION'?12:0),0)):null; return q;
}
export function analysisQualityWarnings(q: PhotoQuality): string[] {
  const priority: (keyof PhotoQuality['flags'])[]=['whiteClipping','blackClipping','underexposed','overexposed','backlight','blur','motionBlur','framing','positioning','unevenLighting','strongReflection'];
  const sorted=priority.filter(k=>['NG','CAUTION'].includes(q.flags[k].state)).sort((a,b)=>(q.flags[b].state==='NG'?1:0)-(q.flags[a].state==='NG'?1:0));
  const families=new Set<string>(),warnings:string[]=[];
  for(const key of sorted){const family=['whiteClipping','blackClipping','underexposed','overexposed'].includes(key)?'exposure':key;if(families.has(family))continue;families.add(family);warnings.push(q.flags[key].message??'写真を確認してください。');if(warnings.length===2)break;}
  return warnings;
}
