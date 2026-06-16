import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_ENGINE_MODEL,
  resolveModelSelector,
} from '../shared/model-selector.js';

test('resolveModelSelector usa GLM_MODEL como default do motor', () => {
  const selector = resolveModelSelector({ GLM_MODEL: 'glm-5.1' });

  assert.equal(selector.key, 'default');
  assert.equal(selector.model, 'glm-5.1');
  assert.equal(selector.fallback, false);
  assert.ok(selector.options.some((option) => option.key === 'default' && option.selected));
});

test('resolveModelSelector escolhe modelo pelo MODEL_SELECTOR_KEY', () => {
  const selector = resolveModelSelector({
    GLM_MODEL: 'glm-5.1',
    MODEL_SELECTOR_KEY: 'raciocinio',
    GLM_MODEL_OPTIONS: JSON.stringify({
      raciocinio: 'glm-5.1-thinking',
      rapido: 'glm-5.1-air',
    }),
  });

  assert.equal(selector.key, 'raciocinio');
  assert.equal(selector.model, 'glm-5.1-thinking');
  assert.equal(selector.fallback, false);
  assert.ok(selector.options.some((option) => option.key === 'rapido' && option.model === 'glm-5.1-air'));
});

test('resolveModelSelector faz fallback quando a chave nao existe', () => {
  const selector = resolveModelSelector({
    GLM_MODEL: 'glm-5.1',
    MODEL_SELECTOR_KEY: 'inexistente',
    GLM_MODEL_OPTIONS: JSON.stringify({ principal: 'glm-5.1' }),
  });

  assert.equal(selector.requestedKey, 'inexistente');
  assert.equal(selector.key, 'default');
  assert.equal(selector.model, 'glm-5.1');
  assert.equal(selector.fallback, true);
});

test('resolveModelSelector ignora mapa invalido e preserva default seguro', () => {
  const selector = resolveModelSelector({
    GLM_MODEL: '',
    MODEL_SELECTOR_KEY: 'principal',
    GLM_MODEL_OPTIONS: '{quebrado',
  });

  assert.equal(selector.key, 'default');
  assert.equal(selector.model, DEFAULT_ENGINE_MODEL);
  assert.equal(selector.fallback, true);
});
