import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { createAuthService } from './auth.js';
import { registerLabCaseRoutes } from './lab-cases.js';
import { registerBancadaFilaRoutes, diaBrasilia, lerConcorrencia, lerTetoDia, resumoDaCorrida, parecerDaAnalise } from './bancada-fila.js';

// Runtime isolado com análise falsa: nenhum teste chama o 9Router.
const fixtureDir = path.resolve('datasets/laboratorio-virtual-v1');
const jsonFixture = (name) => JSON.parse(fs.readFileSync(path.join(fixtureDir, name), 'utf8'));
const caso = (runId = 'run-1', motivo = 'chegada') => ({
  name: `Circuito · ${runId}`, sourceName: '03-aquecimento-e-falha-gps.csv',
  rawCsv: fs.readFileSync(path.join(fixtureDir, '03-aquecimento-e-falha-gps.csv'), 'utf8'),
  metadata: { ...jsonFixture('manifest.json'), circuito: { versao: 1, origem: 'SIMULAÇÃO', runId, elapsedMs: 5000, inicioIso: '2026-10-24T11:00:00Z', fimIso: '2026-10-24T11:00:05Z',
    resultado: { motivo }, episodios: [{ sensor: 'feno', inicioMs: 1000, fimMs: 3000, gravidade: 'critico', velocidadeKph: 6, distanciaCm: 140, rolagemGraus: 0, resposta: { tempoMs: 1600, acao: 'frenagem' }, evitado: true }] } },
  map: jsonFixture('mapa.geojson'),
});
const resposta = {
  summary: 'Revisão: a corrida respondeu ao aviso; telemetria não comprova causa.', limitations: ['Simulação.'], additionalInformation: ['Nada.'],
  hypotheses: [{ title: 'Reação ao fardo', explanation: 'Frenagem após o aviso.', evidence: [{ sampleIndex: 0, description: 'Primeira amostra.', fields: ['coolant_temp_c'] }], limitations: ['Uma amostra.'], additionalInformation: ['Vídeo.'] }],
};

