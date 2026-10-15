import assert from 'node:assert/strict';
import test from 'node:test';
import { montarLinhaDoTempo, quebrarLegenda, RESPIRO } from './linha-do-tempo.ts';

const bloco = (id, duracaoNarracao, planos, texto = 'Frase curta.') => ({
  id, texto, narracao: `${id}.wav`, duracaoNarracao, verdade: 'real', detalhe: '', planos,
});

test('cada bloco dura narração + respiros e os planos cobrem o bloco sem buraco', () => {
  const lt = montarLinhaDoTempo([
    bloco('b1', 3, [{ inicio: 10 }]),
    bloco('b2', 5, [{ inicio: 20, dur: 2 }, { inicio: 40 }]),
  ]);
  assert.equal(lt.blocos[0].dur, RESPIRO.antes + 3 + RESPIRO.depois);
  assert.equal(lt.blocos[1].de, lt.blocos[0].dur);
  assert.equal(lt.total, lt.blocos[0].dur + RESPIRO.antes + 5 + RESPIRO.fim);
  const b2 = lt.planos.filter((p) => p.bloco === 'b2');
  assert.deepEqual(b2.map((p) => p.inicioCaptura), [20, 40]);
  assert.equal(b2[0].dur, 2);
  assert.ok(Math.abs(b2[0].dur + b2[1].dur - lt.blocos[1].dur) < 1e-9);
});

test('bloco sem plano vira cartão (inicioCaptura null)', () => {
  const lt = montarLinhaDoTempo([bloco('b6', 2, [])]);
  assert.equal(lt.planos[0].inicioCaptura, null);
});

test('legenda quebra em pedaços legíveis e cobre toda a fala do bloco', () => {
  const texto = 'Na safra, ela compara a frota. Esta frota é de demonstração: três máquinas, quatro meses, e o que foi prevenção ou dano em cada uma.';
  const pedacos = quebrarLegenda(texto);
  assert.ok(pedacos.length >= 2);
  assert.ok(pedacos.every((p) => p.length <= 75));
  assert.equal(pedacos.join(' '), texto);
  const lt = montarLinhaDoTempo([bloco('b3', 8, [{ inicio: 0 }], texto)]);
  assert.equal(lt.trechos[0].inicio, RESPIRO.antes);
  assert.equal(lt.trechos.at(-1).fim, RESPIRO.antes + 8);
});

test('legenda não deixa palavra órfã no fim', () => {
  const texto = 'Hoje, dentro do painel, o produtor cadastra a máquina dele e abre no simulador.';
  const pedacos = quebrarLegenda(texto);
  assert.equal(pedacos.length, 2);
  assert.ok(pedacos.every((p) => p.split(' ').length >= 4), pedacos.join(' | '));
  assert.equal(pedacos.join(' '), texto);
});
