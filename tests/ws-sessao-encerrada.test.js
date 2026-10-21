import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import WebSocket from 'ws';
import { runtime, temporary } from './support/cli.js';

// Runtime local isolado (mesmo do teste do CLI): nunca contra produção.
const retrato = (x) => ({
  versao: 1, fase: 'dirigindo', tempoMs: 1000, maquina: { x, z: 15, rumoGraus: 0, velocidadeKph: 8, re: false },
  comandos: { esterco: 0, acelerador: 0.5, freio: 0 }, sensor: { distanciaCm: 400, eco: false, alerta: false },
  atitude: { rolagemGraus: 0, arfagemGraus: 0 }, contato: false, tetoKph: 12,
});

async function entrar(url, rota, corpo) {
  const resposta = await fetch(`${url}/api/auth/${rota}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo),
  });
  assert.ok(resposta.ok, `${rota}: ${resposta.status}`);
  return resposta.headers.get('set-cookie').split(';')[0];
}

async function conectar(url, cookie) {
  const ws = new WebSocket(`${url.replace('http', 'ws')}/ws`, { headers: { cookie, origin: url } });
  const retratos = [];
  const fechou = new Promise((ok) => ws.once('close', (codigo, motivo) => ok({ codigo, motivo: String(motivo) })));
  ws.on('message', (dados) => { const m = JSON.parse(String(dados)); if (m.kind === 'gameplay:retrato') retratos.push(m); });
  await once(ws, 'open');
  return { ws, retratos, fechou };
}

/** Espera o retrato `x` chegar (evento, não prazo); o timeout do teste é o teto. */
async function esperarRetrato(cliente, x) {
  while (!cliente.retratos.some((m) => m.estado.maquina.x === x)) await once(cliente.ws, 'message');
}

test('/ws: logout de uma sessão fecha só os sockets dela (4401); a outra sessão da conta segue recebendo', { timeout: 30000 }, async (t) => {
  const url = await runtime(t, await temporary(t));
  const conta = { email: 'feira@sessao.test', password: 'sessao-senha-123' };
  const cookieTotem = await entrar(url, 'register', { name: 'Totem', ...conta });
  const cookieA = await entrar(url, 'login', conta);
  const cookieB = await entrar(url, 'login', conta);

  const totem = await conectar(url, cookieTotem);
  const tabletA1 = await conectar(url, cookieA);
  const tabletA2 = await conectar(url, cookieA);
  const tabletB = await conectar(url, cookieB);
  t.after(() => { for (const c of [totem, tabletA1, tabletA2, tabletB]) c.ws.close(); });

  totem.ws.send(JSON.stringify({ kind: 'gameplay:retrato', estado: retrato(10) }));
  await Promise.all([esperarRetrato(tabletA1, 10), esperarRetrato(tabletB, 10)]);

  const saida = await fetch(`${url}/api/auth/logout`, { method: 'POST', headers: { cookie: cookieA, origin: url } });
  assert.equal(saida.status, 200);
  const [f1, f2] = await Promise.all([tabletA1.fechou, tabletA2.fechou]);
  assert.deepEqual(f1, { codigo: 4401, motivo: 'sessao_encerrada' }, 'os dois sockets da sessão A fecham com 4401');
  assert.deepEqual(f2, { codigo: 4401, motivo: 'sessao_encerrada' });

  // Sessão B e o totem da mesma conta continuam abertos e o retrato segue chegando.
  assert.equal(tabletB.ws.readyState, WebSocket.OPEN);
  assert.equal(totem.ws.readyState, WebSocket.OPEN);
  // Outro socket do totem (mesma sessão): o teto de 5 Hz é por socket, então o envio não depende de relógio.
  const totem2 = await conectar(url, cookieTotem);
  t.after(() => totem2.ws.close());
  totem2.ws.send(JSON.stringify({ kind: 'gameplay:retrato', estado: retrato(11) }));
  await esperarRetrato(tabletB, 11);
  await esperarRetrato(totem, 11);

  // Sessão revogada não reabre: o handshake recusa (sem 4401 em loop).
  const recusa = new WebSocket(`${url.replace('http', 'ws')}/ws`, { headers: { cookie: cookieA, origin: url } });
  const [erro] = await once(recusa, 'error');
  assert.match(String(erro.message), /401/);
});
