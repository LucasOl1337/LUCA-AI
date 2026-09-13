import { chromium } from 'playwright';
const port = process.env.SHOT_PORT || '5197';
const browser = await chromium.launch({ headless: true, executablePath: '/opt/google/chrome/chrome', args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => console.error('PAGE', String(e).slice(0, 400)));
await page.goto(`http://127.0.0.1:${port}/?benchmark=1&offscreen=1`);
await page.waitForFunction(() => document.querySelector('[data-sompo-simulator]')?.dataset.sompoModel && document.querySelector('[data-sompo-simulator]').dataset.sompoModel !== 'loading', null, { timeout: 90000 });
await page.locator('select[name="sompo-scenario"]').selectOption('agri-harvest-dust');
await page.waitForTimeout(4000);
const out = await page.evaluate(() => {
  const p = window.__sompoPost;
  const c = p.composer, r = c.renderer;
  const gl = r.getContext();
  const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
  const px = new Uint8Array(4);
  const mid = () => { c.render(); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(W >> 1, H >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return [...px]; };
  const scene = c.passes[0].scene;
  const res = {};
  let crops;
  scene.traverse(o => { if (o.name === 'sompo-agri-crop-rows') crops = o; });
  res.baseline = mid();
  // 1) material puro sem onBeforeCompile
  const mats = [];
  crops.children.forEach((m, i) => {
    mats[i] = m.material;
    m.material = new m.material.constructor({ color: 0x3a6b2a, side: 2 });
  });
  res.plainMaterial = mid();
  crops.children.forEach((m, i) => { m.material = mats[i]; });
  // 2) esconde tile por tile
  res.perTile = crops.children.map((m) => {
    const was = m.visible; m.visible = false; const v = mid(); m.visible = was; return v;
  });
  return res;
});
console.log(JSON.stringify(out));
await browser.close();
