import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { cabecalhosDeSeguranca } from '../cabecalhos-seguranca.js';
import { credencialXai, provedorXai } from './provedor-xai.js';
import { configStand, criarGuardaDeSessoes, registerStandRoutes } from './rotas.js';

const CHAVE = 'xai-teste-nao-real';
const LIMITES = { silencio_s: 20, teto_s: 240, sessoes_por_hora: 30 };
const roteadorFalso = async () => ({ preaquecer: async () => ({}), rotearPergunta: async (t) => (t.includes('fluxo') ? { id: 'pipeline-completo', confianca: 1, decisao: 'tocar' } : null) });

async function subir(t, { env = {}, fetchImpl, guarda, criarRoteador = roteadorFalso, publicado = () => true } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.auth = { user: { id: req.headers['x-conta'] || 'demo' } }; next(); });
  registerStandRoutes(app, { env, fetchImpl, guarda, criarRoteador, publicado, instrucoes: () => 'prompt-base' });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((ok) => server.once('listening', ok));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  return (caminho, corpo, headers = {}) => fetch(base + caminho, corpo === undefined
    ? { headers }
    : { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(corpo) });
}

const tokenOk = async () => new Response(JSON.stringify({ value: 'xai-realtime-client-secret-abc', expires_at: 1760000000 }), { status: 200 });

test('sem credencial: sessão 503 stand_desligado com motivo; status mostra desligado', async (t) => {
  const pedir = await subir(t);
  const sessao = await pedir('/api/stand/sessao', {});
  assert.equal(sessao.status, 503);
  assert.deepEqual(await sessao.json(), { ok: false, error: 'stand_desligado', motivo: 'sem_credencial' });
  const status = await (await pedir('/api/stand/status')).json();
  assert.equal(status.ligado, false);
  assert.equal(status.provedor, 'xai');
  assert.deepEqual(status.limites, LIMITES);
});

test('com XAI_API_KEY: token efêmero, conexão por subprotocolo e sessão pronta; chave nunca sai', async (t) => {
  const pedidos = [];
  const fetchImpl = async (url, init) => { pedidos.push({ url, init }); return tokenOk(); };
  const pedir = await subir(t, { env: { XAI_API_KEY: CHAVE }, fetchImpl });
  const resposta = await pedir('/api/stand/sessao', {});
  const texto = await resposta.text();
  assert.equal(resposta.status, 200);
  assert.ok(!texto.includes(CHAVE));
  const corpo = JSON.parse(texto);
  assert.equal(corpo.token, 'xai-realtime-client-secret-abc');
  assert.deepEqual(corpo.conexao, { transporte: 'websocket', url: 'wss://api.x.ai/v1/realtime', protocolos: ['xai-client-secret.xai-realtime-client-secret-abc'] });
  assert.equal(corpo.sessao.voice, 'Ara');
  assert.equal(corpo.sessao.instructions, 'prompt-base');
  assert.equal(corpo.sessao.turn_detection.type, 'server_vad');
  assert.ok(corpo.sessao.tools.some((f) => f.name === 'tocar_video'));
  assert.equal(pedidos[0].url, 'https://api.x.ai/v1/realtime/client_secrets');
  assert.equal(pedidos[0].init.headers.Authorization, `Bearer ${CHAVE}`);
});

test('credencial xAI: chave do env, depois auth file lido na hora; expirado vira motivo', () => {
  const arquivo = (expira) => JSON.stringify({ 'https://auth.x.ai::id': { key: 'oauth-key', expires_at: expira } });
  const agora = () => Date.parse('2026-10-15T12:00:00Z');
  assert.deepEqual(credencialXai({ XAI_API_KEY: 'k' }), { chave: 'k', origem: 'api_key' });
  assert.deepEqual(credencialXai({ XAI_OAUTH_AUTH_FILE: '/a' }, { lerArquivo: () => arquivo('2026-10-15T15:00:00Z'), agora }), { chave: 'oauth-key', origem: 'oauth_grok' });
  assert.deepEqual(credencialXai({ XAI_OAUTH_AUTH_FILE: '/a' }, { lerArquivo: () => arquivo('2026-10-15T12:00:10Z'), agora }), { motivo: 'credencial_expirada' });
  assert.deepEqual(credencialXai({ XAI_OAUTH_AUTH_FILE: '/a' }, { lerArquivo: () => { throw new Error('ENOENT'); } }), { motivo: 'auth_file_ilegivel' });
  assert.deepEqual(credencialXai({ XAI_OAUTH_AUTH_FILE: '/a' }, { lerArquivo: () => '{}' }), { motivo: 'auth_file_sem_chave' });
  assert.equal(configStand({ STAND_VOZ_PROVEDOR: 'outro' }).motivo, 'provedor_desconhecido');
});

