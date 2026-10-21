import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import WebSocket from 'ws';
import { runtime, temporary } from './support/cli.js';

// Runtime local isolado (mesmo do teste do CLI): nunca contra produção.
async function entrar(url, rota, corpo) {
  const resposta = await fetch(`${url}/api/auth/${rota}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo),
  });
  assert.ok(resposta.ok, `${rota}: ${resposta.status}`);
  return resposta.headers.get('set-cookie').split(';')[0];
}

/** Abre e espera o primeiro evento decisivo: o `state` inicial (aceito) ou o close (recusado). */
async function conectar(url, cookie) {
  const ws = new WebSocket(`${url.replace('http', 'ws')}/ws`, { headers: { cookie, origin: url } });
  const resultado = await new Promise((ok, falha) => {
    ws.once('message', (dados) => ok({ aceito: JSON.parse(String(dados)).kind === 'state' }));
    ws.once('close', (codigo, motivo) => ok({ aceito: false, codigo, motivo: String(motivo) }));
    ws.once('error', falha);
  });
  return { ws, ...resultado };
}

test('/ws: teto de 8 sockets por conta; o 9º fecha com 1013 e a vaga volta quando um sai', { timeout: 30000 }, async (t) => {
  const url = await runtime(t, await temporary(t));
  const cookieA = await entrar(url, 'register', { name: 'Feira', email: 'feira@limite.test', password: 'limite-senha-123' });
  const cookieB = await entrar(url, 'register', { name: 'Outra', email: 'outra@limite.test', password: 'limite-senha-456' });
  const abertos = [];
  t.after(() => { for (const c of abertos) c.ws.close(); });

  for (let i = 0; i < 8; i += 1) {
    const c = await conectar(url, cookieA);
    abertos.push(c);
    assert.equal(c.aceito, true, `socket ${i + 1} de 8 entra`);
  }

  const nono = await conectar(url, cookieA);
  assert.equal(nono.aceito, false);
  assert.equal(nono.codigo, 1013);
  assert.equal(nono.motivo, 'limite de 8 conexoes por conta');

  // Outra conta não divide o teto.
  const outra = await conectar(url, cookieB);
  abertos.push(outra);
  assert.equal(outra.aceito, true);

  // Um tablet sai: a vaga volta sem esperar nada além do close.
  const saindo = abertos.shift();
  saindo.ws.close();
  await once(saindo.ws, 'close');
  const devolta = await conectar(url, cookieA);
  abertos.push(devolta);
  assert.equal(devolta.aceito, true);
});
