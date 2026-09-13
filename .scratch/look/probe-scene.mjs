import { chromium } from 'playwright';
const port = process.env.SHOT_PORT || '5197';
const scenario = process.env.SHOT_SCENARIO || 'agri-harvest-dust';
const browser = await chromium.launch({ headless: true, executablePath: '/opt/google/chrome/chrome', args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => console.error('PAGE', String(e).slice(0, 600)));
page.on('console', m => { const t = m.text(); if (!t.includes('404')) console.error(m.type().toUpperCase(), t.slice(0, 400)); });
await page.goto(`http://127.0.0.1:${port}/?benchmark=1&offscreen=1`);
await page.evaluate(() => { const f = window.__sompoPreview; f.onFrame = (s, c, r) => { f._r = r; }; });
await page.waitForFunction(() => document.querySelector('[data-sompo-simulator]')?.dataset.sompoModel && document.querySelector('[data-sompo-simulator]').dataset.sompoModel !== 'loading', null, { timeout: 90000 });
await page.locator('select[name="sompo-scenario"]').selectOption(scenario);
await page.waitForTimeout(6000);
const info = await page.evaluate(() => {
  const f = window.__sompoPreview;
  const r = f._r; const s = f.scene; const c = f.camera;
  if (!s) return { scene: null };
  const canvas = r.domElement;
  return {
    canvas: [canvas.width, canvas.height, canvas.clientWidth, canvas.clientHeight],
    pixelRatio: r.getPixelRatio(),
    renderTarget: r.getRenderTarget()?.width ?? 'screen',
    toneMapping: r.toneMapping, exposure: r.toneMappingExposure,
    children: s.children.map(o => `${o.name || o.type}${o.visible === false ? '(hidden)' : ''}`),
    cam: c ? [c.position.x.toFixed(1), c.position.y.toFixed(1), c.position.z.toFixed(1), 'far', c.far] : null,
    fog: s.fog ? [s.fog.near, s.fog.far] : null,
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
