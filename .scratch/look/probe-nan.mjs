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
  const f = window.__sompoPreview;
  const c = p.composer, r = c.renderer;
  const gl = r.getContext();
  const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
  const px = new Uint8Array(4);
  const mid = () => { c.render(); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(W >> 1, H >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return [...px]; };
  const scene = f.scene || c.passes[0].scene;
  const res = { baseline: mid() };
  const rows = [];
  scene.traverse(o => {});
  // Testa cada filho direto da cena e depois netos grandes
  const testVis = (o) => { const was = o.visible; o.visible = false; const v = mid(); o.visible = was; return v; };
  for (const child of [...scene.children]) {
    rows.push({ name: child.name || child.type, hidden: testVis(child) });
  }
  res.perChild = rows;
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
