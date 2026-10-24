import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
const bundle = await build({ stdin: { contents: `export * from './src/stand-voz/portaMicrofone'; export * from './src/stand-voz/escuta'; export * from './src/stand-voz/sessaoTurnos';`, resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm' });
const { configurarPortaMicrofone: porta, microfonePermitido, criarDespertador, SessaoTurnos, pttDoTotem, microfoneDoControle, botaoPtt, guardarBotaoPtt, nomeBotaoPtt } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
const pcmBruto = execFileSync('ffmpeg', ['-v', 'error', '-i', 'tests/fixtures/cabine/diesel-carga.mp3', '-f', 's16le', '-ac', '1', '-ar', '24000', 'pipe:1'], { maxBuffer: 10 * 1024 * 1024 });
const motor = new Int16Array(pcmBruto.buffer.slice(pcmBruto.byteOffset, pcmBruto.byteOffset + pcmBruto.byteLength));
const rms = pcm => Math.sqrt(pcm.reduce((s, n) => s + (n / 32768) ** 2, 0) / pcm.length);
function sessaoCaptura() {
  const s = new SessaoTurnos();
  const enviados = [];
  s.ws = { readyState: 1, send: msg => enviados.push(JSON.parse(msg)) };
  return { s, enviados };
}
globalThis.WebSocket = { OPEN: 1 };
test('motor diesel real a mix 0,22 abre detector RMS sem PTT: exige gesto na corrida', () => {
  const detector = criarDespertador();
  for (let i = 0; i < 20; i++) detector.alimentar(.001, 50);
  let abriu = false;
  for (let i = 0; i + 1200 <= motor.length; i += 1200) {
    const pcm = Int16Array.from(motor.subarray(i, i + 1200), n => Math.round(n * .22));
    abriu ||= detector.alimentar(rms(pcm), 50);
  }
  assert.equal(abriu, true, 'a gravação diesel em carga demonstra o falso despertar');
});
test('motor diesel real a mix máximo 0,22 não sai para Scribe com PTT solto', () => {
  porta(true, false);
  const { s, enviados } = sessaoCaptura();
  for (let i = 0; i + 1200 <= motor.length; i += 1200) {
    const pcm = Int16Array.from(motor.subarray(i, i + 1200), n => Math.round(n * .22));
    s.aoMicrofone(pcm, rms(pcm));
  }
  assert.ok(enviados.length > 0);
  for (const msg of enviados) assert.ok(Buffer.from(msg.audio_base_64, 'base64').every(n => n === 0));
  assert.equal(microfonePermitido(), false);
  porta(false, false);
});
test('pergunta clara com PTT na corrida chega ao turno; soltar volta ao silêncio', () => {
  porta(true, true);
  const { s, enviados } = sessaoCaptura();
  const pcm = new Int16Array(1200).fill(3000);
  s.aoMicrofone(pcm, .09);
  assert.ok(Buffer.from(enviados[0].audio_base_64, 'base64').some(n => n !== 0));
  const turnos = [];
  s.estado = 'ouvindo'; s.fimDaFala = -10000;
  s.perguntar = async e => turnos.push(e);
  s.aoScribe({ message_type: 'committed_transcript', text: 'Como eu faço para frear o trator?' });
  assert.deepEqual(turnos, [{ texto: 'Como eu faço para frear o trator?' }]);
  porta(true, false); s.aoMicrofone(pcm, .09);
  assert.ok(Buffer.from(enviados.at(-1).audio_base_64, 'base64').every(n => n === 0));
  porta(false, false);
});
test('fora da corrida voz livre permanece habilitada', () => { porta(false, false); assert.equal(microfonePermitido(), true); });

test('PTT do Totem: soltar o L1 com frase aberta manda commit na hora, sem esperar o VAD', () => {
  porta(true, true);
  const { s, enviados } = sessaoCaptura();
  const pcm = new Int16Array(1200).fill(3000);
  s.aoMicrofone(pcm, .09);
  s.estado = 'ouvindo'; s.fimDaFala = -10000;
  s.armarSilencio = () => {};
  s.aoScribe({ message_type: 'partial_transcript', text: 'Como funciona o sensor do trator' });
  assert.equal(s.parcial, 'Como funciona o sensor do trator');
  porta(true, false); s.aoMicrofone(pcm, .09);
  assert.equal(enviados.at(-1).commit, true);
  assert.ok(Buffer.from(enviados.at(-1).audio_base_64, 'base64').every(n => n === 0));
  s.aoMicrofone(pcm, .09);
  assert.equal(enviados.at(-1).commit, false, 'um commit por frase');
  porta(false, false);
});
test('PTT do Totem: apertar o L1 com o LUCA falando corta a fala', () => {
  porta(true, false);
  const { s } = sessaoCaptura();
  const pcm = new Int16Array(1200).fill(3000);
  s.aoMicrofone(pcm, .09);
  let cortou = 0;
  s.estado = 'falando';
  s.interromper = () => { cortou += 1; };
  porta(true, true); s.aoMicrofone(pcm, .09); s.aoMicrofone(pcm, .09);
  assert.equal(cortou, 1);
  porta(false, false);
});
test('PTT do Totem: ?ptt=1 liga e fica guardado; ?ptt=0 desliga', () => {
  const guardado = new Map();
  globalThis.localStorage = { getItem: k => guardado.get(k) ?? null, setItem: (k, v) => guardado.set(k, v) };
  assert.equal(pttDoTotem(''), false);
  assert.equal(pttDoTotem('?ptt=1'), true);
  assert.equal(pttDoTotem('?stub=0'), true);
  assert.equal(pttDoTotem('?ptt=0'), false);
  assert.equal(pttDoTotem(''), false);
  delete globalThis.localStorage;
  assert.equal(pttDoTotem(''), false, 'sem armazenamento, desligado');
});
test('microfone do DualSense: pega o aparelho, não o padrão nem a saída', () => {
  const lista = [
    { kind: 'audioinput', label: 'Padrão - Microfone (Wireless Controller)', deviceId: 'default' },
    { kind: 'audioinput', label: 'Webcam C920', deviceId: 'cam' },
    { kind: 'audiooutput', label: 'DualSense wireless controller (PS5) Estéreo analógico', deviceId: 'saida' },
    { kind: 'audioinput', label: 'DualSense wireless controller (PS5) Mono', deviceId: 'ds' },
  ];
  assert.equal(microfoneDoControle(lista), 'ds');
  assert.equal(microfoneDoControle(lista.slice(0, 1)), 'default');
  assert.equal(microfoneDoControle([lista[1]]), null);
});

test("PTT do Totem: botão escolhido fica guardado e só aceita os livres", () => {
  const guardado = new Map();
  globalThis.localStorage = { getItem: (k) => guardado.get(k) ?? null, setItem: (k, v) => guardado.set(k, String(v)) };
  try {
    assert.equal(botaoPtt(), 4);
    guardarBotaoPtt(5);
    assert.equal(botaoPtt(), 5);
    assert.equal(nomeBotaoPtt(), 'R1');
    guardarBotaoPtt(0);
    assert.equal(botaoPtt(), 4, '✕ troca a câmera na corrida: não vira PTT');
  } finally { delete globalThis.localStorage; }
});
