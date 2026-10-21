import assert from 'node:assert/strict';
import test from 'node:test';
import { COMANDOS_VOZ, comandoDireto, comandosParaPrompt } from '../shared/stand/comandos-voz.ts';
import { FERRAMENTAS_STAND, executarFerramentaStand } from '../server/stand/ferramentas.js';
import { executarTurno, FALAS, novaConversa } from '../server/stand/cerebro.js';
import { montarPromptBase } from '../server/stand/conhecimento.js';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { planejarAcao, executarPlano } = await loadFrontendModule('../../src/components/stand/site/acaoDoStand.ts');
const { reduzirModo, modoInicial } = await loadFrontendModule('../../src/components/stand/modoStand.ts');

// Frases do pedido do Lucas (21/10) e variações naturais.
const PEDIDOS_SIMULACAO = [
  'testar o simulador',
  'Quero testar o simulador.',
  'quero jogar',
  'abre a simulação',
  'Abre a simulação!',
  'testar a gameplay',
  'Quero testar a gameplay',
  'posso dirigir o trator?',
  'bora jogar',
  'Deixa eu jogar',
  'mostra o simulador',
  'Dá pra jogar?',
];
const PERGUNTAS_SOBRE_SIMULADOR = [
  'como funciona o simulador?',
  'o simulador grava os dados?',
  'o que é a simulação?',
  'quero saber do simulador',
  'o simulador usa dados reais?',
  'o simulador mostra o quê?',
  'abre o simulador 3D do painel da Sompo',
  'tem um vídeo do simulador?',
  'me mostra tudo',
  'o que é o LUCA?',
];

test('painel e cérebro vêm da mesma lista: toda ferramenta do stand tem comando e todo comando tem ferramenta', () => {
  const ferramentas = new Set(FERRAMENTAS_STAND.map((f) => f.name));
  const nosComandos = new Set(COMANDOS_VOZ.flatMap((c) => c.ferramentas));
  for (const nome of nosComandos) assert.ok(ferramentas.has(nome), `comando aponta para ferramenta inexistente: ${nome}`);
  for (const nome of ferramentas) assert.ok(nosComandos.has(nome), `ferramenta sem comando no painel: ${nome}`);
  assert.equal(new Set(COMANDOS_VOZ.map((c) => c.id)).size, COMANDOS_VOZ.length, 'ids únicos');
  for (const c of COMANDOS_VOZ) {
    assert.ok(c.titulo.split(' ').length <= 4, `título curto: ${c.titulo}`);
    assert.ok(c.exemplo.length <= 40, `exemplo cabe numa linha: ${c.exemplo}`);
    assert.ok(c.faz.length <= 42, `faz cabe numa linha do painel: ${c.faz}`);
  }
});

test('prompt do cérebro traz cada comando do painel com a ferramenta que atende', () => {
  const prompt = montarPromptBase({ lerManifesto: () => [] });
  assert.ok(prompt.includes(comandosParaPrompt()));
  for (const c of COMANDOS_VOZ) {
    assert.ok(prompt.includes(`"${c.exemplo}"`), c.exemplo);
    for (const f of c.ferramentas) assert.ok(prompt.includes(f) || prompt.includes(`${f.split('_')[0]}_*`), f);
  }
  assert.match(prompt, /use abrir_simulacao para jogar, dirigir ou testar o simulador/);
});

test('o exemplo da Simulação no painel é pedido direto', () => {
  const simulacao = COMANDOS_VOZ.find((c) => c.id === 'simulacao');
  assert.equal(comandoDireto(simulacao.exemplo), 'simulacao');
});

test('comandoDireto: pedidos de jogar/testar o simulador abrem a Simulação', () => {
  for (const frase of PEDIDOS_SIMULACAO) assert.equal(comandoDireto(frase), 'simulacao', frase);
});

test('comandoDireto: pergunta sobre o simulador ou outro pedido segue pro modelo', () => {
  for (const frase of PERGUNTAS_SOBRE_SIMULADOR) assert.equal(comandoDireto(frase), null, frase);
  for (const c of COMANDOS_VOZ.filter((item) => item.id !== 'simulacao')) assert.equal(comandoDireto(c.exemplo), null, c.exemplo);
});

