// React e motor reais, sem palco, WebGL, áudio, login ou API do aplicativo.
// Opt-in: LUCA_TESTE_BANCADA=nome node --test tests/gameplay-desafio-relogio.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const bancada = process.env.LUCA_TESTE_BANCADA;

test('resultado começa em 10 s, conta e alterna após 10 s mesmo depois de 18 s de condução', { skip: !bancada && 'requer bancada explícita, sem iniciar navegador fora dela' }, async (t) => {
  const estado = JSON.parse(execFileSync('agent-bench', ['status', bancada], { encoding: 'utf8' }));
  const navegador = JSON.parse(execFileSync('agent-bench', ['browser-status', bancada], { encoding: 'utf8' }));
  assert.ok(estado.workspace >= 6 && estado.workspace <= 11);
  assert.equal(estado.control_mode, 'agente');
  assert.equal(navegador.lives_in, bancada);
  assert.equal(navegador.status, 'conectado');
  const pacote = await build({
    stdin: {
      resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'tsx',
      contents: `import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { DesafioCabine } from './src/components/gameplay/DesafioCabine';
import { criarMotorGameplay } from './src/components/gameplay/motorGameplay';
import { relevoRampaLateral } from './src/components/gameplay/rampaLateral';
const motor = criarMotorGameplay();
const root = createRoot(document.getElementById('root'));
flushSync(() => root.render(createElement(DesafioCabine, { canal: motor, som: false })));
window.concluir = (pendente) => {
  let alertaEm = null;
  for (let i = 0; i < 4200 && motor.ler().fase !== 'fim'; i += 1) {
    const estado = motor.ler();
    if ((pendente ? estado.atitude.rolagemGraus >= 20 : estado.sensor.alerta) && alertaEm === null) alertaEm = estado.tempoMs;
    const freando = alertaEm !== null && estado.tempoMs >= alertaEm + 500;
    flushSync(() => motor.quadro(1 / 60, { esterco: 0, acelerador: freando ? 0 : 1, freio: freando ? 1 : 0 }, pendente ? relevoRampaLateral : undefined));
  }
  return motor.ler().fase;
};
window.desmontar = () => flushSync(() => root.unmount());`,
    },
    bundle: true, write: false, platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"development"' }, loader: { '.css': 'empty' },
  });
  const servidor = createServer((req, res) => {
    if (req.url === '/teste.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(pacote.outputFiles[0].text); }
    else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<div id="root"></div><script src="/teste.js"></script>'); }
  });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  t.after(() => new Promise((ok) => servidor.close(ok)));
  const browser = await chromium.connectOverCDP(navegador.browser_url);
  const page = await browser.contexts()[0].newPage();
  t.after(async () => { await page.close(); await browser.close(); });
  const base = `http://127.0.0.1:${servidor.address().port}`;
  await page.route('**/*', (route) => route.request().url().startsWith(base + '/') ? route.continue() : route.abort());
  const erros = [];
  page.on('pageerror', (erro) => erros.push(erro.message));
  await page.clock.install({ time: new Date(0) });
  await page.clock.pauseAt(new Date(1000));
  await page.goto(base);
  await page.waitForFunction(() => typeof window.concluir === 'function');
  for (const [pendente, rodada] of [[false, '1'], [true, '2']]) {
    await page.clock.runFor(18_000);
    assert.equal(await page.evaluate((p) => window.concluir(p), pendente), 'fim');
    const contagem = page.locator('.gameplay-resultado small');
    assert.equal(await contagem.textContent(), 'Recomeça em 10 s');
    assert.equal(await page.locator('.gameplay-desafio').getAttribute('data-rodada'), rodada);
    await page.clock.runFor(250);
    assert.equal(await contagem.textContent(), 'Recomeça em 10 s');
    await page.clock.runFor(8750);
    assert.equal(await contagem.textContent(), 'Recomeça em 1 s');
    await page.clock.runFor(1000);
    assert.equal(await page.locator('.gameplay-desafio').getAttribute('data-etapa'), 'abertura');
    assert.equal(await page.locator('.gameplay-desafio').getAttribute('data-desafio'), pendente ? 'fardo-a-frente' : 'pendente-lateral');
    assert.equal(await page.locator('.gameplay-desafio').getAttribute('data-rodada'), pendente ? '3' : '2');
  }
  await page.evaluate(() => window.desmontar());
  assert.deepEqual(erros, []);
});
