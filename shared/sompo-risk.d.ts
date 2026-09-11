import type { SompoTelemetrySnapshot } from './sompo-telemetry.js';
export interface SompoRiskContext { operation?: string; region?: string; incidents?: number; }
export interface SompoRiskAssessment {
  version: string; limitation: string; missing: string[]; score: number | null; level: string;
  factors: { label: string; value: string | number; points: number; weight: number; contribution: number }[];
  context: SompoRiskContext; observedAt: string | null; sourceKind: string | null;
}
export const SOMPO_RISK_VERSION: string;
export const SOMPO_RISK_LIMITATION: string;
export function assessSompoRisk(snapshot: SompoTelemetrySnapshot | null, context?: SompoRiskContext): SompoRiskAssessment;
export function sompoRiskBriefing(assessment: SompoRiskAssessment): string;
