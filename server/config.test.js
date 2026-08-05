import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NINE_ROUTER_CAPABILITIES,
  NINE_ROUTER_MODEL_PROFILES,
  NINE_ROUTER_ROUTE_IDS,
  ROUTER_BASE_URL,
  ROUTER_MODEL,
  assertAllowed9RouterModel,
  isAllowed9RouterModel,
  sanitize9RouterModel,
} from './config.js';

const EXPECTED_ROUTE_IDS = [
  'cc/claude-fable-5',
  'cc/claude-opus-4-8(max)',
  'cx/gpt-5.6-sol',
  'cx/gpt-5.6-sol-high',
  'cx/gpt-5.6-sol-xhigh',
  'cx/gpt-5.6-luna-xhigh',
  'cx/gpt-5.5',
  'cx/gpt-5.5-xhigh',
  'gcli/grok-4.5',
  'gcli/grok-4.5-high',
  'gcli/grok-4.5-medium',
  'gcli/grok-4.5-low',
  'kimi/kimi-k3',
  'kimi/k3',
  'kimi/kimi-for-coding',
  'kimi/kimi-for-coding-highspeed',
];

test('catalogo 9Router expoe 18 perfis visuais e 16 rotas permitidas', () => {
  assert.equal(NINE_ROUTER_MODEL_PROFILES.length, 18);
  assert.deepEqual(NINE_ROUTER_ROUTE_IDS, EXPECTED_ROUTE_IDS);
  assert.equal(new Set(NINE_ROUTER_MODEL_PROFILES.map((profile) => profile.id)).size, 18);
});

test('perfis Ultra sao aliases visuais das rotas xhigh', () => {
  const profiles = new Map(NINE_ROUTER_MODEL_PROFILES.map((profile) => [profile.name, profile.model]));
  assert.equal(profiles.get('GPT 5.6 Sol Ultra'), profiles.get('GPT 5.6 Sol xhigh'));
  assert.equal(profiles.get('GPT 5.6 Luna Ultra'), profiles.get('GPT 5.6 Luna xhigh'));
});

test('configuracao 9Router declara capacidades maximas sem controles de esforco', () => {
  assert.deepEqual(NINE_ROUTER_CAPABILITIES.inputModalities, ['text', 'image']);
  assert.deepEqual(NINE_ROUTER_CAPABILITIES.outputModalities, ['text']);
  assert.equal(NINE_ROUTER_CAPABILITIES.attachments, true);
  assert.equal(NINE_ROUTER_CAPABILITIES.toolCalling, true);
  assert.equal(NINE_ROUTER_CAPABILITIES.temperature, true);
  assert.equal(NINE_ROUTER_CAPABILITIES.maxTokens, true);
  assert.equal(Object.keys(NINE_ROUTER_CAPABILITIES).some((key) => /reason|thinking|effort/i.test(key)), false);
});

test('defaults usam a base local e uma rota da whitelist', () => {
  assert.equal(ROUTER_BASE_URL, 'http://127.0.0.1:20128/v1');
  assert.equal(isAllowed9RouterModel(ROUTER_MODEL), true);
});

test('sanitizacao e fronteira do cliente bloqueiam rotas externas', () => {
  assert.equal(sanitize9RouterModel('cx/gpt-5.4-mini-xhigh'), ROUTER_MODEL);
  assert.equal(assertAllowed9RouterModel('kimi/k3'), 'kimi/k3');
  assert.throws(
    () => assertAllowed9RouterModel('cx/gpt-5.4-mini-xhigh'),
    /9router_model_not_allowed/,
  );
});