async function fixture(t, { chat, concorrencia = 1, tetoDia = 60, directory = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-fila-test-')) } = {}) {
  const servers = []; const filas = [];
  const launch = async () => {
    const app = express();
    app.use(express.json({ limit: '8mb' }));
    const auth = createAuthService({ dataPath: path.join(directory, 'auth.json') });
    auth.registerRoutes(app);
    app.use('/api', auth.requireUser);
    const lab = registerLabCaseRoutes(app, { dataDir: directory, chat });
    filas.push(registerBancadaFilaRoutes(app, { lab, dataDir: directory, concorrencia, tetoDia, esperaRetentativaMs: 10 }));
    const server = app.listen(0, '127.0.0.1');
    servers.push(server);
    await new Promise((resolve) => server.once('listening', resolve));
    return `http://127.0.0.1:${server.address().port}`;
  };
  let base = await launch();
  const request = async (url, { cookie, body } = {}) => {
    const r = await fetch(`${base}${url}`, { method: body ? 'POST' : 'GET', headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, body: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0] };
  };
  const register = async (name) => (await request('/api/auth/register', { body: { name, email: `${name}@fila.test`, password: 'test-password-2026' } })).cookie;
  const login = async (name) => (await request('/api/auth/login', { body: { email: `${name}@fila.test`, password: 'test-password-2026' } })).cookie;
  t.after(async () => {
    for (const f of filas) f.parar();
    for (const s of servers) { s.closeAllConnections(); await new Promise((r) => s.close(r)); }
    assert.ok(path.basename(directory).startsWith('luca-fila-test-'));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return { request, register, login, fila: () => filas.at(-1), relaunch: async () => { filas.at(-1).parar(); base = await launch(); }, directory };
}

test('envio entra na fila, a pessoa recebe a posição e o worker processa em ordem com concorrência 1', { timeout: 20000 }, async (t) => {
  const ordem = []; const ativos = new Map(); let pico = 0;
  // O worker fica preso até os envios terminarem: sem isso run-a podia acabar antes do 3º envio e as posições mudavam.
  let liberar; const portao = new Promise((r) => { liberar = r; });
  const chat = async (args) => {
    await portao;
    const run = JSON.parse(args.user).telemetry.circuito?.runId; if (!ordem.includes(run)) ordem.push(run);
    ativos.set(run, (ativos.get(run) || 0) + 1); pico = Math.max(pico, ativos.size);
    await new Promise((r) => setTimeout(r, 15));
    ativos.set(run, ativos.get(run) - 1); if (!ativos.get(run)) ativos.delete(run);
    return { content: JSON.stringify(resposta), finishReason: 'stop' };
  };
  const { request, register, fila } = await fixture(t, { chat });
  const cookie = await register('ana');
  const enviados = [];
  for (const run of ['run-a', 'run-b', 'run-c']) enviados.push(await request('/api/bancada/fila', { cookie, body: { caso: caso(run), corrida: { veiculo: 'trator', nota: 80 } } }));
  assert.deepEqual(enviados.map((e) => e.status), [202, 202, 202]);
  assert.equal(enviados[0].body.item.estado, 'processando');
  assert.deepEqual(enviados.slice(1).map((e) => e.body.item.posicao), [1, 2]);
  assert.equal(enviados[1].body.item.corrida.desfecho, 'chegada');
  assert.equal(enviados[1].body.item.corrida.sinistrosEvitados, 1);
  assert.equal(enviados[1].body.item.corrida.nota, 80);
  // Toque duplo: o mesmo caso ainda na fila devolve o item existente, sem nova análise.
  const repetido = await request('/api/bancada/fila', { cookie, body: { caso: caso('run-c') } });
  assert.equal(repetido.status, 200); assert.equal(repetido.body.item.id, enviados[2].body.item.id);
  liberar();
  await fila().ocioso();
  assert.deepEqual(ordem, ['run-a', 'run-b', 'run-c']); assert.equal(pico, 1, 'uma análise por vez (concorrência 1)');
  const lista = await request('/api/bancada/fila', { cookie });
  assert.deepEqual(lista.body.itens.map((i) => i.estado), ['pronto', 'pronto', 'pronto']);
  const item = (await request(`/api/bancada/fila/${enviados[0].body.item.id}`, { cookie })).body.item;
  assert.equal(item.parecer.status, 'completo'); assert.match(item.parecer.resumo, /Revisão/); assert.equal(item.parecer.principal, 'Reação ao fardo');
  assert.equal(item.foco, undefined); assert.equal(item.ownerId, undefined);
  // O chat falso não devolve veredicto válido: o 5º passo vira 'indeterminado' (contrato v1), resumido na fila.
  assert.equal(item.parecer.veredicto?.culpado, 'indeterminado'); assert.equal(item.parecer.veredicto.confianca, 0);
  const labCase = await request(`/api/lab/cases/${item.caseId}`, { cookie });
  assert.equal(labCase.body.case.analyses[0].id, item.analysisId);
});

test('conta só vê os próprios itens, sem login é 401 e o teto do dia recusa com 429', { timeout: 20000 }, async (t) => {
  const { request, register, fila } = await fixture(t, { chat: async () => ({ content: JSON.stringify(resposta), finishReason: 'stop' }), tetoDia: 2 });
  assert.equal((await request('/api/bancada/fila')).status, 401);
  const ana = await register('ana'); const bia = await register('bia');
  const a = await request('/api/bancada/fila', { cookie: ana, body: { caso: caso('a1') } });
  await request('/api/bancada/fila', { cookie: bia, body: { caso: caso('b1') } });
  const teto = await request('/api/bancada/fila', { cookie: bia, body: { caso: caso('b2') } });
  assert.equal(teto.status, 429); assert.equal(teto.body.error, 'fila_teto_dia');
  await fila().ocioso();
  assert.equal((await request(`/api/bancada/fila/${a.body.item.id}`, { cookie: bia })).status, 404);
  const lista = await request('/api/bancada/fila', { cookie: bia });
  assert.equal(lista.body.itens.length, 1); assert.equal(lista.body.limites.enviadosHoje, 2);
  assert.equal((await request('/api/bancada/fila?estado=na_fila', { cookie: bia })).body.itens.length, 0);
  assert.equal((await request(`/api/bancada/fila?dia=${diaBrasilia(new Date().toISOString())}`, { cookie: bia })).body.itens.length, 1);
  assert.equal((await request('/api/bancada/fila', { cookie: bia, body: { caso: 'x' } })).status, 400);
});

test('análise sem nenhum eixo concluído tenta de novo e depois fica falhou; parcial conta como pronto', { timeout: 20000 }, async (t) => {
  let chamadas = 0;
  const { request, register, fila } = await fixture(t, { chat: async (args) => { chamadas += 1; if (args.agentId === 'lab-mechanical') return { content: JSON.stringify(resposta), finishReason: 'stop' }; throw new Error('router fora'); } });
  const cookie = await register('ana');
  const parcial = await request('/api/bancada/fila', { cookie, body: { caso: caso('p1') } });
  await fila().ocioso();
  const p = (await request(`/api/bancada/fila/${parcial.body.item.id}`, { cookie })).body.item;
  assert.equal(p.estado, 'pronto'); assert.equal(p.parecer.status, 'parcial'); assert.equal(p.tentativas, 1);
  const { request: req2, register: reg2, fila: fila2 } = await fixture(t, { chat: async () => { throw new Error('router fora'); } });
  const c2 = await reg2('bia');
  const falho = await req2('/api/bancada/fila', { cookie: c2, body: { caso: caso('f1') } });
  await fila2().ocioso();
  const f = (await req2(`/api/bancada/fila/${falho.body.item.id}`, { cookie: c2 })).body.item;
  assert.equal(f.estado, 'falhou'); assert.equal(f.tentativas, 2); assert.ok(f.erro);
  assert.ok(chamadas >= 3);
});

test('fila sobrevive a restart: item processando volta para a fila e termina', { timeout: 20000 }, async (t) => {
  let travar = true; const presos = [];
  const chat = async () => { if (travar) await new Promise((r) => presos.push(r)); return { content: JSON.stringify(resposta), finishReason: 'stop' }; };
  const { request, register, login, relaunch, fila } = await fixture(t, { chat });
  await register('ana'); let cookie = await login('ana');
  const enviado = await request('/api/bancada/fila', { cookie, body: { caso: caso('r1') } });
  assert.equal(enviado.body.item.estado, 'processando');
  travar = false; await relaunch();
  cookie = await login('ana');
  await fila().ocioso();
  const item = (await request(`/api/bancada/fila/${enviado.body.item.id}`, { cookie })).body.item;
  assert.equal(item.estado, 'pronto'); assert.equal(item.tentativas, 2);
  presos.forEach((r) => r());
});

test('limites lidos do ambiente e resumo confiam no registro validado, não no rótulo do cliente', () => {
  assert.equal(lerConcorrencia(undefined), 1); assert.equal(lerConcorrencia('2'), 2); assert.equal(lerConcorrencia('0'), 0); assert.equal(lerConcorrencia('x'), 1);
  assert.equal(lerTetoDia(''), 60); assert.equal(lerTetoDia('5'), 5); assert.equal(lerTetoDia('-1'), 60);
  const r = resumoDaCorrida(caso('z', 'tombamento'), { desfecho: 'chegada', avisos: 99, veiculo: 'caminhao', cenario: 'serra-sem-freio' });
  assert.equal(r.desfecho, 'tombamento'); assert.equal(r.avisos, 1); assert.equal(r.veiculo, 'caminhao'); assert.equal(r.cenario, 'serra-sem-freio');
  assert.equal(resumoDaCorrida({ metadata: {} }, { nota: 72, desfecho: 'percurso' }).cenario, 'percurso');
  assert.equal(diaBrasilia('2026-10-25T02:30:00Z'), '2026-10-24');
});

test('parecer resume o veredicto (estimativa) e deixa null em caso antigo', () => {
  const base = { status: 'completed', axes: [{ id: 'review', status: 'completed', summary: 'ok' }], hypotheses: [] };
  assert.equal(parecerDaAnalise(base).veredicto, null);
  const verdict = { versao: 1, status: 'concluido', culpado: 'operador', culpadoRotulo: 'Operador humano', confianca: 0.72, impacto_financeiro: { faixa_min_brl: 8000, faixa_max_brl: 32000 } };
  assert.deepEqual(parecerDaAnalise({ ...base, verdict }).veredicto, { culpado: 'operador', rotulo: 'Operador humano', confianca: 0.72, faixaMinBrl: 8000, faixaMaxBrl: 32000 });
});
