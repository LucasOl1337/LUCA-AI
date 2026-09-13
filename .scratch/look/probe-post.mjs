import { chromium } from 'playwright';
const port = process.env.SHOT_PORT || '5197';
const browser = await chromium.launch({ headless: true, executablePath: '/opt/google/chrome/chrome', args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => console.error('PAGE', String(e).slice(0, 400)));
await page.goto(`http://127.0.0.1:${port}/?benchmark=1&offscreen=1`);
await page.waitForFunction(() => document.querySelector('[data-sompo-simulator]')?.dataset.sompoModel && document.querySelector('[data-sompo-simulator]').dataset.sompoModel !== 'loading', null, { timeout: 90000 });
await page.locator('select[name="sompo-scenario"]').selectOption('agri-harvest-dust');
await page.waitForTimeout(4000);
const info = await page.evaluate(() => {
  const p = window.__sompoPost;
  if (!p) return { err: 'no __sompoPost' };
  const c = p.composer;
  const gl = c.renderer.getContext();
  const rt1 = c.renderTarget1, rt2 = c.renderTarget2;
  return {
    passes: c.passes.map(x => ({ name: x.constructor.name, enabled: x.enabled, needsSwap: x.needsSwap })),
    renderToScreen: c.renderToScreen,
    composerSize: [c._width, c._height, c._pixelRatio],
    rt1: [rt1.width, rt1.height, rt1.samples, rt1.texture?.type],
    rt2: [rt2.width, rt2.height, rt2.samples, rt2.texture?.type],
    canvas: [c.renderer.domElement.width, c.renderer.domElement.height],
    drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
    currentRT: c.renderer.getRenderTarget() ? 'BOUND' : 'null',
    toneMapping: c.renderer.toneMapping,
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
