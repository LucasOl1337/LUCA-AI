/**
 * Peças puras da conversa em turnos (provedor elevenlabs): mensagens do
 * Scribe Realtime e leitura do NDJSON de `/api/stand/turno`. Sem DOM, para os
 * testes `node --test` importarem direto.
 */

/** Linha do NDJSON de `/api/stand/turno`. */
export type LinhaTurno =
  | { t: 'frase'; texto: string }
  | { t: 'audio'; pcm: string }
  | { t: 'evento'; evento: { tipo: string; id?: string; acao?: string; args?: Record<string, unknown>; apos_fala?: boolean } }
  | { t: 'aviso'; aviso: string; detalhe?: string }
  | { t: 'fim'; motivo: string; texto?: string; causa?: string; detalhe?: string; respostas?: number; metricas?: Record<string, unknown> };

/** Lê um corpo NDJSON pedaço a pedaço; linhas quebradas entre pedaços são juntadas. */
export async function* lerNdjson(corpo: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>): AsyncGenerator<LinhaTurno> {
  const decodificador = new TextDecoder();
  let resto = '';
  const leitor = 'getReader' in corpo ? iterarStream(corpo) : corpo;
  for await (const pedaco of leitor) {
    resto += decodificador.decode(pedaco, { stream: true });
    let quebra = resto.indexOf('\n');
    while (quebra >= 0) {
      const linha = resto.slice(0, quebra).trim();
      resto = resto.slice(quebra + 1);
      if (linha) {
        try { yield JSON.parse(linha) as LinhaTurno; } catch { /* linha corrompida: ignora */ }
      }
      quebra = resto.indexOf('\n');
    }
  }
  const final = (resto + decodificador.decode()).trim();
  if (final) {
    try { yield JSON.parse(final) as LinhaTurno; } catch { /* idem */ }
  }
}

async function* iterarStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const leitor = stream.getReader();
  try {
    for (;;) {
      const { value, done } = await leitor.read();
      if (done) return;
      if (value) yield value;
    }
  } finally {
    leitor.releaseLock();
  }
}

/** Pedaço de microfone no formato do Scribe Realtime (`input_audio_chunk`). */
export function mensagemAudioScribe(base64: string, hz: number, commit = false): string {
  return JSON.stringify({ message_type: 'input_audio_chunk', audio_base_64: base64, commit, sample_rate: hz });
}

/**
 * Continuação da mesma pergunta: o VAD de 0,6 s do Scribe fecha a frase na
 * hesitação ("Tem como a seguradora." ‖ "Baixar o preço do seguro?", 12 de 20
 * frases na medição de 24/10, `ouvido/MEDICAO.md`). O commit novo que chega
 * com a resposta ao pedaço ainda em andamento vira uma pergunta só.
 */
export const JUNTAR_CONTINUACAO_MS = 5000;

export function juntarPergunta(anterior: string, novo: string): string {
  const a = anterior.trim();
  const n = novo.trim();
  if (!a) return n;
  if (!n) return a;
  // O Scribe às vezes reenvia o começo: não repete o que já está lá.
  if (palavras(n).join(' ').startsWith(palavras(a).join(' '))) return n;
  return `${a.replace(/[.…]+$/u, '')} ${n.charAt(0).toLowerCase()}${n.slice(1)}`;
}

/**
 * O trecho novo continua a pergunta aberta? 2+ palavras, ou qualquer letra ou
 * número quando a pergunta ficou sem ponto de interrogação ("Eu quero fazer
 * em" ‖ "3D", caso do Lucas, 24/10). "Oi?" solto depois de "...sensor?" não continua.
 */
export function continuaPergunta(aberta: string, novo: string): boolean {
  if (!aberta.trim() || !/[\p{L}\p{N}]/u.test(novo)) return false;
  return palavras(novo).length >= 2 || !/[?!]\s*$/.test(aberta);
}

/**
 * Fechamento forçado: com motor e multidão o VAD do Scribe não acha o
 * silêncio e a frase nunca fecha (7 de 20 sem commit com 0,6 s; 16 de 20 com
 * 1,2 s). Parcial que não muda por este tempo manda `commit:true`; com o
 * commit no fim da fala a transcrição ficou igual à do lote (WER 2,8%).
 */
export const PARCIAL_ESTAVEL_MS = 1500;

/** Mesmo conteúdo de parcial (ignora caixa, acento e pontuação). */
export function mesmaParcial(a: string, b: string): boolean {
  return palavras(a).join(' ') === palavras(b).join(' ');
}

export type EventoScribe =
  | { tipo: 'parcial'; texto: string }
  | { tipo: 'fechada'; texto: string }
  | { tipo: 'erro'; codigo: string; fatal: boolean }
  | { tipo: 'outro' };

// Erros que não se resolvem sozinhos dentro da sessão: o microfone não volta.
const ERROS_FATAIS = /auth|quota|rate_limit|resource_exhausted|session_time_limit|unaccepted_terms|invalid_request/i;

