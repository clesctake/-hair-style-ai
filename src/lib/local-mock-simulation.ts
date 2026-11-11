'use client';
import type {SimulationMetadata,SimulationRequest,SimulationTransport} from './hair-simulation-types.ts';
import {imageSha256,SimulationTransportError} from './hair-simulation-client.ts';
import {comparisonRegions} from './image-comparison.ts';
import type {requestBangComparison} from './image-comparison-client.ts';
import {LOCAL_MOCK_MODEL} from './simulation-provenance.ts';

/** Local marked previews, never a prediction of hair/colour or an API response. */
function canvas(width:number,height:number){const c=document.createElement('canvas');c.width=width;c.height=height;const x=c.getContext('2d');if(!x)throw new Error('MOCK画像の作成にcanvasが必要です。');return {c,x};}
async function load(dataUrl:string){const i=new Image();i.src=dataUrl;await i.decode();return i;}
function paint(x:CanvasRenderingContext2D,i:HTMLImageElement,width:number,height:number,label:string){
 x.fillStyle='#eee8e0';x.fillRect(0,0,width,height);const scale=Math.min(width/i.naturalWidth,height/i.naturalHeight),w=i.naturalWidth*scale,h=i.naturalHeight*scale;x.drawImage(i,(width-w)/2,(height-h)/2,w,h);
 x.fillStyle='#ffffffed';x.fillRect(0,0,width,70);x.fillStyle='#492f23';x.font='24px sans-serif';x.fillText('MOCK · '+label+' · AI生成ではありません',18,43);
}
async function result(r:SimulationRequest,dataUrl:string,width:number,height:number){
 const generation:SimulationMetadata={origin:'MOCK_TRANSPORT_FIXTURE',provider:'LOCAL_MOCK',model:LOCAL_MOCK_MODEL,promptVersion:'local-marked-preview-v1',providerRequestId:null,generatedAt:new Date().toISOString(),sha256:await imageSha256(dataUrl),usage:null,seed:null,providerAttempted:false,requiresStylistReview:true,portraitVerification:'UNAVAILABLE'};
 return {requestId:r.requestId,jobId:r.jobId,designId:r.designId,parentMode:r.parentMode,parentGenerationId:r.parentGenerationId,image:dataUrl,width,height,generation};
}
export function createLocalMockTransports(){
 const mainTransport:SimulationTransport=async(r,snapshot,parent,signal)=>{
  signal?.throwIfAborted();if(parent||r.parentMode!=='NONE')throw new Error('MOCK MAINの親指定が不正です。');
  const photo=snapshot.photos[r.contract.currentPhoto.imageId];if(!photo)throw new Error('MOCK用の本人写真がありません。');
  const {c,x}=canvas(1024,1536);paint(x,await load(photo.dataUrl),1024,1536,'独立MAIN');signal?.throwIfAborted();return result(r,c.toDataURL('image/png'),1024,1536);
 };
 const request:typeof requestBangComparison=async(r,_snapshot,variants,signal,parent)=>{
  signal?.throwIfAborted();
  if(!parent||parent.origin!=='MOCK_TRANSPORT_FIXTURE'||r.parentMode!=='IMAGE_EDIT'||r.parentAsset?.imageId!==parent.id||r.parentAsset.sha256!==parent.sha256||await imageSha256(parent.dataUrl)!==parent.sha256||variants.length!==5)throw new Error('確定MOCK MAINの参照・bytesを確認してください。');
  const original=await load(parent.dataUrl),{c,x}=canvas(2304,2048),regions=comparisonRegions(5,2304,2048);
  for(let n=0;n<5;n++){const box=regions[n];x.save();x.translate(box.x,box.y);paint(x,original,box.width,box.height,'DESIGN '+String.fromCharCode(65+n));x.restore();}
  const output=await result(r,c.toDataURL('image/png'),2304,2048),images=[];
  for(let n=0;n<5;n++){signal?.throwIfAborted();const box=regions[n],tile=canvas(box.width,box.height);tile.x.drawImage(c,box.x,box.y,box.width,box.height,0,0,box.width,box.height);const dataUrl=tile.c.toDataURL('image/png');images.push({dataUrl,width:box.width,height:box.height,sha256:await imageSha256(dataUrl),portraitVerification:'UNAVAILABLE' as const,crop:{version:'comparison-crop-v1' as const,sharedRequestId:r.requestId,sourceSha256:output.generation.sha256,sourceWidth:2304,sourceHeight:2048,...box,label:String.fromCharCode(65+n)}});}
  return {result:output,images};
 };
 const localError=(e:unknown)=>new SimulationTransportError('MOCK処理を完了できませんでした。'+(e instanceof Error?e.message:''),'local_mock_failed',false,false);
 const safeMain:SimulationTransport=async(...args)=>{try{return await mainTransport(...args);}catch(e){throw localError(e);}};
 const safeRequest:typeof requestBangComparison=async(...args)=>{try{return await request(...args);}catch(e){throw localError(e);}};
 return {mainTransport:safeMain,request:safeRequest};
}
