import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { criarAmostras } from './voz-amostras.js';
import { registerStandRoutes } from './rotas.js';
import { criarTetoDiario } from './teto-diario.js';

test('amostra autenticada, whitelist e cache em disco sobrevivem a novo serviço', async (t) => {
  const diretorio = await fs.mkdtemp(path.join(os.tmpdir(), 'voz-amostras-'));
  t.after(() => fs.rm(diretorio, { recursive: true, force: true }));
  let chamadas = 0;
  const app = express();
  app.use((req, _res, next) => { if (req.headers['x-login']) req.auth = { user: { id: 'teste' } }; next(); });
  registerStandRoutes(app, {
    env: { ELEVENLABS_API_KEY: 'teste' }, teto: criarTetoDiario(),
    configTotem: { obter: () => 'otto' },
    amostras: criarAmostras({ diretorio, converter: async () => Buffer.from('MP3-teste') }),
    fetchImpl: async () => { chamadas++; return new Response(new Uint8Array([1, 0, 2, 0])); },
  });
  const servidor = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => servidor.once('listening', resolve));
  t.after(() => servidor.close());
  const url = `http://127.0.0.1:${servidor.address().port}/api/stand/voz-amostra/`;
  assert.equal((await fetch(url + 'otto')).status, 401);
  assert.equal((await fetch(url + 'id-arbitrario', { headers: { 'x-login': '1' } })).status, 400);
  const respostas = await Promise.all([1, 2].map(() => fetch(url + 'otto', { headers: { 'x-login': '1' } })));
  for (const r of respostas) { assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /audio\/mpeg/); assert.equal(await r.text(), 'MP3-teste'); }
  assert.equal(chamadas, 1, 'concorrência não duplica síntese');
  await fetch(url + 'otto', { headers: { 'x-login': '1' } });
  assert.equal(chamadas, 1, 'segunda chamada usa disco');
  const novo = criarAmostras({ diretorio });
  const salvo = await novo('otto', 'ycxdm1PRMs962FxyyuJ0:eleven_turbo_v2_5', () => { throw new Error('não pode sintetizar'); });
  assert.equal(salvo.toString(), 'MP3-teste');
});
