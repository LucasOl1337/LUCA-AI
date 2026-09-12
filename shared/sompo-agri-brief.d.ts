import type { SompoTelemetrySnapshot } from './sompo-telemetry.js';
import type { SompoEpisodePlan, SompoScenarioOutcome, SompoScenarioRunBrief } from './sompo-telemetry-simulator.js';
import type { SompoAgriScenarioId } from './sompo-agri-scenarios.js';

export function isSompoAgriScenarioId(scenarioId: unknown): scenarioId is SompoAgriScenarioId;

export function getSompoAgriOutcomes(scenarioId?: string): readonly Readonly<SompoScenarioOutcome>[];

export function getSompoAgriTravelMeters(
  scenarioId: string,
  elapsedMs?: number,
  outcomeId?: string,
): number;

export function createSompoAgriSimulationSnapshot(
  scenarioId: string,
  outcomeId?: string,
  options?: { observedAt?: string; elapsedMs?: number; connectedAt?: string },
): SompoTelemetrySnapshot;

export function getSompoAgriEpisodePlan(
  scenarioId: string,
  outcomeId?: string | null,
): (Omit<SompoEpisodePlan, 'catalog' | 'scenarioId'> & { catalog: 'agri'; scenarioId: SompoAgriScenarioId }) | null;

export function buildSompoAgriRunBrief(
  scenarioId: string,
  outcomeId?: string | null,
  elapsedMs?: number,
): (Omit<SompoScenarioRunBrief, 'scenarioId'> & { scenarioId: SompoAgriScenarioId }) | null;
