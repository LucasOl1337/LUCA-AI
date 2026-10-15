// Montagem do pipeline-completo: captura (timings.json + cena.mp4) + narração
// (narracao.json) → props da composição, .srt, render pela raiz do stand e
// encode final ≤25 MB (faststart, yuv420p).
//
// Uso: node --experimental-strip-types promo/src/stand/pipeline/montar.mjs --captura DIR --narracao DIR [--so-props]
// Saída versionada: public/stand/videos/pipeline-completo.{mp4,srt}.
// Render pesado: rode pela fila (agent-bench fila luca-stand-m5 rodar -- ...).

import {execFileSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {paraSrt} from '../legendas.ts';
import {montarLinhaDoTempo} from '../sompo/linha-do-tempo.ts';
import {PIPELINE} from './roteiro.ts';
import {planosDoPipeline} from './planos.ts';

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : undefined; };
const dir = path.resolve(opt('captura') || '');
const dirNarracao = path.resolve(opt('narracao') || path.join(dir, 'narracao'));
if (!existsSync(path.join(dir, 'timings.json')) || !existsSync(path.join(dirNarracao, 'narracao.json'))) throw new Error('--captura DIR --narracao DIR');
const LIMITE_BYTES = 25 * 1024 * 1024;
const ID = 'pipeline-completo';

const timings = JSON.parse(readFileSync(path.join(dir, 'timings.json'), 'utf8'));
const narracao = JSON.parse(readFileSync(path.join(dirNarracao, 'narracao.json'), 'utf8'));
const temEntrega = timings.rastro.marcas.b6_entrega !== undefined;
if (narracao.plano_b === temEntrega) throw new Error(`narração ${narracao.plano_b ? 'plano B' : 'principal'} não bate com a captura (${temEntrega ? 'com' : 'sem'} entrega)`);
const duracaoCaptura = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(dir, 'cena.mp4')], {encoding: 'utf8'}).trim());
const PLANOS = planosDoPipeline(timings.rastro.marcas);

const publico = path.join(dir, 'public');
for (const sub of ['captura', 'narracao', 'brand']) mkdirSync(path.join(publico, sub), {recursive: true});
copyFileSync(path.join(dir, 'cena.mp4'), path.join(publico, 'captura', 'cena.mp4'));
for (const f of ['cyber-owl.jpg', 'jetbrains-mono.woff2']) copyFileSync(path.join(repoDir, 'promo', 'public', 'brand', f), path.join(publico, 'brand', f));

const blocos = PIPELINE.map((b) => {
  const n = narracao.blocos.find((x) => x.id === b.id);
  if (!n) throw new Error(`narração do bloco ${b.id} ausente`);
  copyFileSync(path.join(dirNarracao, n.arquivo), path.join(publico, 'narracao', n.arquivo));
  const detalhe = b.id === 'b6' && !temEntrega ? 'sessão da bancada' : b.detalhe;
  return {id: b.id, texto: n.texto, narracao: `narracao/${n.arquivo}`, duracaoNarracao: n.duracao, verdade: b.verdade, detalhe, planos: PLANOS[b.id]};
});
const linha = montarLinhaDoTempo(blocos);
for (const p of linha.planos) {
  if (p.inicioCaptura !== null && p.inicioCaptura + p.dur > duracaoCaptura - 0.1) p.inicioCaptura = Math.max(0, duracaoCaptura - 0.1 - p.dur);
}

const props = {captura: 'captura/cena.mp4', rastro: timings.rastro, linha, blocoEsquema: 'b2'};
writeFileSync(path.join(dir, 'props.json'), JSON.stringify(props, null, 2));
const destino = path.join(repoDir, 'public', 'stand', 'videos');
mkdirSync(destino, {recursive: true});
writeFileSync(path.join(destino, `${ID}.srt`), paraSrt(linha.trechos));
console.log(`linha do tempo: ${linha.total.toFixed(2)} s, ${linha.planos.length} planos, ${linha.trechos.length} legendas`);
if (argv.includes('--so-props')) process.exit(0);

const mestre = path.join(dir, `${ID}-mestre.mp4`);
const chrome = process.env.REMOTION_BROWSER || '';
execFileSync(path.join(repoDir, 'node_modules', '.bin', 'remotion'), [
  'render', 'promo/src/stand/index.tsx', 'PipelineCompleto', mestre,
  `--props=${path.join(dir, 'props.json')}`, `--public-dir=${publico}`,
  '--codec=h264', '--crf=16', '--overwrite', '--concurrency=4',
  ...(chrome ? [`--browser-executable=${chrome}`] : []),
], {cwd: repoDir, stdio: 'inherit'});

const final = path.join(destino, `${ID}.mp4`);
for (const crf of [23, 26, 29]) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mestre, '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-r', '30', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-movflags', '+faststart', final]);
  if (statSync(final).size <= LIMITE_BYTES) { console.log(`final crf ${crf}: ${(statSync(final).size / 1048576).toFixed(2)} MB`); break; }
}
if (statSync(final).size > LIMITE_BYTES) throw new Error('vídeo final passou de 25 MB');
