/**
 * Árbitro entre a faixa de regulação (?cenario=&desfecho=) e o dropdown
 * "Cenário ativo" do simulador. Sem memória do último pedido honrado, a URL
 * antiga puxa o canvas de volta no instante em que o operador muda o select.
 */

export function sompoRequestedScenarioKey(scenarioId, outcomeId) {
  const scenario = String(scenarioId || '').trim();
  if (!scenario) return '';
  return `${scenario}\0${String(outcomeId || '').trim()}`;
}

/**
 * @param {{
 *   requested: { scenarioId?: string, outcomeId?: string },
 *   current: { scenarioId?: string, outcomeId?: string },
 *   lastHonoredKey: string,
 * }} input
 * @returns {{ type: 'idle' }
 *   | { type: 'honor', key: string }
 *   | { type: 'apply', key: string, scenarioId: string, outcomeId?: string }}
 */
export function sompoRequestedScenarioAction({ requested, current, lastHonoredKey }) {
  const scenarioId = String(requested?.scenarioId || '').trim();
  const outcomeId = String(requested?.outcomeId || '').trim();
  const key = sompoRequestedScenarioKey(scenarioId, outcomeId);
  if (!key) return { type: 'idle' };
  if (key === lastHonoredKey) return { type: 'idle' };

  const currentScenario = String(current?.scenarioId || '').trim();
  const currentOutcome = String(current?.outcomeId || '').trim();
  const alreadyOnRequested = currentScenario === scenarioId
    && (!outcomeId || currentOutcome === outcomeId);
  if (alreadyOnRequested) return { type: 'honor', key };
  return {
    type: 'apply',
    key,
    scenarioId,
    ...(outcomeId ? { outcomeId } : {}),
  };
}

/** A cena ao vivo manda na faixa; o deep-link só entra se o simulador ainda não falou. */
export function sompoActiveStoryKeys({ liveScenarioId, liveOutcomeId, urlScenarioId, urlOutcomeId }) {
  return {
    scenarioId: String(liveScenarioId || urlScenarioId || '').trim(),
    outcomeId: String(liveOutcomeId || urlOutcomeId || '').trim(),
  };
}
