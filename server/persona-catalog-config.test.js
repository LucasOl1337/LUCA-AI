import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createPersonaCatalogConfig,
  isEmptyPersonaOverride,
  sanitizePersonaOverride,
} from './persona-catalog-config.js';
import { normalizeYumePersonasForLuca } from './persona-cards.js';
import { createPersonaSource } from './persona-source.js';

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-persona-catalog-'));
  return path.join(dir, 'persona-catalog.json');
}

test('sanitize aceita so campos conhecidos, apaga texto vazio e rejeita modelo fora do 9Router', () => {
  const next = sanitizePersonaOverride({
    visible: false,
    name: '  Juiz Duro  ',
    description: '',
    model: 'glm-nao-existe',
    avatarUrl: 'javascript:alert(1)',
    systemPrompt: 'Voce e o juiz.\r\nSeja duro.',
    extra: 'ignorado',
  }, { description: 'antiga', model: 'cx/gpt-5.6-sol(high)' });
  assert.deepEqual(next, {
    visible: false,
    name: 'Juiz Duro',
    systemPrompt: 'Voce e o juiz.\nSeja duro.',
  });
  assert.equal(isEmptyPersonaOverride(sanitizePersonaOverride({ name: '' })), true);
  assert.equal(sanitizePersonaOverride({ model: 'cx/gpt-5.6-sol(high)' }).model, 'cx/gpt-5.6-sol(high)');
  assert.equal(sanitizePersonaOverride({ avatarUrl: 'https://cdn.exemplo/a.png' }).avatarUrl, 'https://cdn.exemplo/a.png');
  assert.equal(sanitizePersonaOverride({ avatarUrl: '/icons/a.png' }).avatarUrl, '/icons/a.png');
  assert.equal(sanitizePersonaOverride({ avatarUrl: '/../etc' }).avatarUrl, undefined);
});

test('catalogo global persiste em arquivo unico e volta ao padrao no reset', () => {
  const filePath = tmpFile();
  const config = createPersonaCatalogConfig({ filePath, now: () => new Date('2026-09-13T12:00:00.000Z') });
  assert.deepEqual(config.get('maestro'), {});
  assert.equal(config.isVisible('maestro'), true);

  config.set('maestro', { visible: false, name: 'Maestro X' });
  assert.deepEqual(config.get('maestro'), { visible: false, name: 'Maestro X' });
  assert.equal(config.isVisible('maestro'), false);

  const reloaded = createPersonaCatalogConfig({ filePath });
  assert.deepEqual(reloaded.get('maestro'), { visible: false, name: 'Maestro X' });
  assert.equal(reloaded.snapshot().updatedAt, '2026-09-13T12:00:00.000Z');

  // Patch parcial mantem o resto; texto vazio limpa o campo.
  reloaded.set('maestro', { name: '' });
  assert.deepEqual(reloaded.get('maestro'), { visible: false });
  assert.equal(reloaded.reset('maestro'), true);
  assert.deepEqual(createPersonaCatalogConfig({ filePath }).get('maestro'), {});
  assert.equal(reloaded.reset('maestro'), false);
});

test('override do admin entra no card normalizado sem tocar no valor original do Yume', () => {
  const [persona] = normalizeYumePersonasForLuca(
    [{ slug: 'maestro', name: 'Maestro', model: 'glm-5.1', description: 'orquestrador', is_official: true, version: 4 }],
    [],
    { get: () => ({ visible: false, name: 'Regente', model: 'cx/gpt-5.6-sol(high)', systemPrompt: 'x' }) },
  );
  assert.equal(persona.name, 'Regente');
  assert.equal(persona.base.name, 'Maestro');
  assert.equal(persona.description, 'orquestrador');
  assert.equal(persona.visible, false);
  assert.equal(persona.customized, true);
  assert.equal(persona.hasPromptOverride, true);
  assert.equal(persona.model, 'cx/gpt-5.6-sol(high)');
  assert.equal(persona.adminModel, 'cx/gpt-5.6-sol(high)');
  assert.equal(persona.modelOverridden, true);

  const [plain] = normalizeYumePersonasForLuca(
    [{ slug: 'maestro', name: 'Maestro', model: 'glm-5.1', is_official: true }],
    [],
    null,
  );
  assert.equal(plain.visible, true);
  assert.equal(plain.customized, false);
  assert.deepEqual(plain.override, {});
});

test('Persona Source aplica prompt, nome e modelo do admin na resolucao', async () => {
  let records = [];
  const source = createPersonaSource({
    yume: {
      list: async () => [{ slug: 'juiz', name: 'Juiz', model: 'glm-5.1', is_official: true }],
      fetchPrompt: async () => ({ system_prompt: 'PROMPT DO YUME', version: 2, model: 'glm-5.1', name: 'Juiz' }),
      fetchVersion: async () => ({ version: 2 }),
    },
    builtin: { list: () => [] },
    cache: {
      list: () => records,
      replace: (next) => { records = next.map((r) => ({ ...r })); return records; },
    },
    overrides: {
      get: (slug) => (slug === 'juiz'
        ? { name: 'Juiz Severo', systemPrompt: 'PROMPT DO ADMIN', model: 'cx/gpt-5.6-sol(high)' }
        : {}),
    },
  });
  await source.syncRoster();
  const loaded = await source.resolve('juiz');
  assert.equal(loaded.name, 'Juiz Severo');
  assert.equal(loaded.systemPrompt, 'PROMPT DO ADMIN');
  assert.equal(loaded.promptOverridden, true);
  assert.equal(loaded.model, 'cx/gpt-5.6-sol(high)');
  assert.equal(loaded.adminModel, 'cx/gpt-5.6-sol(high)');
  // O cache continua guardando o prompt autoritativo do Yume, nao o override.
  assert.equal(records.find((r) => r.slug === 'juiz').cachedSystemPrompt, 'PROMPT DO YUME');

  // Escolha explicita da rodada ainda vence o admin.
  const forced = await source.resolve('juiz', { modelOverride: 'cx/gpt-5.6-sol(max)' });
  assert.equal(forced.model, 'cx/gpt-5.6-sol(max)');
});
