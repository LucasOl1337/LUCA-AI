import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const layout = readFileSync(new URL('../src/components/Layout.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const sompoPage = readFileSync(new URL('../src/pages/SompoPage.tsx', import.meta.url), 'utf8');
const sompoCases = readFileSync(new URL('../src/lib/sompo-cases.ts', import.meta.url), 'utf8');
const lucaAiPage = readFileSync(new URL('../src/pages/LucaAiPage.tsx', import.meta.url), 'utf8');

test('SOMPO aparece na navegação e no App', () => {
  assert.match(layout, /id: 'sompo'/);
  assert.match(layout, /label: 'SOMPO'/);
  assert.match(layout, /Wheat/);
  assert.match(app, /SompoPage/);
  assert.match(app, /case 'sompo'/);
  assert.match(app, /'sompo'/);
});

test('página SOMPO lista casos agrícolas com handoff para a bancada', () => {
  assert.match(sompoPage, /SOMPO · casos de exemplo/);
  assert.match(sompoPage, /queueSompoCaseForLuca/);
  assert.match(sompoPage, /Abrir na bancada LUCA-AI/);
  assert.match(sompoPage, /SOMPO_EXAMPLE_CASES/);
  assert.match(sompoPage, /SOMPO_INDUSTRY_CONTEXT/);
});

test('catálogo de casos cobre clima, ZARC, penhor e renovação', () => {
  assert.match(sompoCases, /seca-milho-safrinha-pr/);
  assert.match(sompoCases, /granizo-soja-rs/);
  assert.match(sompoCases, /geada-trigo-sc/);
  assert.match(sompoCases, /chuva-replantio-mt/);
  assert.match(sompoCases, /zarc-fora-janela/);
  assert.match(sompoCases, /penhor-trator-incendio/);
  assert.match(sompoCases, /carteira-renovacao-cooperativa/);
  assert.match(sompoCases, /buildSompoCaseMission/);
  assert.match(sompoCases, /queueSompoCaseForLuca/);
});

test('bancada consome briefing SOMPO pendente', () => {
  assert.match(lucaAiPage, /consumePendingSompoMission/);
  assert.match(lucaAiPage, /consumePendingSompoPresetId/);
  assert.match(lucaAiPage, /pendingSompoPresetRef/);
});
