import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';
const { setaDaTecla, comandoDesejado } = await loadFrontendModule('../../src/components/gameplay/volante.ts');
test('os comandos anunciados no guia dirigem e freiam o trator', () => {
  assert.equal(setaDaTecla('W'), 'cima');
  assert.equal(setaDaTecla('w'), 'cima');
  assert.equal(setaDaTecla('ArrowUp'), 'cima');
  assert.equal(setaDaTecla('s'), 'baixo');
  assert.equal(setaDaTecla(' '), 'baixo');
  assert.equal(setaDaTecla('a'), 'esquerda');
  assert.equal(setaDaTecla('d'), 'direita');
  assert.equal(setaDaTecla('Escape'), null);
  assert.deepEqual(comandoDesejado(null, { cima: false, baixo: true, esquerda: false, direita: true }), { acelerador: 0, freio: 1, esterco: 1 });
});
