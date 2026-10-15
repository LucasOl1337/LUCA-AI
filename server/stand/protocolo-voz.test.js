import test from 'node:test';
import assert from 'node:assert/strict';
import { base64DePcm16, criarDetectorFala, floatDeBase64Pcm16, fraseCorrente, LegendaCorrente, nivelNormalizado, rms } from '../../src/stand-voz/protocolo.ts';

test('PCM16 ida e volta por base64 preserva amostras', () => {
  const pcm = new Int16Array([0, 16384, -16384, 32767, -32768]);
  const volta = floatDeBase64Pcm16(base64DePcm16(pcm));
  assert.deepEqual([...volta].map((v) => Math.round(v * 0x8000)), [0, 16384, -16384, 32767, -32768]);
});

test('nível de áudio fica entre 0 e 1', () => {
  assert.equal(rms([]), 0);
  assert.equal(rms([0.5, -0.5]), 0.5);
  assert.equal(nivelNormalizado(0), 0);
  assert.equal(nivelNormalizado(0.1), 0.4);
  assert.equal(nivelNormalizado(0.9), 1);
});

test('legenda mostra só a frase corrente, inteira, e troca na frase seguinte', () => {
  const legenda = new LegendaCorrente();
  assert.equal(legenda.adicionar('Vou te mostrar'), 'Vou te mostrar');
  assert.equal(legenda.adicionar(' o caminho inteiro.'), 'Vou te mostrar o caminho inteiro.');
  assert.equal(legenda.adicionar(' O sensor'), 'O sensor');
  legenda.reiniciar();
  assert.equal(legenda.adicionar('Oi!'), 'Oi!');
  assert.equal(fraseCorrente(''), '');
});

test('detector local de fala exige 150 ms seguidos acima do limiar', () => {
  const detector = criarDetectorFala();
  assert.equal(detector.alimentar(0.2, 50), false);
  assert.equal(detector.alimentar(0.2, 50), false);
  assert.equal(detector.alimentar(0.01, 50), false);
  assert.equal(detector.alimentar(0.2, 50), false);
  assert.equal(detector.alimentar(0.2, 50), false);
  assert.equal(detector.alimentar(0.2, 50), true);
});
