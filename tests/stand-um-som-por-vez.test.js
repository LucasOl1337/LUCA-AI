import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

// Lucas, 23/10: "tem alguma coisa no sistema que às vezes faz sobreposição de
// som, e isso tá terrível, tem que ser anulado". Um som por vez: fala nova para
// a anterior, efeito espera a fala, alarme de sono corta a fala e toca sozinho.

const original = { window: globalThis.window, fetch: globalThis.fetch, WebSocket: globalThis.WebSocket };
afterEach(() => Object.assign(globalThis, original));
globalThis.window ??= globalThis;

// Um bundle só: sessão e barramento precisam do mesmo EventTarget.
const { SessaoTurnos, emitirEventoStand, FilaDeVoz } = await loadFrontendModule('./um-som-por-vez-entry.ts');
const { criarSomCompartilhado } = await loadFrontendModule('../../src/components/gameplay/somCompartilhado.ts');
const { criarSonoCabine } = await loadFrontendModule('../../src/components/gameplay/sonoCabine.ts');
const { criarBarramento } = await loadFrontendModule('../../src/components/stand/canal.ts');
const { ligarUmSomPorVez } = await loadFrontendModule('../../src/components/stand/umSomPorVez.ts');

const PCM = Buffer.from(new Int16Array(2400).fill(1000).buffer).toString('base64');
const tique = () => new Promise((ok) => setImmediate(ok));

/** AudioContext mínimo que registra start/stop de cada fonte no relógio de áudio. */
function contextoDeAudio() {
  const linha = [];
  const contexto = {
    state: 'running', currentTime: 0, destination: {},
    createBuffer: (_c, n, hz) => ({ duration: n / hz, copyToChannel() {} }),
    createBufferSource() {
      const fonte = { connect() {}, onended: null, start(t) { fonte.inicio = t; linha.push(['start', t]); }, stop() { linha.push(['stop', fonte.inicio]); } };
      return fonte;
    },
  };
  return { contexto, linha, saida: { gain: { value: 1 } } };
}

test('FilaDeVoz: corte para todas as fontes e a fala nova começa agora, não depois da antiga', () => {
  const { contexto, linha, saida } = contextoDeAudio();
  const fila = new FilaDeVoz({ contexto, saida });
  fila.tocar(PCM); fila.tocar(PCM); fila.tocar(PCM);
  assert.equal(linha.filter(([o]) => o === 'start').length, 3);
  fila.cortar();
  assert.equal(linha.filter(([o]) => o === 'stop').length, 3, 'nenhuma fonte velha pode seguir soando');
  assert.equal(fila.tocando, false);
  contexto.currentTime = 0.05;
  const inicio = fila.tocar(PCM);
  assert.ok(inicio < 0.1, `fala nova agendada em ${inicio}s: não pode ir para a fila da antiga`);
});

/** Sessão pronta com Scribe falso, áudio emprestado e fetch controlado pelo teste. */
async function sessaoPronta() {
  const relogios = new Map();
  let id = 0;
  globalThis.window = Object.assign(globalThis.window ?? {}, {
    setTimeout: (fn, ms) => { relogios.set(++id, fn); return id; },
    clearTimeout: (n) => relogios.delete(n),
    setInterval: () => 0, clearInterval() {}, addEventListener() {}, removeEventListener() {},
  });
  globalThis.WebSocket = class {
    static OPEN = 1;
    readyState = 1;
    constructor() { queueMicrotask(() => this.onopen()); }
    send() {}
    close() {}
  };
  const { contexto, linha, saida } = contextoDeAudio();
  const audio = { contexto, saida, ouvir() {}, medirNivel: () => () => {} };
  const corpos = [];
  globalThis.fetch = async (_url, { body, signal }) => {
    const pedido = JSON.parse(body);
    if (pedido.evento === 'fim') return new Response('');
    let controlador;
    const stream = new ReadableStream({ start(c) { controlador = c; } });
    signal?.addEventListener('abort', () => { try { controlador.error(new DOMException('abort', 'AbortError')); } catch { /* fechado */ } });
    const corpo = {
      pedido,
      linha(obj) { try { controlador.enqueue(new TextEncoder().encode(`${JSON.stringify(obj)}\n`)); } catch { /* abortado */ } },
      fechar() { try { controlador.close(); } catch { /* abortado */ } },
    };
    corpos.push(corpo);
    return new Response(stream);
  };
  const sessao = new SessaoTurnos();
  await sessao.iniciar({ conversa_id: 'fixture', limites: { silencio_s: 20, teto_s: 240 }, conexao: { transporte: 'scribe', url: 'ws://fixture' } }, { audio, drenar: () => [] });
  return { sessao, linha, corpos, saida };
}

