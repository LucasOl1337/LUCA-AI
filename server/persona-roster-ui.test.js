import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const personasPage = readFileSync(new URL('../src/pages/PersonasPage.tsx', import.meta.url), 'utf8');
const lucaAiPage = readFileSync(new URL('../src/pages/LucaAiPage.tsx', import.meta.url), 'utf8');
const serverIndex = readFileSync(new URL('./index.js', import.meta.url), 'utf8');

test('tela de personas reflete o roster oficial do Yume sem mutação local', () => {
  assert.match(personasPage, /Roster principal/);
  assert.match(personasPage, /Fonte única: personas oficiais do Yume/);
  assert.match(personasPage, /aria-expanded=\{secondaryExpanded\}/);
  assert.match(personasPage, /Gerenciar categoria no Yume/);
  assert.doesNotMatch(personasPage, /Adicionar ao LUCA|Remover do LUCA/);
});

test('picker mostra oficiais antes das secundárias e bloqueia promoção local', () => {
  assert.match(lucaAiPage, /luca-picker-roster-title/);
  assert.match(lucaAiPage, /luca-picker-secondary-panel/);
  assert.match(lucaAiPage, /personas\.filter\(\(persona\) => persona\.imported\)\.map/);
  assert.match(lucaAiPage, /await ensurePersonaOfficial\(slug\)/);
  assert.match(lucaAiPage, /disabled=\{secondary \|\|/);
  assert.doesNotMatch(lucaAiPage, /importYumePersona/);
});

test('Express reconcilia pelo Kamui e identifica a fonte canônica', () => {
  assert.match(serverIndex, /syncOfficialPersonaRoster/);
  assert.match(serverIndex, /syncAllOfficialPersonaRosters/);
  assert.match(serverIndex, /rosterSource: 'yume\.is_official'/);
  assert.match(serverIndex, /error: 'persona_not_official'/);
});
