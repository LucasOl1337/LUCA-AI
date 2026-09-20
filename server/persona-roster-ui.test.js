import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const personasPage = readFileSync(new URL('../src/pages/PersonasPage.tsx', import.meta.url), 'utf8');
const lucaAiPage = readFileSync(new URL('../src/pages/LucaAiPage.tsx', import.meta.url), 'utf8');
const serverIndex = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const configPage = readFileSync(new URL('../src/pages/ConfiguracaoPage.tsx', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../src/components/Layout.tsx', import.meta.url), 'utf8');

test('tela de personas e o catalogo global do admin, sem ativacao por conta nem link do Yume', () => {
  assert.match(personasPage, /Visíveis para todos/);
  assert.match(personasPage, /Ocultas/);
  assert.match(personasPage, /adminListPersonas/);
  assert.match(personasPage, /adminUpdatePersona/);
  assert.match(personasPage, /adminResetPersona/);
  assert.match(personasPage, /data-persona-editor/);
  assert.match(personasPage, /data-persona-field="systemPrompt"/);
  assert.match(personasPage, /Salvar para todos/);
  assert.doesNotMatch(personasPage, /state\?\.personaAgents/);
  assert.doesNotMatch(personasPage, /57\.156\.59\.165|YUME_DASHBOARD_URL|Abrir Yume|Gerenciar categoria no Yume/);
  assert.doesNotMatch(personasPage, /Ativadas na sua conta|Personas principais/);
  assert.doesNotMatch(personasPage, /Adicionar ao LUCA|Remover do LUCA/);
  assert.doesNotMatch(personasPage, /Disponíveis no Yume|secondaryExpanded|Roster principal/);
});

test('bancada respeita o catalogo global: persona oculta nao aparece para ninguem', () => {
  assert.match(lucaAiPage, /persona\.visible !== false/);
  assert.doesNotMatch(lucaAiPage, /YUME_DASHBOARD_URL/);
});

test('catalogo publico e montagem de equipe omitem persona oculta pelo admin', () => {
  assert.match(serverIndex, /listAvailable\(\{ includeHidden: false \}\)/);
  assert.match(configPage, /persona\.visible === false && !selected\.includes\(persona\.slug\)/);
});

test('editor de persona usa lista propria em vez de select nativo no overlay', () => {
  assert.match(personasPage, /data-persona-model-trigger/);
  assert.match(personasPage, /data-persona-model-list/);
  assert.doesNotMatch(personasPage, /<select[\s\S]*data-persona-field="model"/);
});

test('Express expoe o catalogo global de personas so para admin e nao emite snapshot vazio sem conta', () => {
  assert.match(serverIndex, /app\.get\('\/api\/admin\/personas', authService\.requireAdmin/);
  assert.match(serverIndex, /app\.put\('\/api\/admin\/personas\/:slug', authService\.requireAdmin/);
  assert.match(serverIndex, /app\.delete\('\/api\/admin\/personas\/:slug', authService\.requireAdmin/);
  assert.match(serverIndex, /overrides: \{ get: \(slug\) => personaCatalogConfig\.get\(slug\) \}/);
  // Regressao do flicker: emitState sem workspace no contexto precisa
  // resolver o snapshot por cliente, nunca mandar o estado vazio de processo.
  const emitStateSource = serverIndex.slice(serverIndex.indexOf('function emitState()'), serverIndex.indexOf('function emitSompoTelemetry'));
  assert.match(emitStateSource, /clientsByUser/);
  assert.match(emitStateSource, /runWithWorkspaceUser\(userId/);
  assert.doesNotMatch(emitStateSource, /if \(ownerUserId && client\.userId && client\.userId !== ownerUserId\) continue;/);
});

test('picker mostra oficiais e secundárias selecionáveis via cache local', () => {
  assert.match(lucaAiPage, /luca-picker-roster-title/);
  assert.match(lucaAiPage, /luca-picker-secondary-panel/);
  assert.match(lucaAiPage, /persona\.is_official === true/);
  assert.match(lucaAiPage, /await ensurePersonaAvailable\(slug\)/);
  assert.match(lucaAiPage, /importYumePersona/);
  assert.match(lucaAiPage, /disponíveis via cache local do LUCA/);
  assert.doesNotMatch(lucaAiPage, /disabled=\{secondary \|\|/);
  assert.match(lucaAiPage, /locked=\{false\}/);
  assert.doesNotMatch(lucaAiPage, /locked=\{presetsOnly\}/);
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
