import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { formatAppUrl, mergeAppLocation, parseAppLocation, exigeNovoDocumento, politicaDoDocumento } from '../shared/app-location.js';
import { cabecalhosDeSeguranca } from '../server/cabecalhos-seguranca.js';
import { loadFrontendModule } from './support/load-frontend-module.js';

// Opção do CP3 (19/10, PERGUNTAS Q1): o detector da /sonolencia dentro do /gameplay, só com ?webcam=1.

const { criarMonitorSonolencia, EMPTY_READING, RESULTADO_FRESCO_MS, WORKER_MUDO_MS, INTERVALO_FRAME_MS } =
  await loadFrontendModule('../../src/sonolencia/monitor.ts');
const { alertaCabine, BIPE_SONO, ROTULO_ALERTA_CABINE } = await loadFrontendModule('../../src/components/gameplay/alertaCabine.ts');
const { criarSonoCabine, ROTULO_ALERTA_SONO } = await loadFrontendModule('../../src/components/gameplay/sonoCabine.ts');
const { PainelCabineVista } = await loadFrontendModule('../../src/components/gameplay/PainelCabine.tsx');
const { GameplayQuiosque } = await loadFrontendModule('../../src/pages/GameplayPage.tsx');

const estado = ({ cm = 400, fase = 'dirigindo', contato = false } = {}) => ({
  versao: 1, fase, tempoMs: 1000,
  maquina: { x: 0, z: 0, rumoGraus: 0, velocidadeKph: 6, re: false },
  comandos: { esterco: 0, acelerador: 0, freio: 0 },
  sensor: { distanciaCm: cm, eco: cm < 400, alerta: cm < 400 && cm <= 150 },
  atitude: { rolagemGraus: 0, arfagemGraus: 0 },
  contato, tetoKph: 6,
});
const alarme = { status: 'alarm', closedMs: 1200 };

test('?webcam=1 sobrevive à URL canônica só no /gameplay e some ao trocar de página', () => {
  const canonica = (href) => formatAppUrl(parseAppLocation(href));
  assert.equal(canonica('/gameplay?webcam=1'), '/gameplay?webcam=1');
  assert.equal(canonica('/gameplay?quiosque=1&webcam=1'), '/gameplay?quiosque=1&webcam=1');
  assert.equal(canonica('/gameplay?webcam=sim'), '/gameplay');
  assert.equal(canonica('/gameplay'), '/gameplay');
  assert.equal(canonica('/operador?webcam=1'), '/operador');
  assert.equal(canonica('/stand?webcam=1'), '/stand');
  const comWebcam = parseAppLocation('/gameplay?quiosque=1&webcam=1');
  // Shift+Q sai do quiosque e a webcam continua: mesmo documento, mesma política.
  assert.equal(formatAppUrl(mergeAppLocation(comWebcam, { quiosque: '' })), '/gameplay?webcam=1');
  assert.equal(formatAppUrl(mergeAppLocation(comWebcam, { page: 'operador' })), '/operador');
});

test('câmera só no cabeçalho do /gameplay?webcam=1; ligar ou desligar a webcam recarrega o documento', () => {
  const politica = (caminho, busca) => cabecalhosDeSeguranca(caminho, busca)['Permissions-Policy'];
  assert.equal(politica('/gameplay', '?webcam=1'), 'camera=(self), microphone=(), geolocation=()');
  assert.equal(politica('/gameplay/', '?quiosque=1&webcam=1'), 'camera=(self), microphone=(), geolocation=()');
  for (const [caminho, busca] of [['/gameplay', ''], ['/gameplay', '?quiosque=1'], ['/gameplay', '?webcam=0'], ['/operador', '?webcam=1'], ['/', '?webcam=1'], ['/gameplayx', '?webcam=1'], ['/api/gameplay', '?webcam=1']]) {
    assert.equal(politica(caminho, busca), 'camera=(), microphone=(), geolocation=()', `${caminho}${busca}`);
  }
  // Sem a query, o servidor responde igual a antes (quem chama com um argumento só).
  assert.equal(cabecalhosDeSeguranca('/gameplay')['Permissions-Policy'], 'camera=(), microphone=(), geolocation=()');
  assert.equal(cabecalhosDeSeguranca('/sonolencia')['Permissions-Policy'], 'camera=(self), microphone=(), geolocation=()');

  assert.equal(politicaDoDocumento(parseAppLocation('/gameplay?webcam=1')), politicaDoDocumento(parseAppLocation('/sonolencia')));
  assert.equal(exigeNovoDocumento(parseAppLocation('/gameplay'), parseAppLocation('/gameplay?webcam=1')), true);
  assert.equal(exigeNovoDocumento(parseAppLocation('/gameplay?webcam=1'), parseAppLocation('/gameplay')), true);
  assert.equal(exigeNovoDocumento(parseAppLocation('/gameplay?webcam=1'), parseAppLocation('/operador')), true);
  assert.equal(exigeNovoDocumento(parseAppLocation('/gameplay?webcam=1&quiosque=1'), parseAppLocation('/gameplay?webcam=1')), false);
  assert.equal(exigeNovoDocumento(parseAppLocation('/gameplay?quiosque=1'), parseAppLocation('/gameplay')), false);
});

