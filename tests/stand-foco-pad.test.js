import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { lerSetas, proximoNaDirecao, primeiroItem, SETAS_SOLTAS, REPETE_APOS_MS, REPETE_CADA_MS } = await loadFrontendModule('../../src/components/stand/focoPad.ts');

const pad = (apertados = [], axes = [0, 0, 0, 0]) => ({ mapping: 'standard', axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: apertados.includes(i), value: apertados.includes(i) ? 1 : 0 })) });

test('setas: um passo por toque, repetição só depois de segurar', () => {
  const a = lerSetas(pad([13]), SETAS_SOLTAS, 1000);
  assert.equal(a.passo, 'baixo');
  assert.equal(lerSetas(pad([13]), a.next, 1000 + REPETE_APOS_MS - 1).passo, null);
  const r = lerSetas(pad([13]), a.next, 1000 + REPETE_APOS_MS);
  assert.equal(r.passo, 'baixo');
  assert.equal(lerSetas(pad([13]), r.next, 1000 + REPETE_APOS_MS + REPETE_CADA_MS - 1).passo, null);
  assert.equal(lerSetas(pad([13]), r.next, 1000 + REPETE_APOS_MS + REPETE_CADA_MS).passo, 'baixo');
  assert.equal(lerSetas(pad([15]), r.next, 1001 + REPETE_APOS_MS).passo, 'direita', 'trocar de direção é toque novo');
  assert.deepEqual(lerSetas(pad([]), r.next, 2000), { passo: null, origem: 'dpad', next: SETAS_SOLTAS });
});

test('setas: analógico só bem inclinado; sem layout standard não anda', () => {
  assert.equal(lerSetas(pad([], [0, -0.9, 0, 0]), SETAS_SOLTAS, 0).passo, 'cima');
  assert.equal(lerSetas(pad([], [0.3, 0, 0, 0]), SETAS_SOLTAS, 0).passo, null);
  assert.equal(lerSetas({ ...pad([12]), mapping: '' }, SETAS_SOLTAS, 0).passo, null);
  assert.equal(lerSetas(null, SETAS_SOLTAS, 0).passo, null);
});

test('setas: diz se veio do D-pad ou do analógico (na Simulação o analógico é o volante)', () => {
  assert.equal(lerSetas(pad([14]), SETAS_SOLTAS, 0).origem, 'dpad');
  assert.equal(lerSetas(pad([], [-0.95, 0, 0, 0]), SETAS_SOLTAS, 0).origem, 'analogico');
  const analogico = lerSetas(pad([], [0, 0.95, 0, 0]), SETAS_SOLTAS, 0);
  const dpad = lerSetas(pad([13]), analogico.next, 10);
  assert.deepEqual([dpad.passo, dpad.origem], ['baixo', 'dpad'], 'mesma direção por outra origem é toque novo');
});

// Menu em coluna, com cabeçalho (voltar à esquerda, fechar à direita).
const voltar = { x: 0, y: 0, w: 200, h: 40 };
const fechar = { x: 400, y: 0, w: 40, h: 40 };
const item = (i) => ({ x: 0, y: 60 + i * 60, w: 440, h: 50 });
const menu = [voltar, fechar, item(0), item(1), item(2)];

test('foco: anda em coluna e na linha do cabeçalho; sem nada à frente fica', () => {
  assert.equal(proximoNaDirecao(menu, 2, 'baixo'), 3);
  assert.equal(proximoNaDirecao(menu, 3, 'cima'), 2);
  assert.equal(proximoNaDirecao(menu, 4, 'baixo'), null);
  assert.equal(proximoNaDirecao(menu, 0, 'direita'), 1);
  assert.equal(proximoNaDirecao(menu, 1, 'esquerda'), 0);
  assert.equal(proximoNaDirecao(menu, 2, 'cima'), 0, 'o primeiro item sobe pro voltar (mais perto na lateral)');
});

test('foco: barra em linha prefere o vizinho da mesma faixa ao de outra linha', () => {
  const barra = [0, 1, 2].map((i) => ({ x: 300 + i * 160, y: 900, w: 150, h: 60 }));
  const longe = { x: 700, y: 300, w: 200, h: 60 };
  const caixas = [...barra, longe];
  assert.equal(proximoNaDirecao(caixas, 0, 'direita'), 1);
  assert.equal(proximoNaDirecao(caixas, 1, 'direita'), 2);
  assert.equal(proximoNaDirecao(caixas, 2, 'cima'), 3);
});

test('foco inicial: o mais de cima, e à esquerda na mesma linha', () => {
  assert.equal(primeiroItem([]), null);
  assert.equal(primeiroItem([item(1), fechar, voltar]), 2);
});
