// Intake estruturado de contexto do problema (a "caixa esquerda" do desenho).
//
// O sistema so consegue interpretar e resolver um problema real se for
// alimentado com contexto. Este modulo define o FORMATO antecipado em que a
// pesquisa/dados sao entregues ao LUCA-AI, e como sinais imprevisiveis de
// tempo real sao normalizados. Funcoes puras (testaveis, sem efeito colateral).

const MAX_ITEMS = 50;
const MAX_NOTES = 4000;

function toList(value) {
  if (Array.isArray(value)) {
    return value.map((x) => String(x).trim()).filter(Boolean).slice(0, MAX_ITEMS);
  }
  if (value === undefined || value === null || value === '') return [];
  return [String(value).trim()].filter(Boolean);
}

/**
 * Formato canonico do contexto de um problema. Categorias derivadas do desenho:
 * dados historicos, dados coletaveis em tempo real, dados previsiveis,
 * causas do problema, falha provavel + fontes de dados e notas livres.
 */
export function normalizeMissionContext(raw = {}) {
  const r = raw || {};
  return {
    historical: toList(r.historical ?? r.historicalData ?? r.dados_historicos),
    realtime: toList(r.realtime ?? r.realtimeData ?? r.tempo_real),
    predictable: toList(r.predictable ?? r.predictableData ?? r.previsiveis),
    causes: toList(r.causes ?? r.causas),
    probableFailures: toList(r.probableFailures ?? r.probable_failures ?? r.falhas_provaveis ?? r.failureModes),
    dataSources: toList(r.dataSources ?? r.data_sources ?? r.fontes),
    notes: String(r.notes ?? r.notas ?? '').trim().slice(0, MAX_NOTES),
  };
}

export function hasContext(context) {
  const c = normalizeMissionContext(context);
  return Boolean(
    c.historical.length || c.realtime.length || c.predictable.length ||
    c.causes.length || c.probableFailures.length || c.dataSources.length || c.notes,
  );
}

export function mergeMissionContext(current = {}, incoming = {}) {
  const base = normalizeMissionContext(current);
  const add = normalizeMissionContext(incoming);
  const uniq = (a, b) => [...new Set([...a, ...b])].slice(0, MAX_ITEMS);
  return {
    historical: uniq(base.historical, add.historical),
    realtime: uniq(base.realtime, add.realtime),
    predictable: uniq(base.predictable, add.predictable),
    causes: uniq(base.causes, add.causes),
    probableFailures: uniq(base.probableFailures, add.probableFailures),
    dataSources: uniq(base.dataSources, add.dataSources),
    notes: [base.notes, add.notes].filter(Boolean).join('\n').slice(0, MAX_NOTES),
  };
}

export function summarizeContextForPrompt(context, { maxItems = 8 } = {}) {
  const c = normalizeMissionContext(context);
  const section = (label, items) => (items.length
    ? `${label}:\n${items.slice(0, maxItems).map((i) => `- ${i}`).join('\n')}`
    : null);
  return [
    section('Dados historicos', c.historical),
    section('Dados coletaveis em tempo real', c.realtime),
    section('Dados previsiveis', c.predictable),
    section('Causas conhecidas do problema', c.causes),
    section('Falhas provaveis', c.probableFailures),
    section('Fontes de dados', c.dataSources),
    c.notes ? `Notas de contexto:\n${c.notes}` : null,
  ].filter(Boolean).join('\n\n');
}

const SIGNAL_SEVERITIES = ['info', 'warning', 'critical'];

/** Normaliza um sinal/evento imprevisivel recebido em tempo real. */
export function normalizeSignal(raw = {}) {
  const r = raw || {};
  const severity = SIGNAL_SEVERITIES.includes(String(r.severity)) ? String(r.severity) : 'info';
  return {
    id: `signal-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    label: String(r.label ?? r.type ?? r.name ?? 'sinal').trim().slice(0, 120),
    value: r.value !== undefined ? r.value : null,
    unit: String(r.unit ?? '').trim().slice(0, 24),
    source: String(r.source ?? 'realtime').trim().slice(0, 80),
    severity,
    note: String(r.note ?? r.message ?? '').trim().slice(0, 500),
    at: new Date().toISOString(),
  };
}

export function formatSignalLine(signal = {}) {
  const s = signal || {};
  const value = (s.value !== null && s.value !== undefined)
    ? `: ${s.value}${s.unit ? ` ${s.unit}` : ''}`
    : '';
  const note = s.note ? ` (${s.note})` : '';
  return `[${s.severity || 'info'}] ${s.label || 'sinal'}${value}${note} — fonte ${s.source || 'realtime'} @ ${s.at || ''}`.trim();
}

export function summarizeSignalsForPrompt(signals = [], { max = 8 } = {}) {
  const list = Array.isArray(signals) ? signals.slice(-max) : [];
  if (!list.length) return '';
  return `Sinais em tempo real recentes (a IA deve se adaptar a estes dados imprevisiveis e reagir):\n${list.map((s) => `- ${formatSignalLine(s)}`).join('\n')}`;
}