test('sem webcam o painel da cabine fica idêntico; olhos fechados 1 s acendem faixa, vinheta e bipe próprios', () => {
  for (const e of [estado(), estado({ cm: 140 }), estado({ fase: 'pronto' }), estado({ fase: 'fim' })]) {
    const sem = alertaCabine(e);
    assert.deepEqual(alertaCabine(e, null), sem);
    assert.equal(sem.sono, false);
    // Leitura sem alarme (aberto, fechando, sem rosto) não muda nada além do campo `sono`.
    for (const status of ['unknown', 'open', 'closed']) assert.deepEqual(alertaCabine(e, { status, closedMs: 600 }), sem);
  }
  const dormindo = alertaCabine(estado(), alarme);
  assert.equal(dormindo.sono, true);
  assert.equal(dormindo.alerta, true);
  assert.equal(dormindo.rotuloAlerta, ROTULO_ALERTA_SONO);
  assert.equal(dormindo.vinheta, 'critica');
  assert.deepEqual(dormindo.bipe, BIPE_SONO);
  // Parado também alerta (o motorista dorme antes de acelerar); no resultado do desafio, não.
  assert.equal(alertaCabine(estado({ fase: 'pronto' }), alarme).rotuloAlerta, ROTULO_ALERTA_SONO);
  assert.deepEqual(alertaCabine(estado({ fase: 'pronto' }), alarme).bipe, BIPE_SONO);
  assert.equal(alertaCabine(estado({ fase: 'fim' }), alarme).alerta, false);
  // Obstáculo a 1,5 m pede freio mais rápido: o texto e o bipe dele vêm antes; a vinheta segue crítica.
  const os2 = alertaCabine(estado({ cm: 140 }), alarme);
  assert.equal(os2.rotuloAlerta, ROTULO_ALERTA_CABINE);
  assert.notDeepEqual(os2.bipe, BIPE_SONO);
  assert.equal(os2.vinheta, 'critica');
  assert.equal(os2.sono, true);
});

test('painel desenha a faixa de sonolência e marca data-sono só com o alarme', () => {
  const e = estado();
  const html = (sono) => renderToStaticMarkup(createElement(PainelCabineVista, { painel: alertaCabine(e, sono), estado: e }));
  const sem = html(null);
  assert.doesNotMatch(sem, /data-sono/);
  assert.doesNotMatch(sem, /sinais de sono/);
  const com = html(alarme);
  assert.match(com, /data-sono="true"/);
  assert.match(com, /role="alert">Atenção: sinais de sono</);
});

test('quiosque sem ?webcam=1 não monta o quadro da câmera; com ele, monta sem derrubar a cabine', () => {
  const sem = renderToStaticMarkup(createElement(GameplayQuiosque, { aoSair() {} }));
  assert.doesNotMatch(sem, /gameplay-webcam|Webcam de sonolência/);
  // SSR não resolve o lazy: o Suspense do quadro fica vazio e a cabine continua carregando.
  const com = renderToStaticMarkup(createElement(GameplayQuiosque, { aoSair() {}, webcam: true }));
  assert.match(com, /Carregando a cabine do Trator MAX/);
});

test('store do sono avisa só quando muda status ou décimo de segundo', () => {
  const s = criarSonoCabine();
  let avisos = 0;
  s.assinar(() => { avisos += 1; });
  s.definir({ status: 'open', closedMs: 0 });
  s.definir({ status: 'open', closedMs: 0 });
  s.definir({ status: 'closed', closedMs: 333 });
  s.definir({ status: 'closed', closedMs: 349 });
  s.definir({ status: 'closed', closedMs: 351 });
  assert.equal(avisos, 3);
  assert.deepEqual(s.ler(), { status: 'closed', closedMs: 400 });
  s.definir(null);
  s.definir(null);
  assert.equal(avisos, 4);
  assert.equal(s.ler(), null);
});

