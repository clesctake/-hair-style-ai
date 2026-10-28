export type Stage = 'initial' | 'prepared_base' | 'after';
export type Zone = 'root' | 'mid' | 'end';
export type Metric = 'under_level' | 'residual_pigment' | 'damage' | 'porosity' | 'diameter_um' | 'gray_percent';
export type Observation = {
  id: string; stage: Stage; zone: Zone; metric: Metric; origin: 'ai' | 'stylist';
  value: number; modelVersion: string | null; actor: string | null;
  overridesId: string | null; scaleVersion: string; createdAt: string;
};
export type HairHistory = { id: string; type: 'color' | 'bleach' | 'straightening' | 'perm' | 'other'; date: string | null; datePrecision: 'day' | 'unknown'; zones: Zone[]; notes: string };
export type RecipeLine = { id: string; productId: string; variantId: string | null; grams: number | null; ratioPart: number | null; additionPercent: number | null; percentBasis: 'relative_to_base' | 'of_final_total' | 'unspecified'; role: 'base' | 'additive' };
export type Application = {
  id: string; sequence: number; stageInput: Stage; zone: Zone; process: 'color' | 'bleach';
  lines: RecipeLine[]; ratioBasis: 'mass' | 'volume' | 'unspecified';
  developerId: string | null; developerGrams: number | null; durationMin: number | null; notes: string;
};
export type Draft = {
  id: string | null; version: number; schemaVersion: 'phase2-draft-1'; title: string; stylist: string;
  observations: Observation[]; history: HairHistory[]; applications: Application[]; notes: string;
};
export type SavedDraft = Draft & { id: string; version: number; updatedAt: string };
