// Conhecimento do cérebro de voz do stand (M1): prompt-base e busca no repo.
// Só lê uma lista branca de documentos de produto; código, auth e deploy
// ficam fora de propósito, porque a resposta sai em voz alta para o público.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregarManifesto, promptVideos } from './roteador-video.js';
import { comandosParaPrompt } from '../../shared/stand/comandos-voz.ts';

export const RAIZ_REPO = fileURLToPath(new URL('../../', import.meta.url));

export const DOCUMENTOS_PERMITIDOS = Object.freeze([
  'docs/stand-publico.md',
  'INDEX.md',
  'GLOSSARY.md',
  'docs/sompo.md',
  'docs/sompo-demo.md',
  'docs/sompo-gap-analysis.md',
  'docs/sompo-oficina.md',
  'docs/sensor-lab.md',
  'docs/geofencing.md',
  'docs/sonolencia.md',
  'src/lib/sompo-stories.ts',
]);

/** Documento escrito para o público do stand ganha da documentação técnica no empate de termos. */
const PESO_DOCUMENTO = Object.freeze({ 'docs/stand-publico.md': 1.4 });

const PALAVRAS_VAZIAS = new Set(('a o os as um uma uns umas de do da dos das em no na nos nas para pra por com sem que '
  + 'como e é ao aos se ele ela eles elas isso esse essa este esta me te lhe qual quais quando onde ou mas mais muito '
  + 'funciona fazer faz tem ter ser sao são foi vai voce você eu nos nós o que até ate sobre').split(' '));

function normalizar(texto) {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function termos(texto) {
  return [...new Set(normalizar(texto).split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !PALAVRAS_VAZIAS.has(t)))];
}

/** Raiz para casar flexões simples (agente/agentes, entrega/entregar, dado/dados). */
function radical(termo) {
  const singular = termo.length > 4 ? termo.replace(/s$/, '') : termo;
  return singular.length > 6 ? singular.slice(0, 6) : singular;
}