/** Câmera, worker e relógio falsos: o laço real do monitor, sem navegador. */
function bancada() {
  let t = 0;
  const timers = [];
  const trilha = { parada: false, ouvintes: {} };
  const track = { stop() { trilha.parada = true; }, addEventListener(nome, fn) { trilha.ouvintes[nome] = fn; } };
  const stream = { getTracks: () => [track], getVideoTracks: () => [{ ...track, label: 'EMEET SmartCam S600', getSettings: () => ({ width: 1920, height: 1080, frameRate: 30 }) }] };
  const worker = { mensagens: [], terminado: false, onmessage: null, onerror: null, postMessage(m) { this.mensagens.push(m); if (m.type === 'init') queueMicrotask(() => this.onmessage({ data: { type: 'ready' } })); }, terminate() { this.terminado = true; } };
  const video = { srcObject: null, readyState: 4, currentTime: 0, videoWidth: 1920, play: async () => {} };
  const leituras = [], falhas = [];
  const original = { setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval };
  globalThis.setInterval = (fn) => { timers.push(fn); return timers.length; };
  globalThis.clearInterval = (id) => { if (id) timers[id - 1] = null; };
  const monitor = criarMonitorSonolencia({
    video, aoLer: (l) => leituras.push(l), aoFalhar: (m) => falhas.push(m),
    abrirCamera: async () => stream, criarWorker: () => worker, agora: () => t,
    capturar: async () => ({ close() {} }),
  });
  return {
    monitor, worker, video, leituras, falhas, trilha,
    restaurar() { Object.assign(globalThis, original); },
    /** Avança o relógio em um frame e roda o tick; o worker responde com `amostra` se dada. */
    async frame(amostra) {
      t += INTERVALO_FRAME_MS;
      video.currentTime += 1 / 30;
      const tick = timers.find(Boolean);
      if (tick) await tick();
      const pedido = worker.mensagens.at(-1);
      if (amostra !== undefined && pedido?.type === 'frame') worker.onmessage({ data: { type: 'result', sample: amostra, at: pedido.at } });
    },
    avancar(ms) { t += ms; },
  };
}

test('monitor: olhos fechados por 1 s viram alarme pelo mesmo laço da /sonolencia', async () => {
  const b = bancada();
  try {
    const qualidade = await b.monitor.iniciar();
    assert.equal(qualidade.label, 'EMEET SmartCam S600');
    assert.equal(b.video.srcObject !== null, true);
    for (let i = 0; i < 3; i++) await b.frame({ left: 0.02, right: 0.03 });
    assert.equal(b.leituras.at(-1).status, 'open');
    for (let i = 0; i < 10; i++) await b.frame({ left: 0.9, right: 0.92 });
    assert.equal(b.leituras.at(-1).alarm, false, 'aos 900 ms ainda não');
    await b.frame({ left: 0.9, right: 0.92 });
    assert.deepEqual(b.leituras.at(-1), { status: 'alarm', closedMs: 1000, alarm: true });
    await b.frame({ left: 0.02, right: 0.03 });
    assert.equal(b.leituras.at(-1).status, 'open');
    b.monitor.parar();
    assert.equal(b.trilha.parada, true, 'parar libera a câmera');
    assert.equal(b.worker.terminado, true);
    assert.equal(b.video.srcObject, null);
    assert.deepEqual(b.falhas, []);
  } finally { b.restaurar(); }
});

test('monitor: resposta atrasada não conta como olho fechado; worker mudo derruba com mensagem', async () => {
  const b = bancada();
  try {
    await b.monitor.iniciar();
    await b.frame({ left: 0.9, right: 0.92 });
    assert.equal(b.leituras.at(-1).status, 'closed');
    // Sem resposta por mais que o frescor: zera a leitura.
    b.avancar(RESULTADO_FRESCO_MS);
    await b.frame();
    assert.deepEqual(b.leituras.at(-1), EMPTY_READING);
    b.avancar(WORKER_MUDO_MS);
    await b.frame();
    assert.equal(b.falhas.length, 1);
    assert.match(b.falhas[0], /parou de responder/);
    assert.equal(b.trilha.parada, true);
  } finally { b.restaurar(); }
});

test('monitor: webcam desconectada encerra e avisa uma vez só', async () => {
  const b = bancada();
  try {
    await b.monitor.iniciar();
    b.trilha.ouvintes.ended();
    b.trilha.ouvintes.mute();
    assert.equal(b.falhas.length, 1);
    assert.match(b.falhas[0], /desconectada/);
    assert.equal(b.worker.terminado, true);
  } finally { b.restaurar(); }
});
