import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result = await build({ entryPoints: ['src/components/gameplay/comandosCabine.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { COMANDOS_CABINE: C, familiaControle, setaDoComando, rotuloTecla } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
test('família real PS por fabricante e Xbox pelo id', () => {
  assert.equal(familiaControle('054c-0ce6 Wireless Controller'), 'ps');
  assert.equal(familiaControle('Sony DualSense'), 'ps');
  assert.equal(familiaControle('Xbox Wireless Controller'), 'xbox');
});
test('guia compartilha as teclas usadas para direção', () => {
  assert.equal(setaDoComando(C.acelerar.teclas[0]), 'cima');
  assert.equal(setaDoComando(C.frear.teclas[2]), 'baixo');
  assert.equal(setaDoComando('ArrowLeft'), 'esquerda');
  assert.equal(setaDoComando('D'), 'direita');
  assert.equal(setaDoComando('v'), null);
  assert.equal(rotuloTecla(' '), 'Espaço');
});
test('câmera 0/C não conflita com PTT 4/V nem Coruja 16', () => {
  assert.equal(C.camera.botao, 0);
  assert.deepEqual(C.camera.teclas, ['c']);
  assert.equal(C.falar.botao, 4);
  assert.deepEqual(C.falar.teclas, ['v']);
  assert.equal(C.coruja.botao, 16);
  assert.deepEqual(C.coruja.teclas, []);
});
