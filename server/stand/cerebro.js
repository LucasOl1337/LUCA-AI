// Cérebro do stand em turnos (provedor ElevenLabs; docs/stand-voz.md). Recebe
// a pergunta transcrita, consulta o roteador de vídeos (M7), pergunta ao
// Claude em streaming pelo 9Router (exceção ao Astra só aqui), executa as
// ferramentas do stand, corta a resposta em frases e manda cada frase ao TTS
// assim que ela fecha. Tudo sai por `emitir`, linha a linha (NDJSON na rota).
import { randomUUID } from 'node:crypto';
import { cadeiaCerebroStand, ROUTER_API_KEY, ROUTER_BASE_URL } from '../config.js';
import { FERRAMENTAS_STAND } from './ferramentas.js';

// Q5 do grill: por sessão, 8 respostas, 300 tokens por resposta e 2.000
// caracteres de TTS. Os 240 s e os 20 s de silêncio continuam em LIMITES_STAND.
export const LIMITES_TURNO = Object.freeze({ respostas: 8, tokens: 300, caracteres_tts: 2000, frases: 3 });
export const ESPERA_PRIMEIRO_TOKEN_MS = 7000;
export const ROTEAR_MS = 1500;
const RODADAS_DE_FERRAMENTA = 3;

export const FALAS = Object.freeze({
  saudacao: 'Oi! Eu sou o LUCA, o assistente de IA deste stand. Pode perguntar o que quiser.',
  falha: 'Tive um problema pra pensar agora. Pode perguntar de novo?',
  teto_respostas: 'Foi ótimo conversar! Pra continuar, chama alguém da equipe do stand.',
});

export const INSTRUCAO_VOZ = [
  'Sua resposta vira voz na hora: escreva só o que vai ser falado, em frases curtas e completas. No máximo três frases no total, contando qualquer pergunta ou convite no fim; prefira duas frases e um convite curto só quando ajudar.',
  'Nada de markdown, listas, emojis, links ou símbolos; números por extenso quando forem poucos.',
  'Comece sempre falando: responda direto quando o texto acima ou a documentação anexada à pergunta já têm a resposta, e só chame buscar_no_repo ou pesquisar_web se faltar um detalhe, dizendo antes uma frase curta como "Deixa eu conferir isso."',
].join(' ');

/**
 * Trechos da documentação anexados à pergunta antes do modelo, para ele
 * responder já sem uma rodada de buscar_no_repo (medido em 19/10: a rodada
 * extra custava ~3 s de silêncio e o 1º token caiu de 2,3 s para 1,3 s).
 */
export function documentacaoDaPergunta(texto, buscar) {
  let trechos = [];
  try { trechos = buscar(texto) || []; } catch { trechos = []; }
  if (!trechos.length) return '';
  return `\n\nDocumentação (buscar_no_repo já rodou com a pergunta):\n${trechos.map((t) => `[${t.secao}] ${t.trecho}`).join('\n')}`;
}

/** Ferramentas do stand no formato de chat completions (o Realtime usa outro). */
export function ferramentasDeChat(ferramentas = FERRAMENTAS_STAND) {
  return ferramentas.map((f) => ({ type: 'function', function: { name: f.name, description: f.description, parameters: f.parameters } }));
}

