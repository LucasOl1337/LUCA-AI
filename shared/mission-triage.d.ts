export type MissionDomain = 'general' | 'insurance' | 'code' | 'sports';
export type MissionDomainSource = 'auto' | 'override';

export const MISSION_DOMAINS: readonly MissionDomain[];
export const MISSION_DOMAIN_LABELS: Readonly<Record<MissionDomain, string>>;

export function normalizeMissionDomain(value: unknown): MissionDomain | '';
export function classifyMissionDomain(missionText: unknown): MissionDomain;
export function resolveMissionDomain(
  missionText: unknown,
  options?: { domain?: unknown; domainOverride?: unknown },
): { domain: MissionDomain; domainSource: MissionDomainSource };
export function formatDomainBriefing(domain?: unknown, domainSource?: unknown): string;
