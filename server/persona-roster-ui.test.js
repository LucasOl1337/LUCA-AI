import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const personasPage = readFileSync(new URL('../src/pages/PersonasPage.tsx', import.meta.url), 'utf8');
const lucaAiPage = readFileSync(new URL('../src/pages/LucaAiPage.tsx', import.meta.url), 'utf8');
const serverIndex = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const configPage = readFileSync(new URL('../src/pages/ConfiguracaoPage.tsx', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../src/components/Layout.tsx', import.meta.url), 'utf8');

test('tela de personas explica Yume autoritativo e fallback do Persona Source', () => {
  assert.match(personasPage, /Roster principal/);
  assert.match(personasPage, /Fonte editorial: oficiais do Yume/);
  assert.match(personasPage, /Builtins LUCA/);
  assert.match(personasPage, /aria-expanded=\{secondaryExpanded\}/);
  assert.match(personasPage, /Gerenciar categoria no Yume/);
  assert.doesNotMatch(personasPage, /Adicionar ao LUCA|Remover do LUCA/);
});

test('picker mostra oficiais e secundárias selecionáveis via cache local', () => {
  assert.match(lucaAiPage, /luca-picker-roster-title/);
  assert.match(lucaAiPage, /luca-picker-secondary-panel/);
  assert.match(lucaAiPage, /persona\.is_official === true/);
  assert.match(lucaAiPage, /await ensurePersonaAvailable\(slug\)/);
  assert.match(lucaAiPage, /importYumePersona/);
  assert.match(lucaAiPage, /disponíveis via cache local do LUCA/);
  assert.doesNotMatch(lucaAiPage, /disabled=\{secondary \|\|/);
});

test('Express usa a interface profunda de Persona Source', () => {
  assert.match(serverIndex, /personaSource\.listAvailable/);
  assert.match(serverIndex, /personaSource\.loadMany/);
  assert.match(serverIndex, /personaSource\.syncAllRosters/);
  assert.match(serverIndex, /personaSource\.importPersona/);
  assert.match(serverIndex, /\/api\/luca-ai\/team-templates/);
});

test('aba Configuração existe na navegação e página', () => {
  assert.match(layout, /configuracao/);
  assert.match(layout, /Configuração/);
  assert.match(configPage, /Novo template/);
  assert.match(configPage, /createTeamTemplate|updateTeamTemplate/);
});
