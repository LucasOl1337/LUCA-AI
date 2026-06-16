import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildKamuiYumeAvatarUrl,
  buildYumeAvatarProxyUrl,
  normalizeYumeAvatarPath,
  normalizeYumePersonasForLuca,
} from './persona-cards.js';

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
        version: 4,
      },
    ],
    [{ slug: 'maestro' }],
  );

  assert.equal(personas.length, 1);
  assert.equal(personas[0].imported, true);
  assert.equal(personas[0].avatarUrl, '/api/personas/avatar?src=%2Fapi%2Favatars%2Fmaestro.png');
  assert.equal(personas[0].version, 4);
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
