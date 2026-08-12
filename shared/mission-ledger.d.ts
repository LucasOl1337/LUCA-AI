import type { MissionDomain, MissionDomainSource } from './mission-triage.js';

export const MISSION_LEDGER_SCHEMA: 'luca.mission-ledger.v1';

export interface MissionLedger {
  schema: typeof MISSION_LEDGER_SCHEMA;
  decisions: string[];
  evidence: string[];
  pending: string[];
  divergences: string[];
}

export function emptyMissionLedger(): MissionLedger;
export function normalizeMissionLedger(value: unknown): MissionLedger;
export function missionLedgerHasItems(ledger: unknown): boolean;
export function mergeMissionLedger(base: unknown, patch: unknown): MissionLedger;
export function formatMissionLedgerForPrompt(ledger: unknown): string;
export function extractMissionLedgerFromText(text: unknown): MissionLedger;
export function ledgerFromConsensusBoard(board?: unknown, outcome?: unknown): MissionLedger;
export function formatRunBriefing(options?: {
  domain?: MissionDomain | string;
  domainSource?: MissionDomainSource | string;
  ledger?: unknown;
}): string;
