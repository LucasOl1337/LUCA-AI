import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { SessaoTurnos } = await loadFrontendModule('../../src/stand-voz/sessaoTurnos.ts');

// Exercita o receptor real do Scribe; sem abrir microfone, caixa ou rede.
function emFala() {
  const sessao = new SessaoTurnos();
  const entradas = [];
  let cortes = 0;
  sessao.estado = 'falando';
  sessao.fila = { tocando: true };
  sessao.falado = 'O animal na pista é um dos cenários do nosso simulador 3D.';
  sessao.interromper = () => { cortes++; };
  sessao.perguntar = async (entrada) => { entradas.push(entrada); };
  return { sessao, entradas, cortes: () => cortes };
}

test('final Scribe curto não contorna a confirmação exigida da parcial durante TTS', () => {
  const { sessao, entradas, cortes } = emFala();
  sessao.aoScribe({ message_type: 'partial_transcript', text: 'Oi' });
  sessao.aoScribe({ message_type: 'committed_transcript', text: 'Oi' });
  assert.equal(cortes(), 0);
  assert.deepEqual(entradas, []);
});

test('eco exato não corta, mas interrupção humana curta continua funcionando', () => {
  const { sessao, entradas, cortes } = emFala();
  sessao.aoScribe({ message_type: 'committed_transcript', text: 'O animal na pista' });
  assert.deepEqual(entradas, []);
  sessao.aoScribe({ message_type: 'partial_transcript', text: 'Pare!' });
  assert.equal(cortes(), 1);
});

test('sim/não/volta finais são válidos durante TTS e uma palavra fora de TTS também', () => {
  for (const texto of ['Sim', 'Não', 'Volta']) {
    const { sessao, entradas } = emFala();
    sessao.aoScribe({ message_type: 'committed_transcript', text: texto });
    assert.deepEqual(entradas, [{ texto }]);
  }
  const { sessao, entradas } = emFala();
  sessao.estado = 'ouvindo';
  sessao.fila.tocando = false;
  sessao.fimDaFala = -10000;
  sessao.aoScribe({ message_type: 'committed_transcript', text: 'Oi' });
  assert.deepEqual(entradas, [{ texto: 'Oi' }]);
});

// Referência acústica controlada através do caminho real mic → Scribe.
const tts = Float32Array.from({ length: 24000 }, (_, i) =>
  0.17 * Math.sin(i / 11) + 0.07 * Math.sin(i / 23));
function sinal(inicio, humana = false) {
  return Int16Array.from({ length: 1200 }, (_, i) => Math.round(32767 * (
    0.5 * tts[inicio + i] + (humana ? 0.12 * Math.sin(i / 17) : 0))));
}
function comMicrofone() {
  const caso = emFala();
  const enviados = [];
  let abaixadas = 0;
  caso.sessao.ws = { readyState: WebSocket.OPEN, send: (m) => enviados.push(JSON.parse(m)) };
  caso.sessao.audio = { contexto: { currentTime: 1.42 } };
  caso.sessao.abaixarVoz = () => { abaixadas++; };
  caso.sessao.referenciaEco.agendar(tts, 1);
  return { ...caso, enviados, abaixadas: () => abaixadas };
}

test('eco puro envia silêncio ao Scribe e não abaixa/corta a própria caixa', () => {
  const { sessao, enviados, abaixadas, entradas } = comMicrofone();
  sessao.aoMicrofone(sinal(6000), 0.1);
  sessao.audio.contexto.currentTime = 1.47;
  sessao.aoMicrofone(sinal(7200), 0.1);
  assert.ok(enviados.every((m) => Buffer.from(m.audio_base_64, 'base64').every((b) => b === 0)));
  assert.equal(abaixadas(), 0);
  sessao.aoScribe({ message_type: 'committed_transcript', text: 'Oi' });
  assert.deepEqual(entradas, []);
});

test('Oi humano e palavras da narração continuam válidos com fala dupla comprovada no PCM', () => {
  for (const texto of ['Oi', 'O animal na pista']) {
    const { sessao, entradas, enviados } = comMicrofone();
    const primeiro = sinal(6000, true);
    sessao.aoMicrofone(primeiro, 0.1);
    sessao.audio.contexto.currentTime = 1.47;
    sessao.aoMicrofone(sinal(7200, true), 0.1);
    assert.deepEqual(Buffer.from(enviados[0].audio_base_64, 'base64'), Buffer.from(primeiro.buffer));
    sessao.aoScribe({ message_type: 'committed_transcript', text: texto });
    assert.deepEqual(entradas, [{ texto }]);
  }
});

test('cauda textual expira: repetir uma frase humana após TTS continua válido', () => {
  const { sessao, entradas } = emFala();
  sessao.estado = 'ouvindo';
  sessao.fila.tocando = false;
  sessao.fimDaFala = -10000;
  sessao.aoScribe({ message_type: 'committed_transcript', text: 'O animal na pista' });
  assert.deepEqual(entradas, [{ texto: 'O animal na pista' }]);
});

test('sem TTS: microfone humano permanece idêntico no transporte para o Scribe', () => {
  const { sessao, enviados, entradas } = comMicrofone();
  sessao.estado = 'ouvindo';
  sessao.fila.tocando = false;
  sessao.referenciaEco.cortar(0);
  const pcm = sinal(6000, true);
  sessao.aoMicrofone(pcm, 0.1);
  assert.deepEqual(Buffer.from(enviados[0].audio_base_64, 'base64'), Buffer.from(pcm.buffer));
  sessao.aoScribe({ message_type: 'committed_transcript', text: 'Oi' });
  assert.deepEqual(entradas, [{ texto: 'Oi' }]);
});
