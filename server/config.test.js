import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NINE_ROUTER_CAPABILITIES,
  NINE_ROUTER_MODEL_PROFILES,
  NINE_ROUTER_ROUTE_IDS,
  IMAGE_GENERATION_MODEL,
  IMAGE_GENERATION_ROUTE_IDS,
  ROUTER_BASE_URL,
  ROUTER_MODEL,
  ROUTER_TIMEOUT_MS,
  assertAllowed9RouterModel,
  assertAllowedImageGenerationModel,
  isAllowed9RouterModel,
  isAllowedImageGenerationModel,
  sanitize9RouterModel,
  sanitizeImageGenerationModel,
  VISUAL_PERSONA_SLUG,
} from './config.js';

const EXPECTED_ROUTE_IDS = [
  'cc/claude-fable-5(medium)',
  'cc/claude-fable-5(high)',
  'cc/claude-fable-5(max)',
  'cc/claude-opus-5(medium)',
  'cc/claude-opus-5(high)',
  'cc/claude-opus-5(max)',
  'cx/gpt-5.6-sol(medium)',
  'cx/gpt-5.6-sol(high)',
  'cx/gpt-5.6-sol(max)',
  'cx/gpt-5.6-luna(medium)',
  'cx/gpt-5.6-luna(xhigh)',
  'cx/gpt-5.6-luna(max)',
  'cx/gpt-6-luna(medium)',
  'cx/gpt-6-sol(medium)',
  'cx/gpt-6-sol(high)',
  'cx/gpt-6-sol(xhigh)',
  'cx/gpt-6-astra(medium)',
  'cx/gpt-6-astra(high)',
  'cx/gpt-6-astra(xhigh)',
  'gcli/grok-4.6',
  'gcli/grok-4.6(high)',
  'gcli/grok-4.7',
  'gcli/grok-4.5(high)',
];

test('catalogo 9Router expoe 25 perfis visuais e 23 rotas permitidas', () => {
  assert.equal(NINE_ROUTER_MODEL_PROFILES.length, 25);
  assert.deepEqual(NINE_ROUTER_ROUTE_IDS, EXPECTED_ROUTE_IDS);
  assert.equal(new Set(NINE_ROUTER_MODEL_PROFILES.map((profile) => profile.id)).size, 25);
});

test('perfis Ultra sao aliases visuais das rotas (max)', () => {
  const profiles = new Map(NINE_ROUTER_MODEL_PROFILES.map((profile) => [profile.name, profile.model]));
  assert.equal(profiles.get('GPT 5.6 Sol Ultra'), profiles.get('GPT 5.6 Sol Max'));
  assert.equal(profiles.get('GPT 5.6 Luna Ultra'), profiles.get('GPT 5.6 Luna Max'));
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
  assert.equal(ROUTER_BASE_URL, 'http://127.0.0.1:20129/v1');
  assert.equal(isAllowed9RouterModel(ROUTER_MODEL), true);
});

test('timeout do 9Router tolera juiz lento sem cortar o veredito', () => {
  assert.ok(
    ROUTER_TIMEOUT_MS >= 120000,
    `ROUTER_TIMEOUT_MS deve ser >= 120s para o juiz aguardar rodadas longas; atual: ${ROUTER_TIMEOUT_MS}ms`,
  );
});

test('sanitizacao e fronteira do cliente bloqueiam rotas externas', () => {
  assert.equal(sanitize9RouterModel('cx/gpt-5.4-mini-xhigh'), ROUTER_MODEL);
  assert.equal(sanitize9RouterModel('cx/gpt-5.6-sol-xhigh'), ROUTER_MODEL);
  assert.equal(assertAllowed9RouterModel('gcli/grok-4.6(high)'), 'gcli/grok-4.6(high)');
  assert.throws(
    () => assertAllowed9RouterModel('kimi/k3'),
    /9router_model_not_allowed/,
  );
});

test('catalogo de imagem e separado do chat e aceita aliases', () => {
  assert.ok(IMAGE_GENERATION_ROUTE_IDS.includes('cx/gpt-image-2'));
  assert.ok(IMAGE_GENERATION_ROUTE_IDS.includes('xai/grok-imagine-image'));
  assert.ok(IMAGE_GENERATION_ROUTE_IDS.includes('xai/grok-imagine-image-quality'));
  assert.equal(IMAGE_GENERATION_MODEL, 'cx/gpt-image-2');
  assert.equal(isAllowedImageGenerationModel(IMAGE_GENERATION_MODEL), true);
  assert.equal(sanitizeImageGenerationModel('grok-imagine-2'), 'xai/grok-imagine-image');
  assert.equal(sanitizeImageGenerationModel('gpt-image'), 'cx/gpt-image-2');
  assert.equal(sanitizeImageGenerationModel('gpt-5.5-image'), 'cx/gpt-image-2');
  assert.equal(assertAllowedImageGenerationModel('xai/grok-imagine-image-quality'), 'xai/grok-imagine-image-quality');
  assert.equal(isAllowed9RouterModel('xai/grok-imagine-image'), false);
  assert.equal(VISUAL_PERSONA_SLUG, 'especialista-visual');
});
