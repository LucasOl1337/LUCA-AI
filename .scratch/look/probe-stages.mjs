import { chromium } from 'playwright';
const port = process.env.SHOT_PORT || '5197';
const browser = await chromium.launch({ headless: true, executablePath: '/opt/google/chrome/chrome', args: ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => console.error('PAGE', String(e).slice(0, 400)));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('CON', m.text().slice(0, 300)); });
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
  const mid = () => ({ mid: readScreen(W >> 1, H >> 1), top: readScreen(W >> 1, (H * 0.85) | 0) });
  const res = {};
  const [renderPass, bloom, output, grade] = c.passes;

  // A: RenderPass direto pra tela
  renderPass.renderToScreen = true;
  renderPass.render(r, c.writeBuffer, c.readBuffer, 0.016, false);
  res.A_renderToScreen = mid();
  renderPass.renderToScreen = false;

  // B: RenderPass→readBuffer, OutputPass→tela
  renderPass.render(r, c.writeBuffer, c.readBuffer, 0.016, false);
  output.renderToScreen = true;
  output.render(r, c.writeBuffer, c.readBuffer, 0.016, false);
  res.B_renderOutput = mid();
  output.renderToScreen = false;

  // C: + grade na tela lendo o readBuffer (pula output)
  renderPass.render(r, c.writeBuffer, c.readBuffer, 0.016, false);
  grade.renderToScreen = true;
  grade.render(r, c.writeBuffer, c.readBuffer, 0.016, false);
  res.C_renderGrade = mid();
  grade.renderToScreen = false;

  // D: RenderPass + bloom interno (sem ir pra tela), depois output na tela
  renderPass.render(r, c.writeBuffer, c.readBuffer, 0.016, false);
  bloom.renderToScreen = false;
  bloom.render(r, c.writeBuffer, c.readBuffer, 0.016, false);
  output.renderToScreen = true;
  output.render(r, c.writeBuffer, c.readBuffer, 0.016, false);
  res.D_renderBloomOutput = mid();
  output.renderToScreen = false;
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
