import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';
const { SessaoTurnos, SessaoVoz, emitirEventoStand } = await loadFrontendModule('./video-audio-entry.ts');
const original = { window: globalThis.window, fetch: globalThis.fetch, WebSocket: globalThis.WebSocket };
afterEach(() => Object.assign(globalThis, original));

test('vídeo escolhido pelo menu toma o áudio: corta TTS, aborta turno e isola microfone até terminar', async () => {
  let cancelado = false;
  let cortes = 0;
  const enviados = [];
  globalThis.window = { setTimeout: () => 1, clearTimeout() {}, addEventListener() {}, removeEventListener() {} };
  globalThis.fetch = async () => new Response('{"t":"fim","motivo":"ok"}\n');
  globalThis.WebSocket = class {
    static OPEN = 1;
    readyState = 1;
    constructor() { queueMicrotask(() => this.onopen()); }
    send(m) { enviados.push(JSON.parse(m)); }
    close() {}
  };
  const audio = { contexto: { currentTime: 0 }, saida: { gain: { cancelScheduledValues() {}, setTargetAtTime() {}, value: 1 } }, ouvir() {}, medirNivel: () => () => {} };
  const sessao = new SessaoTurnos();
  await sessao.iniciar({ conversa_id: 'fixture', limites: { silencio_s: 20, teto_s: 240 }, conexao: { transporte: 'scribe', url: 'ws://fixture' } }, { audio, drenar: () => [] });
  sessao.fila = { tocando: true, cortar() { cortes++; } };
  sessao.turno = { abort() { cancelado = true; } };
  sessao.estado = 'falando';
  const perguntas = [];
  sessao.perguntar = async (entrada) => perguntas.push(entrada);
  emitirEventoStand({ tipo: 'video_iniciado', id: 'pipeline-completo' });
  sessao.aoMicrofone(new Int16Array(1200).fill(10000), 0.3);
  sessao.aoScribe({ message_type: 'committed_transcript', text: 'No campo um trator pode bater' });
  assert.equal(cancelado, true, 'turno em andamento não pode continuar entregando TTS sobre a narração');
  assert.equal(cortes, 1, 'TTS já agendado deve parar');
  assert.ok(enviados.length > 0);
  assert.ok(Buffer.from(enviados.at(-1).audio_base_64, 'base64').every((b) => b === 0), 'vídeo não pode voltar ao Scribe como fala humana');
  assert.deepEqual(perguntas, []);
  emitirEventoStand({ tipo: 'video_terminou', id: 'pipeline-completo' });
  assert.deepEqual(perguntas, [{ evento: 'video_terminou', id: 'pipeline-completo' }]);
  sessao.encerrar();
});

test('reserva Realtime não aceita TTS/transcrição atrasados durante vídeo', () => {
  const sessao = new SessaoVoz();
  const enviados = [];
  let pedacos = 0;
  let roteamentos = 0;
  sessao.videoTocando = true;
  sessao.enviar = (m) => enviados.push(m);
  sessao.tocarPedaco = () => pedacos++;
  sessao.rotear = () => roteamentos++;
  sessao.aoEvento({ type: 'response.created', response: { id: 'atrasada' } });
  sessao.aoEvento({ type: 'response.output_audio.delta', delta: 'AA==' });
  sessao.aoEvento({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'narração do vídeo' });
  assert.deepEqual(enviados, [{ type: 'response.cancel' }]);
  assert.equal(pedacos, 0);
  assert.equal(roteamentos, 0);
});
