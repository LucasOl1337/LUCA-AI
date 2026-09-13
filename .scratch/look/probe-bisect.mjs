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
  const readScreen = (x, y) => { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return [...px]; };
  const readRT = (rt, x, y) => { const buf = new Float32Array(4); r.readRenderTargetPixels(rt, x, y, 1, 1, buf); return [...buf].map(v => +v.toFixed(3)); };
  const res = { W, H };
  // 1) composer completo + leitura da tela na MESMA task (buffer válido)
  c.render();
  res.screenAfterComposer = { mid: readScreen(W >> 1, H >> 1), top: readScreen(W >> 1, (H * 0.85) | 0) };
  // 2) lê o que cada buffer interno tem depois do composer.render
  res.readBuffer = { rt: c.readBuffer === c.renderTarget1 ? 'rt1' : 'rt2', mid: readRT(c.readBuffer, (W / 2) | 0, (H / 2) | 0), top: readRT(c.readBuffer, (W / 2) | 0, (H * 0.85) | 0) };
  res.writeBuffer = { rt: c.writeBuffer === c.renderTarget1 ? 'rt1' : 'rt2', mid: readRT(c.writeBuffer, (W / 2) | 0, (H / 2) | 0) };
  // 3) RenderPass sozinho direto na tela
  const pass = c.passes[0];
  const prevRTS = pass.renderToScreen; pass.renderToScreen = true;
  pass.render(r, c.writeBuffer, c.readBuffer, 0.016, false);
  res.screenAfterRenderPass = { mid: readScreen(W >> 1, H >> 1), top: readScreen(W >> 1, (H * 0.85) | 0) };
  pass.renderToScreen = prevRTS;
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
