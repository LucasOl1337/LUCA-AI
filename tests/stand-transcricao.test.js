import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { SessaoTurnos } = await loadFrontendModule('../../src/stand-voz/sessaoTurnos.ts');
const originais = { window: globalThis.window, fetch: globalThis.fetch, sessionStorage: globalThis.sessionStorage, CustomEvent: globalThis.CustomEvent, WebSocket: globalThis.WebSocket };
afterEach(() => {
  Object.assign(globalThis, originais);
  delete globalThis.__lucaVozDiagnostico;
});

function preparar(responder, { diagnostico = true } = {}) {
  const eventos = [];
  const pedidos = [];
  const prazos = [];
  globalThis.window = { setTimeout: (cb, ms) => { prazos.push({ cb, ms }); return prazos.length; }, clearTimeout: () => {} };
  globalThis.sessionStorage = { getItem: () => diagnostico ? '1' : null };
  globalThis.CustomEvent = class extends originais.CustomEvent {
    constructor(nome, args) { super(nome, args); eventos.push(args.detail); }
  };
  globalThis.fetch = async (url, opcoes) => {
    const corpo = JSON.parse(opcoes.body);
    pedidos.push(corpo);
    return responder(corpo, opcoes);
  };
  const sessao = new SessaoTurnos();
  sessao.conversaId = 'teste';
  const ndjson = (linhas) => new Response(linhas.map((l) => JSON.stringify(l)).join('\n'));
  return { sessao, eventos, pedidos, prazos, ndjson };
}

const fim = () => new Response('{"t":"fim","motivo":"ok"}\n');
const drenar = () => new Promise((ok) => setImmediate(ok));

test('parcial Nanda → final Netolik: envia exatamente o final e rastreia os dois', async () => {
  const { sessao, eventos, pedidos } = preparar(fim);
  sessao.aoScribe({ message_type: 'partial_transcript', text: 'Fala uma coisa sobre a Nanda' });
  sessao.aoScribe({ message_type: 'committed_transcript', text: 'Fala uma coisa sobre a Netolik' });
  await drenar();
  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].texto, 'Fala uma coisa sobre a Netolik');
  assert.equal(pedidos[0].turno_id, 'teste:1');
  assert.ok(eventos.some((e) => e.tipo === 'legenda' && e.texto === pedidos[0].texto));
  const trace = globalThis.__lucaVozDiagnostico;
  assert.deepEqual(trace.filter((r) => r.tipo === 'scribe').map((r) => r.dados.texto), ['Fala uma coisa sobre a Nanda', pedidos[0].texto]);
  assert.equal(trace.find((r) => r.tipo === 'envio').dados.texto, pedidos[0].texto);
});

test('feio é enviado literal; resposta de turno abortado não invade o turno seguinte', async () => {
  let responderAnterior;
  const { sessao, pedidos, ndjson } = preparar((corpo) => corpo.turno_id === 'teste:1'
    ? new Promise((ok) => { responderAnterior = ok; })
    : ndjson([{ t: 'frase', texto: 'Sou uma coruja de IA.' }, { t: 'fim', motivo: 'ok' }]));
  const anterior = sessao.perguntar({ texto: 'Você está vivo?' });
  const atual = sessao.perguntar({ texto: 'Você é muito feio' });
  await atual;
  responderAnterior(ndjson([{ t: 'frase', texto: 'Você está bem vivo.' }, { t: 'fim', motivo: 'ok' }]));
  await anterior;
  assert.deepEqual(pedidos.map((p) => p.texto), ['Você está vivo?', 'Você é muito feio']);
  assert.deepEqual(globalThis.__lucaVozDiagnostico.filter((r) => r.tipo === 'resposta').map((r) => [r.dados.turno, r.dados.texto]), [[2, 'Sou uma coruja de IA.']]);
});

test('pausa de orçamento mostra recuperação sem áudio, não fecha nem reenvia automaticamente', async () => {
  const texto = 'A voz chegou à pausa da hora. Diga continuar quando liberar.';
  const { sessao, pedidos, eventos, prazos } = preparar(() => new Response(`${JSON.stringify({ t: 'fim', motivo: 'pausa_limite', causa: 'hora', texto })}\n`));
  await sessao.perguntar({ texto: 'Como funciona o LUCA?' });
  assert.equal(sessao.terminada, false);
  assert.equal(sessao.estado, 'ouvindo');
  assert.ok(eventos.some((e) => e.tipo === 'legenda' && e.texto === texto));
  assert.ok(prazos.some((p) => p.ms === 20000), 'inatividade continua limitada');
  assert.equal(pedidos.length, 1, 'não repete mutação');
});