test('turno novo durante a fala: a anterior para antes da nova começar; áudio atrasado do turno abortado não toca', async () => {
  const { sessao, linha, corpos } = await sessaoPronta();
  void sessao.perguntar({ texto: 'Como funciona o LUCA?' });
  await tique();
  corpos[0].linha({ t: 'audio', pcm: PCM });
  corpos[0].linha({ t: 'audio', pcm: PCM });
  await tique(); await tique();
  assert.equal(linha.filter(([o]) => o === 'start').length, 2);
  assert.equal(sessao.estado, 'falando');

  void sessao.perguntar({ texto: 'Quanto custa o trator?' });
  await tique();
  // Pedaço do turno velho chegando atrasado, já com o novo no ar.
  corpos[0].linha({ t: 'audio', pcm: PCM });
  corpos[1].linha({ t: 'audio', pcm: PCM });
  await tique(); await tique();
  const ordem = linha.map(([o]) => o);
  assert.deepEqual(ordem, ['start', 'start', 'stop', 'stop', 'start'], 'duas fontes velhas param, só uma nova começa');
  corpos[1].fechar();
  sessao.encerrar();
});

test('alarme de sono corta a fala (para, não abaixa), aborta o turno e nada fala por cima até ele parar', async () => {
  const { sessao, linha, corpos, saida } = await sessaoPronta();
  void sessao.perguntar({ texto: 'O que é sonolência?' });
  await tique();
  corpos[0].linha({ t: 'audio', pcm: PCM });
  await tique(); await tique();
  assert.equal(sessao.estado, 'falando');

  emitirEventoStand({ tipo: 'alarme_sono', ativo: true });
  assert.deepEqual(linha.map(([o]) => o), ['start', 'stop'], 'a fala para na hora');
  assert.equal(sessao.estado, 'ouvindo');
  assert.equal(saida.gain.value, 1, 'cortar não é abaixar');
  // Pedaço atrasado do turno cortado, pergunta do menu e transcrição do próprio bipe: nada toca.
  corpos[0].linha({ t: 'audio', pcm: PCM });
  emitirEventoStand({ tipo: 'pergunta_texto', texto: 'Explica de novo' });
  sessao.aoScribe({ message_type: 'committed_transcript', text: 'Bip bip bip bip' });
  await tique(); await tique();
  assert.equal(linha.length, 2);
  assert.equal(corpos.length, 1, 'nenhum turno novo durante o alarme');

  emitirEventoStand({ tipo: 'alarme_sono', ativo: false });
  sessao.aoScribe({ message_type: 'committed_transcript', text: 'Como eu desligo o alarme?' });
  await tique();
  assert.equal(corpos.length, 2, 'alarme desligado: a conversa volta');
  corpos[1].fechar();
  sessao.encerrar();
});

/** Contexto falso com ganho que registra o valor efetivo. */
function contextoDeEfeitos() {
  class Contexto {
    constructor() { this.state = 'running'; this.currentTime = 0; this.destination = { nome: 'destino' }; }
    createGain() {
      const ctx = this;
      return { context: ctx, gain: { value: 1, cancelScheduledValues() {}, setValueAtTime(v) { this.value = v; } }, connect(d) { this.ligado = d; return d; } };
    }
  }
  return Contexto;
}

test('efeitos da cabine esperam a fala: chave mestre muda com a Coruja falando e volta quando ela termina', () => {
  const som = criarSomCompartilhado(contextoDeEfeitos());
  som.segurar(true); // antes do contexto existir: vale quando ele nascer
  const mestre = som.destino();
  assert.equal(mestre.ligado.nome, 'destino');
  assert.equal(mestre.gain.value, 0);
  som.segurar(false);
  assert.equal(mestre.gain.value, 1);
  assert.equal(som.destino(), mestre, 'uma chave só por contexto');
});

test('Totem: estado falando segura os efeitos; alarme de sono solta, avisa a sessão e manda na fala', () => {
  const canal = criarBarramento();
  const avisos = [];
  const enviar = canal.enviar.bind(canal);
  canal.enviar = (e) => { avisos.push(e); enviar(e); };
  const segurados = [];
  const som = { segurar: (v) => segurados.push(v) };
  const sono = criarSonoCabine();
  const desligar = ligarUmSomPorVez(canal, { som, sono });

  canal.emitir({ tipo: 'estado', valor: 'falando' });
  canal.emitir({ tipo: 'estado', valor: 'ouvindo' });
  assert.deepEqual(segurados, [true, false]);

  canal.emitir({ tipo: 'estado', valor: 'falando' });
  sono.definir({ status: 'closed', closedMs: 600 });
  assert.deepEqual(avisos, [], 'olho fechado sem alarme ainda não corta nada');
  sono.definir({ status: 'alarm', closedMs: 1000 });
  assert.deepEqual(avisos, [{ tipo: 'alarme_sono', ativo: true }]);
  assert.equal(segurados.at(-1), false, 'o alarme toca: efeitos soltos');
  canal.emitir({ tipo: 'estado', valor: 'falando' });
  assert.equal(segurados.at(-1), false, 'nem uma fala atrasada segura o alarme');
  sono.definir({ status: 'alarm', closedMs: 1500 });
  assert.equal(avisos.length, 1, 'o alarme avisa uma vez');
  sono.definir({ status: 'open', closedMs: 0 });
  assert.deepEqual(avisos.at(-1), { tipo: 'alarme_sono', ativo: false });

  sono.definir({ status: 'alarm', closedMs: 1000 });
  desligar();
  assert.deepEqual(avisos.at(-1), { tipo: 'alarme_sono', ativo: false }, 'sair da página não deixa a sessão presa no alarme');
});
