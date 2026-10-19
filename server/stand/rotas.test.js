import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { cabecalhosDeSeguranca } from '../cabecalhos-seguranca.js';
import { credencialXai, provedorXai } from './provedor-xai.js';
import { configStand, criarGuardaDeSessoes, escutaLigada, LIMITES_STAND, registerStandRoutes } from './rotas.js';
import { criarTetoDiario } from './teto-diario.js';

const CHAVE = 'xai-teste-nao-real';
const LIMITES = { silencio_s: 20, teto_s: 240, sessoes_por_hora: 30 };
const roteadorFalso = async () => ({ preaquecer: async () => ({}), rotearPergunta: async (t) => (t.includes('fluxo') ? { id: 'pipeline-completo', confianca: 1, decisao: 'tocar' } : null) });

async function subir(t, { env: envTeste = {}, fetchImpl, guarda, criarRoteador = roteadorFalso, publicado = () => true } = {}) {
  const env = { STAND_VOZ_PROVEDOR: 'xai', ...envTeste };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.auth = { user: { id: req.headers['x-conta'] || 'demo' } }; next(); });
  registerStandRoutes(app, { env, fetchImpl, guarda, criarRoteador, publicado, instrucoes: () => 'prompt-base', teto: criarTetoDiario() });
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
  const ok = await pedir('/api/stand/ferramenta', { nome: 'abrir_pagina', args: { pagina: 'sensor' } });
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

test('microfone, api.x.ai e api.elevenlabs.io só liberados em /stand', () => {
  const stand = cabecalhosDeSeguranca('/stand');
  assert.equal(stand['Permissions-Policy'], 'camera=(self), microphone=(self), geolocation=()', '/stand mantém o microfone e delega a câmera ao iframe da sonolência');
  assert.match(stand['Content-Security-Policy'], /connect-src 'self' ws: wss: https:\/\/api\.x\.ai wss:\/\/api\.x\.ai wss:\/\/api\.elevenlabs\.io;/);
  for (const caminho of ['/', '/api/stand/sessao', '/stand/outra', '/standx']) {
    const h = cabecalhosDeSeguranca(caminho);
    assert.equal(h['Permissions-Policy'], 'camera=(), microphone=(), geolocation=()', caminho);
    assert.doesNotMatch(h['Content-Security-Policy'], /x\.ai|openai|elevenlabs/, caminho);
  }
  assert.equal(cabecalhosDeSeguranca('/sonolencia')['Permissions-Policy'], 'camera=(self), microphone=(), geolocation=()');
  // Totem-Site Q2: as 6 páginas públicas aceitam moldura só do próprio site; o resto segue DENY.
  for (const caminho of ['/', '/luca-ai', '/sompo', '/laboratorio', '/sensor', '/sonolencia', '/sensor/']) {
    const h = cabecalhosDeSeguranca(caminho);
    assert.equal(h['X-Frame-Options'], 'SAMEORIGIN', caminho);
    assert.match(h['Content-Security-Policy'], /frame-ancestors 'self';/, caminho);
  }
  for (const caminho of ['/admin', '/personas', '/configuracao', '/stand', '/api/lab/cases', '/api/admin/users', '/sensorx', '/sompo/x', '/assets/index.js']) {
    const h = cabecalhosDeSeguranca(caminho);
    assert.equal(h['X-Frame-Options'], 'DENY', caminho);
    assert.match(h['Content-Security-Policy'], /frame-ancestors 'none';/, caminho);
  }
  for (const caminho of ['/', '/sensor', '/sonolencia', '/admin']) {
    assert.doesNotMatch(cabecalhosDeSeguranca(caminho)['Content-Security-Policy'], /frame-ancestors [^;]*(https?:|\*)/, `${caminho}: nenhuma origem de fora emoldura`);
  }
  assert.match(cabecalhosDeSeguranca('/assets/drowsiness-worker-ab1.js')['Content-Security-Policy'], /wasm-unsafe-eval/);
  assert.equal(provedorXai.nome, 'xai');
});

