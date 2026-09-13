import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  sompoActiveStoryKeys,
  sompoRequestedScenarioAction,
  sompoRequestedScenarioKey,
} from '../src/lib/sompo-scenario-selection.js';

const AQUA = { scenarioId: 'aquaplaning', outcomeId: 'saida-de-pista' };
const BLOWOUT = { scenarioId: 'tire-blowout', outcomeId: 'tombamento' };
const AQUA_KEY = sompoRequestedScenarioKey(AQUA.scenarioId, AQUA.outcomeId);

test('deep-link aplica o roteiro da URL na primeira carga', () => {
  const action = sompoRequestedScenarioAction({
    requested: AQUA,
    current: { scenarioId: 'normal', outcomeId: 'livre' },
    lastHonoredKey: '',
  });
  assert.deepEqual(action, { type: 'apply', key: AQUA_KEY, ...AQUA });
});

test('mudar o dropdown com a URL antiga não puxa o cenário de volta', () => {
  const action = sompoRequestedScenarioAction({
    requested: AQUA,
    current: BLOWOUT,
    lastHonoredKey: AQUA_KEY,
  });
  assert.equal(action.type, 'idle');
});

test('chip da regulação só aplica quando a URL de fato muda', () => {
  const action = sompoRequestedScenarioAction({
    requested: BLOWOUT,
    current: AQUA,
    lastHonoredKey: AQUA_KEY,
  });
  assert.deepEqual(action, {
    type: 'apply',
    key: sompoRequestedScenarioKey(BLOWOUT.scenarioId, BLOWOUT.outcomeId),
    ...BLOWOUT,
  });
});

test('depois do dropdown, a URL nova só marca o pedido: não reinicia o roteiro', () => {
  const action = sompoRequestedScenarioAction({
    requested: BLOWOUT,
    current: BLOWOUT,
    lastHonoredKey: AQUA_KEY,
  });
  assert.deepEqual(action, {
    type: 'honor',
    key: sompoRequestedScenarioKey(BLOWOUT.scenarioId, BLOWOUT.outcomeId),
  });
});

test('o ciclo do bug (dropdown → URL → efeito) não devolve o roteiro da regulação', () => {
  let current = { ...AQUA };
  let requested = { ...AQUA };
  let lastHonoredKey = AQUA_KEY;

  current = { ...BLOWOUT };
  assert.equal(sompoRequestedScenarioAction({ requested, current, lastHonoredKey }).type, 'idle');

  requested = { ...BLOWOUT };
  const afterUrl = sompoRequestedScenarioAction({ requested, current, lastHonoredKey });
  assert.equal(afterUrl.type, 'honor');
  lastHonoredKey = afterUrl.key;

  assert.equal(sompoRequestedScenarioAction({ requested, current, lastHonoredKey }).type, 'idle');
});

test('sem cenario na URL o simulador fica dono da seleção', () => {
  assert.equal(sompoRequestedScenarioAction({
    requested: { scenarioId: '', outcomeId: '' },
    current: AQUA,
    lastHonoredKey: '',
  }).type, 'idle');
});

test('a faixa segue o canvas, não o deep-link velho da regulação', () => {
  assert.deepEqual(sompoActiveStoryKeys({
    liveScenarioId: 'tire-blowout',
    liveOutcomeId: 'tombamento',
    urlScenarioId: 'aquaplaning',
    urlOutcomeId: 'saida-de-pista',
  }), { scenarioId: 'tire-blowout', outcomeId: 'tombamento' });
  assert.deepEqual(sompoActiveStoryKeys({
    liveScenarioId: '',
    liveOutcomeId: '',
    urlScenarioId: 'aquaplaning',
    urlOutcomeId: 'saida-de-pista',
  }), { scenarioId: 'aquaplaning', outcomeId: 'saida-de-pista' });
});

test('simulador honra o árbitro e devolve a seleção para a URL', () => {
  const source = readFileSync(new URL('../src/components/SompoTruckSimulator.tsx', import.meta.url), 'utf8');
  assert.match(source, /sompoRequestedScenarioAction/);
  assert.match(source, /lastHonoredRequestRef/);
  assert.match(source, /onScenarioSelectRef\.current\?\.\(/);
  assert.doesNotMatch(
    source,
    /\[requestedScenario, requestedOutcome, isFirebase, episodeActive, agriRun, controls\.scenarioId, controls\.outcomeId\]/,
  );
});

test('página SOMPO não prefere o cenario da URL contra a telemetria ao vivo', () => {
  const source = readFileSync(new URL('../src/pages/SompoPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /sompoActiveStoryKeys/);
  assert.match(source, /onScenarioSelect=/);
  assert.doesNotMatch(
    source,
    /findSompoStoryForScenario\(\s*location\.cenario \|\| telemetry/,
  );
});
