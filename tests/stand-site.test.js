import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { reduzirModo, modoInicial, modosDisponiveis, avisoDeSaida, SIMULACAO_PARADA_MS, REPOUSO_MS } = await loadFrontendModule('../../src/components/stand/modoStand.ts');
const { planejarAcao, executarPlano } = await loadFrontendModule('../../src/components/stand/site/acaoDoStand.ts');
const { dentroDoStand } = await loadFrontendModule('../../src/components/stand/executor/embutido.ts');

const passo = (estado, entrada, agora) => reduzirModo(estado, entrada, agora, 3);

test('Site só existe com página aberta; a barra guarda a página ao passar pra outro modo', () => {
  let e = modoInicial(0);
  assert.deepEqual(modosDisponiveis(e), ['coruja', 'vitrine', 'simulacao']);
  assert.equal(passo(e, { tipo: 'ir', modo: 'site' }, 1).modo, 'coruja', 'barra não abre Site vazio');
  e = passo(e, { tipo: 'abrir_pagina', pagina: 'sensor' }, 2);
  assert.deepEqual([e.modo, e.pagina], ['site', 'sensor']);
  assert.deepEqual(modosDisponiveis(e), ['coruja', 'site', 'vitrine', 'simulacao']);
  const vitrine = passo(e, { tipo: 'ir', modo: 'vitrine' }, 3);
  assert.deepEqual([vitrine.modo, vitrine.pagina], ['vitrine', 'sensor'], 'a barra guarda a página');
  assert.equal(passo(vitrine, { tipo: 'ir', modo: 'site' }, 4).modo, 'site');
});

test('PS, Coruja da barra e voltar_coruja fecham a página', () => {
  const site = passo(modoInicial(0), { tipo: 'abrir_pagina', pagina: 'sonolencia' }, 1);
  for (const entrada of [{ tipo: 'ir', modo: 'coruja' }, { tipo: 'voltar_coruja' }]) {
    const e = passo(site, entrada, 2);
    assert.deepEqual([e.modo, e.pagina], ['coruja', null], entrada.tipo);
  }
  const trocou = passo(site, { tipo: 'abrir_pagina', pagina: 'sensor' }, 3);
  assert.deepEqual([trocou.modo, trocou.pagina], ['site', 'sensor']);
});

test('Site parado 90 s volta pra Coruja com aviso; a coruja falando segura', () => {
  let e = passo(modoInicial(0), { tipo: 'abrir_pagina', pagina: 'sensor' }, 1000);
  assert.equal(avisoDeSaida(e, 1000 + SIMULACAO_PARADA_MS - 10_000), 10);
  const falando = passo(e, { tipo: 'relogio', falando: true }, 1000 + SIMULACAO_PARADA_MS - 5000);
  assert.equal(passo(falando, { tipo: 'relogio' }, 1000 + SIMULACAO_PARADA_MS + 1).modo, 'site', 'narração reinicia a conta');
  assert.equal(passo(e, { tipo: 'relogio', corujaOcupada: true }, 1000 + REPOUSO_MS).modo, 'site', 'Site não vira Vitrine pelo repouso da Coruja');
  e = passo(e, { tipo: 'relogio' }, 1000 + SIMULACAO_PARADA_MS);
  assert.deepEqual([e.modo, e.pagina], ['coruja', null]);
});

test('plano: abrir_pagina e voltar_coruja trocam o modo; controle abre a página dele antes', () => {
  const coruja = { modo: 'coruja', pagina: null };
  assert.deepEqual(planejarAcao('abrir_pagina', { pagina: 'sonolencia' }, coruja), { ok: true, passos: [{ tipo: 'modo', entrada: { tipo: 'abrir_pagina', pagina: 'sonolencia' } }] });
  assert.deepEqual(planejarAcao('voltar_coruja', {}, coruja), { ok: true, passos: [{ tipo: 'modo', entrada: { tipo: 'voltar_coruja' } }] });
  const frio = planejarAcao('sensor_rodar_ensaio', { ensaio: 'curva' }, coruja);
  assert.deepEqual(frio.passos.map((p) => p.tipo), ['modo', 'executor']);
  assert.equal(frio.passos[1].caminho, '/sensor');
  const quente = planejarAcao('sensor_rodar_ensaio', { ensaio: 'curva' }, { modo: 'site', pagina: 'sensor' });
  assert.deepEqual(quente.passos, [{ tipo: 'executor', caminho: '/sensor', acao: 'sensor_rodar_ensaio', args: { ensaio: 'curva' } }]);
  const outra = planejarAcao('sompo_abrir_aba', { aba: 'casos' }, { modo: 'site', pagina: 'sensor' });
  assert.deepEqual(outra.passos[0], { tipo: 'modo', entrada: { tipo: 'abrir_pagina', pagina: 'sompo' } }, 'ação do SOMPO com outra página abre o SOMPO');
  assert.equal(planejarAcao('abrir_pagina', { pagina: 'admin' }, coruja).ok, false);
  assert.equal(planejarAcao('gravar_episodio', {}, coruja).ok, false);
});