// ElevenLabs (padrão desde 19/10): sessão com token Scribe + conversa; turno em NDJSON.
const CHAVE_11 = 'xi-teste-nao-real';
const VOZ_ID = 'AbCdEfGhIjKlMnOpQrSt';

function fetchElevenlabs(pedidos = []) {
  return async (url, init = {}) => {
    pedidos.push({ url: String(url), init });
    const u = String(url);
    if (u.endsWith('/v1/single-use-token/realtime_scribe')) return new Response(JSON.stringify({ token: 'scribe-uso-unico' }), { status: 200 });
    if (u.includes('/v2/voices')) return new Response(JSON.stringify({ voices: [{ name: 'Lucas Oliveira', voice_id: VOZ_ID }, { name: 'Outra', voice_id: 'x' }] }), { status: 200 });
    if (u.includes('/v1/text-to-speech/')) return new Response(new Uint8Array([1, 0, 2, 0, 3]), { status: 200 });
    return new Response('{}', { status: 404 });
  };
}

async function subir11(t, { env = {}, teto = criarTetoDiario({ teto: 1000 }), chamarModelo, pedidos = [], agora = () => Date.now() } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.auth = { user: { id: req.headers['x-conta'] || 'demo' } }; next(); });
  const modelo = chamarModelo || (async () => (async function* () {
    yield { texto: 'O LUCA mede o trator. ' };
    yield { texto: 'E avisa antes.' };
    yield { fim: true, ferramentas: [] };
  })());
  registerStandRoutes(app, {
    env: { ELEVENLABS_API_KEY: CHAVE_11, ...env },
    fetchImpl: fetchElevenlabs(pedidos),
    criarRoteador: roteadorFalso,
    publicado: () => true,
    instrucoes: () => 'prompt-base',
    teto,
    chamarModelo: modelo,
    agora,
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((ok) => server.once('listening', ok));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  return (caminho, corpo, headers = {}) => fetch(base + caminho, corpo === undefined
    ? { headers }
    : { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(corpo) });
}

const linhasNdjson = async (resposta) => (await resposta.text()).trim().split('\n').map((l) => JSON.parse(l));

test('elevenlabs é o padrão: sessão devolve token Scribe, conversa e nunca a chave', async (t) => {
  const pedidos = [];
  const pedir = await subir11(t, { pedidos });
  const status = await (await pedir('/api/stand/status')).json();
  assert.equal(status.provedor, 'elevenlabs');
  assert.equal(status.ligado, true);
  assert.equal(status.voz, 'Lucas Oliveira');
  assert.equal(status.escuta, true, 'escuta ligada por padrão com elevenlabs');
  assert.equal(status.limites.respostas, 8);
  const resposta = await pedir('/api/stand/sessao', {});
  const texto = await resposta.text();
  assert.equal(resposta.status, 200);
  assert.ok(!texto.includes(CHAVE_11));
  const corpo = JSON.parse(texto);
  assert.equal(corpo.conexao.transporte, 'scribe');
  const url = new URL(corpo.conexao.url);
  assert.equal(url.origin + url.pathname, 'wss://api.elevenlabs.io/v1/speech-to-text/realtime');
  assert.equal(url.searchParams.get('token'), 'scribe-uso-unico');
  assert.equal(url.searchParams.get('model_id'), 'scribe_v2_realtime');
  assert.equal(url.searchParams.get('language_code'), 'por');
  assert.equal(url.searchParams.get('commit_strategy'), 'vad');
  assert.equal(url.searchParams.get('audio_format'), 'pcm_24000');
  assert.match(corpo.conversa_id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(corpo.sessao, { modo: 'turnos', entrada_hz: 24000, saida_hz: 24000 });
  assert.equal(pedidos.find((p) => p.url.endsWith('realtime_scribe')).init.headers['xi-api-key'], CHAVE_11);
});

test('escuta: padrão no provedor em turnos, STAND_ESCUTA=0 desliga, Grok nunca', () => {
  const onze = { ELEVENLABS_API_KEY: 'k' };
  assert.equal(escutaLigada(onze), true);
  for (const valor of ['0', 'false', 'off', 'não']) assert.equal(escutaLigada({ ...onze, STAND_ESCUTA: valor }), false, valor);
  assert.equal(escutaLigada({ ...onze, STAND_ESCUTA: '1' }), true);
  assert.equal(escutaLigada({ STAND_VOZ_PROVEDOR: 'xai', XAI_API_KEY: 'k' }), false);
});

test('contagem do dia: despertar sem pergunta é falso; toque ou despertar com pergunta é conversa', async (t) => {
  const teto = criarTetoDiario({ teto: 100_000 });
  const pedir = await subir11(t, { teto });
  const abrir = async (origem) => (await (await pedir('/api/stand/sessao', origem ? { origem } : {})).json()).conversa_id;
  const fechar = (id) => pedir('/api/stand/turno', { conversa_id: id, evento: 'fim' });
  const perguntar = async (id) => (await pedir('/api/stand/turno', { conversa_id: id, texto: 'O que é o LUCA?' })).text();

  await fechar(await abrir('escuta'));
  const comFala = await abrir('escuta');
  await perguntar(comFala);
  await perguntar(comFala);
  await fechar(comFala);
  const toque = await abrir();
  await pedir('/api/stand/turno', { conversa_id: toque, evento: 'saudacao' }).then((r) => r.text());
  await fechar(toque);
  await fechar(await abrir('qualquer-coisa'));

  const dia = (await (await pedir('/api/stand/status')).json()).creditos_dia;
  assert.equal(dia.despertares, 2);
  assert.equal(dia.falsos, 1, 'só o despertar sem pergunta; toque sem pergunta não é falso');
  assert.equal(dia.conversas, 1, 'uma por sessão, não por pergunta');
});

test('turno: NDJSON com frases, PCM par em base64 e fim; voz resolvida pelo nome; créditos contados', async (t) => {
  const pedidos = [];
  const teto = criarTetoDiario({ teto: 1000 });
  let relogio = Date.parse('2026-10-19T15:00:00Z');
  const pedir = await subir11(t, { pedidos, teto, agora: () => relogio });
  const { conversa_id } = await (await pedir('/api/stand/sessao', {})).json();
  const resposta = await pedir('/api/stand/turno', { conversa_id, texto: 'o que é o LUCA?' });
  assert.equal(resposta.status, 200);
  assert.match(resposta.headers.get('content-type'), /application\/x-ndjson/);
  const linhas = await linhasNdjson(resposta);
  assert.deepEqual(linhas.filter((l) => l.t === 'frase').map((l) => l.texto), ['O LUCA mede o trator.', 'E avisa antes.']);
  const audios = linhas.filter((l) => l.t === 'audio').map((l) => Buffer.from(l.pcm, 'base64'));
  assert.ok(audios.length >= 2 && audios.every((b) => b.length % 2 === 0));
  assert.equal(linhas.at(-1).t, 'fim');
  assert.equal(linhas.at(-1).motivo, 'ok');
  const tts = pedidos.filter((p) => p.url.includes('/v1/text-to-speech/'));
  assert.ok(tts[0].url.includes(`/v1/text-to-speech/${VOZ_ID}/stream?output_format=pcm_24000`));
  assert.equal(JSON.parse(tts[0].init.body).model_id, 'eleven_turbo_v2_5');
  assert.equal(teto.usados(), (21 + 14) * 0.5);
  relogio += 60_000;
  const fim = await (await pedir('/api/stand/turno', { conversa_id, evento: 'fim' })).json();
  assert.equal(fim.ok, true);
  assert.equal(teto.usados(), 17.5 + 36, 'o fim da conversa cobra 1 minuto de STT');
  assert.equal((await pedir('/api/stand/turno', { conversa_id, texto: 'oi' })).status, 404);
});

test('turno: conversa de outra conta, texto vazio e modelo TTS pelo env', async (t) => {
  const pedidos = [];
  const pedir = await subir11(t, { pedidos, env: { STAND_TTS_MODELO: 'eleven_multilingual_v2' } });
  const { conversa_id } = await (await pedir('/api/stand/sessao', {})).json();
  assert.equal((await pedir('/api/stand/turno', { conversa_id, texto: 'oi' }, { 'x-conta': 'outra' })).status, 404);
  assert.equal((await pedir('/api/stand/turno', { conversa_id, texto: '  ' })).status, 400);
  await linhasNdjson(await pedir('/api/stand/turno', { conversa_id, texto: 'oi' }));
  assert.equal(JSON.parse(pedidos.find((p) => p.url.includes('/v1/text-to-speech/')).init.body).model_id, 'eleven_multilingual_v2');
});

test('teto diário estourado: status desligado com motivo teto_diario e sessão 503', async (t) => {
  const teto = criarTetoDiario({ teto: 10 });
  teto.somar(10);
  const pedir = await subir11(t, { teto });
  const status = await (await pedir('/api/stand/status')).json();
  assert.equal(status.ligado, false);
  assert.equal(status.motivo, 'teto_diario');
  assert.deepEqual(status.creditos_dia.teto, 10);
  const sessao = await pedir('/api/stand/sessao', {});
  assert.equal(sessao.status, 503);
  assert.equal((await sessao.json()).motivo, 'teto_diario');
});

test('sem ELEVENLABS_API_KEY: desligado com sem_credencial', async (t) => {
  const pedir = await subir11(t, { env: { ELEVENLABS_API_KEY: '' } });
  const status = await (await pedir('/api/stand/status')).json();
  assert.equal(status.ligado, false);
  assert.equal(status.motivo, 'sem_credencial');
});

test('turno novo da mesma conversa aborta o anterior (barge-in)', async (t) => {
  let abortados = 0;
  let chamou;
  const primeiraChamada = new Promise((ok) => { chamou = ok; });
  let chamadas = 0;
  const lento = async ({ sinal }) => {
    // Só o 1º turno fica preso até ser abortado; o 2º responde direto.
    const primeiro = ++chamadas === 1;
    if (primeiro) sinal?.addEventListener('abort', () => { abortados++; }, { once: true });
    return (async function* () {
      if (primeiro) chamou();
      yield { texto: 'Começo. ' };
      if (primeiro) await new Promise((ok) => { const r = setTimeout(ok, 5000); sinal?.addEventListener('abort', () => { clearTimeout(r); ok(); }); });
      yield { texto: 'Resto.' };
      yield { fim: true, ferramentas: [] };
    })();
  };
  const pedir = await subir11(t, { chamarModelo: lento });
  const { conversa_id } = await (await pedir('/api/stand/sessao', {})).json();
  const primeiro = pedir('/api/stand/turno', { conversa_id, texto: 'primeira' });
  await primeiraChamada;
  await new Promise((ok) => setTimeout(ok, 20));
  const segundo = await linhasNdjson(await pedir('/api/stand/turno', { conversa_id, texto: 'segunda' }));
  const linhasPrimeiro = await linhasNdjson(await primeiro);
  assert.equal(abortados, 1);
  assert.ok(!linhasPrimeiro.some((l) => l.t === 'fim'));
  assert.equal(segundo.at(-1).motivo, 'ok');
});

test('conversa abandonada sem fim é cobrada pela estimativa (último uso + silêncio + 30 s)', async (t) => {
  const teto = criarTetoDiario({ teto: 100000 });
  let relogio = Date.parse('2026-10-19T15:00:00Z');
  const pedir = await subir11(t, { teto, agora: () => relogio });
  await pedir('/api/stand/sessao', {});
  assert.equal(teto.usados(), 0);
  relogio += 60 * 60 * 1000;
  await pedir('/api/stand/status');
  assert.equal(teto.usados(), ((LIMITES_STAND.silencio_s + 30) / 60) * 36);
});
