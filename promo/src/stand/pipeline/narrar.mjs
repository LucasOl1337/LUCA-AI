// Narração do pipeline-completo: um wav por bloco na voz oficial do OmniVoice
// (resolvida na hora por /api/mcp/default, marca d'água invisível desligada),
// STT de volta como prova e narracao.json com duração de cada bloco.
// Áudio fica fora do git.
//
// Uso: node --experimental-strip-types promo/src/stand/pipeline/narrar.mjs --saida DIR [--plano-b] [--so b6,b5]
// --plano-b: a corrida da bancada não entregou parecer (timings.json sem b6_entrega).
// --so: refaz só esses blocos e mantém os demais do narracao.json existente.

import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {PIPELINE, PLANO_B} from './roteiro.ts';

const OMNI = process.env.OMNIVOICE_URL || 'http://localhost:3900';
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : undefined; };
const saida = path.resolve(opt('saida') || '.');
const planoB = argv.includes('--plano-b');
const so = opt('so') ? new Set(opt('so').split(',')) : null;
const anterior = so && existsSync(path.join(saida, 'narracao.json')) ? JSON.parse(await readFile(path.join(saida, 'narracao.json'), 'utf8')) : null;
await mkdir(saida, {recursive: true});

const json = async (url, init) => { const r = await fetch(url, init); if (!r.ok) throw new Error(`${url}: ${r.status} ${await r.text()}`); return r.json(); };

const {profile_id: voz} = await json(`${OMNI}/api/mcp/default`);
const vozes = await json(`${OMNI}/v1/audio/voices`);
const perfil = (vozes.voices || vozes.data || []).find((v) => v.voice_id === voz || v.id === voz);
if (!perfil) throw new Error(`voz oficial ${voz} não está em /v1/audio/voices`);
let marca = await json(`${OMNI}/watermark/status`);
if (marca.invisible_enabled) {
  await json(`${OMNI}/watermark/settings?invisible=false`, {method: 'POST'});
  marca = await json(`${OMNI}/watermark/status`);
  if (marca.invisible_enabled) throw new Error('não consegui desligar a marca d’água invisível');
}

const duracao = (arq) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', arq], {encoding: 'utf8'}).trim());
const normaliza = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const semelhanca = (a, b) => { const x = normaliza(a).split(' '); const y = new Set(normaliza(b).split(' ')); return x.filter((w) => y.has(w)).length / x.length; };

const blocos = [];
for (const bloco of PIPELINE) {
  const texto = planoB && PLANO_B[bloco.id] ? PLANO_B[bloco.id] : bloco.narracao;
  const velho = anterior?.blocos.find((b) => b.id === bloco.id);
  if (so && !so.has(bloco.id) && velho?.texto === texto) { blocos.push(velho); continue; }
  const arq = path.join(saida, `${bloco.id}.wav`);
  const r = await fetch(`${OMNI}/v1/audio/speech`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({model: 'tts-1-hd', voice: voz, input: texto, response_format: 'wav', language: 'pt'}),
  });
  if (!r.ok) throw new Error(`TTS ${bloco.id}: ${r.status} ${await r.text()}`);
  await writeFile(arq, Buffer.from(await r.arrayBuffer()));
  const form = new FormData();
  form.append('file', new Blob([await readFile(arq)], {type: 'audio/wav'}), `${bloco.id}.wav`);
  form.append('model', 'whisper-1');
  form.append('response_format', 'json');
  form.append('language', 'pt');
  const stt = await json(`${OMNI}/v1/audio/transcriptions`, {method: 'POST', body: form});
  const item = {id: bloco.id, texto, arquivo: path.basename(arq), duracao: duracao(arq), stt: stt.text, aderencia: Number(semelhanca(texto, stt.text || '').toFixed(2))};
  blocos.push(item);
  console.log(`${bloco.id} ${item.duracao.toFixed(2)}s aderência ${item.aderencia}`);
}

await writeFile(path.join(saida, 'narracao.json'), JSON.stringify({
  roteiro: 'pipeline-completo',
  plano_b: planoB,
  gerado_em: new Date().toISOString(),
  voz: {profile_id: voz, nome: perfil.name, origem: `${OMNI}/api/mcp/default`},
  invisible_watermark: false,
  blocos,
}, null, 2));