/** Limpa o que não deve ir ao TTS (marcação de markdown, links). */
export function textoFalavel(texto) {
  return String(texto || '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_#`>|~]+/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Junta deltas de texto e devolve frases prontas para o TTS. A primeira frase
 * sai no primeiro ponto final; se demorar, sai na primeira vírgula depois de
 * 80 caracteres, para o áudio começar logo.
 */
export class CortadorDeFrases {
  constructor() {
    this.resto = '';
    this.saiuAlguma = false;
  }

  adicionar(delta) {
    this.resto += delta;
    const frases = [];
    const fim = /[.!?…]+["')\]]?(\s+|$)|\n+/g;
    let corte = 0;
    let m;
    while ((m = fim.exec(this.resto))) {
      if (m.index + m[0].length === this.resto.length && !/\s/.test(m[0].slice(-1))) break;
      const frase = this.resto.slice(corte, m.index + m[0].length).trim();
      corte = m.index + m[0].length;
      if (frase) frases.push(frase);
    }
    this.resto = this.resto.slice(corte);
    if (!this.saiuAlguma && !frases.length && this.resto.length > 80) {
      const virgula = this.resto.indexOf(', ', 80);
      if (virgula > 0) {
        frases.push(this.resto.slice(0, virgula + 1).trim());
        this.resto = this.resto.slice(virgula + 2);
      }
    }
    if (frases.length) this.saiuAlguma = true;
    return frases;
  }

  terminar() {
    const frase = this.resto.trim();
    this.resto = '';
    return frase ? [frase] : [];
  }
}

function juntarFerramentas(acumulado, deltas) {
  for (const delta of deltas) {
    const i = Number.isInteger(delta?.index) ? delta.index : acumulado.length;
    acumulado[i] ??= { id: '', type: 'function', function: { name: '', arguments: '' } };
    if (delta.id) acumulado[i].id = delta.id;
    if (delta.function?.name) acumulado[i].function.name = delta.function.name;
    if (typeof delta.function?.arguments === 'string') acumulado[i].function.arguments += delta.function.arguments;
  }
}

/** Lê o SSE de chat completions: gera `{texto}` a cada delta e `{fim, ferramentas}` no final. */
export async function* lerSseDeChat(corpo) {
  const decodificador = new TextDecoder();
  const ferramentas = [];
  let buffer = '';
  let motivo = null;
  for await (const pedaco of corpo) {
    buffer += decodificador.decode(pedaco, { stream: true });
    let quebra;
    while ((quebra = buffer.indexOf('\n')) >= 0) {
      const linha = buffer.slice(0, quebra).trim();
      buffer = buffer.slice(quebra + 1);
      if (!linha.startsWith('data:')) continue;
      const dado = linha.slice(5).trim();
      if (!dado || dado === '[DONE]') continue;
      let evento;
      try { evento = JSON.parse(dado); } catch { continue; }
      const escolha = evento?.choices?.[0];
      const texto = escolha?.delta?.content;
      if (typeof texto === 'string' && texto) yield { texto };
      if (Array.isArray(escolha?.delta?.tool_calls)) juntarFerramentas(ferramentas, escolha.delta.tool_calls);
      if (escolha?.finish_reason) motivo = escolha.finish_reason;
    }
  }
  yield {
    fim: true,
    motivo,
    // Ferramenta sem argumento (voltar_coruja, sensor_pausar) chega com
    // `arguments: ""`; devolvido assim no histórico, o turno seguinte leva 400
    // ("tool_use.input: Input should be an object"). Vazio vira "{}".
    ferramentas: ferramentas.filter((f) => f?.function?.name).map((f, i) => ({
      ...f,
      id: f.id || `chamada_${i + 1}`,
      function: { ...f.function, arguments: f.function.arguments.trim() || '{}' },
    })),
  };
}

/** Chat em streaming no 9Router com a rota pedida (só o stand chama isto). */
export function criarChamadaDeModelo({ fetchImpl = globalThis.fetch, baseUrl = ROUTER_BASE_URL, chave = ROUTER_API_KEY } = {}) {
  return async function chamarModelo({ modelo, mensagens, ferramentas, maxTokens, sinal }) {
    const headers = { 'Content-Type': 'application/json' };
    if (chave) headers.Authorization = `Bearer ${chave}`;
    const resposta = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      signal: sinal,
      body: JSON.stringify({ model: modelo, messages: mensagens, tools: ferramentas, max_tokens: maxTokens, temperature: 0.4, stream: true }),
    });
    if (!resposta.ok || !resposta.body) {
      await resposta.body?.cancel?.().catch(() => {});
      throw new Error(`9router_${resposta.status}`);
    }
    return lerSseDeChat(resposta.body);
  };
}

/** Uma conversa do stand guardada no servidor entre os turnos. */
export function novaConversa({ conta, agora = Date.now() }) {
  return {
    id: randomUUID(),
    conta,
    criadaEm: agora,
    ultimoUso: agora,
    historico: [],
    respostas: 0,
    caracteresTts: 0,
    videosTocados: new Set(),
    turno: null,
  };
}

function abortado(sinal) {
  return Boolean(sinal?.aborted);
}

/** Espera o primeiro item do iterador com prazo; depois disso o stream segue livre. */
async function primeiroComPrazo(iterador, prazoMs, sinal) {
  let relogio;
  const prazo = new Promise((_, falha) => { relogio = setTimeout(() => falha(new Error('sem_primeiro_token')), prazoMs); });
  try {
    return await Promise.race([iterador.next(), prazo]);
  } finally {
    clearTimeout(relogio);
    if (abortado(sinal)) iterador.return?.().catch(() => {});
  }
}

/**
 * Fila de fala: cada frase vai ao TTS em ordem, e o áudio sai por `emitir`
 * logo que chega. Respeita o teto de caracteres da conversa.
 */
function criarFilaDeFala({ conversa, sintetizar, emitir, aoCobrarTts, sinal, marcar }) {
  let corrente = Promise.resolve();
  let anterior = '';
  const faladas = [];
  return {
    faladas,
    /** Teto de frases por turno: a instrução sozinha não segurou (19/10, 4 a 5 frases). */
    falar(fraseCrua) {
      const frase = textoFalavel(fraseCrua);
      if (!frase) return false;
      if (faladas.length >= LIMITES_TURNO.frases) return false;
      faladas.push(frase);
      corrente = corrente.then(async () => {
        if (abortado(sinal)) return;
        emitir({ t: 'frase', texto: frase });
        const sobra = LIMITES_TURNO.caracteres_tts - conversa.caracteresTts;
        if (sobra < frase.length) {
          emitir({ t: 'aviso', aviso: 'teto_caracteres_tts' });
          return;
        }
        conversa.caracteresTts += frase.length;
        aoCobrarTts(frase.length);
        try {
          for await (const pcm of sintetizar({ texto: frase, anterior, sinal })) {
            if (abortado(sinal)) return;
            marcar('primeiro_audio');
            emitir({ t: 'audio', pcm: pcm.toString('base64') });
          }
        } catch (erro) {
          if (!abortado(sinal)) emitir({ t: 'aviso', aviso: 'tts_falhou', detalhe: String(erro?.message || erro) });
        }
        anterior = `${anterior} ${frase}`.slice(-300);
      });
      return true;
    },
    terminou: () => corrente,
  };
}

/**
 * Executa um turno. `entrada`: `{texto}` (pergunta), `{evento:'saudacao'}` ou
 * `{evento:'video_terminou', id}`. Nunca lança: falha vira a fala pronta.
 * Devolve as métricas do turno (também emitidas na linha `fim`).
 */
export async function executarTurno({ conversa, entrada, emitir, sinal, deps }) {
  const {
    chamarModelo,
    sintetizar,
    falaPronta,
    rotear = async () => null,
    buscar = () => [],
    executarFerramenta,
    instrucoes = () => '',
    modelos = cadeiaCerebroStand(),
    aoCobrarTts = () => {},
    agora = () => Date.now(),
  } = deps;
  const inicio = agora();
  const metricas = { modelo: null, tentativas: [] };
  const marcar = (nome) => { if (metricas[`${nome}_ms`] === undefined) metricas[`${nome}_ms`] = agora() - inicio; };
  const encerrarTurno = (motivo, extra = {}) => {
    metricas.total_ms = agora() - inicio;
    emitir({ t: 'fim', motivo, respostas: conversa.respostas, metricas, ...extra });
    return { motivo, metricas };
  };
  const tocarPronta = async (chave) => {
    emitir({ t: 'frase', texto: FALAS[chave] });
    for await (const pcm of falaPronta(chave, sinal)) {
      if (abortado(sinal)) return;
      marcar('primeiro_audio');
      emitir({ t: 'audio', pcm: pcm.toString('base64') });
    }
  };

  if (entrada.evento === 'saudacao') {
    conversa.historico.push({ role: 'assistant', content: FALAS.saudacao });
    await tocarPronta('saudacao').catch(() => {});
    return encerrarTurno('saudacao');
  }
  if (conversa.respostas >= LIMITES_TURNO.respostas) {
    await tocarPronta('teto_respostas').catch(() => {});
    return encerrarTurno('teto_respostas');
  }

  let conteudo;
  let documentacao = '';
  if (entrada.evento === 'video_terminou') {
    conteudo = `Roteador: o vídeo ${entrada.id} terminou. Pergunte, em uma frase, se ficou alguma dúvida.`;
  } else {
    const texto = String(entrada.texto || '').trim();
    let decisao = null;
    let relogio;
    try {
      decisao = await Promise.race([
        Promise.resolve(rotear(texto)).catch(() => null),
        new Promise((ok) => { relogio = setTimeout(() => ok(null), ROTEAR_MS); }),
      ]);
    } finally {
      clearTimeout(relogio);
    }
    marcar('roteador');
    const nota = decisao && !conversa.videosTocados.has(decisao.id)
      ? `Roteador: decisao=${decisao.decisao} id=${decisao.id}.`
      : 'Roteador: nenhum vídeo; responda ao vivo.';
    metricas.roteador = decisao && !conversa.videosTocados.has(decisao.id) ? decisao : null;
    documentacao = documentacaoDaPergunta(texto, buscar);
    conteudo = `${texto}\n\n${nota}`;
  }
  const tamanhoAntes = conversa.historico.length;
  conversa.respostas += 1;
  conversa.historico.push({ role: 'user', content: conteudo });
  // A documentação vale só para este turno: o histórico guarda a pergunta crua.
  const indicePergunta = conversa.historico.length - 1;
  const comDocumentacao = (historico) => (documentacao
    ? historico.map((m, i) => (i === indicePergunta ? { ...m, content: conteudo.replace(/\n\nRoteador:/, `${documentacao}\n\nRoteador:`) } : m))
    : historico);

  const fala = criarFilaDeFala({ conversa, sintetizar, emitir, aoCobrarTts, sinal, marcar });
  const ferramentasChat = ferramentasDeChat();
  let falouAlgo = false;
  let videoComecou = false;

  for (let rodada = 0; rodada < RODADAS_DE_FERRAMENTA && !videoComecou; rodada++) {
    const mensagens = [{ role: 'system', content: `${instrucoes()}\n\n${INSTRUCAO_VOZ}` }, ...comDocumentacao(conversa.historico)];
    let resultado = null;
    for (const modelo of (falouAlgo ? [metricas.modelo] : modelos)) {
      if (abortado(sinal)) break;
      try {
        const eventos = await chamarModelo({ modelo, mensagens, ferramentas: ferramentasChat, maxTokens: LIMITES_TURNO.tokens, sinal });
        const iterador = eventos[Symbol.asyncIterator]();
        const primeiro = await primeiroComPrazo(iterador, ESPERA_PRIMEIRO_TOKEN_MS, sinal);
        metricas.modelo = modelo;
        resultado = { iterador, primeiro };
        break;
      } catch (erro) {
        metricas.tentativas.push({ modelo, erro: String(erro?.message || erro).slice(0, 80) });
        if (abortado(sinal)) break;
      }
    }
    if (abortado(sinal)) break;
    if (!resultado) {
      if (!falouAlgo) {
        conversa.historico.length = tamanhoAntes;
        conversa.respostas -= 1;
        await tocarPronta('falha').catch(() => {});
        return encerrarTurno('falha');
      }
      break;
    }

    const cortador = new CortadorDeFrases();
    let textoDaRodada = '';
    const faladasAntes = fala.faladas.length;
    let cortou = false;
    let fim = null;
    let passo = resultado.primeiro;
    try {
      while (!passo.done) {
        const evento = passo.value;
        if (evento.texto) {
          marcar('primeiro_token');
          textoDaRodada += evento.texto;
          for (const frase of cortador.adicionar(evento.texto)) {
            marcar('primeira_frase');
            if (fala.falar(frase)) falouAlgo = true;
            else cortou = true;
          }
        }
        if (evento.fim) fim = evento;
        if (abortado(sinal)) break;
        passo = await resultado.iterador.next();
      }
    } catch (erro) {
      if (!abortado(sinal)) metricas.tentativas.push({ modelo: metricas.modelo, erro: String(erro?.message || erro).slice(0, 80) });
    }
    for (const frase of cortador.terminar()) {
      marcar('primeira_frase');
      if (fala.falar(frase)) falouAlgo = true;
      else cortou = true;
    }
    // Passou do teto de frases: o histórico guarda só o que o visitante ouviu.
    if (cortou) {
      textoDaRodada = fala.faladas.slice(faladasAntes).join(' ');
      metricas.frases_cortadas = true;
    }

    const chamadas = abortado(sinal) ? [] : fim?.ferramentas || [];
    // Interrompido ou sem ferramenta: fica no histórico só o texto que saiu.
    conversa.historico.push(chamadas.length
      ? { role: 'assistant', content: textoDaRodada || null, tool_calls: chamadas }
      : { role: 'assistant', content: textoDaRodada || '…' });
    if (!chamadas.length) break;

    for (const chamada of chamadas) {
      let args = {};
      try { args = JSON.parse(chamada.function.arguments || '{}'); } catch { /* argumento quebrado vira objeto vazio */ }
      const saida = await executarFerramenta(chamada.function.name, args).catch(() => ({ ok: false, erro: 'ferramenta_falhou' }));
      const evento = saida?.evento;
      if (evento?.tipo === 'tocar_video' && evento.id) {
        conversa.videosTocados.add(evento.id);
        videoComecou = true;
      }
      if (evento) {
        // O vídeo espera a fala anterior terminar de sair; a ação no site vai já.
        if (evento.tipo === 'tocar_video') await fala.terminou();
        emitir({ t: 'evento', evento });
      }
      conversa.historico.push({ role: 'tool', tool_call_id: chamada.id, content: JSON.stringify(saida).slice(0, 4000) });
      metricas.ferramentas = [...(metricas.ferramentas || []), chamada.function.name];
    }
  }

  await fala.terminou();
  // O próximo turno começa com `user`: o histórico tem de fechar em `assistant`
  // (interrupção antes do 1º token, vídeo iniciado ou fim das rodadas de ferramenta).
  if (conversa.historico.at(-1)?.role !== 'assistant' || conversa.historico.at(-1)?.tool_calls) {
    conversa.historico.push({ role: 'assistant', content: '…' });
  }
  if (abortado(sinal)) return { motivo: 'interrompido', metricas };
  return encerrarTurno(videoComecou ? 'video' : 'ok', { fala: fala.faladas.join(' ') });
}
