import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const landing = readFileSync(join(root, 'src/pages/LandingPage.tsx'), 'utf8');
const workbench = readFileSync(join(root, 'src/pages/LucaAiPage.tsx'), 'utf8');
const css = readFileSync(join(root, 'src/home-page.css'), 'utf8');
const main = readFileSync(join(root, 'src/main.tsx'), 'utf8');
const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');

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
