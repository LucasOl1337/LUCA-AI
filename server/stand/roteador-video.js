// Roteamento de pergunta para vídeo do stand (M7).
// Compara a transcrição da pergunta com as perguntas de exemplo do manifesto
// `shared/stand/videos.json` por embeddings (9Router) e decide se a IA toca um
// vídeo pré-gravado, oferece o vídeo ou responde ao vivo. Não checa se o mp4
// existe: isso é de quem toca (`tocar_video`).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTER_API_KEY, ROUTER_BASE_URL } from '../config.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
export const CAMINHO_MANIFESTO = path.resolve(aqui, '../../shared/stand/videos.json');
const CAMINHO_PROMPT = path.join(aqui, 'prompt-videos.md');

export const MODELO_PADRAO = 'openrouter/openai/text-embedding-3-small';
export const DIMENSOES = 256;
export const TIMEOUT_PERGUNTA_MS = 1500;
const TIMEOUT_LOTE_MS = 15000;

// Calibrados com `node server/stand/roteador-calibrar.js` sobre a tabela
// `roteador-video.avaliacao.json` (resultado na entrega da M7).
export const LIMIARES = Object.freeze({ tocar: 0.6, oferecer: 0.45, margem: 0.03 });

const ID_VALIDO = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function normalizar(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .replace(/[?!.,;:¿¡"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hashTexto(texto) {
  return crypto.createHash('sha1').update(normalizar(texto)).digest('hex').slice(0, 16);
}

export function validarManifesto(lista) {
  if (!Array.isArray(lista) || lista.length === 0) throw new Error('manifesto_vazio');
  const ids = new Set();
  const perguntas = new Map();
  for (const [i, item] of lista.entries()) {
    const onde = `manifesto[${i}]${item?.id ? ` (${item.id})` : ''}`;
    if (!ID_VALIDO.test(String(item?.id ?? ''))) throw new Error(`${onde}: id inválido`);
    if (ids.has(item.id)) throw new Error(`${onde}: id repetido`);
    ids.add(item.id);
    for (const campo of ['titulo', 'arquivo', 'resumo_falado']) {
      if (typeof item[campo] !== 'string' || !item[campo].trim()) throw new Error(`${onde}: ${campo} vazio`);
    }
    if (item.duracao_s !== null && !(Number.isFinite(item.duracao_s) && item.duracao_s > 0)) {
      throw new Error(`${onde}: duracao_s deve ser null ou número > 0`);
    }
    const exemplos = item.perguntas_exemplo;
    if (!Array.isArray(exemplos) || exemplos.length < 8 || exemplos.length > 15) {
      throw new Error(`${onde}: perguntas_exemplo precisa de 8 a 15 itens`);
    }
    for (const pergunta of exemplos) {
      const chave = normalizar(pergunta);
      if (!chave) throw new Error(`${onde}: pergunta vazia`);
      if (perguntas.has(chave)) throw new Error(`${onde}: pergunta repetida (também em ${perguntas.get(chave)}): ${pergunta}`);
      perguntas.set(chave, item.id);
    }
  }
  return lista;
}

export function carregarManifesto(caminho = CAMINHO_MANIFESTO) {
  return validarManifesto(JSON.parse(fs.readFileSync(caminho, 'utf8')));
}

export function criarEmbedder({
  baseUrl = ROUTER_BASE_URL,
  apiKey = ROUTER_API_KEY,
  modelo = process.env.STAND_EMBEDDING_MODEL || MODELO_PADRAO,
  dimensoes = DIMENSOES,
  fetchImpl = globalThis.fetch,
} = {}) {
  async function embed(textos, { timeoutMs = TIMEOUT_PERGUNTA_MS } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const resposta = await fetchImpl(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({ model: modelo, dimensions: dimensoes, input: textos.map(normalizar) }),
    });
    if (!resposta.ok) throw new Error(`stand_embeddings ${resposta.status}`);
    const dados = (await resposta.json())?.data;
    if (!Array.isArray(dados) || dados.length !== textos.length) throw new Error('stand_embeddings_resposta_invalida');
    return [...dados].sort((a, b) => a.index - b.index).map((d) => d.embedding);
  }
  embed.chave = `${modelo}|${dimensoes}`;
  return embed;
}

export function criarCacheEmDisco(arquivo) {
  let dados = {};
  try { dados = JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch { dados = {}; }
  return {
    get: (chave) => dados[chave],
    set: (chave, vetor) => { dados[chave] = vetor; },
    salvar() {
      fs.mkdirSync(path.dirname(arquivo), { recursive: true });
      fs.writeFileSync(arquivo, JSON.stringify(dados));
    },
  };
}

export function cosseno(a, b) {
  let ab = 0; let aa = 0; let bb = 0;
  for (let i = 0; i < a.length; i += 1) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
  return aa && bb ? ab / Math.sqrt(aa * bb) : 0;
}

// Nota de cada id = maior cosseno entre a pergunta e os exemplos dele.
export function classificar(vetor, vetoresPorId, limiares = LIMIARES) {
  const notas = Object.entries(vetoresPorId)
    .map(([id, vetores]) => ({ id, nota: Math.max(...vetores.map((v) => cosseno(vetor, v))) }))
    .sort((a, b) => b.nota - a.nota);
  const [primeiro, segundo] = notas;
  if (!primeiro || primeiro.nota < limiares.oferecer) return null;
  const confianca = Math.round(primeiro.nota * 1000) / 1000;
  const margem = primeiro.nota - (segundo?.nota ?? -1);
  const decisao = primeiro.nota >= limiares.tocar && margem >= limiares.margem ? 'tocar' : 'oferecer';
  return { id: primeiro.id, confianca, decisao };
}

// Cria o roteador: embute os exemplos uma vez (cache em disco por modelo e
// texto) e depois só a pergunta. Qualquer falha de rede ou timeout vira `null`
// (a IA responde ao vivo); não há plano B por palavra-chave.
export function criarRoteador({
  manifesto = carregarManifesto(),
  embed = criarEmbedder(),
  cache = criarCacheEmDisco(path.join(process.env.LUCA_DATA_DIR || path.resolve(process.cwd(), '.luca'), 'stand', 'embeddings.json')),
  limiares = LIMIARES,
  aoFalhar = (erro) => console.warn('[stand] roteador sem embeddings:', erro.message),
} = {}) {
  let vetoresPorId = null;

  async function vetoresDosExemplos() {
    if (vetoresPorId) return vetoresPorId;
    const chaveDe = (texto) => `${embed.chave}|${hashTexto(texto)}`;
    const todos = manifesto.flatMap((item) => item.perguntas_exemplo);
    const faltando = todos.filter((texto) => !cache.get(chaveDe(texto)));
    if (faltando.length) {
      const vetores = await embed(faltando, { timeoutMs: TIMEOUT_LOTE_MS });
      faltando.forEach((texto, i) => cache.set(chaveDe(texto), vetores[i]));
      cache.salvar();
    }
    vetoresPorId = Object.fromEntries(manifesto.map((item) => [
      item.id,
      item.perguntas_exemplo.map((texto) => cache.get(chaveDe(texto))),
    ]));
    return vetoresPorId;
  }

  async function rotearPergunta(texto) {
    if (!normalizar(texto)) return null;
    try {
      const exemplos = await vetoresDosExemplos();
      const [vetor] = await embed([texto], { timeoutMs: TIMEOUT_PERGUNTA_MS });
      return classificar(vetor, exemplos, limiares);
    } catch (erro) {
      aoFalhar(erro);
      return null;
    }
  }

  return { rotearPergunta, preaquecer: vetoresDosExemplos };
}

// Instrução pro cérebro de voz (M1), com a lista de vídeos do manifesto.
export function promptVideos(manifesto = carregarManifesto()) {
  const lista = manifesto
    .map((item) => `- \`${item.id}\`: ${item.titulo}. Resumo falado: "${item.resumo_falado}"`)
    .join('\n');
  return fs.readFileSync(CAMINHO_PROMPT, 'utf8').replace('{{VIDEOS}}', lista).trim();
}
