import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const layout = readFileSync(new URL('../src/components/Layout.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const sompoPage = readFileSync(new URL('../src/pages/SompoPage.tsx', import.meta.url), 'utf8');
const sompoTelemetryPanel = readFileSync(new URL('../src/components/SompoTelemetryPanel.tsx', import.meta.url), 'utf8');
const sompoSimulator = readFileSync(new URL('../src/components/SompoTruckSimulator.tsx', import.meta.url), 'utf8');
const packageJson = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
const sompoCases = readFileSync(new URL('../src/lib/sompo-cases.ts', import.meta.url), 'utf8');
const sompoCss = readFileSync(new URL('../src/sompo-page.css', import.meta.url), 'utf8');
const lucaAiPage = readFileSync(new URL('../src/pages/LucaAiPage.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8');
const serverIndex = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const sompoSource = readFileSync(new URL('./sompo-telemetry-source.js', import.meta.url), 'utf8');
const lucaStateHook = readFileSync(new URL('../src/hooks/useLucaState.tsx', import.meta.url), 'utf8');

test('SOMPO aparece na navegação e no App', () => {
  assert.match(layout, /id: 'sompo'/);
  assert.match(layout, /label: 'SOMPO'/);
  assert.match(layout, /Wheat/);
  assert.match(app, /SompoPage/);
  assert.match(app, /case 'sompo'/);
  assert.match(app, /'sompo'/);
});

test('página SOMPO escolhe caso + equipe e dispara run', () => {
  assert.match(sompoPage, /SOMPO · campo \+ agentes/);
  assert.match(sompoPage, /queueSompoLaunch/);
  assert.match(sompoPage, /Rodar avaliação na bancada/);
  assert.match(sompoPage, /teamMode/);
  assert.match(sompoPage, /listTeamTemplates/);
  assert.match(sompoPage, /createSession/);
  assert.match(sompoPage, /SOMPO_EXAMPLE_CASES/);
  assert.match(sompoPage, /Equipe/);
  assert.match(sompoPage, /Individual/);
});

test('modo SOMPO Telemetria assina o Firebase em tempo real e fecha snapshot para a bancada', () => {
  assert.match(sompoTelemetryPanel, /data-sompo-telemetry/);
  assert.match(sompoPage, /getSompoTelemetry/);
  assert.doesNotMatch(sompoPage, /TELEMETRY_POLL_MS|loadTelemetry\('poll'\)/);
  assert.match(sompoPage, /streamedTelemetry/);
  assert.match(sompoPage, /buildSompoTelemetryMission/);
  assert.match(sompoPage, /data-sompo-telemetry-run/);
  assert.match(sompoTelemetryPanel, /risks\.collision/);
  assert.match(sompoTelemetryPanel, /risks\.inclination/);
  assert.match(api, /\/api\/sompo\/telemetry/);
  assert.match(serverIndex, /createSompoTelemetryHttpHandler/);
  assert.match(serverIndex, /sompoTelemetrySource\.start\(\)/);
  assert.match(serverIndex, /kind: 'sompo\.telemetry'/);
  assert.match(serverIndex, /app\.get\('\/api\/sompo\/telemetry'/);
  assert.match(sompoSource, /text\/event-stream/);
  assert.match(sompoSource, /eventName === 'put'/);
  assert.match(sompoSource, /eventName !== 'patch'/);
  assert.match(lucaStateHook, /payload\.kind === 'sompo\.telemetry'/);
  assert.match(sompoCss, /\.sompo-telemetry/);
  assert.match(sompoCss, /\.sompo-risk-grid/);
  assert.match(sompoCss, /\.sompo-sensor-grid/);
});

test('modo SOMPO oferece simulador 3D local sem substituir nem escrever no Firebase', () => {
  assert.match(sompoPage, /TelemetrySourceMode = 'firebase' \| 'simulation'/);
  assert.match(sompoPage, /useState<TelemetrySourceMode>\('firebase'\)/);
  assert.match(sompoPage, /telemetrySourceMode === 'simulation' \? simulatedTelemetry : firebaseTelemetry/);
  assert.match(sompoPage, /lazy\(\(\) => import\('@\/components\/SompoTruckSimulator'\)\)/);
  assert.match(sompoPage, /Simulador 3D/);
  assert.match(sompoPage, /setSimulatedTelemetry/);
  assert.match(sompoSimulator, /from 'three'/);
  assert.match(sompoSimulator, /OrbitControls/);
  assert.match(sompoSimulator, /data-sompo-simulator/);
  assert.match(sompoSimulator, /ESP32 VIRTUAL/);
  assert.match(sompoSimulator, /Não envia ao Firebase/);
  assert.match(sompoSimulator, /renderer\.dispose\(\)/);
  assert.match(sompoSimulator, /cancelAnimationFrame/);
  assert.match(sompoSimulator, /prefers-reduced-motion/);
  assert.match(sompoTelemetryPanel, /source\.kind === 'simulation'/);
  assert.match(sompoTelemetryPanel, /simulation \? 'off' : 'polite'/);
  assert.match(sompoCss, /\.sompo-simulator-workspace/);
  assert.match(packageJson, /"three":/);
  assert.doesNotMatch(sompoSimulator, /fetch\(|lucaApi|setSompoTelemetry/);
});

test('página SOMPO usa grade com imagem e launch focado sem painel lateral fixo', () => {
  assert.match(sompoPage, /sompo-page\.css/);
  assert.match(sompoPage, /sompo-case-card/);
  assert.match(sompoPage, /sompo-launch/);
  assert.match(sompoPage, /SOMPO_PAGE_BACKGROUND/);
  assert.match(sompoPage, /item\.image/);
  assert.match(sompoPage, /openCase/);
  assert.match(sompoPage, /closeLaunch/);
  assert.match(sompoCss, /\.sompo-page-bg/);
  assert.match(sompoCss, /\.sompo-grid/);
  assert.match(sompoCss, /\.sompo-launch-panel/);
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

test('cada caso SOMPO tem cover image em public/sompo', () => {
  assert.match(sompoCases, /image: string/);
  assert.match(sompoCases, /SOMPO_PAGE_BACKGROUND/);
  const caseIds = [
    'seca-milho-safrinha-pr',
    'granizo-soja-rs',
    'geada-trigo-sc',
    'chuva-replantio-mt',
    'zarc-fora-janela',
    'penhor-trator-incendio',
    'irrigacao-alagamento-aurora',
    'carteira-renovacao-cooperativa',
  ];
  for (const id of caseIds) {
    assert.match(sompoCases, new RegExp(`image: '/sompo/${id}\\.jpg'`));
    assert.ok(existsSync(path.join(root, 'public', 'sompo', `${id}.jpg`)), `missing public/sompo/${id}.jpg`);
  }
  assert.ok(existsSync(path.join(root, 'public', 'sompo', 'bg-agro.jpg')), 'missing public/sompo/bg-agro.jpg');
});

test('bancada consome launch SOMPO e auto-run', () => {
  assert.match(lucaAiPage, /consumeSompoLaunch/);
  assert.match(lucaAiPage, /pendingSompoLaunchRef/);
  assert.match(lucaAiPage, /sompoAutoRunArmedRef/);
  assert.match(lucaAiPage, /applyIndividualPreset/);
  assert.match(lucaAiPage, /applyTeamPreset/);
});
