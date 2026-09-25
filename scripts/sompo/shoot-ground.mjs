// Captura de revisão do chão em resolução configurável, via Chromium da bancada.
// Uso: node scripts/sompo/shoot-ground.mjs <pasta> <cenarios> [esperaMs]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const out = process.argv[2] || '.cinema/shots/chao';
const scenarios = (process.argv[3] || '').split(',').filter(Boolean);
const settleMs = Number(process.argv[4] || 3500);
const width = Number(process.env.SOMPO_SHOT_WIDTH || 1600);
const height = Number(process.env.SOMPO_SHOT_HEIGHT || 900);
const cdpUrl = process.env.CDP_URL || 'http://127.0.0.1:19081';
const previewUrl = process.env.SOMPO_PREVIEW_URL || 'http://127.0.0.1:5282';

mkdirSync(out, { recursive: true });
const browser = await chromium.connectOverCDP(cdpUrl);
const page = await browser.contexts()[0].newPage();
await page.bringToFront();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error).slice(0, 300)));
await page.setViewportSize({ width, height });
await page.goto(`${previewUrl}/?benchmark=1`);
await page.addStyleTag({ content: `
  html, body, #root { width: 100%; height: 100%; max-width: none !important; overflow: hidden; }
  body { padding: 0 !important; }
  .sompo-simulator-stage {
    position: fixed !important; inset: 0 !important; z-index: 9999 !important;
    width: 100vw !important; height: 100vh !important; min-height: 0 !important;
    aspect-ratio: auto !important; border-radius: 0 !important;
  }
` });
await page.locator('[data-sompo-model]:not([data-sompo-model="loading"])').waitFor({ timeout: 60_000 });
const available = await page.locator('select[name="sompo-scenario"] option').evaluateAll((options) => options.map((option) => option.value));
const list = scenarios.length ? scenarios : available;
const report = {};

for (const id of list) {
  await page.locator('select[name="sompo-scenario"]').selectOption(id);
  await page.waitForTimeout(600);
  await page.locator('[data-sompo-model]:not([data-sompo-model="loading"])').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(settleMs);
  // Descarta upload/compilação e frames da cena anterior. O custo abaixo é
  // só do cenário estabilizado, não uma mistura dos últimos 300 frames.
  await page.evaluate(() => { window.__sompoPreview.metrics = []; });
  await page.waitForTimeout(3000);
  await page.locator('.sompo-simulator-stage').screenshot({ path: `${out}/${id}.png` });
  report[id] = await page.evaluate(() => window.__sompoPreview?.measure?.() ?? null).catch(() => null);
  const sample = report[id];
  console.log('ok', id, JSON.stringify(sample && {
    interval: sample.intervalMs,
    gpu: sample.gpuMs,
    cpu: sample.cpuMs,
    calls: sample.calls,
    tris: sample.triangles,
  }));
}

writeFileSync(`${out}/report.json`, JSON.stringify({ viewport: { width, height }, errors, report }, null, 2));
console.log('errors', errors);
await page.close();
await browser.close();
