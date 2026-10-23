import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { criarConfigTotem } from './config-totem.js';
import { registerStandRoutes } from './rotas.js';
import { criarTetoDiario } from './teto-diario.js';
import { VOZES_STAND } from './provedor-elevenlabs.js';

test('padrão global: admin salva, outro login usa, reinício persiste; usuário 403 e inválida 400', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voz-global-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const arquivo = path.join(dir, 'totem-config.json');
  const configTotem = criarConfigTotem({ arquivo });
  assert.equal(configTotem.obter(), 'otto');
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.auth = { user: { id: req.headers['x-user'] || 'visitante', role: req.headers['x-role'] || 'user' } }; next(); });
  registerStandRoutes(app, { configTotem, teto: criarTetoDiario(), env: { ELEVENLABS_API_KEY: 'teste' },
    criarRoteador: async () => ({ preaquecer() {} }),
    fetchImpl: async (url) => new Response(JSON.stringify(String(url).includes('single-use-token') ? { token: 't' } : { voices: [{ name: 'Lucas Oliveira', voice_id: 'AbCdEfGhIjKlMnOpQrSt' }] })),
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const mudar = (voz, role) => fetch(base + '/api/stand/voz-padrao', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-role': role }, body: JSON.stringify({ totemDefaultVoice: voz }) });
  assert.equal((await mudar('vanessa', 'user')).status, 403);
  assert.equal((await mudar('id-arbitrario', 'admin')).status, 400);
  assert.equal((await mudar('vanessa', 'admin')).status, 200);
  assert.equal(criarConfigTotem({ arquivo }).obter(), 'vanessa');
  const status = await (await fetch(base + '/api/stand/status', { headers: { 'x-user': 'outra-conta' } })).json();
  assert.equal(status.totemDefaultVoice, 'vanessa');
  assert.deepEqual(status.vozes.filter((v) => v.padrao).map((v) => v.chave), ['vanessa']);
  assert.deepEqual(status.vozes.map((v) => v.chave), Object.keys(VOZES_STAND));
  const sessao = async (voz) => (await fetch(base + '/api/stand/sessao', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user': 'outro-navegador' }, body: JSON.stringify({ voz }) })).json();
  assert.equal((await sessao(null)).voz, 'vanessa');
  assert.equal((await sessao('lucas')).voz, 'lucas');
  assert.equal((await sessao('otto')).voz, 'otto');
  assert.equal((await sessao('invalida')).voz, 'vanessa');
});

test('preferência local antiga só era gravada por clique; catálogo não se duplica no frontend', async () => {
  const { lerVozEscolhida, gravarVozEscolhida } = await import('../../src/stand-voz/vozEscolhida.ts');
  const dados = new Map();
  const anterior = globalThis.window;
  globalThis.window = { localStorage: { getItem: (k) => dados.get(k) ?? null, setItem: (k, v) => dados.set(k, v), removeItem: (k) => dados.delete(k) } };
  try {
    assert.equal(lerVozEscolhida(), null);
    assert.equal(dados.size, 0, 'ler não grava preferência implícita');
    gravarVozEscolhida('lucas');
    assert.equal(lerVozEscolhida(), 'lucas', 'clique explícito antigo é preservado');
    gravarVozEscolhida(null);
    assert.equal(lerVozEscolhida(), null, 'seguir padrão remove a preferência');
  } finally { globalThis.window = anterior; }
  const raiz = new URL('../../', import.meta.url);
  const componente = fs.readFileSync(new URL('src/components/totem/SeletorVoz.tsx', raiz), 'utf8');
  const preferencia = fs.readFileSync(new URL('src/stand-voz/vozEscolhida.ts', raiz), 'utf8');
  assert.ok(!preferencia.includes('VOZES_TOTEM'));
  assert.ok(!preferencia.includes('Lucas Oliveira'));
  assert.ok(componente.includes('setVozes(dados.vozes || [])'));
  assert.ok(preferencia.includes("const ARMAZENAMENTO = 'luca:totem:voz'"));
  assert.ok(preferencia.includes('return window.localStorage.getItem(ARMAZENAMENTO) || null'));
});
