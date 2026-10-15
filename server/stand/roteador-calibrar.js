// Calibração manual do roteador de vídeos do stand (M7). Chama o 9Router de
// verdade UMA vez, regrava o fixture de vetores e imprime acerto e falso
// positivo por limiar. Rode de novo só se exemplos, tabela ou modelo mudarem.
//   ROUTER_BASE_URL=... ROUTER_API_KEY=... node server/stand/roteador-calibrar.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FORA_DE_ESCOPO, LIMIARES, TIMEOUT_PERGUNTA_MS, avaliarTabela, carregarForaDeEscopo, carregarManifesto,
  criarEmbedder, hashTexto,
} from './roteador-video.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
export const CAMINHO_AVALIACAO = path.join(aqui, 'roteador-video.avaliacao.json');
export const CAMINHO_VETORES = path.join(aqui, 'roteador-video.vetores.json');

const manifesto = carregarManifesto();
const foraDeEscopo = carregarForaDeEscopo();
const { casos } = JSON.parse(fs.readFileSync(CAMINHO_AVALIACAO, 'utf8'));
const textos = [...new Set([
  ...manifesto.flatMap((i) => i.perguntas_exemplo), ...foraDeEscopo, ...casos.map((c) => c.pergunta),
])];

const embed = criarEmbedder();
const inicio = Date.now();
const vetores = await embed(textos, { timeoutMs: 30000 });
console.log(`embeddings: ${textos.length} textos, ${embed.chave}, ${Date.now() - inicio} ms`);

// Latência de uma pergunta sozinha, o caso real do stand.
const t0 = Date.now();
await embed([casos[0].pergunta], { timeoutMs: TIMEOUT_PERGUNTA_MS });
console.log(`latência de uma pergunta: ${Date.now() - t0} ms`);

const arredondar = (v) => v.map((x) => Math.round(x * 1e4) / 1e4);
const porHash = Object.fromEntries(textos.map((t, i) => [hashTexto(t), arredondar(vetores[i])]));
fs.writeFileSync(CAMINHO_VETORES, `${JSON.stringify({ modelo: embed.chave, vetores: porHash })}\n`);

const vetorDe = (t) => porHash[hashTexto(t)];
const vetoresPorId = Object.fromEntries(manifesto.map((i) => [i.id, i.perguntas_exemplo.map(vetorDe)]));
if (process.env.STAND_SEM_ANCORAS !== '1') vetoresPorId[FORA_DE_ESCOPO] = foraDeEscopo.map(vetorDe);

console.log('\ntocar  acerto  acertoComVideo  falsoPositivo  nullEmOferecer');
for (let tocar = 0.4; tocar <= 0.801; tocar += 0.025) {
  const r = avaliarTabela(casos, vetorDe, vetoresPorId, { ...LIMIARES, tocar });
  console.log(`${tocar.toFixed(3)}  ${(r.acerto * 100).toFixed(1).padStart(5)}%  ${(r.acertoComVideo * 100).toFixed(1).padStart(13)}%  ${String(r.falsosPositivos).padStart(13)}  ${String(r.nullEmOferecer).padStart(14)}`);
}

const atual = avaliarTabela(casos, vetorDe, vetoresPorId);
console.log(`\nlimiares atuais ${JSON.stringify(LIMIARES)}: acerto ${(atual.acerto * 100).toFixed(1)}%, falso positivo ${atual.falsosPositivos}, null em oferecer ${atual.nullEmOferecer}`);
for (const l of atual.linhas) {
  const r = l.resultado;
  console.log(`${l.certo ? 'ok ' : 'ERR'} ${String(l.esperado).padEnd(17)} -> ${r ? `${r.decisao} ${r.id} ${r.confianca}` : 'null'}  | ${l.pergunta}`);
}
