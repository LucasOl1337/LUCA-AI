import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { ReferenciaEco } = await loadFrontendModule('../../src/stand-voz/ecoPcm.ts');
const hz = 24000;
// Dois sinais fixos com frequências/envelopes distintos. Não é áudio pessoal nem
// teste de acurácia ASR: mede a proteção entre PCM de playback e PCM enviado.
const tts = Float32Array.from({ length: hz }, (_, i) =>
  (0.12 + 0.05 * Math.sin(i / 230)) * (Math.sin(i / 11) + 0.5 * Math.sin(i / 23)));
const humana = Float32Array.from({ length: 1200 }, (_, i) => 0.09 * Math.sin(i / 17) + 0.04 * Math.sin(i / 31));
const captura = (inicio, { ganho = 0.6, pessoa = false } = {}) => Int16Array.from({ length: 1200 }, (_, i) =>
  Math.round(((tts[inicio + i] || 0) * ganho + (pessoa ? humana[i] : 0)) * 32767));

function referencia() { const r = new ReferenciaEco(); r.agendar(tts, 1); return r; }

test('eco PCM: atraso de120ms e ganho diferente são silenciáveis antes do ASR', () => {
  const r = referencia();
  const eco = r.analisar(captura(6000), 1 + (6000 + 1200) / hz + 0.12);
  assert.equal(eco.eco, true);
  assert.ok(eco.correlacao > 0.99);
});

test('fala dupla e voz humana diferente passam intactas durante playback', () => {
  const r = referencia();
  assert.equal(r.analisar(captura(6000, { pessoa: true }), 1.42).eco, false);
  const soHumana = Int16Array.from(humana, (x) => Math.round(x * 32767));
  assert.equal(r.analisar(soHumana, 1.42).eco, false);
});

test('cauda após corte ainda é eco; áudio futuro cortado deixa de ser referência', () => {
  const r = referencia();
  r.cortar(1.5);
  assert.equal(r.analisar(captura(9600), 1.65).eco, true, 'sinal de1,4s volta200ms depois');
  assert.equal(r.analisar(captura(18000), 1.92).eco, false, 'trecho de1,75s nunca tocou');
});

test('LUCA sem TTS e referência expirada nunca silenciam entrada humana', () => {
  const pcm = captura(6000, { pessoa: true });
  assert.equal(new ReferenciaEco().analisar(pcm, 1.42).eco, false);
  assert.equal(referencia().analisar(pcm, 5).eco, false);
});

// Vizinho concreto: atraso não alinhado à redução3kHz (2883 amostras).
test('eco PCM: refina fase para atraso120,125ms, fora da grade3kHz', () => {
  assert.equal(referencia().analisar(captura(6000), 1.420125).eco, true);
});
