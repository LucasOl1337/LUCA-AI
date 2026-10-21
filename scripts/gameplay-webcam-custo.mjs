// Custo do detector de sonolência dentro do /gameplay. Só localhost; abre Chromium com
// WebGL, então roda pela fila pesada (`agent-bench fila NOME rodar -- …`).
// Rodada A = /gameplay?quiosque=1, B = com &webcam=1: aquece 8 s, grava trace CDP de 10 s
// e soma o tempo de CPU (tdur) por thread. Depois mede a latência do alerta usando o
// marcador do y4m (quadrado de 40 px no canto inferior direito: preto = olhos abertos,
// branco = fechados) contra `data-sono` do painel.
// Uso: QA_URL=http://127.0.0.1:PORTA Y4M=rosto.y4m RODADAS="A B A B" CICLOS=5 OUT=x.json \
//      node scripts/gameplay-webcam-custo.mjs   (LATENCIA=0 pula a latência)
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.QA_URL;
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Só localhost.');
const rodadas = (process.env.RODADAS || 'A B').split(/\s+/).filter(Boolean);
const TRACE_MS = 10_000;
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium', headless: false,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${process.env.Y4M}`, '--window-size=1600,1000'],
});
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
assert.equal((await context.request.post(`${base}/api/auth/register`, { data: { name: 'Custo QA', email: `custo-${Date.now()}@local.test`, password: 'Only-local-webcam-test-12345' } })).status(), 201);

function analisar(eventos) {
  const nomes = new Map();
  for (const e of eventos) if (e.ph === 'M' && e.name === 'thread_name') nomes.set(`${e.pid}:${e.tid}`, e.args.name);
  const porThread = new Map();
  const soma = (k, campo, v) => { const t = porThread.get(k) ?? { cpu: 0, wall: 0, chamadasDetector: 0, cpuDetector: 0, cpuMonitor: 0, quadros: 0 }; t[campo] += v; porThread.set(k, t); };
  for (const e of eventos) {
    const k = `${e.pid}:${e.tid}`;
    if (e.ph === 'X' && (e.name === 'ThreadControllerImpl::RunTask' || e.name === 'RunTask')) {
      soma(k, 'wall', (e.dur ?? 0) / 1000); soma(k, 'cpu', (e.tdur ?? e.dur ?? 0) / 1000);
    }
    if (e.ph === 'X' && e.name === 'FunctionCall') {
      const url = e.args?.data?.url ?? '';
      if (/drowsiness-worker/.test(url)) { soma(k, 'chamadasDetector', 1); soma(k, 'cpuDetector', (e.tdur ?? e.dur ?? 0) / 1000); }
      if (/monitor-|WebcamSonoCabine-/.test(url)) soma(k, 'cpuMonitor', (e.tdur ?? e.dur ?? 0) / 1000);
    }
    if (e.ph === 'X' && e.name === 'FireAnimationFrame') soma(k, 'quadros', 1);
  }
  const linhas = [];
  for (const [k, v] of porThread) {
    const nome = nomes.get(k) ?? '?';
    if (!/CrRendererMain|DedicatedWorker|ThreadPool|Compositor|VizCompositor|CrGpuMain|Media|Video/.test(nome)) continue;
    linhas.push({ thread: nome, k, ...Object.fromEntries(Object.entries(v).map(([c, n]) => [c, Math.round(n * 10) / 10])) });
  }
  return linhas.sort((a, b) => b.cpu - a.cpu);
}

