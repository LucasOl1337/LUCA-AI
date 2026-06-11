import test from 'node:test';
import assert from 'node:assert/strict';

import { BRAZIL_TIME_ZONE, formatBrazilDateTime, formatBrazilTime } from '../shared/time.js';

test('formatBrazilTime sempre usa horario de Brasilia', () => {
  assert.equal(BRAZIL_TIME_ZONE, 'America/Sao_Paulo');
  assert.equal(formatBrazilTime('2026-06-11T22:33:16.000Z'), '19:33:16');
});

test('formatBrazilDateTime preserva a data/hora brasileira para timestamps ISO', () => {
  assert.equal(formatBrazilDateTime('2026-06-11T22:33:16.000Z'), '11/06/2026, 19:33:16');
});
