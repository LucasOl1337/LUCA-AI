import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
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

async function conectar(url, cookie, origem) {
  const ws = new WebSocket(`${url.replace('http', 'ws')}/ws`, { headers: { cookie, ...(origem ? { origin: origem } : {}) } });
  const retratos = [];
  ws.on('message', (dados) => { const m = JSON.parse(String(dados)); if (m.kind === 'gameplay:retrato') retratos.push(m); });
  await once(ws, 'open');
  return { ws, retratos };
}

test('/ws repassa o retrato do gameplay só para a mesma conta', { timeout: 30000 }, async (t) => {
  const url = await runtime(t, await temporary(t));
  const senhaA = 'ao-vivo-senha-a-123', senhaB = 'ao-vivo-senha-b-456';
  const cookieTotem = await entrar(url, 'register', { name: 'Totem', email: 'totem@ao-vivo.test', password: senhaA });
  const cookieB = await entrar(url, 'register', { name: 'Outra conta', email: 'outra@ao-vivo.test', password: senhaB });
  const cookieTablet = await entrar(url, 'login', { email: 'totem@ao-vivo.test', password: senhaA });

  const totem = await conectar(url, cookieTotem, url);
  const tablet = await conectar(url, cookieTablet, url);
  const outra = await conectar(url, cookieB, url);
  const intruso = await conectar(url, cookieTotem, 'https://mal.example');
  t.after(() => { for (const c of [totem, tablet, outra, intruso]) c.ws.close(); });

  totem.ws.send(JSON.stringify({ kind: 'gameplay:retrato', estado: { ...retrato(20), extra: 'nao-repassa' } }));
  outra.ws.send(JSON.stringify({ kind: 'gameplay:retrato', estado: retrato(-5) }));
  intruso.ws.send(JSON.stringify({ kind: 'gameplay:retrato', estado: retrato(77) }));
  totem.ws.send(JSON.stringify({ kind: 'state', state: {} }));
  await delay(400);

  assert.equal(tablet.retratos.length, 1, 'o tablet da conta A recebe um retrato do totem');
  assert.equal(tablet.retratos[0].estado.maquina.x, 20);
  assert.equal(tablet.retratos[0].estado.extra, undefined);
  assert.equal(outra.retratos.length, 0, 'a conta B não recebe o retrato da A');
  assert.equal(totem.retratos.length, 0, 'o remetente não recebe o próprio retrato');
  assert.ok(!tablet.retratos.some((m) => m.estado.maquina.x === 77), 'origem estranha não escreve');

  // Tablet que abre depois começa com o último retrato da conta; a B continua sem nada.
  const tarde = await conectar(url, cookieTablet);
  t.after(() => tarde.ws.close());
  await delay(200);
  assert.equal(tarde.retratos.at(-1)?.estado.maquina.x, 20);
  assert.equal(outra.retratos.length, 0);

  // Aba do totem oculta (item 7): `oculto` booleano passa; outro tipo derruba o retrato inteiro.
  await delay(250);
  totem.ws.send(JSON.stringify({ kind: 'gameplay:retrato', estado: retrato(21), oculto: 'talvez' }));
  await delay(250);
  totem.ws.send(JSON.stringify({ kind: 'gameplay:retrato', estado: retrato(22), oculto: true }));
  await delay(300);
  assert.ok(!tablet.retratos.some((m) => m.estado.maquina.x === 21), 'oculto não booleano é descartado');
  assert.equal(tablet.retratos.at(-1).estado.maquina.x, 22);
  assert.equal(tablet.retratos.at(-1).oculto, true);
});
