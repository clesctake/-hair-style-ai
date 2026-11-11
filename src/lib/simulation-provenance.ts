import type {Journey} from './journey.ts';
import type {DiagnosisSession} from './session-model.ts';
import type {SimulationAsset} from './hair-simulation-types.ts';
export const LOCAL_MOCK_MODEL='DEV01_LOCAL_MOCK_V1';
export const isLocalMockSession=(s:DiagnosisSession|null|undefined)=>s?.counseling?.generationMode==='MOCK_LOCAL_V1';
export const isLocalMockGeneration=(j:Journey)=>isLocalMockSession(j.diagnosisSession);
/** Rendering/review provenance only; never authentication, ownership or spending approval. */
export function isDisplayableSimulationAssetForSession(s:DiagnosisSession|null|undefined,asset:SimulationAsset|null|undefined):boolean{
 if(!s||!asset)return false;
 if(asset.origin==='REAL_API')return true;
 if(!isLocalMockSession(s)||asset.origin!=='MOCK_TRANSPORT_FIXTURE')return false;
 const event=s.hairSimulation?.events.find(e=>e.id===asset.eventId);
 return Boolean(event&&event.status==='COMPLETE'&&event.assetId===asset.id&&asset.parentSessionId===s.id&&event.metadata?.origin===asset.origin&&event.metadata.provider==='LOCAL_MOCK'&&event.metadata.model===LOCAL_MOCK_MODEL&&event.metadata.providerAttempted===false&&event.metadata.sha256===asset.sha256);
}
export const isDisplayableSimulationAsset=(j:Journey,asset:SimulationAsset|null|undefined)=>isDisplayableSimulationAssetForSession(j.diagnosisSession,asset);
export function localMockResponseCount(s:DiagnosisSession){
 return new Set((s.hairSimulation?.events??[]).filter(e=>e.status==='COMPLETE'&&e.metadata?.origin==='MOCK_TRANSPORT_FIXTURE'&&e.metadata.model===LOCAL_MOCK_MODEL&&e.metadata.providerAttempted===false).map(e=>e.metadata?.comparisonCrop?.sharedRequestId??e.requestId)).size;
}
