import test from 'node:test';
import assert from 'node:assert/strict';

import { buildOkStateResponse } from './state-response.js';

test('buildOkStateResponse inclui ok, campos extras e snapshot atual', () => {
  const state = { activeRun: { status: 'running' } };
  const response = buildOkStateResponse(state, { mission: { id: 'mission-1' } });

  assert.equal(response.ok, true);
  assert.deepEqual(response.mission, { id: 'mission-1' });
  assert.equal(response.state, state);
});

test('buildOkStateResponse preserva o snapshot mesmo com extra vazio', () => {
  const state = { supervisorMode: 'standby' };
  const response = buildOkStateResponse(state);

  assert.deepEqual(response, {
    ok: true,
    state,
  });
});
