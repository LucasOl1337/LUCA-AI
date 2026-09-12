import assert from 'node:assert/strict';
import test from 'node:test';

import { frameDamping } from '../src/components/sompo/frameDamping.js';

test('amortecimento da cena independe da taxa de quadros', () => {
  const response = 5;
  const step = (value, delta) => value + ((1 - value) * frameDamping(delta, response));
  let at60Fps = 0;
  let at10Fps = 0;
  for (let frame = 0; frame < 60; frame += 1) at60Fps = step(at60Fps, 1 / 60);
  for (let frame = 0; frame < 10; frame += 1) at10Fps = step(at10Fps, 1 / 10);
  assert.ok(Math.abs(at60Fps - at10Fps) < 1e-12);
  assert.ok(at10Fps > 0.99, 'a câmera alcança um alvo móvel mesmo com poucos quadros');
});

test('amortecimento rejeita entradas inválidas sem produzir NaN', () => {
  assert.equal(frameDamping(Number.NaN, 5), 1);
  assert.equal(frameDamping(1 / 60, Number.POSITIVE_INFINITY), 1);
  assert.equal(frameDamping(-1, 5), 0);
});
