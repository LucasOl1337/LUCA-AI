import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  optionalSlugsForTeamPreset,
  partitionPresetCatalogSlugs,
  presetCatalogApplyMessage,
} from '../shared/luca-preset-catalog.js';
import { VISUAL_PERSONA_SLUG } from '../shared/luca-preset-seed.js';

const lucaAiPage = readFileSync(new URL('../src/pages/LucaAiPage.tsx', import.meta.url), 'utf8');

// Produção 2026-09-20: admin ocultou especialista-visual; ARTIFICIAL ANALISYS
// usa Fable/Sol/Grok e não pede o builtin. O apply antigo injetava a slug
// oculta e recusava o preset inteiro.
const ARTIFICIAL_ANALISYS = {
  label: 'ARTIFICIAL ANALISYS',
  assignments: {
    supervisor: ['pure-fable-5'],
    mission: ['pure-gpt-5-6-sol'],
    execution: ['pure-gpt-5-6-sol'],
    approval: ['pure-gpt-5-6-sol'],
    display: ['pure-grok-4-5'],
    visual: ['pure-grok-4-5'],
  },
};

const VISIBLE_CATALOG = [
  'lucas',
  'pure-fable-5',
  'pure-gpt-5-6-sol',
  'pure-grok-4-5',
];

test('ARTIFICIAL ANALISYS aplica sem o builtin visual oculto', () => {
  const wanted = [
    'pure-fable-5',
    'pure-gpt-5-6-sol',
    'pure-grok-4-5',
  ];
  const optional = optionalSlugsForTeamPreset(ARTIFICIAL_ANALISYS.assignments);
  assert.deepEqual(optional, [VISUAL_PERSONA_SLUG]);

  const partition = partitionPresetCatalogSlugs(wanted, VISIBLE_CATALOG, optional);
  assert.equal(partition.blocked, false);
  assert.deepEqual(partition.present, wanted);
  assert.deepEqual(partition.missingRequired, []);
  assert.deepEqual(partition.missingOptional, []);
  assert.equal(presetCatalogApplyMessage(ARTIFICIAL_ANALISYS.label, partition), null);
});

test('injetar especialista-visual oculto era o bug: agora isso é opcional', () => {
  const wantedWithInjectedVisual = [
    'pure-fable-5',
    'pure-gpt-5-6-sol',
    'pure-grok-4-5',
    VISUAL_PERSONA_SLUG,
  ];
  const partition = partitionPresetCatalogSlugs(
    wantedWithInjectedVisual,
    VISIBLE_CATALOG,
    optionalSlugsForTeamPreset(ARTIFICIAL_ANALISYS.assignments),
  );
  assert.equal(partition.blocked, false);
  assert.deepEqual(partition.missingOptional, [VISUAL_PERSONA_SLUG]);
  assert.deepEqual(partition.missingRequired, []);
  assert.equal(presetCatalogApplyMessage(ARTIFICIAL_ANALISYS.label, partition), null);
});

test('preset só com personas ocultas ainda bloqueia', () => {
  const partition = partitionPresetCatalogSlugs(
    ['darius', 'jinx', VISUAL_PERSONA_SLUG],
    VISIBLE_CATALOG,
    [VISUAL_PERSONA_SLUG],
  );
  assert.equal(partition.blocked, true);
  assert.match(
    presetCatalogApplyMessage("Squad Summoner's Rift", partition),
    /fora do catálogo visível: darius, jinx/,
  );
});

test('papel obrigatório ausente aplica o resto e avisa, visual oculto fica quieto', () => {
  const partition = partitionPresetCatalogSlugs(
    ['lucas', 'tars', 'elon-musk', 'aurora', 'maestro-2', 'pure-gpt-5-6-sol', VISUAL_PERSONA_SLUG],
    VISIBLE_CATALOG,
    [VISUAL_PERSONA_SLUG],
  );
  assert.equal(partition.blocked, false);
  assert.deepEqual(partition.present, ['lucas', 'pure-gpt-5-6-sol']);
  assert.deepEqual(partition.missingRequired, ['tars', 'elon-musk', 'aurora', 'maestro-2']);
  assert.deepEqual(partition.missingOptional, [VISUAL_PERSONA_SLUG]);
  assert.equal(
    presetCatalogApplyMessage('Conselho de Estratégia', partition),
    'Preset "Conselho de Estratégia" aplicado sem 4 personas: tars, elon-musk, aurora, maestro-2.',
  );
});

test('bancada não injeta mais especialista-visual em todo preset', () => {
  assert.match(lucaAiPage, /partitionPresetCatalogSlugs/);
  assert.match(lucaAiPage, /optionalSlugsForTeamPreset/);
  assert.doesNotMatch(
    lucaAiPage,
    /uniqueSlugs\(\[\.\.\.teamPresetSlugs\(preset\), VISUAL_PERSONA_SLUG\]\)/,
  );
  assert.doesNotMatch(
    lucaAiPage,
    /uniqueSlugs\(\[\.\.\.individualPresetSlugs\(preset\), VISUAL_PERSONA_SLUG\]\)/,
  );
  assert.doesNotMatch(lucaAiPage, /fora do catálogo Yume/);
});
