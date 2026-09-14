// Produto local já aberto por npm run demo:sompo. Não inicia servidores.
// Uso: node scripts/geofencing/demo-operacao.cjs — capturas e relatório em tmp-shots/operacao-*/ (pasta ignorada pelo git).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = 'http://127.0.0.1:4243';
const cases = [
  ['operacao-completa', [[16000, 'Dentro do declive', false], [93000, 'Borda da ribanceira', false], [136000, 'Proximidade elevada', false]]],
  ['encosta-alem-do-limite', [[16000, 'No limite ou acima', true], [93000, 'Borda da ribanceira', false], [136000, 'Proximidade elevada', false]]],
  ['cabeceira-na-ribanceira', [[16000, 'Dentro do declive', false], [101000, 'Dentro da ribanceira', true], [194000, 'Proximidade elevada', false]]],
];

(async () => {
  const { createSompoAgriGeofenceSnapshot: createSompoAgriSimulationSnapshot, describeGeofence, getSompoAgriGeofenceEpisodes } = await import('../../shared/geofencing/index.js');
  const artifacts = path.resolve(__dirname, '../../tmp-shots');
  fs.mkdirSync(artifacts, { recursive: true });
  const output = fs.mkdtempSync(path.join(artifacts, 'operacao-'));
  const report = { errors: [], captures: [], checks: [], complete: false };
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1500 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    page.on('pageerror', error => report.errors.push(error.message));
    const response = await context.request.post(`${base}/api/auth/register`, { timeout: 10000, data: { name: 'Demo operação', email: `operacao-${Date.now()}@luca.test`, password: 'senha-demo-123456' } });
    assert.ok(response.ok(), `registro local: HTTP ${response.status()}`);
    await page.goto(`${base}/sompo`, { waitUntil: 'domcontentloaded' });
    const go = page.getByRole('button', { name: 'Prosseguir', exact: true });
    await go.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    if (await go.isVisible()) await go.click();
    const telemetry = page.getByText('Sinais em tempo real', { exact: true });
    await telemetry.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
    if (await telemetry.isVisible()) await telemetry.click();
    await page.locator('select[name="sompo-scenario"]').selectOption('agri-geofencing-operacao');
    const slider = page.locator('input[aria-label="Instante da simulação"]');
    const now = page.locator('[data-sompo-geofence-now] strong');
    async function assertClock(ms) {
      await page.waitForFunction(value => [...document.querySelectorAll('.sompo-simulator-workspace span')].some(el => el.textContent === `${value} ms`), ms);
      // Tolerância de 1e-4 % cobre a serialização de 6 dígitos das porcentagens pelo navegador.
      // O range nativo tem step=100: seu valor DOM arredonda amostras de 250 ms. O HUD expõe o relógio exato.
      assert.equal(await page.locator('.sompo-simulator-workspace').getByText(`${ms} ms`, { exact: true }).count(), 1);
    }
    async function pause() {
      const button = page.getByRole('button', { name: 'Pausar simulação', exact: true });
      if (await button.count()) await button.click();
      await page.getByRole('button', { name: 'Reproduzir simulação', exact: true }).waitFor();
    }
    async function seek(ms) {
      await slider.evaluate((el, value) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(value));
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }, ms);
      await page.waitForFunction(value => document.querySelector('input[aria-label="Instante da simulação"]')?.value === String(value), ms);
      await page.waitForFunction(value => document.querySelector('[data-sompo-geofence-now] span')?.textContent === `Agora · ${(value / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`, ms);
    }
    for (const [outcome, moments] of cases) {
      await page.locator('select[name="sompo-scenario-outcome"]').selectOption(outcome);
      await pause();
      await page.getByRole('button', { name: 'Visão geral', exact: true }).click();
      assert.equal(await page.locator('.sompo-geofence-lane').count(), 5);
      const overlap = await page.locator('.sompo-geofence-lane').evaluateAll(lanes => lanes.some(lane => {
        const buttons = [...lane.querySelectorAll('button')];
        return buttons.slice(1).some((button, i) => parseFloat(button.style.left) + 1e-4 < parseFloat(buttons[i].style.left) + parseFloat(buttons[i].style.width));
      }));
      assert.equal(overlap, false, 'episódios curtos não cobrem o próximo segmento');
      for (const [ms, band, alert] of moments) {
        await seek(ms);
        assert.equal(await now.textContent(), band);
        const snapshot = createSompoAgriSimulationSnapshot('agri-geofencing-operacao', outcome, { elapsedMs: ms });
        assert.equal(snapshot.risks.proximity, alert);
        assert.equal(await page.locator('[data-geofence]').getAttribute('data-alert'), String(alert));
        assert.equal(await page.locator('[data-geofence] strong').textContent(), `Radar: ${describeGeofence(snapshot.geofence)}`);
        if (band === 'Proximidade elevada') assert.match(await page.locator('[data-sompo-geofence-now]').innerText(), /aproximando.*≈ \d+ s.*crítica/s);
        if (band === 'No limite ou acima') assert.match(await page.locator('[data-geofence-machine]').innerText(), /inclinação 17° · limite 15°/);
        // Deixa o palco desenhar após o seek; relógio permanece pausado.
        await page.waitForTimeout(700);
        const filename = `${outcome}-${ms}.png`;
        await page.locator('.sompo-simulator-workspace').first().screenshot({ path: path.join(output, filename) });
        report.captures.push({ outcome, ms, band, alert, filename });
      }
      const episodes = getSompoAgriGeofenceEpisodes('agri-geofencing-operacao', outcome);
      assert.equal(await page.locator('[data-sompo-geofence-episodes] tbody tr').count(), episodes.length);
      const elevated = episodes.find(e => e.hazardKey.startsWith('water') && e.bandId === 'elevada');
      const rowIndex = episodes.indexOf(elevated);
      await page.locator('[data-sompo-geofence-episodes] tbody tr').nth(rowIndex).getByRole('button').click();
      await assertClock(elevated.startMs);
      assert.equal(await now.textContent(), 'Proximidade elevada');
      const startSeconds = (elevated.startMs / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      await seek(0);
      await page.getByRole('button', { name: `Ir para Córrego sintético, Proximidade elevada, ${startSeconds} s`, exact: true }).click();
      await assertClock(elevated.startMs);
      await page.getByRole('button', { name: 'Ampliar o mapa do talhão', exact: true }).click();
      const map = page.locator('[data-sompo-geofence-map]');
      await map.waitFor();
      assert.match(await map.innerText(), /Talhão 2 sintético/);
      assert.match(await map.innerText(), /Galpão/);
      await map.screenshot({ path: path.join(output, `${outcome}-mapa.png`) });
      await page.getByRole('button', { name: 'Simulador', exact: true }).click();
      report.checks.push({ outcome, episodes: episodes.length, lanes: 5, tableSeek: elevated.startMs, stripSeek: elevated.startMs, map: true });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await pause();
    await seek(194000);
    await page.waitForTimeout(700);
    const widths = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth,
      panels: [...document.querySelectorAll('.sompo-simulator-workspace, [data-sompo-geofence-panel]')].map(el => ({ client: el.clientWidth, scroll: el.scrollWidth })),
    }));
    assert.ok(widths.document <= widths.viewport, `rolagem horizontal: ${JSON.stringify(widths)}`);
    assert.ok(widths.panels.every(p => p.scroll <= p.client), `rolagem interna horizontal: ${JSON.stringify(widths)}`);
    await page.locator('[data-sompo-geofence-now]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, 'mobile-390.png'), fullPage: true });
    report.checks.push({ mobile: widths });
    assert.deepEqual(report.errors, []);
    report.complete = true;
  } catch (error) {
    report.failure = error.stack;
    throw error;
  } finally {
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ output, ...report }, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