async function medir(modo) {
  const page = await context.newPage();
  const url = `${base}/gameplay?quiosque=1${modo === 'A' ? '' : '&webcam=1'}`;
  await page.goto(url);
  await page.locator('.gameplay-painel').waitFor({ timeout: 90000 });
  if (modo !== 'A') await page.locator('.gameplay-webcam[data-fase="rodando"]').waitFor({ timeout: 90000 });
  await page.waitForTimeout(8000);
  const cdp = await context.newCDPSession(page);
  const eventos = [];
  cdp.on('Tracing.dataCollected', ({ value }) => eventos.push(...value));
  const fim = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
  await cdp.send('Tracing.start', { categories: 'toplevel,devtools.timeline,disabled-by-default-devtools.timeline,v8.execute', transferMode: 'ReportEvents' });
  await page.waitForTimeout(TRACE_MS);
  await cdp.send('Tracing.end');
  await fim;
  const linhas = analisar(eventos);
  const main = linhas.filter((l) => l.thread === 'CrRendererMain').sort((a, b) => b.quadros - a.quadros)[0];
  const worker = linhas.filter((l) => /DedicatedWorker/.test(l.thread)).sort((a, b) => b.chamadasDetector - a.chamadasDetector)[0];
  const s = TRACE_MS / 1000;
  const r = {
    modo, url,
    fps: +(main.quadros / s).toFixed(1),
    mainCpuMsPorS: +(main.cpu / s).toFixed(1),
    mainCpuMonitorMsPorS: +(main.cpuMonitor / s).toFixed(2),
    classificacoesPorS: worker ? +(worker.chamadasDetector / s).toFixed(1) : 0,
    workerCpuMsPorS: worker ? +(worker.cpu / s).toFixed(1) : 0,
    inferenciaMsMedia: worker && worker.chamadasDetector ? +(worker.cpuDetector / worker.chamadasDetector).toFixed(1) : 0,
    threads: linhas.slice(0, 12),
  };
  console.log(JSON.stringify({ modo: r.modo, fps: r.fps, mainCpuMsPorS: r.mainCpuMsPorS, mainCpuMonitorMsPorS: r.mainCpuMonitorMsPorS, classificacoesPorS: r.classificacoesPorS, workerCpuMsPorS: r.workerCpuMsPorS, inferenciaMsMedia: r.inferenciaMsMedia }));
  await page.close();
  return r;
}

/** Latência: do 1º quadro com o marcador branco (olhos fechados no vídeo) até data-sono no painel. */
async function latencia(ciclos = 3) {
  const page = await context.newPage();
  await page.goto(`${base}/gameplay?quiosque=1&webcam=1`);
  await page.locator('.gameplay-webcam[data-fase="rodando"]').waitFor({ timeout: 90000 });
  const r = await page.evaluate((ciclos) => new Promise((resolve) => {
    const video = document.querySelector('.gameplay-webcam video');
    const c = new OffscreenCanvas(1, 1); const g = c.getContext('2d', { willReadFrequently: true });
    let fechado = null; let fechouEm = 0; const lat = []; const erros = { alarmeAberto: 0, abertoLidoComoFechado: 0 };
    const marcas = []; const ateClassificar = []; const classificouAte = [];
    let ultimoSono = null; let primeiraFechadaEm = 0;
    new MutationObserver(() => {
      const w = document.querySelector('.gameplay-webcam'); const st = w?.dataset.sono;
      if (st === ultimoSono) return; ultimoSono = st;
      if (st === 'closed' && fechado && fechouEm) { primeiraFechadaEm = performance.now(); ateClassificar.push(Math.round(primeiraFechadaEm - fechouEm)); }
      if ((st === 'closed' || st === 'alarm') && fechado === false) erros.abertoLidoComoFechado++;
    }).observe(document.querySelector('.gameplay-webcam'), { attributes: true, attributeFilter: ['data-sono'] });
    const painel = () => document.querySelector('.gameplay-painel');
    const quadro = (agora, meta) => {
      g.drawImage(video, video.videoWidth - 20, video.videoHeight - 20, 1, 1, 0, 0, 1, 1);
      const branco = g.getImageData(0, 0, 1, 1).data[0] > 128;
      if (fechado !== null && branco !== fechado) { marcas.push({ t: performance.now(), fechado: branco }); if (branco) fechouEm = performance.now(); }
      fechado = branco;
      video.requestVideoFrameCallback(quadro);
    };
    video.requestVideoFrameCallback(quadro);
    new MutationObserver(() => {
      const p = painel(); if (!p) return;
      if (p.dataset.sono === 'true') {
        if (fechado && fechouEm) { lat.push(Math.round(performance.now() - fechouEm)); if (primeiraFechadaEm) classificouAte.push(Math.round(performance.now() - primeiraFechadaEm)); fechouEm = 0; primeiraFechadaEm = 0; }
        else if (!fechado) erros.alarmeAberto++;
        if (lat.length >= ciclos) resolve({ lat, ateClassificar, classificouAte, erros, marcas: marcas.length });
      }
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-sono'] });
    setTimeout(() => resolve({ lat, ateClassificar, classificouAte, erros, marcas: marcas.length, timeout: true }), ciclos * 7000 + 9000);
  }), ciclos);
  console.log(JSON.stringify({ latenciaMs: r.lat, ...r }));
  await page.close();
  return r;
}

const resultado = { rodadas: [] };
for (const modo of rodadas) resultado.rodadas.push(await medir(modo));
if (process.env.LATENCIA !== '0') resultado.latencia = await latencia(Number(process.env.CICLOS || 3));
await fs.writeFile(process.env.OUT, JSON.stringify(resultado, null, 2));
await browser.close();
