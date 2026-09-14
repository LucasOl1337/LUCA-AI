import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { formatAppUrl, mergeAppLocation, emptyAppLocation } from '../shared/app-location.js';
import { getSompoAgriFrame, getSompoAgriScenario } from '../shared/sompo-agri-scenarios.js';
import { getSompoAgriEpisodePlan } from '../shared/sompo-agri-brief.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const landing = readFileSync(join(root, 'src/pages/LandingPage.tsx'), 'utf8');
const workbench = readFileSync(join(root, 'src/pages/LucaAiPage.tsx'), 'utf8');
const css = readFileSync(join(root, 'src/home-page.css'), 'utf8');
const main = readFileSync(join(root, 'src/main.tsx'), 'utf8');
const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');

// Render the real component tree with only its application hooks replaced.
// Invoking the rendered CTA handlers checks the navigation payload, not source spelling.
const require = createRequire(import.meta.url);
function loadTsModule(source, imports = {}) {
  const exports = {};
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(output, { exports, require: (id) => imports[id] ?? require(id) });
  return exports;
}

function homeTree(navigate) {
  const stories = loadTsModule(readFileSync(join(root, 'src/lib/sompo-stories.ts'), 'utf8'));
  const { default: Home } = loadTsModule(landing, {
    '@/hooks/useAppLocation': { useAppLocation: () => ({ navigate }) },
    '@/hooks/useAuth': { useAuth: () => ({ user: { role: 'user' } }) },
    '@/hooks/useLucaState': { useLuca: () => ({ backendReady: true, connectionState: 'online' }) },
    '@/hooks/useDeferredFlag': { useDeferredFlag: () => false },
    '@/lib/sompo-stories': stories,
    '@/home-page.css': {},
    'framer-motion': { motion: { article: 'article', header: 'header' }, useReducedMotion: () => true },
  });
  return Home({ onNavigate() {} });
}

function elements(node) {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node?.props) return [];
  return [node, ...elements(node.props.children)];
}

test('home puts two stories before the unchanged mode entry and uses existing images', () => {
  const nodes = elements(homeTree(() => {}));
  const stories = nodes.filter((node) => node.props['data-home-story']);
  assert.deepEqual(stories.map((node) => node.props['data-home-story']), ['field', 'portfolio']);
  const hero = nodes.findIndex((node) => node.props.className === 'home-a-hero');
  assert.ok(stories.every((story) => nodes.indexOf(story) < hero));
  for (const story of stories) {
    const img = elements(story).find((node) => node.type === 'img');
    assert.ok(existsSync(join(root, 'public', img.props.src)), img.props.src);
  }
});

test('story CTAs navigate to the preventive scenario, cooperative case and lab', () => {
  let href;
  const nodes = elements(homeTree((patch, history) => {
    assert.equal(history, 'push');
    href = formatAppUrl(mergeAppLocation(emptyAppLocation(), patch));
  }));
  for (const [cta, expected] of [
    ['field', '/sompo?aba=telemetria&cenario=agri-tractor-rollover&desfecho=controlled-stop'],
    ['portfolio', '/sompo?aba=casos&caso=carteira-renovacao-cooperativa'],
    ['lab', '/laboratorio'],
  ]) {
    nodes.find((node) => node.props['data-landing-cta'] === cta).props.onClick();
    assert.equal(href, expected);
  }
  const scenario = getSompoAgriScenario('agri-tractor-rollover');
  assert.ok(Object.hasOwn(scenario.outcomes, 'controlled-stop'));
  assert.equal(getSompoAgriFrame(scenario.scenarioId, 4000, 'controlled-stop').inclinationRisk, true);
  assert.equal(getSompoAgriFrame(scenario.scenarioId, scenario.totalMs, 'controlled-stop').speedKph, 0);
  assert.equal(getSompoAgriEpisodePlan(scenario.scenarioId, 'controlled-stop').frameMoments.length, 5);
});

test('home ships binary mode entry with cyber agent art', () => {
  assert.ok(landing.includes('Usar modo individual'));
  assert.ok(landing.includes('Usar modo equipe'));
  assert.ok(landing.includes("startMode('individual')"));
  assert.ok(landing.includes("startMode('team')"));
  assert.ok(landing.includes('/home/agent-supervisor.jpg'));
  assert.ok(landing.includes('/home/agent-planner.jpg'));
  assert.ok(landing.includes('/home/agent-researcher.jpg'));
  assert.ok(landing.includes('/home/agent-designer.jpg'));
  assert.equal(landing.includes('/v2-design/owl-'), false);
  assert.equal(landing.includes('HomePrototype'), false);
  assert.equal(landing.includes('PrototypeSwitcher'), false);
  assert.ok(css.includes('.home-page-a'));
  assert.ok(css.includes('@media (max-width: 660px)'));
  assert.equal(css.includes('home-prototype'), false);
  assert.equal(main.includes("get('prototype') === 'home'"), false);
  assert.equal(app.includes('homePrototype'), false);
});

test('mode CTA hands its choice to the real workbench once', () => {
  assert.ok(landing.includes("sessionStorage.setItem('luca.lucaAi.entryMode', mode)"));
  assert.ok(landing.includes("modo: mode === 'individual' ? 'individual' : ''"));
  assert.ok(workbench.includes('window.sessionStorage.getItem(LUCA_AI_ENTRY_MODE_STORAGE_KEY)'));
  assert.ok(workbench.includes('window.sessionStorage.removeItem(LUCA_AI_ENTRY_MODE_STORAGE_KEY)'));
  assert.ok(/setOperationMode\([^)]*consumeEntryMode\(\)/.test(workbench));
  assert.ok(workbench.includes("location.modo === 'individual' ? 'individual' : 'team'"));
  assert.equal(workbench.includes("session.operationMode === 'individual' ? 'individual' : 'team'"), false);
});
