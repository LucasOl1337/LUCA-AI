import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.SONOLENCIA_QA_URL || 'http://127.0.0.1:4348';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Este teste só pode criar dados em localhost.');
const out = 'output/sonolencia';
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
page.on('console', m => { if (m.type() === 'error') console.log('BROWSER:', m.text().slice(0, 350)); });
try {
  const register = await context.request.post(`${base}/api/auth/register`, { data: { name: 'Webcam QA local', email: `webcam-${Date.now()}@example.test`, password: 'Only-local-webcam-test-12345' } });
  assert.equal(register.status(), 201);
  const response = await page.goto(`${base}/sonolencia`);
  assert.equal(response.headers()['permissions-policy'], 'camera=(self), microphone=(), geolocation=()');
  await page.getByRole('heading', { name: 'Monitor de sonolência', exact: true }).waitFor();
  assert.equal(await page.locator('video').evaluate(v => v.srcObject), null);
  await page.screenshot({ path: `${out}/desktop.png`, fullPage: true });
  await page.getByRole('button', { name: 'Testar som', exact: true }).click();
  await page.getByRole('button', { name: 'Tocando alerta…' }).waitFor();
  await page.getByRole('button', { name: 'Testar som', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Ativar webcam' }).click();
  await page.locator('.drowsiness-page[data-state="running"]').waitFor({ timeout: 60000 });
  console.log('PASS: modelo real + WASM inicializam no worker sob a CSP de produção');
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('.drowsiness-page').getAttribute('data-eyes'), 'unknown');
  await page.getByRole('button', { name: 'Parar monitor' }).click();
  assert.equal(await page.locator('video').evaluate(v => v.srcObject), null);
  console.log('PASS: câmera sintética sem rosto não dispara; parar libera webcam');

  // Only replace model observations. Real camera lifecycle, worker messaging,
  // monotonic clock, UI and Web Audio remain under test.
  await context.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.__eyeSample = { left: 0.06, right: 0.05 };
    window.__silentWorker = false;
    window.__workersTerminated = 0;
    window.__audioPulses = 0;
    const ramp = AudioParam.prototype.linearRampToValueAtTime;
    AudioParam.prototype.linearRampToValueAtTime = function(value, time) {
      if (value === 0.28) window.__audioPulses++;
      return ramp.call(this, value, time);
    };
    window.Worker = class {
      constructor(url, options) {
        if (!String(url).includes('drowsiness-worker')) return new NativeWorker(url, options);
      }
      postMessage(data) {
        if (data.type === 'init') setTimeout(() => this.onmessage?.({ data: { type: 'ready' } }), 20);
        if (data.type === 'frame') {
          data.bitmap.close();
          if (!window.__silentWorker) setTimeout(() => this.onmessage?.({ data: { type: 'result', sample: window.__eyeSample, at: data.at } }), 1);
        }
      }
      terminate() { window.__workersTerminated++; }
    };
  });
  await page.reload();
  await page.getByLabel('Sensibilidade').selectOption('high');
  await page.getByRole('button', { name: 'Ativar webcam' }).click();
  await page.locator('[data-eyes="open"]').waitFor();
  assert.deepEqual(await page.locator('.drowsiness-eye-meters meter').evaluateAll(nodes => nodes.map(node => node.value)), [0, 0]);
  assert.deepEqual(await page.locator('.drowsiness-eye-meters small').allTextContents(), ['0% fechado', '0% fechado']);
  await page.evaluate(() => { window.__eyeSample = { left: 0.08, right: 0.32 }; });
  await page.waitForFunction(() => document.querySelectorAll('.drowsiness-eye-meters meter')[1]?.value === 1);
  assert.equal(await page.locator('.drowsiness-page').getAttribute('data-eyes'), 'open');
  assert.deepEqual(await page.locator('.drowsiness-eye-meters meter').evaluateAll(nodes => nodes.map(node => node.value)), [0, 1]);
  assert.deepEqual(await page.locator('.drowsiness-eye-meters small').allTextContents(), ['0% fechado', '100% fechado']);
  await page.evaluate(() => { window.__eyeSample = { left: 0.54, right: 0.65 }; });
  await page.locator('[data-eyes="closed"]').waitFor();
  assert.deepEqual(await page.locator('.drowsiness-eye-meters meter').evaluateAll(nodes => nodes.map(node => node.value)), [1, 1]);
  assert.deepEqual(await page.locator('.drowsiness-eye-meters small').allTextContents(), ['100% fechado', '100% fechado']);
  console.log('PASS: frames reais normalizam olhos abertos/fechados sem confundir piscada unilateral');
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => window.__audioPulses), 0);
  await page.locator('[data-eyes="alarm"]').waitFor({ timeout: 1500 });
  assert.ok(await page.evaluate(() => window.__audioPulses > 0));
  await page.screenshot({ path: `${out}/alerta.png`, fullPage: true });
  await page.evaluate(() => { window.__eyeSample = { left: 0.06, right: 0.05 }; });
  await page.locator('[data-eyes="open"]').waitFor();
  const pulses = await page.evaluate(() => window.__audioPulses);
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => window.__audioPulses), pulses);
  console.log('PASS: olhos fechados por 1 s iniciam som; reabrir interrompe o som');
  await page.evaluate(() => { window.__eyeSample = { left: 0.9, right: 0.9 }; });
  await page.locator('[data-eyes="closed"]').waitFor();
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.__eyeSample = null; });
  await page.locator('[data-eyes="unknown"]').waitFor();
  assert.equal(await page.locator('progress').getAttribute('value'), '0');
  await page.evaluate(() => { window.__silentWorker = true; });
  await page.locator('[data-state="error"]').waitFor({ timeout: 11000 });
  assert.equal(await page.locator('video').evaluate(v => v.srcObject), null);
  console.log('PASS: rosto perdido zera; worker travado desarma e libera a câmera');
  await page.reload();
  await page.getByRole('button', { name: 'Ativar webcam' }).click();
  await page.locator('[data-state="running"]').waitFor();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.locator('[data-state="idle"]').waitFor();
  assert.equal(await page.locator('video').evaluate(v => v.srcObject), null);
  assert.equal(await page.evaluate(() => window.__workersTerminated), 1);
  console.log('PASS: ocultar aba encerra câmera e worker');
  await page.reload();
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError'); }; });
  await page.getByRole('button', { name: 'Ativar webcam' }).click();
  await page.getByRole('alert').filter({ hasText: 'A câmera foi bloqueada' }).waitFor();
  assert.equal(await page.locator('video').evaluate(v => v.srcObject), null);
  console.log('PASS: permissão negada mostra recuperação');
  await page.reload();
  await page.evaluate(() => {
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async options => {
      const stream = await getUserMedia(options);
      window.__lateStream = stream;
      await new Promise(resolve => setTimeout(resolve, 1300));
      return stream;
    };
  });
  await page.getByRole('button', { name: 'Ativar webcam' }).click();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await page.waitForTimeout(2000);
  assert.equal(await page.evaluate(() => window.__lateStream?.getTracks().every(t => t.readyState === 'ended')), true);
  assert.equal(await page.locator('.drowsiness-page').getAttribute('data-state'), 'idle');
  console.log('PASS: cancelar durante permissão também fecha stream que chega atrasado');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${out}/mobile.png`, fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(await page.locator('.drowsiness-grid').evaluate(grid => grid.scrollWidth > grid.clientWidth), false);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const nextDocument = page.waitForNavigation();
  await page.getByRole('button', { name: 'Início', exact: true }).first().click();
  const home = await nextDocument;
  assert.equal(home.headers()['permissions-policy'], 'camera=(), microphone=(), geolocation=()');
  const entryDocument = page.waitForNavigation();
  await page.getByRole('button', { name: 'Sonolência', exact: true }).click();
  const entry = await entryDocument;
  assert.equal(entry.headers()['permissions-policy'], 'camera=(self), microphone=(), geolocation=()');
  await page.getByRole('heading', { name: 'Monitor de sonolência', exact: true }).waitFor();
  assert.equal(await page.locator('video').evaluate(v => v.srcObject), null);
  console.log('PASS: navegação troca a política da câmera e nunca inicia captura automaticamente');
  assert.deepEqual(pageErrors, []);
  console.log('PASS: layout mobile sem overflow; nenhum erro JavaScript');
} finally { await browser.close(); }
