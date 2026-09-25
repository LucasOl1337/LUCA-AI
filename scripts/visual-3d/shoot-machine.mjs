// Captura de aceite da maquina em enquadramento fixo, inclusive inspeção próxima.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2];
const width = Number(process.argv[3] || 1600);
const height = Number(process.argv[4] || 900);
const scale = Math.max(1, width / 1600);
const logicalWidth = Math.round(width / scale);
const logicalHeight = Math.round(height / scale);
const scenarios = (process.argv[5] || 'agri-tractor-rollover,agri-harvest-dust,agri-night-operation,normal').split(',');
mkdirSync(out, { recursive: true });
const browser = await chromium.connectOverCDP(process.env.CDP_URL || 'http://127.0.0.1:19085');
const ownedContext = scale > 1 ? await browser.newContext({ viewport: { width: logicalWidth, height: logicalHeight }, deviceScaleFactor: scale }) : null;
const context = ownedContext || browser.contexts()[0];
if (!ownedContext && process.env.SOMPO_CLOSE_EXISTING === '1') {
  await Promise.all(context.pages().map(page => page.close()));
}
const page = await context.newPage();
page.setDefaultTimeout(120000);
if (process.env.SOMPO_BASELINE_DIR) {
  await page.route(/\/models\/sompo\/generated-agri-(tractor|harvester)\.(glb|textures\.json)$/, async route => {
    const filename = new URL(route.request().url()).pathname.split('/').at(-1);
    await route.fulfill({ path: join(process.env.SOMPO_BASELINE_DIR, filename) });
  });
}
const errors = [];
page.on('pageerror', error => errors.push(String(error).slice(0, 300)));
if (!ownedContext) await page.setViewportSize({ width: logicalWidth, height: logicalHeight });
await page.goto(`${process.env.SOMPO_PREVIEW_URL || 'http://127.0.0.1:5284'}/?benchmark=1&offscreen=1`);
await page.bringToFront();
await page.locator('[data-sompo-model]:not([data-sompo-model="loading"])').waitFor({ timeout: 60000 });
await page.addStyleTag({ content: `
  html,body{margin:0!important;overflow:hidden!important;background:#000!important}
  .sompo-simulator-stage{position:fixed!important;inset:0!important;width:${logicalWidth}px!important;height:${logicalHeight}px!important;min-height:${logicalHeight}px!important;z-index:99999!important;border-radius:0!important}
` });
const report = {};
for (const id of scenarios) {
  await page.locator('select[name="sompo-scenario"]').evaluate((select, value) => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, id);
  await page.waitForTimeout(700);
  await page.locator('[data-sompo-model]:not([data-sompo-model="loading"])').waitFor({ timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { window.__sompoPreview.metrics = []; });
  await page.waitForTimeout(5000);
  const stage = page.locator('.sompo-simulator-stage');
  await page.screenshot({ path: `${out}/${id}.png` });
  report[id] = { overview: await page.evaluate(() => window.__sompoPreview?.measure?.() ?? null) };
  if (id.startsWith('agri-')) {
    await page.getByRole('button', { name: 'Inspecionar máquina', exact: true }).click();
    await page.waitForTimeout(1200);
    await page.evaluate(() => { window.__sompoPreview.metrics = []; });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${out}/${id}-inspecao.png` });
    report[id].inspection = await page.evaluate(() => window.__sompoPreview?.measure?.() ?? null);
  }
}
writeFileSync(`${out}/report.json`, JSON.stringify({ width, height, errors, report }, null, 2));
await page.close();
await ownedContext?.close();
await browser.close();
