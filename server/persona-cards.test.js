import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildKamuiYumeAvatarUrl,
  buildYumeAvatarProxyUrl,
  normalizeYumeAvatarPath,
  normalizeYumePersonasForLuca,
} from './persona-cards.js';
import { ROUTER_MODEL, resolvePersonaRuntimeModel } from './config.js';

test('normaliza personas do Yume com flag de importacao e avatar proxy local', () => {
  const personas = normalizeYumePersonasForLuca(
    [
      {
        slug: 'maestro',
        name: 'Maestro',
        model: 'glm-5.1',
        description: 'orquestrador',
        purpose: 'coordena',
        avatar_url: '/api/avatars/maestro.png',
        is_official: true,
        version: 4,
      },
    ],
    [{ slug: 'maestro', model: 'cx/gpt-5.6-sol' }],
  );

  assert.equal(personas.length, 1);
  assert.equal(personas[0].imported, true);
  assert.equal(personas[0].model, 'cx/gpt-5.6-sol');
  assert.equal(personas[0].yumeModel, 'glm-5.1');
  assert.equal(personas[0].localModel, 'cx/gpt-5.6-sol');
  assert.equal(personas[0].modelOverridden, true);
  assert.equal(personas[0].avatarUrl, '/api/personas/avatar?src=%2Fapi%2Favatars%2Fmaestro.png');
  assert.equal(personas[0].is_official, true);
  assert.equal(personas[0].version, 4);
});

test('secundária cacheada aparece como imported no catálogo normalizado', () => {
  const personas = normalizeYumePersonasForLuca(
    [
      { slug: 'aurora', name: 'Aurora', model: 'gcli/grok-4.5', is_official: true },
      { slug: 'jinx', name: 'Jinx', model: 'cx/gpt-5.6-sol', is_official: false },
    ],
    [{ slug: 'jinx', model: 'kimi/k3' }],
  );
  assert.equal(personas[0].imported, true);
  assert.equal(personas[1].imported, true);
  assert.equal(personas[1].is_official, false);
  assert.equal(personas[1].model, 'kimi/k3');
});

test('expoe modelo Yume valido no 9Router mesmo sem import, e marca motor efetivo', () => {
  const personas = normalizeYumePersonasForLuca([
    { slug: 'aurora', name: 'Aurora', model: 'gcli/grok-4.5' },
    { slug: 'legada', name: 'Legada', model: 'glm-5.2' },
    { slug: 'grok-high', name: 'Grok High', model: 'gcli/grok-4.5-high' },
  ]);

  assert.equal(personas[0].imported, false);
  assert.equal(personas[0].yumeModel, 'gcli/grok-4.5');
  assert.equal(personas[0].model, 'gcli/grok-4.5');
  assert.equal(personas[0].modelOverridden, false);

  assert.equal(personas[1].imported, false);
  assert.equal(personas[1].yumeModel, 'glm-5.2');
  // rota fora do catalogo 9Router cai no default do LUCA
  assert.equal(personas[1].model, ROUTER_MODEL);

  assert.equal(personas[2].model, 'gcli/grok-4.5-high');
  assert.equal(personas[2].modelOverridden, false);
});

test('import sem override local preserva motor do Yume no seletor', () => {
  const personas = normalizeYumePersonasForLuca(
    [{ slug: 'anfitriao', name: 'O Anfitrião', model: 'gcli/grok-4.5-high', is_official: true }],
    [{ slug: 'anfitriao', model: '' }],
  );
  assert.equal(personas[0].imported, true);
  assert.equal(personas[0].localModel, '');
  assert.equal(personas[0].yumeModel, 'gcli/grok-4.5-high');
  assert.equal(personas[0].model, 'gcli/grok-4.5-high');
  assert.equal(personas[0].modelOverridden, false);
});

test('resolvePersonaRuntimeModel prioriza override > local > yume > fallback', () => {
  assert.equal(
    resolvePersonaRuntimeModel({
      localModel: 'cx/gpt-5.6-sol',
      yumeModel: 'gcli/grok-4.5',
      overrideModel: 'kimi/k3',
    }),
    'kimi/k3',
  );
  assert.equal(
    resolvePersonaRuntimeModel({
      localModel: 'cx/gpt-5.6-sol',
      yumeModel: 'gcli/grok-4.5',
    }),
    'cx/gpt-5.6-sol',
  );
  assert.equal(
    resolvePersonaRuntimeModel({
      yumeModel: 'gcli/grok-4.5',
    }),
    'gcli/grok-4.5',
  );
  assert.equal(
    resolvePersonaRuntimeModel({
      localModel: '',
      yumeModel: 'gcli/grok-4.5-high',
    }),
    'gcli/grok-4.5-high',
  );
  assert.equal(resolvePersonaRuntimeModel({ yumeModel: 'glm-5.2' }), ROUTER_MODEL);
});

test('especialista visual usa Grok 4.6 por padrão e respeita override explícito', () => {
  const [defaultVisual] = normalizeYumePersonasForLuca([
    {
      slug: 'especialista-visual',
      name: 'Especialista Visual',
      model: 'cx/gpt-5.6-sol-high',
      is_official: true,
    },
  ]);
  assert.equal(defaultVisual.model, 'gcli/grok-4.6');
  assert.equal(defaultVisual.localModel, '');

  const [overriddenVisual] = normalizeYumePersonasForLuca(
    [{
      slug: 'especialista-visual',
      name: 'Especialista Visual',
      model: 'cx/gpt-5.6-sol-high',
      is_official: true,
    }],
    [{ slug: 'especialista-visual', model: 'kimi/k3' }],
  );
  assert.equal(overriddenVisual.model, 'kimi/k3');
  assert.equal(overriddenVisual.localModel, 'kimi/k3');
});

test('mantem avatar externo direto e nao tenta proxiar pelo LUCA', () => {
  const avatar = 'https://cdn.example.com/avatar.jpg';
  assert.equal(buildYumeAvatarProxyUrl(avatar), avatar);
  assert.equal(normalizeYumeAvatarPath(avatar), '');
});

test('aceita somente paths estaticos de avatar do Yume no proxy Kamui', () => {
  assert.equal(normalizeYumeAvatarPath('api/avatars/tars.png'), '/api/avatars/tars.png');
  assert.equal(normalizeYumeAvatarPath('/api/personas/maestro'), '');
  assert.equal(normalizeYumeAvatarPath('/api/avatars/../state.json'), '');
  assert.match(buildKamuiYumeAvatarUrl('/api/avatars/tars.png'), /\/kamui\/yume\/api\/avatars\/tars\.png$/);
});
