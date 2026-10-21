import assert from 'node:assert/strict';
import test from 'node:test';
import net from 'node:net';
import { once } from 'node:events';
import { setTimeout as esperar } from 'node:timers/promises';
import WebSocket from 'ws';
import { runtime, temporary } from './support/cli.js';

// A1 da revisão do item 1 (prova do zebra em arquivos/luca-revisao/ws-fantasma.test.mjs),
// com o pulso curto por env para não esperar 30 s. Runtime local isolado, nunca produção.
// Sem heartbeat: 8 sockets meio-abertos ocupam o teto e o aparelho que volta leva 1013.
const PULSO_MS = 300;

async function entrar(url, email) {
  const r = await fetch(`${url}/api/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Feira', email, password: 'fantasma-senha-123' }),
  });
  assert.ok(r.ok, `register: ${r.status}`);
  return r.headers.get('set-cookie').split(';')[0];
}

/** Proxy TCP que "corta o Wi-Fi": para de repassar sem fechar nada (meio-aberto, sem FIN). */
async function proxyCongelavel(destinoPorta) {
  const pares = [];
  const servidor = net.createServer((cliente) => {
    const origem = net.connect(destinoPorta, '127.0.0.1');
    cliente.pipe(origem); origem.pipe(cliente);
    cliente.on('error', () => {}); origem.on('error', () => {});
    pares.push({ cliente, origem });
  }).listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  return {
    porta: servidor.address().port,
    congelar() {
      for (const { cliente, origem } of pares) { cliente.unpipe(origem); origem.unpipe(cliente); cliente.pause(); origem.pause(); }
    },
    fechar() { for (const { cliente, origem } of pares) { cliente.destroy(); origem.destroy(); } servidor.close(); },
  };
}

function conectar(porta, cookie, origin) {
  const ws = new WebSocket(`ws://127.0.0.1:${porta}/ws`, { headers: { cookie, origin } });
  ws.on('error', () => {});
  return new Promise((ok) => {
    ws.once('message', (d) => ok({ ws, aceito: JSON.parse(String(d)).kind === 'state' }));
    ws.once('close', (codigo) => ok({ ws, aceito: false, codigo }));
  });
}

test('/ws: heartbeat derruba socket meio-aberto e devolve a vaga do teto de 8', { timeout: 30_000 }, async (t) => {
  const url = await runtime(t, await temporary(t), { LUCA_WS_PULSO_MS: String(PULSO_MS) });
  const porta = Number(new URL(url).port);
  const cookie = await entrar(url, 'fantasma@limite.test');
  const proxy = await proxyCongelavel(porta);
  t.after(() => proxy.fechar());

  // Socket vivo de outra conta: recebe ping e, respondendo pong (o `ws` responde sozinho), não cai.
  const vivo = await conectar(porta, await entrar(url, 'vivo@limite.test'), url);
  t.after(() => vivo.ws.terminate());
  let pings = 0;
  vivo.ws.on('ping', () => { pings += 1; });

  const fantasmas = [];
  for (let i = 0; i < 8; i += 1) {
    const c = await conectar(proxy.porta, cookie, url);
    assert.equal(c.aceito, true, `aparelho ${i + 1} entra`);
    fantasmas.push(c);
  }
  const nono = await conectar(porta, cookie, url);
  assert.equal(nono.codigo, 1013, 'teto cheio antes do corte');
  proxy.congelar();

  await esperar(PULSO_MS * 4);

  const devolta = await conectar(porta, cookie, url);
  t.after(() => devolta.ws.terminate());
  assert.equal(devolta.aceito, true, `aparelho que voltou levou ${devolta.codigo} com 8 sockets meio-abertos`);
  assert.ok(pings >= 2, `o servidor mandou ${pings} pings em ${PULSO_MS * 4} ms`);
  assert.equal(vivo.ws.readyState, WebSocket.OPEN, 'quem responde pong segue conectado');
});
