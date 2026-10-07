import type { SompoAgriScenario } from './sompo-agri-scenarios.js';

export const SOMPO_MAX_TRACTOR_EQUIPMENT_ID: 'max-tractor';
export const SOMPO_MAX_TRACTOR_AGRI_PARITY: Readonly<Record<string, Readonly<{ status: 'adaptado' | 'incompativel' | 'pendente'; maxId?: string; reason?: string }>>>;
export function createSompoMaxTractorScenarios(base: Readonly<Record<string, Readonly<SompoAgriScenario>>>): Record<string, Readonly<SompoAgriScenario>>;
