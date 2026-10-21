import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { criarReligador, ligarCicloDaPagina } = await loadFrontendModule('../../src/lib/religaWs.ts');

function relogioComPrazos() {
  const fila = new Map();
  const prazos = [];
  let id = 0;
  return {
    agendar: (fn, ms) => { prazos.push(ms); fila.set(++id, fn); return id; },
    cancelar: (i) => { fila.delete(i); },
    pendentes: () => fila.size,
    prazos,
    async disparar() {
      const itens = [...fila.values()];
      fila.clear();
      for (const fn of itens) fn();
      await new Promise((r) => setImmediate(r));
    },
  };
}

const transicao = (tipo, persisted) => Object.assign(new Event(tipo), { persisted });

/**
 * Monta o mesmo fio do useLucaState: o connect abre um socket falso, o close do
 * socket chama `agendar`, e o ciclo da página fecha o socket no pagehide.
 */
function montar() {
  const relogio = relogioComPrazos();
  const janela = new EventTarget();
  const sockets = [];
  const religador = criarReligador(async () => {
    const s = { aberto: true, fechou: null };
    sockets.push(s);
    return true;
  }, relogio, 3000, () => 0.5);
  const fechar = () => {
    const s = sockets.at(-1);
    if (!s?.aberto) return;
    s.aberto = false;
    s.fechou = 1000;
    religador.agendar(); // o listener de close do /ws não olha o código
  };
  const soltar = ligarCicloDaPagina(janela, religador, fechar);
  return { relogio, janela, sockets, religador, soltar };
}

test('pagehide indo para o bfcache (persisted=true) fecha o /ws e não religa enquanto a página está guardada', async () => {
  const { relogio, janela, sockets, religador } = montar();
  await religador.tentar();
  assert.equal(sockets.length, 1);
  janela.dispatchEvent(transicao('pagehide', true));
  assert.equal(sockets[0].aberto, false, 'a vaga do teto por conta volta ao servidor na hora');
  assert.equal(sockets[0].fechou, 1000);
  assert.equal(relogio.pendentes(), 0, 'o close não agenda religação com a página escondida');
  await religador.tentar();
  assert.equal(sockets.length, 1, 'nenhuma tentativa com a página escondida');
});

test('pagehide de descarte (persisted=false) também fecha o /ws', async () => {
  const { relogio, janela, sockets, religador } = montar();
  await religador.tentar();
  janela.dispatchEvent(transicao('pagehide', false));
  assert.equal(sockets[0].aberto, false);
  assert.equal(relogio.pendentes(), 0);
});

test('pageshow vindo do bfcache (persisted=true) religa pelo prazo normal com jitter, uma vez', async () => {
  const { relogio, janela, sockets, religador } = montar();
  await religador.tentar();
  janela.dispatchEvent(transicao('pagehide', true));
  janela.dispatchEvent(transicao('pageshow', true));
  janela.dispatchEvent(transicao('pageshow', true));
  assert.equal(relogio.pendentes(), 1, 'um agendamento só');
  assert.deepEqual(relogio.prazos, [3500], 'RELIGA_MS + jitter, o mesmo caminho do 1013');
  await relogio.disparar();
  assert.equal(sockets.length, 2);
  assert.equal(sockets[1].aberto, true);
});

test('pageshow da primeira carga (persisted=false) não mexe no religador', async () => {
  const { relogio, janela, sockets, religador } = montar();
  await religador.tentar();
  janela.dispatchEvent(transicao('pageshow', false));
  assert.equal(relogio.pendentes(), 0);
  assert.equal(sockets.length, 1);
  assert.equal(sockets[0].aberto, true);
});

test('com o religador parado (provider desmontado) o pageshow não religa', async () => {
  const { relogio, janela, religador } = montar();
  await religador.tentar();
  janela.dispatchEvent(transicao('pagehide', true));
  religador.parar();
  janela.dispatchEvent(transicao('pageshow', true));
  assert.equal(relogio.pendentes(), 0);
});

test('soltar tira os ouvintes: pagehide depois não fecha nada', async () => {
  const { janela, sockets, religador, soltar } = montar();
  await religador.tentar();
  soltar();
  janela.dispatchEvent(transicao('pagehide', true));
  assert.equal(sockets[0].aberto, true);
});

test('fio: o provider do /ws liga o ciclo da página e desliga no cleanup', () => {
  const fonte = readFileSync(new URL('../src/hooks/useLucaState.tsx', import.meta.url), 'utf8');
  assert.match(fonte, /ligarCicloDaPagina\(window, religador,/);
  assert.equal(fonte.match(/soltarCicloDaPagina\(\);/g)?.length, 2, 'os dois cleanups soltam os ouvintes');
  const connect = fonte.slice(fonte.indexOf('async function connect()'), fonte.indexOf('socket = new WebSocket(wsUrl());'));
  assert.match(connect, /if \(religador\.pausado\(\)\) return false;/, 'página escondida no meio do refresh não abre socket');
});
