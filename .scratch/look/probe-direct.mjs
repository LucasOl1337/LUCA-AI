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
// Força um render direto, por fora do composer, e fotografa.
await page.evaluate(() => {
  const f = window.__sompoPreview;
  f._r.setRenderTarget(null);
  f._r.render(f.scene, f.camera);
});
await page.screenshot({ path: '/tmp/sompo-look/shots/agri-direct.png' });
await browser.close();
