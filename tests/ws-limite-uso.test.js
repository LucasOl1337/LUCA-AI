import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import WebSocket from 'ws';
import { runtime, temporary } from './support/cli.js';

// Runtime local isolado (mesmo do teste do CLI): nunca contra produção.
// A2: o handshake recusado com 1013 pelo teto por conta não conta uso nem reescreve o auth-store.
async function entrar(url, corpo) {
  const resposta = await fetch(`${url}/api/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo),
  });
  assert.ok(resposta.ok, `register: ${resposta.status}`);
  return resposta.headers.get('set-cookie').split(';')[0];
}

async function conectar(url, cookie) {
  const ws = new WebSocket(`${url.replace('http', 'ws')}/ws`, { headers: { cookie, origin: url } });
  const resultado = await new Promise((ok, falha) => {
    ws.once('message', (dados) => ok({ aceito: JSON.parse(String(dados)).kind === 'state' }));
    ws.once('close', (codigo) => ok({ aceito: false, codigo }));
    ws.once('error', falha);
  });
  return { ws, ...resultado };
}

test('/ws: recusa por teto (1013) não muda websocketCount nem grava o auth-store', { timeout: 30000 }, async (t) => {
  const diretorio = await temporary(t);
  const url = await runtime(t, diretorio, { LUCA_WS_MAX_POR_CONTA: '2' });
  const arquivo = path.join(diretorio, 'runtime', 'auth.json');
  const cookie = await entrar(url, { name: 'Teto', email: 'teto@uso.test', password: 'teto-senha-123' });
  const abertos = [];
  t.after(() => { for (const c of abertos) c.ws.close(); });

  for (let i = 0; i < 2; i += 1) {
    const c = await conectar(url, cookie);
    abertos.push(c);
    assert.equal(c.aceito, true);
  }
  const contagem = async () => JSON.parse(await fs.readFile(arquivo, 'utf8')).users.find((u) => u.email === 'teto@uso.test').usage.websocketCount;
  assert.equal(await contagem(), 2, 'socket aceito conta uso');
  const antes = await fs.readFile(arquivo, 'utf8');
  const mtimeAntes = (await fs.stat(arquivo)).mtimeMs;

  for (let i = 0; i < 5; i += 1) {
    const recusado = await conectar(url, cookie);
    assert.equal(recusado.aceito, false);
    assert.equal(recusado.codigo, 1013);
  }

  assert.equal(await contagem(), 2, 'recusa por teto não infla websocketCount');
  assert.equal(await fs.readFile(arquivo, 'utf8'), antes, 'auth-store não foi reescrito');
  assert.equal((await fs.stat(arquivo)).mtimeMs, mtimeAntes);
});
