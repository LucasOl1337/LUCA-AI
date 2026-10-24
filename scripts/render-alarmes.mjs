// Render offline dos alarmes da cabine com o código real (criarMotorBipe e
// timbreAlarme; o /sonolencia usa o mesmo ALARMES.sono). Nada toca na
// caixa do host: OfflineAudioContext do pacote `node-web-audio-api`, que não é
// dependência do app (passe a pasta dele em WEB_AUDIO_API).
//   WEB_AUDIO_API=/caminho/node_modules/node-web-audio-api node scripts/render-alarmes.mjs SAIDA
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const saida = process.argv[2];
if (!saida) throw new Error('uso: node scripts/render-alarmes.mjs SAIDA');
await fs.mkdir(saida, { recursive: true });
const require = createRequire(import.meta.url);
const { OfflineAudioContext } = require(process.env.WEB_AUDIO_API || 'node-web-audio-api');

const pacote = await build({
  stdin: { contents: `export * from './src/components/gameplay/timbreAlarme';
export { criarMotorBipe } from './src/components/gameplay/bipeCabine';
export { bipeProximidade, BIPE_SONO, BIPE_RE } from './src/components/gameplay/alertaCabine';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node', external: ['react', 'three'], logLevel: 'error',
});
const arquivo = path.join(process.cwd(), 'scripts', `.alarmes-bundle-${process.pid}.mjs`);
await fs.writeFile(arquivo, pacote.outputFiles[0].text);
let m;
try { m = await import(arquivo); } finally { await fs.rm(arquivo, { force: true }); }

const SR = 48000;
/** Relógio falso do `window.setInterval`, avançado de 10 em 10 ms pelo próprio render. */
function relogio() {
  const tarefas = new Map(); let id = 0, agora = 0;
  globalThis.window = { setInterval: (fn, ms) => { tarefas.set(++id, { fn, ms, prox: agora + ms }); return id; }, clearInterval: (i) => tarefas.delete(i) };
  return { avancar(ms) { agora += ms; for (const t of [...tarefas.values()]) while (t.prox <= agora + 1e-6) { t.prox += t.ms; t.fn(); } } };
}

/**
 * Roda `roteiro(tMs)` (devolve {intervaloMs, som} ou null) num OfflineAudioContext,
 * com o motor real do bipe, e devolve o PCM mono.
 */
async function renderMotor(segundos, roteiro, escolha) {
  const ctx = new OfflineAudioContext(1, Math.round(segundos * SR), SR);
  const alvo = new Proxy(ctx, { get(t, n) { if (n === 'state') return 'running'; const v = Reflect.get(t, n, t); return typeof v === 'function' ? v.bind(t) : v; } });
  const r = relogio();
  const som = { obter: () => alvo, destravar: async () => true, ligarDestravas: () => () => {} };
  const motor = m.criarMotorBipe(som, escolha ? m.alarmesDa(escolha) : undefined);
  let anterior = 'nada';
  const passo = (tMs) => {
    const b = roteiro(tMs);
    const chave = b ? `${b.intervaloMs}|${b.som}` : 'nada';
    if (b) motor.tocar(b.intervaloMs, b.som); else if (anterior !== 'nada') motor.parar();
    anterior = chave;
    r.avancar(10);
  };
  passo(0);
  for (let t = 10; t < segundos * 1000 - 20; t += 10) ctx.suspend(t / 1000).then(() => { passo(t); ctx.resume(); });
  const buf = await ctx.startRendering();
  motor.fechar();
  return buf.getChannelData(0);
}

/** Sons antigos (até 87c0ca5), reconstruídos para comparar: onda quadrada/senoide crua. */
async function renderAntigo(segundos, eventos) {
  const ctx = new OfflineAudioContext(1, Math.round(segundos * SR), SR);
  for (const { t, hz, dur, vol, tipo = 'square' } of eventos) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = tipo; o.frequency.value = hz;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.setValueAtTime(vol, t + dur - 0.01); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.01);
  }
  return (await ctx.startRendering()).getChannelData(0);
}

// Cenas: o mesmo roteiro do painel (alertaCabine) para cada opção.
const aproximacao = (tMs) => {
  // 400 cm → 0 em 6 s (sensor de ré/colisão apertando), 1,2 s encostado, depois livre.
  if (tMs >= 7200) return null;
  const cm = Math.max(0, 400 - 400 * tMs / 6000);
  return m.bipeProximidade(cm);
};
const fixo = (b, ate) => (tMs) => (tMs < ate ? b : null);
const zonaEInclinacao = (tMs) => (tMs < 1800 ? { intervaloMs: 120, som: 'zona' } : tMs < 2200 ? null : tMs < 4000 ? { intervaloMs: 200, som: 'inclinacao' } : null);

const cenas = {
  colisao: { segundos: 8, roteiro: aproximacao },
  'zona-inclinacao': { segundos: 4.4, roteiro: zonaEInclinacao, categoria: 'colisao' },
  re: { segundos: 4.2, roteiro: fixo(m.BIPE_RE, 4000) },
  sono: { segundos: 4.2, roteiro: fixo(m.BIPE_SONO, 4000) },
};

/** Eventos do som antigo (87c0ca5) com a mesma cadência. */
function antigo(nome) {
  const ev = []; const q = (t, hz, dur = 0.09, vol = 0.18) => ev.push({ t, hz, dur, vol });
  if (nome === 'colisao') {
    let t = 0;
    while (t < 6) { const cm = 400 - 400 * t / 6; if (cm <= 10) break; q(t, 1180); t += (100 + 700 * (Math.min(400, cm) - 10) / 390) / 1000; }
    q(t, 1180, 7.2 - t, 0.144);
  }
  if (nome === 'zona-inclinacao') { for (let t = 0; t < 1.8; t += 0.12) q(t, 990); for (let t = 2.2; t < 4; t += 0.2) q(t, 660); }
  if (nome === 're') for (let t = 0; t < 4; t += 0.6) q(t, 1040);
  if (nome === 'sono') for (let t = 0; t < 4; t += 0.3) q(t, 520);
  return ev;
}

const medidas = {};
function wav(pcm) {
  const b = Buffer.alloc(44 + pcm.length * 2);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(pcm.length * 2, 40);
  pcm.forEach((v, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2));
  return b;
}
/** Frequência dominante num trecho com som (DFT de 4096 pontos, 100–6000 Hz em passos de 10). */
function dominante(pcm) {
  let i0 = pcm.findIndex((v) => Math.abs(v) > 0.05); if (i0 < 0) return 0; i0 += 200;
  const N = 2048; let melhor = [0, 0];
  for (let hz = 100; hz <= 6000; hz += 10) {
    let re = 0, im = 0; const w = 2 * Math.PI * hz / SR;
    for (let i = 0; i < N; i++) { const v = pcm[i0 + i] ?? 0; re += v * Math.cos(w * i); im += v * Math.sin(w * i); }
    const a = Math.hypot(re, im); if (a > melhor[0]) melhor = [a, hz];
  }
  return melhor[1];
}
async function gravar(nome, pcm) {
  let pico = 0, soma = 0, ativos = 0;
  for (const v of pcm) { const a = Math.abs(v); pico = Math.max(pico, a); if (a > 0.01) { soma += v * v; ativos++; } }
  medidas[nome] = { segundos: +(pcm.length / SR).toFixed(2), pico: +pico.toFixed(3), rmsAtivo: +Math.sqrt(soma / Math.max(1, ativos)).toFixed(3), hzDominante: dominante(pcm) };
  if (pico >= 0.99) throw new Error(`${nome}: clipou (pico ${pico})`);
  await fs.writeFile(path.join(saida, `${nome}.wav`), wav(pcm));
}

for (const [nome, cena] of Object.entries(cenas)) {
  const cat = cena.categoria ?? nome;
  await gravar(`alarme-${nome}-0-atual`, await renderAntigo(cena.segundos, antigo(nome)));
  for (const op of ['A', 'B']) {
    const escolha = { ...m.ESCOLHA_ALARME, [cat]: op };
    await gravar(`alarme-${nome}-${op}`, await renderMotor(cena.segundos, cena.roteiro, escolha));
  }
}
// Padrão publicado (ESCOLHA_ALARME), o que o app toca de fato.
for (const [nome, cena] of Object.entries(cenas)) await gravar(`alarme-${nome}-publicado`, await renderMotor(cena.segundos, cena.roteiro));
await fs.writeFile(path.join(saida, 'alarme-medidas.json'), JSON.stringify({ escolha: m.ESCOLHA_ALARME, medidas }, null, 2) + '\n');
console.log(JSON.stringify(medidas, null, 1));
