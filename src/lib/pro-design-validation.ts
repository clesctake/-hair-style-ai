import type {DiagnosisSession} from './session-model.ts';
import {sourceTypes} from './session-model.ts';
import {PRO_DESIGN_MASTER_ID,nextColorFamilies,toneValues,homeCareFocuses} from './pro-design-types.ts';
export function validateProDesign(s:DiagnosisSession){
 const p=s.proDesign;if(!p)return;const bad=()=>{throw new Error('施術設計の保存データを確認してください。原本は保持しています。');};
 if(p.schemaVersion!=='pro-design-v1'||p.visualMasterId!==PRO_DESIGN_MASTER_ID||p.parentSessionId!==s.id||p.inputSnapshot.sessionId!==s.id||!p.inputFingerprint||!Array.isArray(p.recipeSets)||!Array.isArray(p.handoffs)||!Array.isArray(p.aiHistory))bad();
 const validColors=(colors:typeof p.nextColors)=>colors.length<=3&&new Set(colors.map(c=>c.family)).size===colors.length&&colors.every((c,i)=>nextColorFamilies.includes(c.family)&&toneValues.includes(c.tone)&&c.order===i&&sourceTypes.includes(c.sourceType)&&typeof c.reason==='string'&&c.reason.length<=1000);
 if(!validColors(p.nextColors))bad();
 const a=p.aftercare;if(a.visitWeeks!==null&&![4,6,8].includes(a.visitWeeks)||a.customWeeks!==null&&(!Number.isFinite(a.customWeeks)||a.customWeeks<1||a.customWeeks>52)||a.homeCare.some(c=>!homeCareFocuses.includes(c))||new Set(a.productIds).size!==a.productIds.length||a.productIds.some(id=>!p.settings.productCatalog?.products.some(x=>x.productId===id&&x.active))||a.menuId&&!p.settings.menus.some(m=>m.id===a.menuId&&m.active))bad();
 if(typeof p.message.notes!=='string'||typeof p.message.text!=='string'||p.message.notes.length>4000||p.message.text.length>6000)bad();
 const ids=new Set<string>();for(const set of p.recipeSets){if(ids.has(set.id)||set.recipes.length!==3||new Set(set.recipes.map(r=>r.label)).size!==3)bad();ids.add(set.id);const settings=set.settingsSnapshot??p.settings;for(const r of set.recipes){if(r.id!==r.proposal.id||r.proposal.parentSessionId!==s.id||r.predictedFinish!==null||r.reproductionScore!==null||r.developerId&&!settings.enabledDeveloperIds.includes(r.developerId)||r.proposal.fioleDrugs.some(d=>!settings.enabledFirstAgentIds.includes(d.productId!)))bad();}}
 const active=p.recipeSets.find(set=>set.id===p.activeRecipeSetId);if(p.activeRecipeSetId&&!active||p.selectedRecipeId&&!active?.recipes.some(r=>r.id===p.selectedRecipeId))bad();
 for(const h of p.handoffs){if(h.finalImageReference){const image=s.hairSimulation?.generatedAssets.find(x=>x.id===h.finalImageReference!.assetId),event=s.hairSimulation?.events.find(x=>x.id===h.finalImageReference!.generationId);if(!image||image.origin!=='REAL_API'||image.eventId!==event?.id||event.request.designId!==h.finalImageReference.designId)bad();}if(!validColors(h.nextColors)||h.nextColors.length!==3||h.status!=='READY_FOR_PAGE_3_UI'||!p.recipeSets.some(set=>set.recipes.some(r=>r.id===h.selectedRecipeId)))bad();}
}
