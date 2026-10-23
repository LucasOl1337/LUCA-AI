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
// Ganho da voz que registra toda escrita: a voz não pode mudar de volume sozinha.
function ganhoVigiado() {
  const escritas = [];
  let valor = 1;
  const anotar = (nome) => (...args) => { escritas.push([nome, ...args]); };
  return {
    escritas,
    gain: {
      get value() { return valor; },
      set value(v) { escritas.push(['value', v]); valor = v; },
      setTargetAtTime: anotar('setTargetAtTime'),
      setValueAtTime: anotar('setValueAtTime'),
      linearRampToValueAtTime: anotar('linearRampToValueAtTime'),
      exponentialRampToValueAtTime: anotar('exponentialRampToValueAtTime'),
      cancelScheduledValues: anotar('cancelScheduledValues'),
    },
  };
}
function comMicrofone() {
  const caso = emFala();
  const enviados = [];
  const saida = ganhoVigiado();
  caso.sessao.ws = { readyState: WebSocket.OPEN, send: (m) => enviados.push(JSON.parse(m)) };
  caso.sessao.audio = { contexto: { currentTime: 1.42 }, saida };
  caso.sessao.referenciaEco.agendar(tts, 1);
  return { ...caso, enviados, saida, abaixadas: () => saida.escritas.length };
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

// Até 23/10 este caso exigia o defeito D1: com o PCM "independente" (eco de
// sala que não bate 96% com a referência), o próprio texto da narração cortava
// a fala. Agora o microfone segue íntegro ao Scribe, mas durante a fala só o
// texto decide: eco do que ele está dizendo e "Oi" solto não cortam.
test('fala dupla no PCM não deixa o próprio texto nem um Oi solto cortarem a fala', () => {
  for (const texto of ['Oi', 'O animal na pista']) {
    const { sessao, entradas, enviados, cortes } = comMicrofone();
    const primeiro = sinal(6000, true);
    sessao.aoMicrofone(primeiro, 0.1);
    sessao.audio.contexto.currentTime = 1.47;
    sessao.aoMicrofone(sinal(7200, true), 0.1);
    assert.deepEqual(Buffer.from(enviados[0].audio_base_64, 'base64'), Buffer.from(primeiro.buffer));
    sessao.aoScribe({ message_type: 'partial_transcript', text: texto });
    sessao.aoScribe({ message_type: 'committed_transcript', text: texto });
    assert.equal(cortes(), 0, texto);
    assert.deepEqual(entradas, [], texto);
  }
});

test('(a) volume alto no microfone durante a fala não mexe no ganho da voz', () => {
  const { sessao, saida } = comMicrofone();
  // 2 s de "outro som" alto (bipe, vídeo, plateia) sem relação com a voz.
  for (let i = 0; i < 40; i++) {
    sessao.audio.contexto.currentTime = 1.42 + i * 0.05;
    sessao.aoMicrofone(Int16Array.from({ length: 1200 }, (_, j) => Math.round(20000 * Math.sin(j / 3))), 0.6);
  }
  assert.deepEqual(saida.escritas, []);
  assert.equal(saida.gain.value, 1);
});

test('(b) eco sujo do próprio texto não interrompe, nem com PCM independente (caso real 22/10)', () => {
  const ecos = [
    'Oi, animal na pista é um dos seus... Ô, animal.',
    'Ô, animal.',
    'animal na pista é um dos cenários',
    'é um dos cenários do simulador',
  ];
  for (const texto of ecos) {
    const { sessao, entradas, cortes } = emFala();
    sessao.falaIndependenteAte = Number.POSITIVE_INFINITY;
    sessao.aoScribe({ message_type: 'partial_transcript', text: texto });
    sessao.aoScribe({ message_type: 'committed_transcript', text: texto });
    assert.equal(cortes(), 0, texto);
    assert.deepEqual(entradas, [], texto);
  }
});

test('(b) comando curto que está na própria fala é eco; fora dela continua valendo', () => {
  const { sessao, entradas, cortes } = emFala();
  sessao.falado = 'Não é nada sério, deve ter sido só um susto.';
  sessao.aoScribe({ message_type: 'partial_transcript', text: 'Não' });
  sessao.aoScribe({ message_type: 'committed_transcript', text: 'Não' });
  assert.equal(cortes(), 0);
  assert.deepEqual(entradas, []);
  sessao.aoScribe({ message_type: 'partial_transcript', text: 'Pare' });
  assert.equal(cortes(), 1);
});

test('(c) visitante com frase clara e diferente interrompe a fala', () => {
  const { sessao, entradas, cortes } = emFala();
  sessao.aoScribe({ message_type: 'partial_transcript', text: 'Quanto custa o trator?' });
  assert.equal(cortes(), 1);
  sessao.aoScribe({ message_type: 'committed_transcript', text: 'Quanto custa o trator?' });
  assert.deepEqual(entradas, [{ texto: 'Quanto custa o trator?' }]);
});

test('(d) eco na cauda logo depois da fala não abre turno novo', () => {
  const { sessao, entradas } = emFala();
  sessao.estado = 'ouvindo';
  sessao.fila.tocando = false;
  sessao.fimDaFala = performance.now() - 800;
  sessao.falaIndependenteAte = Number.POSITIVE_INFINITY;
  for (const texto of ['cenários do nosso simulador', 'Simulador 3D.', 'um dos cenários']) {
    sessao.aoScribe({ message_type: 'committed_transcript', text: texto });
  }
  assert.deepEqual(entradas, []);
  sessao.aoScribe({ message_type: 'committed_transcript', text: 'Como funciona a sonolência?' });
  assert.deepEqual(entradas, [{ texto: 'Como funciona a sonolência?' }]);
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
