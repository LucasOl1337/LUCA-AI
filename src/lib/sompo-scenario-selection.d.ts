export function sompoRequestedScenarioKey(scenarioId?: string, outcomeId?: string): string;

export type SompoRequestedScenarioAction =
  | { type: 'idle' }
  | { type: 'honor'; key: string }
  | { type: 'apply'; key: string; scenarioId: string; outcomeId?: string };

export function sompoRequestedScenarioAction(input: {
  requested: { scenarioId?: string; outcomeId?: string };
  current: { scenarioId?: string; outcomeId?: string };
  lastHonoredKey: string;
}): SompoRequestedScenarioAction;

export function sompoActiveStoryKeys(input: {
  liveScenarioId?: string;
  liveOutcomeId?: string;
  urlScenarioId?: string;
  urlOutcomeId?: string;
}): { scenarioId: string; outcomeId: string };
