import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyMissionLedger,
  extractMissionLedgerFromText,
  formatMissionLedgerForPrompt,
  formatRunBriefing,
  ledgerFromConsensusBoard,
  mergeMissionLedger,
  missionLedgerHasItems,
  normalizeMissionLedger,
} from '../shared/mission-ledger.js';

test('normalizeMissionLedger clips, dedupes and accepts Portuguese keys', () => {
  const ledger = normalizeMissionLedger({
    decisoes: ['Priorizar talhao norte', 'Priorizar talhao norte', '  '],
    evidencias: 'fotos; telemetria',
    pendencias: ['laudo'],
    divergencias: [],
  });
  assert.equal(ledger.schema, 'luca.mission-ledger.v1');
  assert.deepEqual(ledger.decisions, ['Priorizar talhao norte']);
  assert.deepEqual(ledger.evidence, ['fotos', 'telemetria']);
  assert.deepEqual(ledger.pending, ['laudo']);
  assert.equal(missionLedgerHasItems(ledger), true);
  assert.equal(missionLedgerHasItems(emptyMissionLedger()), false);
});

test('mergeMissionLedger keeps unique items from both sides', () => {
  const merged = mergeMissionLedger(
    { decisions: ['Aprovar vistoria'] },
    { decisions: ['Aprovar vistoria', 'Coletar laudo'], pending: ['franquia'] },
  );
  assert.deepEqual(merged.decisions, ['Aprovar vistoria', 'Coletar laudo']);
  assert.deepEqual(merged.pending, ['franquia']);
});

test('extractMissionLedgerFromText reads the DIARIO DA MISSAO block and ignores other prose', () => {
  const text = `Veredito: vistoria no talhao norte.

DIARIO DA MISSAO
decisoes: vistoria no talhao norte
evidencias: fotos de granizo; sensor de umidade
pendencias: valor da franquia
divergencias: participante B queria indenizar agora
`;
  const ledger = extractMissionLedgerFromText(text);
  assert.deepEqual(ledger.decisions, ['vistoria no talhao norte']);
  assert.deepEqual(ledger.evidence, ['fotos de granizo', 'sensor de umidade']);
  assert.deepEqual(ledger.pending, ['valor da franquia']);
  assert.match(ledger.divergences[0], /indenizar agora/);
  assert.deepEqual(extractMissionLedgerFromText('so prosa sem bloco'), emptyMissionLedger());
});

test('formatMissionLedgerForPrompt and formatRunBriefing stay compact and labeled', () => {
  const prompt = formatMissionLedgerForPrompt({
    decisions: ['Vistoria'],
    evidence: ['Fotos'],
    pending: [],
    divergences: ['B discorda do valor'],
  });
  assert.match(prompt, /Diario da missao/i);
  assert.match(prompt, /decisoes: Vistoria/);
  assert.match(prompt, /pendencias: \(vazio\)/);

  const briefing = formatRunBriefing({
    domain: 'insurance',
    domainSource: 'auto',
    ledger: { decisions: ['Vistoria'] },
  });
  assert.match(briefing, /Formato desta missao/);
  assert.match(briefing, /Diario da missao/);
});

test('ledgerFromConsensusBoard records dissent and the agreed stance', () => {
  const board = {
    seats: [
      { label: 'A', vote: 'converge', stance: 'Vistoria agora. Evidencia: fotos.' },
      { label: 'B', vote: 'dissent', stance: 'Indenizar', dissentReason: 'franquia ainda pendente' },
    ],
  };
  const dissent = ledgerFromConsensusBoard(board, 'dissent');
  assert.equal(dissent.decisions.length, 0);
  assert.match(dissent.divergences[0], /franquia ainda pendente/);
  assert.ok(dissent.evidence.length >= 1);

  const consensus = ledgerFromConsensusBoard({
    seats: [{ label: 'A', vote: 'converge', stance: 'Vistoria agora' }],
  }, 'consensus');
  assert.deepEqual(consensus.decisions, ['Vistoria agora']);
});