test('executarPlano: página que não carrega volta pra Coruja; falha do controle volta a mensagem', async () => {
  const modos = [];
  const base = { despacharModo: (e) => modos.push(e.tipo), enviarAcaoSite: async (acao) => ({ ok: true, mensagem: `fiz ${acao}` }) };
  const plano = planejarAcao('sonolencia_testar_som', {}, { modo: 'coruja', pagina: null });
  assert.deepEqual(await executarPlano(plano, { ...base, aguardarExecutor: async () => true }), { ok: true, mensagem: 'fiz sonolencia_testar_som' });
  assert.deepEqual(modos, ['abrir_pagina']);
  modos.length = 0;
  const caiu = await executarPlano(plano, { ...base, aguardarExecutor: async () => false });
  assert.equal(caiu.ok, false);
  assert.deepEqual(modos, ['abrir_pagina', 'voltar_coruja']);
  const falhou = await executarPlano(plano, { ...base, aguardarExecutor: async () => true, enviarAcaoSite: async () => ({ ok: false, mensagem: 'Nenhuma webcam encontrada.' }) });
  assert.deepEqual(falhou, { ok: false, mensagem: 'Nenhuma webcam encontrada.' });
  assert.equal((await executarPlano(planejarAcao('x', {}, { modo: 'coruja', pagina: null }), base)).ok, false);
});

test('Executor só liga dentro de um frame do /stand', () => {
  const topo = {}; topo.self = topo; topo.parent = topo;
  assert.equal(dentroDoStand(topo), false, 'janela de cima (inclusive o /stand e a aba com ?stand=1)');
  assert.equal(dentroDoStand({ self: {}, parent: { location: { pathname: '/stand' } } }), true);
  assert.equal(dentroDoStand({ self: {}, parent: { location: { pathname: '/sompo' } } }), false);
  const deFora = { self: {}, parent: { get location() { throw new Error('cross-origin'); } } };
  assert.equal(dentroDoStand(deFora), false);
  assert.equal(dentroDoStand(undefined), false);
});

const { retratoDaPagina, limparLinha, RETRATO_MAX } = await loadFrontendModule('../../src/components/stand/executor/retrato.ts');
const { linhaDaTela } = await loadFrontendModule('../../src/components/stand/site/acaoDoStand.ts');

const leitor = (textos = {}, atributos = {}) => ({
  texto: (s) => textos[s] ?? null,
  atributo: (s, n) => atributos[`${s}|${n}`] ?? null,
});

test('retrato: sonolência, sensor e laboratório dizem o que a tela mostra, em uma linha', () => {
  assert.equal(
    retratoDaPagina('/sonolencia', leitor({}, { '.drowsiness-page|data-state': 'idle', '.drowsiness-sensitivity select|value': 'high' })),
    'Página sonolência. webcam desligada. sensibilidade alta',
  );
  assert.equal(
    retratoDaPagina('/sonolencia', leitor({ '.drowsiness-panel .drowsiness-message': 'Nenhuma webcam\nencontrada.' }, { '.drowsiness-page|data-state': 'error' })),
    'Página sonolência. webcam com erro. Nenhuma webcam encontrada.',
  );
  assert.equal(
    retratoDaPagina('/sensor', leitor({
      '.sensor-choice[aria-label="Veículo da bancada"] button[aria-pressed="true"]': 'Trator MAX',
      '.sensor-essay-select select option:checked': 'Curva',
      '.sensor-operation-slider span': 'Velocidade 40 km/h',
      '.sensor-operation-views button[aria-pressed="true"]': 'Bancada',
    })),
    'Página laboratório do sensor. Trator MAX. ensaio Curva. Velocidade 40 km/h. rodando. vista Bancada',
  );
  assert.equal(retratoDaPagina('/laboratorio', leitor()), 'Página laboratório. demonstração fechada');
  assert.equal(retratoDaPagina('/admin', leitor({ h1: 'segredo' })), '', 'fora das páginas públicas: nada');
});

