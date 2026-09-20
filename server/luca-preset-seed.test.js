import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LUCA_INDIVIDUAL_PRESET_SEED,
  LUCA_TEAM_PRESET_SEED,
  VISUAL_PERSONA_SLUG,
} from '../shared/luca-preset-seed.js';

const YUME_OR_BUILTIN = new Set([
  'maestro-2', 'pure-fable-5', 'pure-grok-4-5', 'matt-pocock-ai-engineer',
  'pure-gpt-5-6-sol', 'tars', 'lucas', 'thresh', 'ahri', 'yasuo', 'garen',
  'katarina', 'lux', 'jinx', 'darius', 'zed', 'kaisa', 'agente-terror',
  'aurora', 'elon-musk', VISUAL_PERSONA_SLUG,
]);

function seedSlugs() {
  return [
    ...LUCA_TEAM_PRESET_SEED.flatMap((preset) => Object.values(preset.assignments).flat()),
    ...LUCA_INDIVIDUAL_PRESET_SEED.flatMap((preset) => [...preset.participants, preset.judge]),
  ];
}

test('presets da plataforma só citam personas do Yume ou o builtin visual', () => {
  const missing = [...new Set(seedSlugs())].filter((slug) => !YUME_OR_BUILTIN.has(slug));
  assert.deepEqual(missing, []);
  assert.equal(LUCA_TEAM_PRESET_SEED.some((preset) => preset.id === 'risco-agro'), false);
  assert.equal(LUCA_INDIVIDUAL_PRESET_SEED.some((preset) => preset.id === 'comite-risco-agro'), false);
});