test('cérebro: "testar o simulador" fala a frase pronta e manda abrir_simulacao depois dela, sem modelo', async () => {
  const conversa = novaConversa({ conta: 'demo' });
  const linhas = [];
  let chamouModelo = false;
  const resultado = await executarTurno({
    conversa,
    entrada: { texto: 'testar o simulador' },
    emitir: (l) => linhas.push(l),
    deps: {
      chamarModelo: async () => { chamouModelo = true; throw new Error('não devia chamar'); },
      sintetizar: async function* () { yield Buffer.from([0]); },
      falaPronta: async function* (chave) { yield Buffer.from(chave); },
      executarFerramenta: async () => ({ ok: true }),
      modelos: ['cc/claude-sonnet-5'],
    },
  });
  assert.equal(chamouModelo, false);
  assert.equal(resultado.motivo, 'simulacao');
  const ordem = linhas.filter((l) => l.t !== 'audio').map((l) => (l.t === 'frase' ? `frase:${l.texto}` : l.t === 'evento' ? `evento:${l.evento.acao}` : l.t));
  assert.deepEqual(ordem, [`frase:${FALAS.simulacao}`, 'evento:abrir_simulacao', 'fim']);
  const evento = linhas.find((l) => l.t === 'evento').evento;
  assert.deepEqual(evento, { tipo: 'acao_site', acao: 'abrir_simulacao', args: {}, apos_fala: true });
  assert.equal(conversa.respostas, 1);
  assert.deepEqual(conversa.historico.map((m) => m.role), ['user', 'assistant']);
});

test('cérebro: barge-in durante a fala não abre a Simulação', async () => {
  const controle = new AbortController();
  const linhas = [];
  const resultado = await executarTurno({
    conversa: novaConversa({ conta: 'demo' }),
    entrada: { texto: 'quero jogar' },
    emitir: (l) => linhas.push(l),
    sinal: controle.signal,
    deps: {
      chamarModelo: async () => { throw new Error('não devia chamar'); },
      sintetizar: async function* () {},
      falaPronta: async function* () { controle.abort(); yield Buffer.from('x'); },
      executarFerramenta: async () => ({ ok: true }),
    },
  });
  assert.equal(resultado.motivo, 'interrompido');
  assert.ok(!linhas.some((l) => l.t === 'evento'));
});

test('ferramenta abrir_simulacao (modelo ou Grok Realtime) vira acao_site válida', async () => {
  const saida = await executarFerramentaStand('abrir_simulacao', {});
  assert.deepEqual(saida, { ok: true, ferramenta: 'abrir_simulacao', evento: { tipo: 'acao_site', acao: 'abrir_simulacao', args: {} } });
  assert.equal((await executarFerramentaStand('abrir_simulacao', { modo: 'x' })).ok, false);
});

test('fluxo no stand: abrir_simulacao leva a Coruja, o Site ou a Vitrine direto pro modo Simulação', async () => {
  for (const inicio of ['coruja', 'site', 'vitrine']) {
    let estado = modoInicial(0);
    if (inicio === 'site') estado = reduzirModo(estado, { tipo: 'abrir_pagina', pagina: 'sensor' }, 1, 3);
    if (inicio === 'vitrine') estado = reduzirModo(estado, { tipo: 'ir', modo: 'vitrine' }, 1, 3);
    const plano = planejarAcao('abrir_simulacao', {}, { modo: estado.modo, pagina: estado.pagina });
    assert.deepEqual(plano, { ok: true, passos: [{ tipo: 'modo', entrada: { tipo: 'ir', modo: 'simulacao' } }] });
    const r = await executarPlano(plano, {
      despacharModo: (entrada) => { estado = reduzirModo(estado, entrada, 2, 3); },
      aguardarExecutor: async () => { throw new Error('Simulação não passa pelo Executor'); },
      enviarAcaoSite: async () => { throw new Error('Simulação não passa pelo Executor'); },
    });
    assert.equal(r.ok, true);
    assert.match(r.mensagem, /Simulação/);
    assert.equal(estado.modo, 'simulacao', inicio);
  }
});
