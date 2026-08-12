import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  LUCA_INDIVIDUAL_PRESET_SEED,
  LUCA_TEAM_PRESET_SEED,
  VISUAL_PERSONA_MODEL,
  VISUAL_PERSONA_SLUG,
} from '../shared/luca-preset-seed.js';
import {
  NINE_ROUTER_ROUTE_IDS,
  sanitizeAgentModel,
} from './config.js';

const pageSource = fs.readFileSync(new URL('../src/pages/LucaAiPage.tsx', import.meta.url), 'utf8');
const STRONGEST_JUDGE_ROUTE = 'cx/gpt-5.6-sol-xhigh';

function teamSlugs(preset) {
  return Object.values(preset.assignments).flat();
}

test('templates seed atribuem uma rota válida e diversa a cada persona', () => {
  for (const preset of LUCA_TEAM_PRESET_SEED) {
    const slugs = teamSlugs(preset);
    const nonVisualSlugs = slugs.filter((slug) => slug !== VISUAL_PERSONA_SLUG);
    assert.deepEqual(Object.keys(preset.models).sort(), [...slugs].sort(), `${preset.id}: cobertura de modelos`);
    assert.equal(preset.models[VISUAL_PERSONA_SLUG], VISUAL_PERSONA_MODEL, `${preset.id}: visual usa Grok High`);
    assert.equal(
      new Set(nonVisualSlugs.map((slug) => preset.models[slug])).size,
      nonVisualSlugs.length,
      `${preset.id}: demais rotas distintas`,
    );
    assert.ok(new Set(Object.values(preset.models).map((model) => model.split('/')[0])).size >= 3, `${preset.id}: famílias diversas`);
    for (const model of Object.values(preset.models)) {
      assert.ok(NINE_ROUTER_ROUTE_IDS.includes(model), `${preset.id}: ${model} está no catálogo fechado`);
      assert.equal(sanitizeAgentModel(model), model, `${preset.id}: ${model} sobrevive à sanitização`);
    }
  }

  for (const preset of LUCA_INDIVIDUAL_PRESET_SEED) {
    const nonVisualSlugs = [...preset.participants, preset.judge];
    const slugs = [...nonVisualSlugs, VISUAL_PERSONA_SLUG];
    assert.deepEqual(Object.keys(preset.models).sort(), [...slugs].sort(), `${preset.id}: cobertura de modelos`);
    assert.equal(preset.models[VISUAL_PERSONA_SLUG], VISUAL_PERSONA_MODEL, `${preset.id}: visual usa Grok High`);
    assert.equal(
      new Set(nonVisualSlugs.map((slug) => preset.models[slug])).size,
      nonVisualSlugs.length,
      `${preset.id}: demais rotas distintas`,
    );
    assert.equal(
      new Set(nonVisualSlugs.map((slug) => preset.models[slug].split('/')[0])).size,
      Math.min(nonVisualSlugs.length, 4),
      `${preset.id}: máxima diversidade de famílias`,
    );
    assert.equal(preset.models[preset.judge], STRONGEST_JUDGE_ROUTE, `${preset.id}: juiz usa rota mais forte`);
    for (const model of Object.values(preset.models)) {
      assert.ok(NINE_ROUTER_ROUTE_IDS.includes(model), `${preset.id}: ${model} está no catálogo fechado`);
      assert.equal(sanitizeAgentModel(model), model, `${preset.id}: ${model} sobrevive à sanitização`);
    }
  }
});

test('run aplica modelos do template e o default visual nos modelOverrides', () => {
  const start = pageSource.indexOf('async function runMission()');
  const end = pageSource.indexOf('const activeTeamPresetId', start);
  assert.ok(start >= 0 && end > start, 'runMission presente');
  const runMission = pageSource.slice(start, end);
  assert.match(runMission, /teamPresets\.find\(\(preset\) => teamPresetMatches\(assignmentsToRun, preset\)\)/);
  assert.match(runMission, /individualPresets\.find\(\(preset\) => individualPresetMatches\(individualToRun, preset\)\)/);
  assert.match(runMission, /slug\s*===\s*VISUAL_PERSONA_SLUG/);
  assert.match(runMission, /persona\?\.localModel\s*\|\|\s*presetModels\?\.\[slug\]\s*\|\|\s*VISUAL_PERSONA_MODEL/);
  assert.match(runMission, /modelOverrides/);
});
