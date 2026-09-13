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
  const worldRoot = scene.children.find(o => o.type === 'Group' && !o.name.includes('atmospheric'));
  const res = {};
  const testVis = (o) => { const was = o.visible; o.visible = false; const v = mid(); o.visible = was; return v; };
  const walk = (o, path, depth) => {
    res[path] = testVis(o);
    if (depth > 0) for (const ch of o.children) walk(ch, `${path}/${ch.name || ch.type}`, depth - 1);
  };
  for (const child of worldRoot.children) walk(child, child.name || child.type, 1);
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
