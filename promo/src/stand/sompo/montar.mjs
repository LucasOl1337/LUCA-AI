// Montagem M6: captura (timings.json + cena.mp4) + narração (narracao.json)
// → props da composição Remotion, .srt, render e encode final ≤15 MB.
//
// Uso: node promo/src/stand/sompo/montar.mjs --roteiro painel-sompo|painel-segurado --captura DIR [--so-props]
// DIR = m6-captura/<sompo|segurado> (fora do git). Saída versionada:
// public/stand/videos/<roteiro>.mp4 e .srt.

import {execFileSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {paraSrt} from '../legendas.ts';
import {montarLinhaDoTempo} from './linha-do-tempo.ts';
import {ROTEIROS} from './roteiros.ts';

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : undefined; };
const roteiro = opt('roteiro');
const dir = path.resolve(opt('captura') || '');
if (!ROTEIROS[roteiro] || !existsSync(path.join(dir, 'timings.json'))) throw new Error('--roteiro painel-sompo|painel-segurado --captura DIR');
const LIMITE_BYTES = 15 * 1024 * 1024;

const timings = JSON.parse(readFileSync(path.join(dir, 'timings.json'), 'utf8'));
const narracao = JSON.parse(readFileSync(path.join(dir, 'narracao', 'narracao.json'), 'utf8'));
const m = timings.rastro.marcas;
const duracaoCaptura = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(dir, 'cena.mp4')], {encoding: 'utf8'}).trim());
const marca = (nome, desloca = 0) => {
  if (m[nome] === undefined) throw new Error(`marca ${nome} ausente em timings.json`);
  return Math.max(0, m[nome] + desloca);
};

/** Planos de cada bloco: onde a captura mostra o que a narração diz. */
const PLANOS = {
  'painel-sompo': () => ({
    b1: [{inicio: marca('b1_welcome', -0.4)}],
    b2: [{inicio: marca('b2_casos', -0.2), dur: 5.5}, {inicio: marca('b2_grade', -0.2)}],
    b3: [{inicio: marca('b3_safra_demo', -0.3)}],
    b4: [{inicio: marca('b4_frames', -2.2)}],
    b5: m.b5_entrega !== undefined
      ? [{inicio: marca('b5_clique', -1.2), dur: 3}, {inicio: marca('b5_sessao', -0.5), dur: 2.5}, {inicio: marca('b5_entrega', -0.8)}]
      : [{inicio: marca('b5_clique', -1.2), dur: 3}, {inicio: marca('b5_sessao', -0.5)}],
    b6: [{inicio: marca('b6_rodape', -0.3), dur: 4.5}, {inicio: null}],
  }),
  'painel-segurado': () => ({
    b1: [{inicio: marca('b1_veiculos', -0.3)}],
    b2: [{inicio: marca('b2_simulador', -1.4)}],
    b3: [{inicio: marca('b3_cenario', -2.2), dur: 4}, {inicio: m.b3_alerta !== undefined ? marca('b3_alerta', -0.5) : marca('b3_cenario', 1.5)}],
    b4: [{inicio: marca('b4_gravar', -1.2)}],
    b5: [{inicio: marca('b5_frames', -2.5)}],
    b6: [{inicio: null}],
  }),
}[roteiro]();

const FECHAMENTO = {
  'painel-sompo': {linha1: 'Evidência do campo, organizada para decidir.', linha2: 'LUCA-AI · painel SOMPO'},
  'painel-segurado': {linha1: 'Próximo passo: a tela do produtor, ligada à apólice.', linha2: 'LUCA-AI · ainda não existe hoje'},
}[roteiro];

const publico = path.join(dir, 'public');
mkdirSync(path.join(publico, 'captura'), {recursive: true});
mkdirSync(path.join(publico, 'narracao'), {recursive: true});
mkdirSync(path.join(publico, 'brand'), {recursive: true});
copyFileSync(path.join(dir, 'cena.mp4'), path.join(publico, 'captura', 'cena.mp4'));
for (const f of ['cyber-owl.jpg', 'jetbrains-mono.woff2']) copyFileSync(path.join(repoDir, 'promo', 'public', 'brand', f), path.join(publico, 'brand', f));

const blocos = ROTEIROS[roteiro].map((b) => {
  const n = narracao.blocos.find((x) => x.id === b.id);
  if (!n) throw new Error(`narração do bloco ${b.id} ausente`);
  copyFileSync(path.join(dir, 'narracao', n.arquivo), path.join(publico, 'narracao', n.arquivo));
  return {id: b.id, texto: n.texto, narracao: `narracao/${n.arquivo}`, duracaoNarracao: n.duracao, verdade: b.verdade, detalhe: b.detalhe, fonte: b.fonte, planos: PLANOS[b.id]};
});
const linha = montarLinhaDoTempo(blocos);
// Nenhum plano pode pedir captura além do fim gravado.
for (const p of linha.planos) {
  if (p.inicioCaptura !== null && p.inicioCaptura + p.dur > duracaoCaptura - 0.1) p.inicioCaptura = Math.max(0, duracaoCaptura - 0.1 - p.dur);
}

const props = {titulo: roteiro, captura: 'captura/cena.mp4', rastro: timings.rastro, linha, fechamento: FECHAMENTO};
writeFileSync(path.join(dir, 'props.json'), JSON.stringify(props, null, 2));
const destino = path.join(repoDir, 'public', 'stand', 'videos');
mkdirSync(destino, {recursive: true});
writeFileSync(path.join(destino, `${roteiro}.srt`), paraSrt(linha.trechos));
console.log(`linha do tempo: ${linha.total.toFixed(2)} s, ${linha.planos.length} planos, ${linha.trechos.length} legendas`);
if (argv.includes('--so-props')) process.exit(0);

const composicao = roteiro === 'painel-sompo' ? 'PainelSompo' : 'PainelSegurado';
const mestre = path.join(dir, `${roteiro}-mestre.mp4`);
execFileSync(path.join(repoDir, 'node_modules', '.bin', 'remotion'), [
  'render', 'promo/src/stand/index.tsx', composicao, mestre,
  `--props=${path.join(dir, 'props.json')}`, `--public-dir=${publico}`,
  '--codec=h264', '--crf=16', '--overwrite', '--concurrency=4',
], {cwd: repoDir, stdio: 'inherit'});

const final = path.join(destino, `${roteiro}.mp4`);
for (const crf of [24, 27, 30]) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mestre, '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-r', '30', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-movflags', '+faststart', final]);
  if (statSync(final).size <= LIMITE_BYTES) { console.log(`final crf ${crf}: ${(statSync(final).size / 1048576).toFixed(2)} MB`); break; }
}
if (statSync(final).size > LIMITE_BYTES) throw new Error('vídeo final passou de 15 MB');
