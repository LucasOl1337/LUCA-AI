import type { SompoAgriScenario } from './sompo-agri-scenarios.js';

export type SompoMaxTractorParity = Readonly<{ status: 'adaptado' | 'incompativel'; maxId?: string; outcomeId?: string; reason: string }>;

export const SOMPO_MAX_TRACTOR_EQUIPMENT_ID: 'max-tractor';
export const SOMPO_MAX_TRACTOR_AGRI_PARITY: Readonly<Record<string, SompoMaxTractorParity>>;
export const SOMPO_MAX_TRACTOR_TRUCK_PARITY: Readonly<Record<string, SompoMaxTractorParity>>;
export function createSompoMaxTractorScenarios(base: Readonly<Record<string, Readonly<SompoAgriScenario>>>): Record<string, Readonly<SompoAgriScenario>>;