test('retrato e linha da Tela: no máximo 200 caracteres, sem quebra de linha', () => {
  const longo = retratoDaPagina('/sompo', leitor({ '[data-stand-alvo^="aba-"][aria-pressed="true"] strong': 'a\n'.repeat(300) }));
  assert.ok(longo.length <= RETRATO_MAX && !longo.includes('\n'));
  assert.equal(limparLinha('  x \n y  '), 'x y');
  assert.equal(linhaDaTela({ ok: true, mensagem: 'Sensibilidade alta.', retrato: 'Página sonolência. webcam desligada. sensibilidade alta' }),
    'Sensibilidade alta. Mostra: Página sonolência. webcam desligada. sensibilidade alta');
  assert.equal(linhaDaTela({ ok: false, mensagem: 'Desligue a câmera antes de mudar a sensibilidade.' }),
    'a ação falhou: Desligue a câmera antes de mudar a sensibilidade.');
  assert.ok(linhaDaTela({ ok: true, mensagem: 'm'.repeat(150), retrato: 'r'.repeat(200) }).length <= 200);
});

test('executarPlano devolve o retrato do Executor', async () => {
  const plano = planejarAcao('sonolencia_sensibilidade', { nivel: 'alta' }, { modo: 'site', pagina: 'sonolencia' });
  const r = await executarPlano(plano, { despacharModo: () => {}, aguardarExecutor: async () => true, enviarAcaoSite: async () => ({ ok: true, mensagem: 'Sensibilidade alta.', retrato: 'Página sonolência' }) });
  assert.deepEqual(r, { ok: true, mensagem: 'Sensibilidade alta.', retrato: 'Página sonolência' });
});

test('plano: tour_iniciar solto não vai ao Executor (o cérebro manda o roteiro passo a passo)', () => {
  const r = planejarAcao('tour_iniciar', {}, { modo: 'coruja', pagina: null });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /tour/);
});

test('retrato da bancada LUCA AI: só os templates prontos, sem missão nem chat (Totem B3)', () => {
  const botoes = ['Aplicar preset Pesquisa rápida', 'Aplicar preset Revisão de código'];
  const comGaleria = {
    texto: () => null,
    atributo: (s, n) => (s === '[data-luca-preset-gallery]' && n === 'data-luca-preset-gallery' ? 'Equipes prontas' : null),
    todos: (s, n) => (n === 'aria-label' && s.includes('Aplicar preset') ? botoes : []),
  };
  assert.equal(retratoDaPagina('/luca-ai', comGaleria), 'Página LUCA AI. Equipes prontas: Pesquisa rápida, Revisão de código');
  assert.equal(retratoDaPagina('/luca-ai', leitor()), 'Página LUCA AI', 'leitor sem lista ou galeria fechada: só o nome da página');
});

test('abrir_pagina só responde "Abri" quando a página sobe; traz o retrato dela (Totem B3)', async () => {
  const modos = [];
  const plano = planejarAcao('abrir_pagina', { pagina: 'luca_ai' }, { modo: 'coruja', pagina: null });
  const pedidos = [];
  const ok = await executarPlano(plano, {
    despacharModo: (e) => modos.push(e.tipo),
    aguardarExecutor: async (caminho) => { pedidos.push(caminho); return { retrato: 'Página LUCA AI. Equipes prontas: A, B' }; },
    enviarAcaoSite: async () => { throw new Error('abrir página não vai ao Executor'); },
  });
  assert.deepEqual(ok, { ok: true, mensagem: 'Abri a página luca_ai.', retrato: 'Página LUCA AI. Equipes prontas: A, B' });
  assert.deepEqual(pedidos, ['/luca-ai']);
  modos.length = 0;
  const caiu = await executarPlano(plano, { despacharModo: (e) => modos.push(e.tipo), aguardarExecutor: async () => false, enviarAcaoSite: async () => ({ ok: true, mensagem: '' }) });
  assert.equal(caiu.ok, false);
  assert.match(caiu.mensagem, /não carregou/);
  assert.deepEqual(modos, ['abrir_pagina', 'voltar_coruja']);
  // Executor antigo (sem retrato no pronto): continua valendo.
  assert.deepEqual(await executarPlano(plano, { despacharModo: () => {}, aguardarExecutor: async () => true, enviarAcaoSite: async () => ({ ok: true, mensagem: '' }) }), { ok: true, mensagem: 'Abri a página luca_ai.' });
});

test('controle com página fechada espera uma vez só (abrir + executor)', async () => {
  const pedidos = [];
  const plano = planejarAcao('sensor_pausar', {}, { modo: 'coruja', pagina: null });
  const r = await executarPlano(plano, { despacharModo: () => {}, aguardarExecutor: async (c) => { pedidos.push(c); return {}; }, enviarAcaoSite: async () => ({ ok: true, mensagem: 'Ensaio pausado.' }) });
  assert.deepEqual(r, { ok: true, mensagem: 'Ensaio pausado.' });
  assert.deepEqual(pedidos, ['/sensor']);
});
