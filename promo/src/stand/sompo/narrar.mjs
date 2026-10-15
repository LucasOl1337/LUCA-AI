// Narração M6: um wav por bloco na voz oficial do OmniVoice (resolvida na
// hora por /api/mcp/default), STT de volta como prova, e narracao.json com
// proveniência e duração de cada bloco. Áudio fica fora do git.
//
// Uso: node --experimental-strip-types promo/src/stand/sompo/narrar.mjs --roteiro painel-sompo|painel-segurado --saida DIR [--b5-sem-entrega]

import {execFileSync} from 'node:child_process';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {ROTEIROS, SOMPO_B5_SEM_ENTREGA} from './roteiros.ts';

const OMNI = process.env.OMNIVOICE_URL || 'http://localhost:3900';
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : undefined; };
const roteiroId = opt('roteiro');
const blocos = ROTEIROS[roteiroId];
if (!blocos) throw new Error('--roteiro painel-sompo|painel-segurado');
const saida = path.resolve(opt('saida') || '.');
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
function semelhanca(a, b) {
  const x = normaliza(a).split(' ');
  const y = new Set(normaliza(b).split(' '));
  return x.filter((w) => y.has(w)).length / x.length;
}

const saidaBlocos = [];
for (const bloco of blocos) {
  const texto = roteiroId === 'painel-sompo' && bloco.id === 'b5' && argv.includes('--b5-sem-entrega') ? SOMPO_B5_SEM_ENTREGA : bloco.narracao;
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
  saidaBlocos.push(item);
  console.log(`${bloco.id} ${item.duracao.toFixed(2)}s aderência ${item.aderencia}`);
}

await writeFile(path.join(saida, 'narracao.json'), JSON.stringify({
  roteiro: roteiroId,
  gerado_em: new Date().toISOString(),
  voz: {profile_id: voz, nome: perfil.name, origem: `${OMNI}/api/mcp/default`},
  invisible_watermark: false,
  blocos: saidaBlocos,
}, null, 2));
