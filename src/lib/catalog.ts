import source from '../data/fiole_catalog.json' with { type: 'json' };
import research from '../data/web_research.json' with { type: 'json' };
export const catalog = {
  axes: source.axes,
  records: source.records.map(r => ({ id:r.id, brand:r.brand, type:r.type, code:r.code, name:r.name, level_label:r.level_label, level_semantics:r.level_semantics, source_page:r.source_page, description:r.description, diagram_vector:r.diagram_vector as Record<string,number> | null })),
  variants: research.verified_variants.map(v=>({...v,manufacturer_label:v.level_semantics==='low_alkali_label_not_verified_lift'?v.manufacturer_label.replace(/ (\d+)$/,'$1/Low'):v.manufacturer_label})),
  products: research.products,
  sources: research.sources,
  rules: research.rules,
  cases: research.reference_cases,
  issues: research.open_issues,
  researchDate: research.research_date
};
export type CatalogData = typeof catalog;
export const productIds = new Set(catalog.products.filter(p => p.role !== 'developer').map(p=>p.id));
export const variantProducts = new Map(catalog.variants.map(v => [v.id,v.product_id]));
export const developerIds = new Set(catalog.products.filter(p=>p.role==='developer').map(p=>p.id));
