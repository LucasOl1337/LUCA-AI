import assert from 'node:assert/strict';
import test from 'node:test';
import { montarLinhaDoTempo } from '../sompo/linha-do-tempo.ts';
import { planosDoPipeline } from './planos.ts';
import { PIPELINE, PLANO_B } from './roteiro.ts';

const MARCAS = {
  b1_campo: 2, b3_simulador: 6, b3_alerta: 9, b4_gravando: 14, b4_registrado: 30,
  b5_painel: 33, b5_clique: 35, b5_sessao: 37, b5_etapa_supervisor: 45, b5_etapa_tars: 60,
  b6_entrega: 300, b6_texto: 305, b7_safra: 312, b7_frames: 316, fim: 322,
};

test('com entrega: b6 mostra a entrega e o b5 passa pela primeira etapa', () => {
  const p = planosDoPipeline(MARCAS);
  assert.deepEqual(p.b6.map((x) => x.inicio), [299.2, 301.5]);
  assert.equal(p.b5.at(-1).inicio, 44.5);
  assert.deepEqual(p.b2, [{ inicio: null }]);
  assert.deepEqual(p.b8, [{ inicio: null }]);
});

test('sem entrega (plano B): b6 fica na sessão sem parecer', () => {
  const { b6_entrega, b6_texto, ...resto } = MARCAS;
  const p = planosDoPipeline({ ...resto, b6_sem_entrega: 290 });
  assert.deepEqual(p.b6, [{ inicio: 289.5 }]);
});

test('marca obrigatória ausente falha alto', () => {
  const { b4_gravando, ...resto } = MARCAS;
  assert.throws(() => planosDoPipeline(resto), /b4_gravando/);
});

test('linha do tempo cobre os 8 blocos e o esquema/fechamento não usam captura', () => {
  const p = planosDoPipeline(MARCAS);
  const linha = montarLinhaDoTempo(PIPELINE.map((b) => ({ id: b.id, texto: b.narracao, narracao: `${b.id}.wav`, duracaoNarracao: 10, verdade: b.verdade, detalhe: b.detalhe, planos: p[b.id] })));
  assert.equal(linha.blocos.length, 8);
  assert.ok(linha.planos.filter((x) => x.inicioCaptura === null).every((x) => ['b2', 'b8'].includes(x.bloco)));
  assert.ok(Math.abs(linha.planos.reduce((n, x) => n + x.dur, 0) - linha.total) < 1e-6);
});

test('roteiro: fecha com "Pergunta pro LUCA", sem "operador LUCA" nem "classificação"', () => {
  const tudo = [...PIPELINE.map((b) => b.narracao), ...Object.values(PLANO_B)].join(' ');
  assert.match(PIPELINE.at(-1).narracao, /Pergunta pro LUCA\.$/);
  assert.doesNotMatch(tudo, /operador LUCA|classifica/i);
  assert.equal(PIPELINE.find((b) => b.id === 'b2').verdade, 'esquema');
});
