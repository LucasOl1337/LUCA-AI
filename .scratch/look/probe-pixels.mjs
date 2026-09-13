import { chromium } from 'playwright';
const port = process.env.SHOT_PORT || '5197';
const browser = await chromium.launch({ headless: true, executablePath: '/opt/google/chrome/chrome', args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => console.error('PAGE', String(e).slice(0, 600)));
await page.goto(`http://127.0.0.1:${port}/?benchmark=1&offscreen=1`);
await page.evaluate(() => { const f = window.__sompoPreview; f.onFrame = (s, c, r) => { f._r = r; }; });
await page.waitForFunction(() => document.querySelector('[data-sompo-simulator]')?.dataset.sompoModel && document.querySelector('[data-sompo-simulator]').dataset.sompoModel !== 'loading', null, { timeout: 90000 });
await page.locator('select[name="sompo-scenario"]').selectOption('agri-harvest-dust');
await page.waitForTimeout(6000);
const info = await page.evaluate(() => {
  const f = window.__sompoPreview;
  const r = f._r; const gl = r.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  // Render direto e lê pixels no mesmo task — buffer ainda válido.
  r.setRenderTarget(null);
  r.render(f.scene, f.camera);
  const read = (fx, fy) => { const px = new Uint8Array(4); gl.readPixels(Math.floor(w * fx), Math.floor(h * fy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return Array.from(px); };
  return { size: [w, h], top: read(0.5, 0.85), mid: read(0.5, 0.5), low: read(0.5, 0.15), left: read(0.2, 0.5) };
});
console.log(JSON.stringify(info));
await browser.close();
