// Autoteste ao vivo: dirige o Chrome headed aberto no workspace 8 via CDP.
// Uso: LIVE_URL=https://luca-ai.com.br LIVE_SCENARIO=animal-crossing LIVE_OUTCOME=desvio LIVE_AT=5200 LIVE_NAME=x node live-qa.mjs
// Requer Chrome rodando com --remote-debugging-port=9222.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = process.env.LIVE_OUT || '/tmp/sompo-look/live';
const url = process.env.LIVE_URL || 'http://127.0.0.1:5197/'; // produção: https://luca-ai.com.br/sompo
const scenario = process.env.LIVE_SCENARIO;
const outcome = process.env.LIVE_OUTCOME;
const at = Number(process.env.LIVE_AT || 0);
const name = process.env.LIVE_NAME || `live-${scenario || 'scene'}`;
mkdirSync(out, { recursive: true });

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const context = browser.contexts()[0];
const page = context.pages()[0] || await context.newPage();
await page.setViewportSize({ width: 1720, height: 960 });

if (!page.url().includes('/sompo') && url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
}
await page.waitForFunction(() => {
  const el = document.querySelector('[data-sompo-simulator]');
  return el?.dataset.sompoModel && el.dataset.sompoModel !== 'loading';
}, null, { timeout: 90000 });

if (scenario) {
  await page.locator('select[name="sompo-scenario"]').selectOption(scenario);
  await page.waitForFunction(() => document.querySelector('[data-sompo-simulator]').dataset.sompoModel !== 'loading', null, { timeout: 90000 });
}
if (outcome) {
  await page.locator('select[name="sompo-scenario-outcome"]').selectOption(outcome);
  await page.waitForTimeout(500);
}
await page.waitForTimeout(3500); // streaming de assets + HDRI

if (at > 0 && await page.evaluate(() => !!window.__sompoPreview)) {
  await page.evaluate(ms => window.__sompoPreview.advance(ms), at);
  await page.waitForFunction(() => window.__sompoPreview.time === window.__sompoPreview.until, null, { timeout: 60000 });
} else if (at > 0) {
  await page.waitForTimeout(Math.min(at, 15000));
}
await page.waitForTimeout(1200);
const info = await page.evaluate(() => {
  const p = window.__sompoPreview;
  return p ? p.measure() : { note: 'sem preview hooks (produção)' };
});
console.log('INFO', JSON.stringify({ renderer: info.renderer, triangles: info.triangles?.median ?? info.triangles, calls: info.calls?.median ?? info.calls }));
await page.locator('[data-sompo-simulator]').screenshot({ path: `${out}/${name}.png` });
console.log('SHOT', `${out}/${name}.png`);
await browser.close().catch(() => {}); // disconnect, o Chrome do usuário continua aberto
