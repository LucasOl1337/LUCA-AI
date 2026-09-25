// Captura de revisão visual: um PNG por cenário do simulador + report.json com custo por quadro.
// Uso: node scripts/visual-3d/shoot.mjs <pasta> [cenario,cenario...] [msAposTroca]
// Precisa da prévia (scripts/sompo-preview/serve.mjs) e de um Chromium com GPU real por CDP.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const out = process.argv[2] || '.cinema/shots/tmp';
const only = (process.argv[3] || '').split(',').filter(Boolean);
const at = Number(process.argv[4] || 3000);
const viewportWidth = Number(process.env.SOMPO_VIEWPORT_WIDTH || 1600);
const viewportHeight = Number(process.env.SOMPO_VIEWPORT_HEIGHT || 900);
const exactStage = process.env.SOMPO_EXACT_STAGE === '1';
mkdirSync(out, { recursive: true });
const b = await chromium.connectOverCDP(process.env.CDP_URL || 'http://127.0.0.1:19081');
const p = await b.contexts()[0].newPage();
const errors = [];
p.on('pageerror', e => errors.push(String(e).slice(0, 300)));
await p.setViewportSize({ width: viewportWidth, height: viewportHeight });
await p.goto(`${process.env.SOMPO_PREVIEW_URL || 'http://127.0.0.1:5261'}/?benchmark=1`);
if (exactStage) await p.addStyleTag({ content: `
  html,body,#root{margin:0!important;padding:0!important;width:${viewportWidth}px!important;max-width:none!important;overflow:hidden!important}
  .sompo-simulator-workspace{display:block!important;width:${viewportWidth}px!important}
  .sompo-simulator-stage{box-sizing:border-box!important;width:${viewportWidth}px!important;height:${viewportHeight}px!important;min-height:0!important;aspect-ratio:auto!important;border:0!important;border-radius:0!important}
  .sompo-simulator-panel{display:none!important}
` });
await p.locator('[data-sompo-model]:not([data-sompo-model="loading"])').waitFor({ timeout: 60000 });
const options = await p.locator('select[name="sompo-scenario"] option').evaluateAll(o => o.map(x => x.value));
const list = only.length ? only : options;
const report = {};
for (const id of list) {
  await p.locator('select[name="sompo-scenario"]').selectOption(id);
  await p.waitForTimeout(600);
  await p.locator('[data-sompo-model]:not([data-sompo-model="loading"])').waitFor({ timeout: 60000 });
  // O medidor é global à página. Sem limpar aqui, os 300 últimos quadros do
  // cenário anterior contaminam a mediana logo após uma troca de palco.
  await p.evaluate(() => { if (window.__sompoPreview?.metrics) window.__sompoPreview.metrics.length = 0; });
  await p.waitForTimeout(at);
  const stage = p.locator('.sompo-simulator-stage');
  await stage.evaluate(element => { element.style.transform = ''; });
  const box = await stage.boundingBox();
  if (!box) throw new Error(`Palco sem caixa no cenário ${id}`);
  await stage.evaluate((element, shift) => {
    element.style.transform = `translate(${shift.x}px,${shift.y}px)`;
  }, { x: Math.round(box.x) - box.x, y: Math.round(box.y) - box.y });
  await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve())));
  await stage.screenshot({ path: `${out}/${id}.png` });
  report[id] = await p.evaluate(() => window.__sompoPreview?.measure?.() ?? null).catch(() => null);
  console.log('ok', id, JSON.stringify(report[id] && { interval: report[id].intervalMs, gpu: report[id].gpuMs, cpu: report[id].cpuMs, calls: report[id].calls, tris: report[id].triangles }));
}
writeFileSync(`${out}/report.json`, JSON.stringify({ errors, report }, null, 2));
console.log('options', options.join(','));
console.log('errors', errors);
await p.close(); await b.close();
