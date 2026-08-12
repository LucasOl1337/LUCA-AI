import { formatDomainBriefing } from './mission-triage.js';

export const MISSION_LEDGER_SCHEMA = 'luca.mission-ledger.v1';
const MAX_ITEMS = 8;
const MAX_ITEM_CHARS = 240;

function clipItem(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= MAX_ITEM_CHARS) return text;
  return `${text.slice(0, MAX_ITEM_CHARS - 1)}…`;
}

function normalizeList(value) {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/\s*[;•|\n]\s*/)
      : [];
  const seen = new Set();
  const items = [];
  for (const raw of source) {
    const item = clipItem(raw);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    items.push(item);
    if (items.length >= MAX_ITEMS) break;
  }
  return items;
}

export function emptyMissionLedger() {
  return {
    schema: MISSION_LEDGER_SCHEMA,
    decisions: [],
    evidence: [],
    pending: [],
    divergences: [],
  };
}

export function normalizeMissionLedger(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    schema: MISSION_LEDGER_SCHEMA,
    decisions: normalizeList(source.decisions || source.decisoes),
    evidence: normalizeList(source.evidence || source.evidencias),
    pending: normalizeList(source.pending || source.pendencias),
    divergences: normalizeList(source.divergences || source.divergencias),
  };
}

export function missionLedgerHasItems(ledger) {
  const normalized = normalizeMissionLedger(ledger);
  return Boolean(
    normalized.decisions.length
    || normalized.evidence.length
    || normalized.pending.length
    || normalized.divergences.length,
  );
}

export function mergeMissionLedger(base, patch) {
  const left = normalizeMissionLedger(base);
  const right = normalizeMissionLedger(patch);
  return normalizeMissionLedger({
    decisions: [...left.decisions, ...right.decisions],
    evidence: [...left.evidence, ...right.evidence],
    pending: [...left.pending, ...right.pending],
    divergences: [...left.divergences, ...right.divergences],
  });
}

export function formatMissionLedgerForPrompt(ledger) {
  const normalized = normalizeMissionLedger(ledger);
  if (!missionLedgerHasItems(normalized)) return '';
  const line = (label, items) => (items.length ? `${label}: ${items.join('; ')}` : `${label}: (vazio)`);
  return `Diario da missao (estado estruturado da bancada — nao e uma fala de persona):
${line('decisoes', normalized.decisions)}
${line('evidencias', normalized.evidence)}
${line('pendencias', normalized.pending)}
${line('divergencias', normalized.divergences)}`;
}

function captureSection(block, label) {
  const pattern = new RegExp(
    `${label}\\s*[:\\-]\\s*([\\s\\S]*?)(?=\\n\\s*(?:decisoes|evidencias|pendencias|divergencias)\\s*[:\\-]|$)`,
    'i',
  );
  const match = String(block || '').match(pattern);
  return match ? match[1] : '';
}

export function extractMissionLedgerFromText(text) {
  const raw = String(text || '');
  const blockMatch = raw.match(/DIARIO DA MISSAO\s*([\s\S]*?)(?:```|$)/i)
    || raw.match(/diario da missao\s*([\s\S]*?)(?:```|$)/i);
  if (!blockMatch) return emptyMissionLedger();
  const block = blockMatch[1];
  return normalizeMissionLedger({
    decisions: captureSection(block, 'decisoes'),
    evidence: captureSection(block, 'evidencias'),
    pending: captureSection(block, 'pendencias'),
    divergences: captureSection(block, 'divergencias'),
  });
}

export function ledgerFromConsensusBoard(board = {}, outcome = '') {
  const seats = Array.isArray(board?.seats) ? board.seats : [];
  const decisions = [];
  const divergences = [];
  const pending = [];
  const evidence = [];
  if (String(outcome || '') === 'consensus') {
    const agreed = seats.map((seat) => String(seat?.stance || '').trim()).filter(Boolean);
    if (agreed[0]) decisions.push(agreed[0]);
  }
  for (const seat of seats) {
    const label = String(seat?.label || 'Participante').trim();
    if (seat?.vote === 'dissent' && seat?.dissentReason) {
      divergences.push(`${label}: ${seat.dissentReason}`);
    }
    const stance = String(seat?.stance || '');
    if (/\bpendente\b/i.test(stance)) pending.push(`${label}: ${clipItem(stance)}`);
    if (/\bevidenc/i.test(stance)) evidence.push(`${label}: ${clipItem(stance)}`);
  }
  return normalizeMissionLedger({ decisions, evidence, pending, divergences });
}

export function formatRunBriefing({ domain, domainSource, ledger } = {}) {
  const parts = [];
  if (domain) parts.push(formatDomainBriefing(domain, domainSource));
  const ledgerBlock = formatMissionLedgerForPrompt(ledger);
  if (ledgerBlock) parts.push(ledgerBlock);
  return parts.join('\n\n');
}