test('diagnóstico desligado não guarda transcrições em memória global', async () => {
  const { sessao } = preparar(fim, { diagnostico: false });
  await sessao.perguntar({ texto: 'Você é muito feio' });
  assert.equal(globalThis.__lucaVozDiagnostico, undefined);
});


test('ElevenLabs inicia sem timer absoluto240s; mantém prazo de fala/inatividade', async () => {
  const { sessao, prazos } = preparar(fim);
  window.addEventListener = () => {};
  window.removeEventListener = () => {};
  globalThis.WebSocket = class {
    static OPEN = 1;
    readyState = 1;
    constructor() { queueMicrotask(() => this.onopen()); }
    send() {}
    close() {}
  };
  const audio = {
    contexto: { currentTime: 0 },
    saida: { gain: { cancelScheduledValues() {}, value: 1 } },
    ouvir() {}, medirNivel: () => () => {},
  };
  await sessao.iniciar({ conversa_id: 'teste', limites: { silencio_s: 20, teto_s: 240 }, conexao: { transporte: 'scribe', url: 'ws://falso' } }, { audio, drenar: () => [] });
  assert.equal(sessao.etapa, 'pronta');
  assert.ok(prazos.some((p) => p.ms === 6000));
  assert.ok(prazos.every((p) => p.ms !== 240000));
  sessao.encerrar();
});

// Ouvido 24/10 (`ouvido/MEDICAO.md`): o VAD de 0,6 s fecha a frase na hesitação
// e o LUCA respondia só ao último pedaço.
test('frase partida pelo VAD vira uma pergunta só: a resposta ao pedaço não sai', async () => {
  const { sessao, pedidos, eventos } = preparar((corpo, opcoes) => corpo.texto === 'Tem como a seguradora.'
    ? new Promise((_, falha) => opcoes.signal.addEventListener('abort', () => falha(new Error('abortado'))))
    : fim());
  sessao.aoScribe({ message_type: 'committed_transcript', text: 'Tem como a seguradora.' });
  await drenar();
  assert.equal(sessao.estado, 'pensando');
  sessao.aoScribe({ message_type: 'partial_transcript', text: 'Baixar o preço' });
  assert.equal(sessao.estado, 'ouvindo', 'continuação aborta a resposta ao pedaço');
  assert.ok(eventos.some((e) => e.tipo === 'legenda' && e.texto === 'Tem como a seguradora baixar o preço'));
  sessao.aoScribe({ message_type: 'committed_transcript', text: 'Baixar o preço do seguro com esses dados?' });
  await drenar();
  assert.deepEqual(pedidos.map((p) => p.texto), ['Tem como a seguradora.', 'Tem como a seguradora baixar o preço do seguro com esses dados?']);
});

test('pergunta nova depois da resposta tocada não é juntada com a anterior', async () => {
  const { sessao, pedidos } = preparar(fim);
  sessao.aoScribe({ message_type: 'committed_transcript', text: 'Como funciona o sensor?' });
  await drenar();
  await drenar();
  sessao.aoScribe({ message_type: 'committed_transcript', text: 'E o simulador?' });
  await drenar();
  assert.deepEqual(pedidos.map((p) => p.texto), ['Como funciona o sensor?', 'E o simulador?']);
});

test('parcial parada fecha a frase (commit) uma vez, sem esperar o VAD do ruído', () => {
  const { sessao } = preparar(fim);
  sessao.aoScribe({ message_type: 'partial_transcript', text: 'Quero testar o simulador' });
  assert.equal(sessao.parcialParada(), false, 'parcial recém-chegada não fecha');
  sessao.parcialMudouEm = performance.now() - 1600;
  assert.equal(sessao.parcialParada(), true);
  assert.equal(sessao.parcialParada(), false, 'um commit por parcial');
  sessao.aoScribe({ message_type: 'partial_transcript', text: 'Quero testar o simulador do trator' });
  assert.equal(sessao.parcialParada(), false, 'texto novo zera o relógio');
});
