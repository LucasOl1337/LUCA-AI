// Autoteste ao vivo em produção: conecta no Chrome QA do workspace 8 via CDP,
// seleciona cenário/desfecho na UI real, deixa a animação rodar em tempo real
// e captura screenshots nos instantes pedidos (LIVE_ATS, ms separados por vírgula).
//
// Uso:
//   LIVE_SCENARIO=animal-crossing LIVE_OUTCOME=colisao LIVE_ATS=3000,5900,9000 \
//   LIVE_NAME=animal-colisao node .scratch/look/live-drive.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = process.env.LIVE_OUT || '/tmp/sompo-live';
const scenario = process.env.LIVE_SCENARIO || '';
const outcome = process.env.LIVE_OUTCOME || '';
const ats = (process.env.LIVE_ATS || '6000').split(',').map(Number).sort((a, b) => a - b);
const name = process.env.LIVE_NAME || 'live';
mkdirSync(out, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts()[0].pages().find((p) => p.url().includes('luca-ai.com.br'));
if (!page) throw new Error('aba do luca-ai não encontrada no Chrome QA');

// Garante a view de telemetria com o simulador.
if (!page.url().includes('/sompo')) {
  await page.goto('https://luca-ai.com.br/sompo?aba=telemetria&fonte=simulacao');
}
await page.waitForFunction(
  () => document.querySelector('[data-sompo-simulator]')?.dataset.sompoModel
    && document.querySelector('[data-sompo-simulator]').dataset.sompoModel !== 'loading',
  null,
  { timeout: 90_000 },
);
await page.waitForTimeout(2500); // HDRI + texturas + GLB assentam

const simBox = await page.locator('[data-sompo-simulator]');

if (scenario) {
  await page.locator('select[name="sompo-scenario"]').selectOption(scenario);
  await page.waitForFunction(
    () => document.querySelector('[data-sompo-simulator]').dataset.sompoModel !== 'loading',
    null,
    { timeout: 90_000 },
  );
}
if (outcome) {
  await page.locator('select[name="sompo-scenario-outcome"]').selectOption(outcome);
  await page.waitForTimeout(400);
}

// O playback nasce tocando e selectScenario zera o relógio: t0 é agora.
const t0 = Date.now();
for (const at of ats) {
  const wait = at - (Date.now() - t0);
  if (wait > 0) await page.waitForTimeout(wait);
  const file = `${out}/${name}-${(at / 1000).toFixed(1)}s.png`;
  await simBox.screenshot({ path: file });
  console.log('SHOT', file);
}
const info = await page.evaluate(() => ({
  model: document.querySelector('[data-sompo-simulator]')?.dataset.sompoModel,
  url: location.href,
}));
console.log('INFO', JSON.stringify(info));
await browser.close();