/** Mensagem do Scribe → o que a sessão precisa saber. */
export function eventoScribe(mensagem: { message_type?: string; text?: string; error?: string }): EventoScribe {
  const tipo = String(mensagem?.message_type || '');
  if (tipo === 'partial_transcript') return { tipo: 'parcial', texto: String(mensagem.text || '').trim() };
  if (tipo === 'committed_transcript' || tipo === 'committed_transcript_with_timestamps') {
    return { tipo: 'fechada', texto: String(mensagem.text || '').trim() };
  }
  if (/error/i.test(tipo)) return { tipo: 'erro', codigo: tipo, fatal: ERROS_FATAIS.test(`${tipo} ${mensagem.error || ''}`) };
  return { tipo: 'outro' };
}

const palavras = (texto: string): string[] => texto
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .split(/[^\p{L}\p{N}]+/u)
  .filter(Boolean);

// Palavras que aparecem em qualquer frase: não contam como conteúdo ao comparar
// o que o microfone ouviu com o que o LUCA falou.
const VAZIAS = new Set(('a o as os e de da do das dos um uma uns umas que em no na nos nas pra pro para por com se ao aos '
  + 'eu voce ele ela isso esse essa este esta ta ai la ja mas ou meu minha seu sua seus suas')
  .split(' '));
const conteudo = (lista: string[]): string[] => lista.filter((p) => !VAZIAS.has(p));

/**
 * Transcrição que é só a voz do LUCA voltando pelo microfone (o cancelamento
 * de eco do navegador falha em caixa de som alta). Fora da fala: 3+ palavras e
 * um trecho consecutivo de pelo menos 80% delas na narração. Durante a fala
 * (ou logo depois) o ASR do eco sai sujo ("Oi, animal na pista é um dos seus...
 * Ô, animal", stand 22/10): basta trecho curto todo dito, 3 palavras seguidas
 * da fala, 60% de 2+ palavras de conteúdo já ditas, ou nenhuma de conteúdo.
 * Palavras espalhadas pelo roteiro não bastam: "o que é o sensor?" é uma pergunta nova.
 */
export function pareceEco(texto: string, falado: string, { durante = false } = {}): boolean {
  const ouvidas = palavras(texto);
  if (!ouvidas.length || !falado) return false;
  const palavrasDitas = palavras(falado);
  const ditas = ` ${palavrasDitas.join(' ')} `;
  if (durante) {
    if (ouvidas.length < 3 && ouvidas.every((p) => palavrasDitas.includes(p))) return true;
    for (let inicio = 0; inicio + 3 <= ouvidas.length; inicio++) {
      if (ditas.includes(` ${ouvidas.slice(inicio, inicio + 3).join(' ')} `)) return true;
    }
    const proprias = conteudo(ouvidas);
    if (!proprias.length) return true;
    if (proprias.length >= 2 && proprias.filter((p) => palavrasDitas.includes(p)).length >= proprias.length * 0.6) return true;
  }
  if (ouvidas.length < 3) return false;
  const minimo = Math.ceil(ouvidas.length * 0.8);
  for (let inicio = 0; inicio <= ouvidas.length - minimo; inicio++) {
    if (ditas.includes(` ${ouvidas.slice(inicio, inicio + minimo).join(' ')} `)) return true;
  }
  return false;
}

/** Parcial/final: 2+ palavras, ou resposta/comando curto legítimo; nunca só ruído/eco. */
export function respostaCurta(texto: string): boolean {
  return /^(sim|nao|pare|para|espera|cancela|chega|volta)( ai| la)?$/.test(palavras(texto).join(' '));
}

/**
 * Fala do visitante que corta o LUCA no meio: comando curto que ele não acabou
 * de dizer, ou 2+ palavras de conteúdo novas que não sejam eco. Volume, "Oi"
 * solto e o próprio texto voltando pela caixa nunca cortam (Lucas, 23/10: "a
 * fala dele mesmo interrompe ele mesmo falando").
 */
export function interrompeFala(parcial: string, falado: string): boolean {
  const ouvidas = palavras(parcial);
  const ditas = palavras(falado);
  if (respostaCurta(parcial)) return !ditas.includes(ouvidas[0]);
  const novas = conteudo(ouvidas).filter((p) => !ditas.includes(p));
  return novas.length >= 2 && vaiAoCerebro(parcial) && !pareceEco(parcial, falado, { durante: true });
}

/**
 * Trecho ouvido com a resposta a caminho (estado `pensando`): só troca a
 * legenda ou refaz a pergunta com 2+ palavras de verdade. O Scribe às
 * vezes devolve um "Oi?" solto no silêncio logo depois de fechar a frase
 * (prova de 19/10, 67 s); isso não é o visitante e não pode atropelar a resposta.
 */
export function valeEnquantoPensa(texto: string, falado: string): boolean {
  return palavras(texto).length >= 2 && interrompeFala(texto, falado);
}

/**
 * Pergunta que vale um turno: pelo menos 2 letras. Ruído e "hã" isolado não
 * gastam uma das 8 respostas da conversa.
 */
export function vaiAoCerebro(texto: string): boolean {
  const letras = texto.normalize('NFD').replace(/[^\p{L}]/gu, '');
  return letras.length >= 2 && !/^(h+[aãe]+|[aeiou]h+|hum+|uhum|ah+|eh+|ãh+)$/i.test(letras);
}
