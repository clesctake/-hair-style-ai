import type {Journey,Photo,ColorValue} from './journey.ts';
import {selectedBangDecision,bangDescription} from './bang-design.ts';
export type SimulationMode='style_only'|'color_only'|'style_color';
export type StyleParameters={version:'style-parameters-v1';origin:'stylist';lengthOffsetCm:-10|-5|0|5|10|null;layerAmount:'light'|'standard'|'more'|null;layerStart:'cheekbone'|'chin'|'clavicle'|null;volumePosition:'top'|'side'|'lower'|null;endsLightness:'soft'|'standard'|'light'|null};
export type ColorTargetZone={id:string;zone:'root'|'mid'|'end'|'highlight'|'lowlight';status:'not_assessed'|'image_preview_estimate';sourcePhotoId:string|null;hairMaskId:string|null;sample:{x:number;y:number;radius:number}|null;color:ColorValue|null;areaRatio:number|null};
export const newStyleParameters=():StyleParameters=>({version:'style-parameters-v1',origin:'stylist',lengthOffsetCm:null,layerAmount:null,layerStart:null,volumePosition:null,endsLightness:null});
export function newColorZones(sourcePhotoId:string|null=null):ColorTargetZone[]{return (['root','mid','end','highlight','lowlight'] as const).map(zone=>({id:`color-zone-${zone}`,zone,status:'not_assessed',sourcePhotoId,hairMaskId:null,sample:null,color:null,areaRatio:null}));}
export type FinalDesignParameters={version:'final-design-v1';mode:SimulationMode|null;styleReferencePhotoId:string|null;colorReferencePhotoId:string|null;styleParameters:StyleParameters|null;selectedBangDecisionId:string|null;bangParameters:import('./bang-design.ts').BangParameters|null;targetAdjustmentId:string|null};
export function simulationMode(s:Journey):SimulationMode|null{
 if(s.target.simulationMode&&s.target.simulationMode!=='auto')return s.target.simulationMode;
 const style=Boolean(s.target.styleReference||s.target.style.trim()||selectedBangDecision(s)),color=Boolean(s.target.reference||s.target.text.trim());
 return style&&color?'style_color':style?'style_only':color?'color_only':null;
}
export const simulationModeLabels:Record<SimulationMode,string>={style_only:'髪型だけ',color_only:'カラーだけ',style_color:'髪型 ＋ カラー'};
export function styleParameterText(p?:StyleParameters|null){if(!p)return '';const result:string[]=[];if(p.lengthOffsetCm!==null)result.push(`STYLEの参考に対する希望長さ ${p.lengthOffsetCm>0?'+':''}${p.lengthOffsetCm}cm（画像上の実寸計測なし）`);if(p.layerAmount)result.push(`レイヤー量 ${p.layerAmount}`);if(p.layerStart)result.push(`レイヤー開始 ${p.layerStart}`);if(p.volumePosition)result.push(`ボリューム位置 ${p.volumePosition}`);if(p.endsLightness)result.push(`毛先の軽さ ${p.endsLightness}`);return result.join(' / ');}
export function finalDesignParameters(s:Journey):FinalDesignParameters{const bang=selectedBangDecision(s);return {version:'final-design-v1',mode:simulationMode(s),styleReferencePhotoId:s.target.styleReference?.id??null,colorReferencePhotoId:s.target.reference?.id??null,styleParameters:s.target.styleParameters??null,selectedBangDecisionId:bang?.id??null,bangParameters:bang?.parameters??null,targetAdjustmentId:s.target.confirmedAdjustmentId??null};}
export function designStyleText(s:Journey){const bang=selectedBangDecision(s);return [s.target.style.trim(),styleParameterText(s.target.styleParameters),bang?`美容師が採用した前髪・顔周りをSTYLE画像の前髪より優先。${bangDescription(bang.parameters)}`:''].filter(Boolean).join('\n');}
export function validateDesignTarget(s:Journey){
 if(s.target.simulationMode&&!['auto','style_only','color_only','style_color'].includes(s.target.simulationMode))throw new Error('シミュレーションの対象を確認してください。');
 if(s.target.styleReference&&s.target.styleReference.view!=='style_reference')throw new Error('STYLE写真の役割を確認してください。');
 const p=s.target.styleParameters;if(p&&(p.version!=='style-parameters-v1'||p.origin!=='stylist'||p.lengthOffsetCm!==null&&![-10,-5,0,5,10].includes(p.lengthOffsetCm)||p.layerAmount!==null&&!['light','standard','more'].includes(p.layerAmount)||p.layerStart!==null&&!['cheekbone','chin','clavicle'].includes(p.layerStart)||p.volumePosition!==null&&!['top','side','lower'].includes(p.volumePosition)||p.endsLightness!==null&&!['soft','standard','light'].includes(p.endsLightness)))throw new Error('STYLE補正の形式を確認してください。');
 for(const z of s.target.colorZones??[])if(!['root','mid','end','highlight','lowlight'].includes(z.zone)||!['not_assessed','image_preview_estimate'].includes(z.status)||z.status==='not_assessed'&&z.color!==null||z.areaRatio!==null&&(!Number.isFinite(z.areaRatio)||z.areaRatio<0||z.areaRatio>1))throw new Error('COLORの領域データを確認してください。');
}
