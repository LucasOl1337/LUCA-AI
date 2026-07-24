import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createPersonaStore } from './persona-store.js';

test('persona-store migra cache legado e persiste somente personas', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-personas-'));
  try {
    fs.writeFileSync(path.join(stateDir, 'system-state.json'), JSON.stringify({
      activeMission: { description: 'legado' },
      personaAgents: [{ slug: 'tars', name: 'TARS', cachedSystemPrompt: 'prompt antigo' }],
    }), 'utf8');

    const store = createPersonaStore({ stateDir });
    assert.equal(store.list()[0].slug, 'tars');
    store.upsert({ slug: 'designer', name: 'Designer', cachedSystemPrompt: 'prompt novo' });

    const persisted = JSON.parse(fs.readFileSync(path.join(stateDir, 'personas.json'), 'utf8'));
    assert.equal(persisted.version, 1);
    assert.deepEqual(persisted.personaAgents.map((entry) => entry.slug), ['designer', 'tars']);
    assert.equal(Object.hasOwn(persisted, 'activeMission'), false);

    assert.equal(store.remove('tars'), true);
    assert.deepEqual(store.list().map((entry) => entry.slug), ['designer']);
    assert.equal(store.remove('designer'), true);

    const reopened = createPersonaStore({ stateDir });
    assert.deepEqual(reopened.list(), []);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});
