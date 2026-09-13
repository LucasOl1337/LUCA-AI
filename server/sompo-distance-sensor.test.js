import assert from 'node:assert/strict';
import test from 'node:test';

import { sompoDistanceSensorCopy } from '../shared/sompo-distance-sensor.js';

test('rótulo de distância acompanha a posição física do sensor', () => {
  assert.deepEqual(sompoDistanceSensorCopy('rear'), { label: 'Distância traseira', relative: 'atrás' });
  assert.deepEqual(sompoDistanceSensorCopy('front'), { label: 'Distância frontal', relative: 'à frente' });
  assert.deepEqual(sompoDistanceSensorCopy(undefined), { label: 'Distância frontal', relative: 'à frente' });
});
