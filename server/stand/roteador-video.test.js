import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  FORA_DE_ESCOPO, LIMIARES, avaliarTabela, carregarForaDeEscopo, carregarManifesto, classificar,
  criarCacheEmDisco, criarEmbedder, criarRoteador, hashTexto, promptVideos, validarManifesto,
} from './roteador-video.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const lerJson = (nome) => JSON.parse(fs.readFileSync(path.join(aqui, nome), 'utf8'));

// Embedder falso: cada texto conhecido vira um eixo; o resto, vetor nulo.
function embedFalso(mapa, contador = { chamadas: 0 }) {
  const embed = async (textos) => {
    contador.chamadas += 1;
    return textos.map((t) => mapa[t] ?? [0, 0, 0]);
  };
  embed.chave = 'falso|3';
  return embed;
}

const manifestoMini = [
  { id: 'a', titulo: 'A', arquivo: '/a.mp4', duracao_s: null, perguntas_exemplo: ['pa'], resumo_falado: 'Resumo A.' },
  { id: 'b', titulo: 'B', arquivo: '/b.mp4', duracao_s: 30, perguntas_exemplo: ['pb'], resumo_falado: 'Resumo B.' },
];

function cacheEmMemoria() {
  const dados = {};
  return { get: (k) => dados[k], set: (k, v) => { dados[k] = v; }, salvar() {} };
}

test('manifesto do stand é válido: vitrine financeira abre a volta; pipeline-completo saiu em 24/10 (ordem do Lucas)', () => {
  const manifesto = carregarManifesto();
  assert.deepEqual(manifesto.map((i) => i.id), ['luca-em-reais', 'painel-sompo', 'painel-segurado']);
  assert.ok(manifesto.every((i) => i.arquivo === `/stand/videos/${i.id}.mp4`));
});

test('validarManifesto aponta o id e o campo com problema', () => {
  const base = carregarManifesto().find((i) => i.id === 'painel-sompo');
  assert.throws(() => validarManifesto([{ ...base, id: 'Com Espaço' }]), /id inválido/);
  assert.throws(() => validarManifesto([base, { ...base }]), /id repetido/);
  assert.throws(() => validarManifesto([{ ...base, resumo_falado: ' ' }]), /painel-sompo.*resumo_falado vazio/);
  assert.throws(() => validarManifesto([{ ...base, duracao_s: 0 }]), /duracao_s/);
  assert.throws(() => validarManifesto([{ ...base, perguntas_exemplo: base.perguntas_exemplo.slice(0, 7) }]), /8 a 15/);
  const outro = { ...base, id: 'outro', perguntas_exemplo: [...base.perguntas_exemplo] };
  assert.throws(() => validarManifesto([base, outro]), /pergunta repetida/);
});

test('classificar: tocar, oferecer, null e fora de escopo', () => {
  const grupos = { a: [[1, 0, 0]], b: [[0, 1, 0]], [FORA_DE_ESCOPO]: [[0, 0, 1]] };
  assert.equal(classificar([1, 0, 0], grupos).decisao, 'tocar');
  assert.equal(classificar([1, 0, 0], grupos).id, 'a');
  // Perto de a e de b ao mesmo tempo: sem margem, só oferece.
  assert.deepEqual(classificar([1, 1, 0], grupos), { id: 'a', confianca: 0.707, decisao: 'oferecer' });
  // Mais perto do fora de escopo: resposta ao vivo.
  assert.equal(classificar([0.2, 0, 1], grupos), null);
  // Longe de tudo.
  assert.equal(classificar([0, 0, 0], grupos), null);
});

test('roteador devolve null em pergunta vazia, erro de rede e timeout', async () => {
  const silencio = () => {};
  const vazio = criarRoteador({ manifesto: manifestoMini, foraDeEscopo: [], embed: embedFalso({}), cache: cacheEmMemoria(), aoFalhar: silencio });
  assert.equal(await vazio.rotearPergunta('   '), null);

  const quebrado = async () => { throw new Error('stand_embeddings 502'); };
  quebrado.chave = 'x|3';
  const r1 = criarRoteador({ manifesto: manifestoMini, foraDeEscopo: [], embed: quebrado, cache: cacheEmMemoria(), aoFalhar: silencio });
  assert.equal(await r1.rotearPergunta('pa'), null);

  const lento = criarEmbedder({
    baseUrl: 'http://127.0.0.1:9', apiKey: '', modelo: 'm', dimensoes: 3,
    fetchImpl: (_url, { signal }) => new Promise((_, rejeitar) => signal.addEventListener('abort', () => rejeitar(signal.reason))),
  });
  const inicio = Date.now();
  await assert.rejects(lento(['oi'], { timeoutMs: 50 }));
  assert.ok(Date.now() - inicio < 1000);
});

