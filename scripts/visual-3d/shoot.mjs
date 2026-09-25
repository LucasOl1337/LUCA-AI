// Captura de revisão visual: um PNG por cenário do simulador + report.json com custo por quadro.
// Uso: node scripts/visual-3d/shoot.mjs <pasta> [cenario,cenario...] [msAposTroca]
// Precisa da prévia (scripts/sompo-preview/serve.mjs) e de um Chromium com GPU real por CDP.
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const out = process.argv[2] || '.cinema/shots/tmp';
const only = (process.argv[3] || '').split(',').filter(Boolean);
const at = Number(process.argv[4] || 3000);
const measureMs = Number(process.env.SOMPO_MEASURE_MS || 3000);
const viewportWidth = Number(process.env.SOMPO_VIEWPORT_WIDTH || 1600);
const viewportHeight = Number(process.env.SOMPO_VIEWPORT_HEIGHT || 900);
mkdirSync(out, { recursive: true });
const b = await chromium.connectOverCDP(process.env.CDP_URL || 'http://127.0.0.1:19081');
const p = await b.contexts()[0].newPage();
const errors = [];
p.on('pageerror', e => errors.push(String(e).slice(0, 300)));
await p.setViewportSize({ width: viewportWidth, height: viewportHeight });
const cdp = await p.context().newCDPSession(p);
await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
cdp.on('Page.screencastFrame', ({ sessionId }) => { void cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {}); });
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 12, maxWidth: 64, maxHeight: 64, everyNthFrame: 6 });
await p.goto(`${process.env.SOMPO_PREVIEW_URL || 'http://127.0.0.1:5261'}/?benchmark=1&offscreen=1`);
await p.locator('[data-sompo-model]:not([data-sompo-model="loading"])').waitFor({ timeout: 60000 });
await p.addStyleTag({ content: `
  .sompo-simulator-stage {
    position: fixed !important; inset: 0 !important; z-index: 9999 !important;
    width: ${viewportWidth}px !important; height: ${viewportHeight}px !important;
    max-width: none !important; min-height: 0 !important; border-radius: 0 !important;
  }
` });
await p.waitForTimeout(250);
const options = await p.locator('select[name="sompo-scenario"] option').evaluateAll(o => o.map(x => x.value));
const list = only.length ? only : options;
const reportPath = `${out}/report.json`;
const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')).report ?? {} : {};
for (const id of list) {
  await p.locator('select[name="sompo-scenario"]').selectOption(id);
  await p.waitForTimeout(600);
  await p.locator('[data-sompo-model]:not([data-sompo-model="loading"])').waitFor({ timeout: 60000 });
  await p.evaluate(ms => window.__sompoPreview.advance(ms), at);
  await p.waitForFunction(() => window.__sompoPreview.time === window.__sompoPreview.until, null, { timeout: 60000, polling: 30 });
  await p.evaluate(ms => { window.__sompoPreview.metrics = []; window.__sompoPreview.advance(ms); }, measureMs);
  await p.waitForFunction(() => window.__sompoPreview.time === window.__sompoPreview.until, null, { timeout: 60000, polling: 30 });
  const stage = p.locator('.sompo-simulator-stage');
  const box = await stage.boundingBox();
  if (!box) throw new Error(`Palco sem caixa para ${id}`);
  const shot = await cdp.send('Page.captureScreenshot', {
    format: 'png', fromSurface: true, captureBeyondViewport: true,
    clip: { x: box.x, y: box.y, width: viewportWidth, height: viewportHeight, scale: 1 },
  });
  writeFileSync(`${out}/${id}.png`, Buffer.from(shot.data, 'base64'));
  report[id] = await p.evaluate(() => window.__sompoPreview?.measure?.() ?? null).catch(() => null);
  writeFileSync(reportPath, JSON.stringify({ errors, report }, null, 2));
  console.log('ok', id, JSON.stringify(report[id] && { interval: report[id].intervalMs, gpu: report[id].gpuMs, cpu: report[id].cpuMs, calls: report[id].calls, tris: report[id].triangles }));
}
writeFileSync(reportPath, JSON.stringify({ errors, report }, null, 2));
console.log('options', options.join(','));
console.log('errors', errors);
await p.close(); await b.close();
