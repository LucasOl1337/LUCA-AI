import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeMissionContext,
  hasContext,
  mergeMissionContext,
  summarizeContextForPrompt,
  normalizeSignal,
  summarizeSignalsForPrompt,
} from './problem-context.js';

test('normalizeMissionContext aceita aliases e produz listas', () => {
  const c = normalizeMissionContext({
    dados_historicos: ['sinistros 2024', 'sinistros 2025'],
    realtimeData: 'leituras de sensores',
    previsiveis: ['sazonalidade'],
    causas: ['fraude', 'falha de inspecao'],
    falhas_provaveis: 'subnotificacao',
    fontes: ['datalake', 'CRM'],
    notas: 'foco em prevencao',
  });
  assert.deepEqual(c.historical, ['sinistros 2024', 'sinistros 2025']);
  assert.deepEqual(c.realtime, ['leituras de sensores']);
  assert.deepEqual(c.predictable, ['sazonalidade']);
  assert.deepEqual(c.causes, ['fraude', 'falha de inspecao']);
  assert.deepEqual(c.probableFailures, ['subnotificacao']);
  assert.deepEqual(c.dataSources, ['datalake', 'CRM']);
  assert.equal(c.notes, 'foco em prevencao');
});

test('hasContext distingue vazio de preenchido', () => {
  assert.equal(hasContext({}), false);
  assert.equal(hasContext({ causes: [] }), false);
  assert.equal(hasContext({ causes: ['x'] }), true);
  assert.equal(hasContext({ notes: 'algo' }), true);
});

test('mergeMissionContext une sem duplicar', () => {
  const merged = mergeMissionContext(
    { causes: ['fraude'], historical: ['2024'] },
    { causes: ['fraude', 'clima'], realtime: ['IoT'] },
  );
  assert.deepEqual(merged.causes, ['fraude', 'clima']);
  assert.deepEqual(merged.historical, ['2024']);
  assert.deepEqual(merged.realtime, ['IoT']);
});

test('summarizeContextForPrompt rotula as secoes presentes', () => {
  const text = summarizeContextForPrompt({ causes: ['fraude'], realtime: ['sensor'] });
  assert.match(text, /Causas conhecidas do problema:/);
  assert.match(text, /- fraude/);
  assert.match(text, /Dados coletaveis em tempo real:/);
  assert.doesNotMatch(text, /Dados historicos:/); // ausente -> nao aparece
});

test('normalizeSignal aplica defaults e severidade valida', () => {
  const s = normalizeSignal({ label: 'sinistros/hora', value: 12, unit: 'sin', severity: 'critical', source: 'stream' });
  assert.equal(s.label, 'sinistros/hora');
  assert.equal(s.value, 12);
  assert.equal(s.severity, 'critical');
  assert.equal(s.source, 'stream');
  assert.ok(s.id.startsWith('signal-'));
  assert.ok(s.at);
  const bad = normalizeSignal({ severity: 'explosao' });
  assert.equal(bad.severity, 'info');
});

test('summarizeSignalsForPrompt lista os ultimos sinais', () => {
  assert.equal(summarizeSignalsForPrompt([]), '');
  const out = summarizeSignalsForPrompt([
    normalizeSignal({ label: 'a', value: 1 }),
    normalizeSignal({ label: 'b', value: 2, severity: 'warning' }),
  ]);
  assert.match(out, /Sinais em tempo real recentes/);
  assert.match(out, /a: 1/);
  assert.match(out, /\[warning\] b: 2/);
});
