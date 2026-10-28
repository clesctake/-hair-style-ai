import type { Journey, Photo } from './journey.ts';
/** Retain analysed source bytes if a direction is later replaced/removed, even before the first save. */
export function preserveAnalysisOriginals(previous: Journey, next: Journey): Journey {
  if(previous.diagnosisSession?.id!==next.diagnosisSession?.id)return next;
  const referenced=new Set((next.diagnosisSession?.photoAnalysis?.runs??[]).flatMap(r=>r.inputPhotoIds));
  const current=new Set(next.photos.map(p=>p.id)),archive=new Map((next.analysisPhotoArchive??[]).map(p=>[p.id,p]));
  for(const p of [...(previous.analysisPhotoArchive??[]),...previous.photos])if(referenced.has(p.id)&&!current.has(p.id)&&!archive.has(p.id))archive.set(p.id,p);
  return archive.size?{...next,analysisPhotoArchive:[...archive.values()]}:next;
}
export function validateAnalysisPhotoArchive(journey: Journey) {
  const archived=journey.analysisPhotoArchive??[];
  if(new Set(archived.map(p=>p.id)).size!==archived.length||archived.some(p=>!['front','right','left','side','back'].includes(p.view)))throw new Error('解析元画像の履歴が不正です。');
  return archived as Photo[];
}
