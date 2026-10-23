import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
const bundle = await build({ stdin: { contents: `export * from './src/stand-voz/portaMicrofone'; export * from './src/stand-voz/escuta'; export * from './src/stand-voz/sessaoTurnos';`, resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm' });
const { configurarPortaMicrofone: porta, microfonePermitido, criarDespertador, SessaoTurnos } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
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
