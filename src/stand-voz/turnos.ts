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
  | { t: 'fim'; motivo: string; respostas?: number; metricas?: Record<string, unknown> };

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
export function mensagemAudioScribe(base64: string, hz: number): string {
  return JSON.stringify({ message_type: 'input_audio_chunk', audio_base_64: base64, commit: false, sample_rate: hz });
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

/**
 * Transcrição que é só a voz do LUCA voltando pelo microfone (o cancelamento
 * de eco do navegador falha em caixa de som alta). Fora da fala: 3+ palavras e
 * um trecho consecutivo de pelo menos 80% delas na narração. Durante a fala
 * (ou logo depois), um trecho curto idêntico também é eco. Palavras espalhadas
 * pelo roteiro não bastam: "o que é o sensor?" é uma pergunta nova.
 */
export function pareceEco(texto: string, falado: string, { durante = false } = {}): boolean {
  const ouvidas = palavras(texto);
  if (!ouvidas.length || !falado) return false;
  const palavrasDitas = palavras(falado);
  const ditas = ` ${palavrasDitas.join(' ')} `;
  if (durante && ouvidas.length < 3 && ouvidas.every((p) => palavrasDitas.includes(p))) return true;
  if (durante && ditas.includes(` ${ouvidas.join(' ')} `)) return true;
  if (ouvidas.length < 3) return false;
  const minimo = Math.ceil(ouvidas.length * 0.8);
  for (let inicio = 0; inicio <= ouvidas.length - minimo; inicio++) {
    if (ditas.includes(` ${ouvidas.slice(inicio, inicio + minimo).join(' ')} `)) return true;
  }
  return false;
}

/** Parcial/final: 2+ palavras, ou resposta/comando curto legítimo; nunca só ruído/eco. */
export function respostaCurta(texto: string): boolean {
  return /^(sim|nao|pare|para|espera|cancela|chega|volta)$/.test(palavras(texto).join(' '));
}

export function interrompeFala(parcial: string, falado: string): boolean {
  // Texto sozinho não distingue um “não” humano da mesma palavra na narração.
  // Curtas legítimas ficam disponíveis; eco confirmado é removido antes do ASR.
  return respostaCurta(parcial) || (palavras(parcial).length >= 2
    && vaiAoCerebro(parcial) && !pareceEco(parcial, falado, { durante: true }));
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