function trechosDoArquivo(caminho, conteudo) {
  const trechos = [];
  let titulo = '';
  let cabecalhoPendente = '';
  for (const bloco of conteudo.split(/\n\s*\n/)) {
    const texto = bloco.trim();
    if (!texto) continue;
    const cabecalho = texto.match(/^#{1,4}\s+(.+)$/);
    if (cabecalho) {
      titulo = cabecalho[1].trim();
      cabecalhoPendente = texto;
      continue;
    }
    trechos.push({ caminho, titulo, texto: cabecalhoPendente ? `${cabecalhoPendente}\n${texto}` : texto });
    cabecalhoPendente = '';
  }
  return trechos;
}

export function carregarIndice({ raiz = RAIZ_REPO, documentos = DOCUMENTOS_PERMITIDOS } = {}) {
  const indice = [];
  for (const caminho of documentos) {
    let conteudo;
    try {
      conteudo = fs.readFileSync(path.join(raiz, caminho), 'utf8');
    } catch {
      continue; // documento ausente no release não derruba a busca
    }
    for (const trecho of trechosDoArquivo(caminho, conteudo)) {
      indice.push({
        ...trecho,
        radicais: new Set(termos(`${trecho.titulo} ${trecho.texto}`).map(radical)),
        radicaisTitulo: new Set(termos(trecho.titulo).map(radical)),
      });
    }
  }
  return indice;
}

let indicePadrao = null;

/** No máximo este número de trechos por documento, para a resposta cruzar fontes. */
const TRECHOS_POR_DOCUMENTO = 2;

/** Pontua por IDF: termo raro no índice vale mais; termo no título da seção vale o dobro. */
export function buscarNoRepo(consulta, { indice, limite = 5, maxChars = 600 } = {}) {
  const base = indice ?? (indicePadrao ??= carregarIndice());
  const pedidos = [...new Set(termos(consulta).map(radical))];
  if (!pedidos.length || !base.length) return [];
  const peso = new Map(pedidos.map((r) => {
    const frequencia = base.filter((t) => t.radicais.has(r)).length;
    return [r, frequencia ? Math.log(1 + base.length / frequencia) : 0];
  }));
  const porDocumento = new Map();
  return base
    .map((trecho) => ({
      trecho,
      pontos: (PESO_DOCUMENTO[trecho.caminho] ?? 1) * pedidos.reduce((soma, r) => soma
        + (trecho.radicais.has(r) ? peso.get(r) : 0)
        + (trecho.radicaisTitulo.has(r) ? peso.get(r) : 0), 0),
    }))
    .filter((item) => item.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos || a.trecho.texto.length - b.trecho.texto.length)
    .filter(({ trecho }) => {
      const vistos = porDocumento.get(trecho.caminho) ?? 0;
      porDocumento.set(trecho.caminho, vistos + 1);
      return vistos < TRECHOS_POR_DOCUMENTO;
    })
    .slice(0, Math.max(1, Math.min(limite, 5)))
    .map(({ trecho }) => ({
      caminho: trecho.caminho,
      secao: trecho.titulo,
      trecho: trecho.texto.length > maxChars ? `${trecho.texto.slice(0, maxChars)}…` : trecho.texto,
    }));
}

function userStories(raiz) {
  try {
    const fonte = fs.readFileSync(path.join(raiz, 'src/lib/sompo-stories.ts'), 'utf8');
    const titulos = [...fonte.matchAll(/title:\s*'([^']+)'/g)].map((m) => m[1]);
    const solucoes = [...fonte.matchAll(/solution:\s*'([^']+)'/g)].map((m) => m[1]);
    return titulos.map((titulo, i) => `- ${titulo} ${solucoes[i] || ''}`.trim());
  } catch {
    return [];
  }
}

/** O mp4 do manifesto existe em dist/ (produção) ou public/ (dev)? */
export function videoTemArquivo(arquivo, raiz = RAIZ_REPO) {
  const relativo = String(arquivo || '').replace(/^\/+/, '');
  if (!relativo || relativo.includes('..')) return false;
  return ['dist', 'public'].some((pasta) => fs.existsSync(path.join(raiz, pasta, relativo)));
}

/**
 * Instrução dos vídeos (M7) só com os vídeos cujo mp4 já está publicado: a IA
 * não anuncia vídeo que `tocar_video` recusaria. Sem nenhum, fica de fora.
 */
function promptVideosDaM7(raiz, lerManifesto) {
  try {
    const publicados = lerManifesto().filter((video) => videoTemArquivo(video.arquivo, raiz));
    return publicados.length ? promptVideos(publicados) : '';
  } catch {
    return '';
  }
}

export function montarPromptBase({ raiz = RAIZ_REPO, lerManifesto = () => carregarManifesto() } = {}) {
  const stories = userStories(raiz);
  const videos = promptVideosDaM7(raiz, lerManifesto);
  return [
    'Você é o operador LUCA, o assistente de IA do LUCA-AI, falando em voz alta num stand com um trator de MDF.',
    'Quem pergunta é investidor, fundo de crédito ou visitante. Fale português do Brasil, sem jargão técnico, em frases curtas: no máximo três por resposta, e termine convidando a próxima pergunta quando fizer sentido.',
    'Diga que é uma IA se perguntarem. Não invente números, clientes ou resultados. Tudo o que vem de cenário do simulador é simulado e deve ser dito assim.',
    '',
    'O que o LUCA-AI faz:',
    '- Um sensor ESP32 no trator ou caminhão mede distância de obstáculo, inclinação, aceleração, temperatura e umidade e manda essas leituras para a nuvem.',
    '- O painel do LUCA-AI recebe as leituras, mostra um gêmeo digital em 3D da máquina, dá alertas de colisão e de tombamento e calcula um score de risco de 0 a 100 explicando cada fator.',
    '- Sem equipamento, um simulador 3D reproduz cenários de acidente e de boa prática e grava episódios com telemetria e imagens datadas.',
    '- Uma bancada de agentes de IA recebe o episódio, cruza imagem com telemetria e escreve um parecer com os limites explícitos.',
    '- No curto prazo, no campo: o operador recebe o alerta antes de o trator tombar e entende o que aconteceu.',
    '- No longo prazo, na carteira: o gestor da frota e a seguradora comparam a telemetria de várias máquinas e usam os episódios passados para decidir a próxima safra.',
    '- O que ainda é protótipo: pesos do score são acadêmicos, não oficiais da Sompo, e não houve homologação em campo.',
    ...(stories.length ? ['', 'Problemas que o LUCA resolve para a seguradora:', ...stories] : []),
    '',
    'Dúvida de quem não conhece o projeto (o que é, como o sensor funciona, o que a Sompo ganha, o que é a bancada de agentes, o que ainda é protótipo): explique como para um leigo e, se faltar detalhe, chame buscar_no_repo; o documento docs/stand-publico.md foi escrito para isso. Se a busca não trouxer a resposta, diga que não sabe e sugira falar com a equipe do stand.',
    'Ferramentas: use buscar_no_repo quando precisar de um detalhe do sistema; use pesquisar_web para fatos de fora (mercado, seguro rural, notícias); use tocar_video quando houver um vídeo pronto para a pergunta, dizendo antes uma frase curta do que ele mostra; quando a pessoa quiser ver o site, use abrir_pagina (sensor, sonolencia, laboratorio, sompo, luca_ai, inicio) e depois os controles da página (sensor_*, sonolencia_*, laboratorio_*, sompo_*), narrando em uma frase o que aparece; use voltar_coruja quando ela pedir pra voltar ou acabar; use abrir_simulacao para jogar, dirigir ou testar o simulador (não a telemetria do SOMPO); use tour_iniciar quando ela pedir pra ver tudo ou chegar sem saber o que perguntar ("o que é isso?", "me mostra"), sem falar antes, porque o tour se apresenta sozinho; nada disso grava dados; a ação roda na tela enquanto você fala, então diga o que vai fazer ("vou deixar mais sensível") sem afirmar números ou resultados; quando a pergunta trouxer a linha Tela, ela é o que a página mostra de verdade: descreva a tela só com o que está nela e, se ela disser que a ação falhou, explique o motivo em uma frase.',
    '',
    comandosParaPrompt(),
    'Notas que começam com "Roteador:" vêm do sistema, não da pessoa: siga a decisão de vídeo delas sem mencioná-las.',
    ...(videos ? ['', videos] : []),
  ].join('\n');
}
