import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_ROUTER_MODEL,
  isAllowedRouterModel,
  resolveRouterModel,
  ROUTER_MODEL_IDS,
  ROUTER_PROFILES,
} from './router-models.js';

test('catalogo 9Router expõe 14 perfis e 12 rotas distintas da whitelist', () => {
  assert.equal(ROUTER_PROFILES.length, 14);
  assert.equal(ROUTER_MODEL_IDS.length, 12);
  assert.ok(ROUTER_MODEL_IDS.every(isAllowedRouterModel));
});

test('Ultra resolve para a rota xhigh sem campo de esforço separado', () => {
  assert.equal(resolveRouterModel('GPT 5.6 Sol Ultra'), 'cx/gpt-5.6-sol-xhigh');
  assert.equal(resolveRouterModel('9router/cx/gpt-5.6-sol-high'), 'cx/gpt-5.6-sol-high');
});

test('modelo fora da whitelist resolve para o padrão autorizado', () => {
  assert.equal(resolveRouterModel('glm-5.2'), DEFAULT_ROUTER_MODEL);
  assert.equal(resolveRouterModel('cx/gpt-5.4-mini-xhigh'), DEFAULT_ROUTER_MODEL);
});