test('provedor recusa ou cai: 502 sem vazar a chave', async (t) => {
  const recusa = async () => new Response(JSON.stringify({ error: `chave ${CHAVE} inválida` }), { status: 401 });
  const pedir = await subir(t, { env: { XAI_API_KEY: CHAVE }, fetchImpl: recusa });
  const r = await pedir('/api/stand/sessao', {});
  assert.equal(r.status, 502);
  assert.ok(!(await r.text()).includes(CHAVE));
  const cai = async () => { throw new TypeError('fetch failed'); };
  const pedir2 = await subir(t, { env: { XAI_API_KEY: CHAVE }, fetchImpl: cai });
  assert.equal((await (await pedir2('/api/stand/sessao', {})).json()).error, 'stand_provedor_indisponivel');
});

test('teto de sessões por hora por conta, janela deslizante', async (t) => {
  let agora = 0;
  const guarda = criarGuardaDeSessoes({ teto: 2, agora: () => agora });
  const pedir = await subir(t, { env: { XAI_API_KEY: CHAVE }, fetchImpl: tokenOk, guarda });
  assert.equal((await pedir('/api/stand/sessao', {})).status, 200);
  assert.equal((await pedir('/api/stand/sessao', {})).status, 200);
  assert.equal((await pedir('/api/stand/sessao', {})).status, 429);
  assert.equal((await pedir('/api/stand/sessao', {}, { 'x-conta': 'outra' })).status, 200);
  agora = 60 * 60 * 1000;
  assert.equal((await pedir('/api/stand/sessao', {})).status, 200);
});

test('ferramenta executa as válidas e recusa desconhecida com 400', async (t) => {
  const pedir = await subir(t);
  const ok = await pedir('/api/stand/ferramenta', { nome: 'abrir_aba', args: { aba: 'telemetria' } });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).evento.tipo, 'acao_site');
  assert.equal((await pedir('/api/stand/ferramenta', { nome: 'shell', args: {} })).status, 400);
});

test('rotear devolve a decisão da M7; roteador quebrado vira null', async (t) => {
  const pedir = await subir(t);
  assert.deepEqual(await (await pedir('/api/stand/rotear', { texto: 'como funciona o fluxo do dado?' })).json(), { ok: true, decisao: { id: 'pipeline-completo', confianca: 1, decisao: 'tocar' } });
  assert.equal((await pedir('/api/stand/rotear', { texto: ' ' })).status, 400);
  const quebrado = await subir(t, { criarRoteador: async () => { throw new Error('sem 9router'); } });
  assert.deepEqual(await (await quebrado('/api/stand/rotear', { texto: 'oi' })).json(), { ok: true, decisao: null });
});

test('rotear descarta vídeo cujo mp4 ainda não foi publicado', async (t) => {
  const pedir = await subir(t, { publicado: (id) => id !== 'pipeline-completo' });
  assert.deepEqual(await (await pedir('/api/stand/rotear', { texto: 'como funciona o fluxo do dado?' })).json(), { ok: true, decisao: null });
});

test('microfone e api.x.ai só liberados em /stand', () => {
  const stand = cabecalhosDeSeguranca('/stand');
  assert.equal(stand['Permissions-Policy'], 'camera=(), microphone=(self), geolocation=()');
  assert.match(stand['Content-Security-Policy'], /connect-src 'self' ws: wss: https:\/\/api\.x\.ai wss:\/\/api\.x\.ai;/);
  for (const caminho of ['/', '/api/stand/sessao', '/stand/outra', '/standx']) {
    const h = cabecalhosDeSeguranca(caminho);
    assert.equal(h['Permissions-Policy'], 'camera=(), microphone=(), geolocation=()', caminho);
    assert.doesNotMatch(h['Content-Security-Policy'], /x\.ai|openai/, caminho);
  }
  assert.equal(cabecalhosDeSeguranca('/sonolencia')['Permissions-Policy'], 'camera=(self), microphone=(), geolocation=()');
  assert.match(cabecalhosDeSeguranca('/assets/drowsiness-worker-ab1.js')['Content-Security-Policy'], /wasm-unsafe-eval/);
  assert.equal(provedorXai.nome, 'xai');
});
