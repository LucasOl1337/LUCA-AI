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

test('página SOMPO escolhe caso + equipe e dispara run', () => {
  assert.match(sompoPage, /SOMPO · casos \+ equipe/);
  assert.match(sompoPage, /queueSompoLaunch/);
  assert.match(sompoPage, /Rodar avaliação na bancada/);
  assert.match(sompoPage, /teamMode/);
  assert.match(sompoPage, /listTeamTemplates/);
  assert.match(sompoPage, /createSession/);
  assert.match(sompoPage, /SOMPO_EXAMPLE_CASES/);
  assert.match(sompoPage, /Equipe/);
  assert.match(sompoPage, /Individual/);
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
  assert.match(sompoCases, /queueSompoLaunch/);
  assert.match(sompoCases, /consumeSompoLaunch/);
  assert.match(sompoCases, /autoRun/);
});

test('bancada consome launch SOMPO e auto-run', () => {
  assert.match(lucaAiPage, /consumeSompoLaunch/);
  assert.match(lucaAiPage, /pendingSompoLaunchRef/);
  assert.match(lucaAiPage, /sompoAutoRunArmedRef/);
  assert.match(lucaAiPage, /applyIndividualPreset/);
  assert.match(lucaAiPage, /applyTeamPreset/);
});
