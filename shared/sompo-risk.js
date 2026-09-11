// Port of entregaveis final/08-python-backend/risco.py, without missing-value imputation.
export const SOMPO_RISK_VERSION = 'academic-context-v1';
export const SOMPO_RISK_LIMITATION = 'Heurística acadêmica experimental, sem validação atuarial. Não é probabilidade de sinistro nem autorização para operar. Temperatura ambiente em °C e umidade em %; unidades convencionadas, a confirmar no equipamento.';

export function assessSompoRisk(snapshot, context = {}) {
  const missing = [];
  const operation = { campo: 15, transporte: 25, 'proximidade de agua': 40, outro: 10 };
  const region = { rural: [5, 0], critica: [15, 15], alagada: [20, 25], outra: [0, 0] };
  if (!Object.hasOwn(operation, context.operation)) missing.push('tipo de operação');
  if (!Object.hasOwn(region, context.region)) missing.push('condição da região');
  if (!Number.isInteger(context.incidents) || context.incidents < 0) missing.push('histórico de incidentes');
  const temperature = snapshot?.readings?.temperature;
  const humidity = snapshot?.readings?.humidity;
  if (!Number.isFinite(temperature) || temperature < -40 || temperature > 80) missing.push('temperatura ambiente válida');
  if (!Number.isFinite(humidity) || humidity < 0 || humidity > 100) missing.push('umidade válida');
  if (!snapshot || snapshot.freshness !== 'fresh' || snapshot.connection?.state !== 'live') missing.push('telemetria atual e conectada');
  const base = { version: SOMPO_RISK_VERSION, limitation: SOMPO_RISK_LIMITATION, missing, score: null, level: 'Indisponível', factors: [], context, observedAt: snapshot?.observedAt ?? null, sourceKind: snapshot?.source?.kind ?? null };
  if (missing.length) return base;
  const incidents = context.incidents >= 5 ? 35 : context.incidents >= 3 ? 25 : context.incidents >= 1 ? 10 : 0;
  const temp = temperature >= 38 ? 30 : temperature >= 35 ? 20 : temperature >= 30 ? 10 : 0;
  const humid = humidity >= 90 ? 30 : humidity >= 80 ? 20 : humidity >= 70 ? 10 : 0;
  const factors = [
    ['Operação', context.operation, operation[context.operation], 0.6],
    ['Incidentes informados', context.incidents, incidents, 0.6],
    ['Região · operacional', context.region, region[context.region][0], 0.6],
    ['Temperatura ambiente (°C)', temperature, temp, 0.4],
    ['Umidade (%)', humidity, humid, 0.4],
    ['Região · ambiental', context.region, region[context.region][1], 0.4],
  ].map(([label, value, points, weight]) => ({ label, value, points, weight, contribution: Math.round(points * weight * 100) / 100 }));
  const score = Math.min(100, Math.round(factors.reduce((sum, f) => sum + f.contribution, 0) * 100) / 100);
  return { ...base, score, level: score >= 75 ? 'Alto' : score >= 45 ? 'Médio' : 'Baixo', factors };
}

export function sompoRiskBriefing(assessment) {
  return `Avaliação determinística de contexto (não substitui flags do equipamento):\n${JSON.stringify(assessment)}\nContexto de operação, região e incidentes declarado pelo usuário; não medido pelos sensores. Flags de colisão/inclinação exigem atenção independentemente do score. Cobertura pendente: nenhuma apólice foi fornecida neste fluxo. Não concluir cobertura, exclusão, indenização ou sinistro evitado. Separar fatos, hipóteses, evidências, lacunas e ações por responsável.`;
}