test('roteador embute os exemplos uma vez e relê do cache em disco', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-stand-'));
  const arquivo = path.join(dir, 'stand', 'embeddings.json');
  const mapa = { pa: [1, 0, 0], pb: [0, 1, 0], 'quero o a': [0.95, 0.05, 0] };
  const contador = { chamadas: 0 };
  const opcoes = { manifesto: manifestoMini, foraDeEscopo: [], embed: embedFalso(mapa, contador) };

  const r1 = criarRoteador({ ...opcoes, cache: criarCacheEmDisco(arquivo) });
  assert.deepEqual(await r1.rotearPergunta('quero o a'), { id: 'a', confianca: 0.999, decisao: 'tocar' });
  assert.deepEqual(await r1.rotearPergunta('quero o a'), { id: 'a', confianca: 0.999, decisao: 'tocar' });
  assert.equal(contador.chamadas, 3); // 1 lote de exemplos + 2 perguntas
  assert.ok(fs.existsSync(arquivo));

  contador.chamadas = 0;
  const r2 = criarRoteador({ ...opcoes, cache: criarCacheEmDisco(arquivo) });
  await r2.rotearPergunta('quero o a');
  assert.equal(contador.chamadas, 1); // só a pergunta: exemplos vieram do disco
  fs.rmSync(dir, { recursive: true, force: true });
});

test('embedder manda modelo, dimensões e texto normalizado ao 9Router', async () => {
  let pedido;
  const embed = criarEmbedder({
    baseUrl: 'http://router/v1', apiKey: 'k', modelo: 'mod', dimensoes: 256,
    fetchImpl: async (url, init) => {
      pedido = { url, init };
      return { ok: true, json: async () => ({ data: [{ index: 1, embedding: [2] }, { index: 0, embedding: [1] }] }) };
    },
  });
  assert.deepEqual(await embed(['Oi, Tudo?', 'b']), [[1], [2]]);
  assert.equal(pedido.url, 'http://router/v1/embeddings');
  assert.equal(pedido.init.headers.Authorization, 'Bearer k');
  assert.deepEqual(JSON.parse(pedido.init.body), { model: 'mod', dimensions: 256, input: ['oi tudo', 'b'] });
});

test('promptVideos lista cada vídeo com o resumo falado e a regra do tocar_video', () => {
  const texto = promptVideos();
  assert.match(texto, /tocar_video\(id\)/);
  for (const item of carregarManifesto()) {
    assert.ok(texto.includes(`\`${item.id}\``));
    assert.ok(texto.includes(item.resumo_falado));
  }
  assert.ok(!texto.includes('{{VIDEOS}}'));
});

test('tabela de avaliação com vetores reais congelados: ≥90% de acerto e 0 falso positivo', () => {
  const { casos } = lerJson('roteador-video.avaliacao.json');
  const { vetores } = lerJson('roteador-video.vetores.json');
  const manifesto = carregarManifesto();
  const foraDeEscopo = carregarForaDeEscopo();
  assert.ok(casos.length >= 30);
  assert.ok(casos.some((c) => c.pergunta.startsWith('como que funciona o fluxo do dado até a entrega para os agentes')
    && c.esperado === null));

  const vetorDe = (texto) => {
    const v = vetores[hashTexto(texto)];
    assert.ok(v, `fixture desatualizado, rode roteador-calibrar.js: ${texto}`);
    return v;
  };
  const vetoresPorId = Object.fromEntries(manifesto.map((i) => [i.id, i.perguntas_exemplo.map(vetorDe)]));
  vetoresPorId[FORA_DE_ESCOPO] = foraDeEscopo.map(vetorDe);

  const r = avaliarTabela(casos, vetorDe, vetoresPorId, LIMIARES);
  const erros = r.linhas.filter((l) => !l.certo).map((l) => `${l.pergunta} -> ${JSON.stringify(l.resultado)}`);
  assert.equal(r.falsosPositivos, 0, erros.join('\n'));
  assert.ok(r.acerto >= 0.9, `acerto ${(r.acerto * 100).toFixed(1)}%\n${erros.join('\n')}`);
});

test('STAND_EMBEDDING_BASE_URL/API_KEY apontam só o roteador para outro 9Router (Railway sem embeddings, 24/10)', async () => {
  const antes = { url: process.env.STAND_EMBEDDING_BASE_URL, chave: process.env.STAND_EMBEDDING_API_KEY };
  process.env.STAND_EMBEDDING_BASE_URL = 'http://127.0.0.1:20129/v1';
  process.env.STAND_EMBEDDING_API_KEY = 'hostinger';
  try {
    let pedido;
    const embed = criarEmbedder({ fetchImpl: async (url, init) => { pedido = { url, init }; return { ok: true, json: async () => ({ data: [{ index: 0, embedding: [1] }] }) }; } });
    await embed(['oi']);
    assert.equal(pedido.url, 'http://127.0.0.1:20129/v1/embeddings');
    assert.equal(pedido.init.headers.Authorization, 'Bearer hostinger');
  } finally {
    for (const [k, v] of [['STAND_EMBEDDING_BASE_URL', antes.url], ['STAND_EMBEDDING_API_KEY', antes.chave]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});
