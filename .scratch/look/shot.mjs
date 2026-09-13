import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = process.env.SHOT_OUT || '/tmp/sompo-look/shots';
const port = process.env.SHOT_PORT || '5199';
const scenario = process.env.SHOT_SCENARIO || 'normal';
const at = Number(process.env.SHOT_AT || 6000);
const headed = process.env.SHOT_HEADED === '1';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  headless: !headed,
  executablePath: '/opt/google/chrome/chrome',
  args: [...(headed ? ['--class=sompo-studio-qa', '--ozone-platform=x11'] : []), '--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
// SHOT_TRUCK=generated|modular força o modelo de caminhão do estúdio.
const truck = process.env.SHOT_TRUCK;
if (truck) {
  await page.addInitScript((model) => {
    const base = { version: 1, name: 'Frota rural · fim de tarde', truck: model, equipment: model === 'generated' ? 'generated' : 'modular', lighting: 'golden', paint: '#1d5680', cargo: '#eceade', roughness: 0.4, exposure: 1, wind: 0.65, wireframe: false, exploded: 0 };
    localStorage.setItem('luca:sompo-studio:v1', JSON.stringify(base));
  }, truck);
}
page.on('pageerror', e => console.error('PAGE', String(e)));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) console.error('BROWSER', m.text().slice(0, 400)); });
await page.goto(`http://127.0.0.1:${port}/?benchmark=1&offscreen=1`);
await page.waitForFunction(() => document.querySelector('[data-sompo-simulator]')?.dataset.sompoModel && document.querySelector('[data-sompo-simulator]').dataset.sompoModel !== 'loading', null, { timeout: 90000 });
if (scenario !== 'normal') {
  await page.locator('select[name="sompo-scenario"]').selectOption(scenario);
  await page.waitForFunction(() => document.querySelector('[data-sompo-simulator]').dataset.sompoModel !== 'loading', null, { timeout: 90000 });
}
const outcome = process.env.SHOT_OUTCOME;
if (outcome) {
  await page.locator('select[name="sompo-scenario-outcome"]').selectOption(outcome);
  await page.waitForTimeout(400);
}
await page.waitForTimeout(4000); // HDRI + textures + trees load
const drag = process.env.SHOT_DRAG; // "dx,dy" orbita o canvas antes do avanço
if (drag) {
  const [dx, dy] = drag.split(',').map(Number);
  const box = await page.locator('[data-sompo-simulator] canvas').boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 12 });
    await page.mouse.up();
  }
}
await page.evaluate(ms => window.__sompoPreview.advance(ms), at);
await page.waitForFunction(() => window.__sompoPreview.time === window.__sompoPreview.until, null, { timeout: 60000 });
await page.waitForTimeout(1500);
const info = await page.evaluate(() => {
  const m = window.__sompoPreview.measure();
  return { renderer: m.renderer, triangles: m.triangles?.median, calls: m.calls?.median };
});
console.log('INFO', JSON.stringify(info));
await page.locator('[data-sompo-simulator]').screenshot({ path: `${out}/${process.env.SHOT_NAME || 'scene'}.png` });
await browser.close();
