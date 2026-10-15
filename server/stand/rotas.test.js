import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { cabecalhosDeSeguranca } from '../cabecalhos-seguranca.js';
import { corpoDoToken, criarGuardaDeSessoes, registerStandRoutes } from './rotas.js';

const CHAVE = 'sk-teste-nao-real';

async function subir(t, { env = {}, fetchImpl, guarda } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.auth = { user: { id: req.headers['x-conta'] || 'demo' } }; next(); });
  registerStandRoutes(app, { env, fetchImpl, guarda });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((ok) => server.once('listening', ok));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  return (caminho, corpo, headers = {}) => fetch(base + caminho, corpo === undefined
    ? { headers }
    : { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(corpo) });
}

test('sem chave: sessão responde 503 stand_desligado e status mostra desligado', async (t) => {
  const pedir = await subir(t);
  const sessao = await pedir('/api/stand/sessao', {});
  assert.equal(sessao.status, 503);
  assert.deepEqual(await sessao.json(), { ok: false, error: 'stand_desligado' });
  const status = await (await pedir('/api/stand/status')).json();
  assert.equal(status.ligado, false);
  assert.deepEqual(status.limites, { silencio_s: 20, teto_s: 240, sessoes_por_hora: 30 });
});

test('com chave: pede token efêmero configurado e nunca devolve a chave', async (t) => {
  const pedidos = [];
  const fetchImpl = async (url, init) => {
    pedidos.push({ url, init });
    return new Response(JSON.stringify({ value: 'ek_efemero', expires_at: 1760000000 }), { status: 200 });
  };
  const pedir = await subir(t, { env: { OPENAI_API_KEY: CHAVE }, fetchImpl });
  const resposta = await pedir('/api/stand/sessao', {});
  const texto = await resposta.text();
  assert.equal(resposta.status, 200);
  assert.ok(!texto.includes(CHAVE));
  assert.deepEqual(JSON.parse(texto), { ok: true, token: 'ek_efemero', expira_em: 1760000000, modelo: 'gpt-realtime', limites: { silencio_s: 20, teto_s: 240, sessoes_por_hora: 30 } });
  assert.equal(pedidos[0].url, 'https://api.openai.com/v1/realtime/client_secrets');
  assert.equal(pedidos[0].init.headers.Authorization, `Bearer ${CHAVE}`);
  const corpo = JSON.parse(pedidos[0].init.body);
  assert.equal(corpo.session.audio.input.turn_detection.type, 'server_vad');
  assert.deepEqual(corpo.session.tools.map((f) => f.name), ['buscar_no_repo', 'pesquisar_web', 'tocar_video', 'acao_site']);
});

test('provedor recusa ou cai: 502 sem vazar detalhe da chave', async (t) => {
  const recusa = async () => new Response(JSON.stringify({ error: { code: 'invalid_api_key', message: `chave ${CHAVE}` } }), { status: 401 });
  const pedir = await subir(t, { env: { OPENAI_API_KEY: CHAVE }, fetchImpl: recusa });
  const r = await pedir('/api/stand/sessao', {});
  assert.equal(r.status, 502);
  assert.ok(!(await r.text()).includes(CHAVE));
  const cai = async () => { throw new TypeError('fetch failed'); };
  const pedir2 = await subir(t, { env: { OPENAI_API_KEY: CHAVE }, fetchImpl: cai });
  assert.equal((await (await pedir2('/api/stand/sessao', {})).json()).error, 'stand_provedor_indisponivel');
});

test('teto de 30 sessões por hora por conta, janela deslizante', async (t) => {
  let agora = 0;
  const guarda = criarGuardaDeSessoes({ teto: 2, agora: () => agora });
  const fetchImpl = async () => new Response(JSON.stringify({ value: 'ek' }), { status: 200 });
  const pedir = await subir(t, { env: { OPENAI_API_KEY: CHAVE }, fetchImpl, guarda });
  assert.equal((await pedir('/api/stand/sessao', {})).status, 200);
  assert.equal((await pedir('/api/stand/sessao', {})).status, 200);
  assert.equal((await pedir('/api/stand/sessao', {})).status, 429);
  assert.equal((await pedir('/api/stand/sessao', {}, { 'x-conta': 'outra' })).status, 200);
  agora = 60 * 60 * 1000;
  assert.equal((await pedir('/api/stand/sessao', {})).status, 200);
  assert.equal(criarGuardaDeSessoes().usadas('x'), 0);
});

test('ferramenta: executa as válidas e recusa desconhecida com 400', async (t) => {
  const pedir = await subir(t);
  const ok = await pedir('/api/stand/ferramenta', { nome: 'acao_site', args: { acao: 'abrir_aba' } });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).evento.tipo, 'acao_site');
  assert.equal((await pedir('/api/stand/ferramenta', { nome: 'shell', args: {} })).status, 400);
});

test('corpo do token leva o prompt-base em PT-BR', () => {
  const corpo = corpoDoToken({ modelo: 'm', voz: 'v' });
  assert.match(corpo.session.instructions, /operador LUCA/);
  assert.equal(corpo.session.audio.output.voice, 'v');
});

test('microfone e api.openai.com só liberados em /stand', () => {
  const stand = cabecalhosDeSeguranca('/stand');
  assert.equal(stand['Permissions-Policy'], 'camera=(), microphone=(self), geolocation=()');
  assert.match(stand['Content-Security-Policy'], /connect-src 'self' ws: wss: https:\/\/api\.openai\.com;/);
  for (const caminho of ['/', '/api/stand/sessao', '/stand/outra', '/standx']) {
    const h = cabecalhosDeSeguranca(caminho);
    assert.equal(h['Permissions-Policy'], 'camera=(), microphone=(), geolocation=()', caminho);
    assert.doesNotMatch(h['Content-Security-Policy'], /openai/, caminho);
  }
  assert.equal(cabecalhosDeSeguranca('/sonolencia')['Permissions-Policy'], 'camera=(self), microphone=(), geolocation=()');
  assert.match(cabecalhosDeSeguranca('/assets/drowsiness-worker-ab1.js')['Content-Security-Policy'], /wasm-unsafe-eval/);
});
