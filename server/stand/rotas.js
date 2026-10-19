// Rotas do cérebro de voz do stand. Ficam atrás de requireUser: o PC do stand
// loga com uma conta demo. A credencial do provedor fica só no servidor; o
// navegador recebe um token efêmero e fala com o provedor direto. Nenhum áudio
// do público passa pelo Express nem é gravado.
//
// Dois provedores (docs/stand-voz.md):
// - `elevenlabs` (padrão desde 19/10): microfone direto ao Scribe Realtime; a
//   pergunta transcrita vem a `POST /api/stand/turno`, que responde em NDJSON
//   com frases, áudio da voz do Lucas e eventos (cerebro.js).
// - `xai`: Grok Voice Realtime, conversa inteira no navegador (reserva).
import { executarTurno, FALAS, LIMITES_TURNO, criarChamadaDeModelo, novaConversa } from './cerebro.js';
import { FERRAMENTAS_STAND, executarFerramentaStand, videoPublicado } from './ferramentas.js';
import { buscarNoRepo, montarPromptBase } from './conhecimento.js';
import { provedorXai } from './provedor-xai.js';
import { CREDITOS_STT_POR_MINUTO, fatorCreditosTts, modeloTtsStand, provedorElevenlabs, resolverVoz, sintetizarElevenlabs } from './provedor-elevenlabs.js';
import { arquivoPadrao, criarTetoDiario, tetoDiarioDoEnv } from './teto-diario.js';

export const LIMITES_STAND = Object.freeze({ silencio_s: 20, teto_s: 240, sessoes_por_hora: 30 });
const UMA_HORA_MS = 60 * 60 * 1000;

// Forma comum: {nome, vozPadrao, credencial(env), sessao(...), pedirToken, conexao};
// `turnos: true` quando a conversa passa por `/api/stand/turno`.
export const PROVEDORES_VOZ = Object.freeze({ elevenlabs: provedorElevenlabs, xai: provedorXai });
export const PROVEDOR_PADRAO = 'elevenlabs';
const CONVERSAS_MAX = 64;

export function configStand(env = process.env, provedores = PROVEDORES_VOZ) {
  const nome = String(env.STAND_VOZ_PROVEDOR || PROVEDOR_PADRAO).trim();
  const provedor = provedores[nome];
  if (!provedor) return { nome, motivo: 'provedor_desconhecido' };
  const credencial = provedor.credencial(env);
  return {
    nome,
    provedor,
    voz: String(env.LUCA_STAND_VOZ || provedor.vozPadrao).trim(),
    chave: credencial.chave || '',
    motivo: credencial.chave ? null : credencial.motivo,
  };
}

/**
 * Escuta: a Coruja abre a conversa quando alguém fala, sem toque (Lucas,
 * 19/10). Ligada por padrão no provedor em turnos; `STAND_ESCUTA=0` volta ao toque.
 */
export function escutaLigada(env = process.env, config = configStand(env)) {
  if (!config.provedor?.turnos) return false;
  return !/^(0|false|nao|não|off)$/i.test(String(env.STAND_ESCUTA ?? '').trim());
}

/** Conta sessões por conta numa janela deslizante de 1 h, em memória. */
export function criarGuardaDeSessoes({ teto = LIMITES_STAND.sessoes_por_hora, agora = () => Date.now() } = {}) {
  const porConta = new Map();
  const recentes = (conta) => (porConta.get(conta) || []).filter((t) => agora() - t < UMA_HORA_MS);
  return {
    usadas: (conta) => recentes(conta).length,
    tentar(conta) {
      const lista = recentes(conta);
      if (lista.length >= teto) return false;
      lista.push(agora());
      porConta.set(conta, lista);
      return true;
    },
  };
}

async function roteadorPadrao() {
  const { criarRoteador } = await import('./roteador-video.js');
  return criarRoteador();
}

/** Falas prontas (saudação, falha, teto) sintetizadas uma vez e guardadas em memória. */
function criarFalasProntas(sintetizar) {
  const guardadas = new Map();
  return async function* falaPronta(chave, sinal) {
    if (guardadas.has(chave)) {
      for (const pedaco of guardadas.get(chave)) yield pedaco;
      return;
    }
    const pedacos = [];
    for await (const pcm of sintetizar({ texto: FALAS[chave], sinal, pronta: true })) {
      pedacos.push(pcm);
      yield pcm;
    }
    if (!sinal?.aborted) guardadas.set(chave, pedacos);
  };
}

export function registerStandRoutes(app, {
  env = process.env,
  fetchImpl = globalThis.fetch,
  guarda = criarGuardaDeSessoes(),
  provedores = PROVEDORES_VOZ,
  criarRoteador = roteadorPadrao,
  instrucoes = () => montarPromptBase(),
  publicado = videoPublicado,
  teto = criarTetoDiario({ teto: tetoDiarioDoEnv(env), arquivo: arquivoPadrao(env) }),
  chamarModelo = criarChamadaDeModelo({ fetchImpl }),
  executarFerramenta = executarFerramentaStand,
  agora = () => Date.now(),
} = {}) {
  const conta = (req) => String(req.auth?.user?.id || '');
  let roteador = null;
  const obterRoteador = () => (roteador ??= criarRoteador().catch((erro) => {
    roteador = null;
    throw erro;
  }));
  const rotear = async (texto) => {
    const decisao = await (await obterRoteador()).rotearPergunta(texto);
    return decisao && publicado(decisao.id) ? decisao : null;
  };

  /** Conversas em turnos vivas, por id. Expiram depois do teto da sessão. */
  const conversas = new Map();
  const validadeMs = (LIMITES_STAND.teto_s + 60) * 1000;
  /**
   * Fecha a conta de STT de uma conversa, uma vez: minutos de microfone aberto.
   * Sem 'fim' (aba fechada, queda) estima pelo último turno + o relógio de
   * silêncio do navegador + 30 s de folga, sempre dentro do teto da sessão.
   */
  const cobrarStt = (conversa, { estimado = false } = {}) => {
    if (conversa.sttCobrado) return;
    conversa.sttCobrado = true;
    const ultimo = (conversa.ultimoUso ?? conversa.criadaEm) + (LIMITES_STAND.silencio_s + 30) * 1000;
    const fimMs = estimado ? Math.min(agora(), ultimo) : agora();
    const minutos = Math.min(LIMITES_STAND.teto_s, Math.max(0, fimMs - conversa.criadaEm) / 1000) / 60;
    teto.somar(minutos * CREDITOS_STT_POR_MINUTO);
  };
  // Conversa que sumiu sem 'fim' é cobrada pela estimativa ao ser despejada.
  const despejar = (id, { estimado = true } = {}) => {
    const c = conversas.get(id);
    if (!c) return;
    c.turno?.abort();
    cobrarStt(c, { estimado });
    conversas.delete(id);
  };
  const limparConversas = () => {
    for (const [id, c] of conversas) {
      if (agora() - c.criadaEm > validadeMs) despejar(id);
    }
    while (conversas.size > CONVERSAS_MAX) despejar(conversas.keys().next().value);
  };

  const motivoDesligado = (config) => {
    if (!config.chave) return config.motivo;
    if (config.provedor.turnos && teto.estourou()) return 'teto_diario';
    return null;
  };

  // TTS da conversa em turnos: voz pelo nome (skill elevenlabs-voz), modelo por env.
  let vozId = null;
  const sintetizarCom = (config) => {
    const modelo = modeloTtsStand(env);
    return async function* sintetizar({ texto, anterior = '', sinal, pronta = false }) {
      vozId ??= await resolverVoz({ chave: config.chave, voz: config.voz, fetchImpl });
      if (pronta) teto.somar(texto.length * fatorCreditosTts(modelo));
      yield* sintetizarElevenlabs({ chave: config.chave, vozId, texto, modelo, anterior, sinal, fetchImpl });
    };
  };

  app.get('/api/stand/status', (req, res) => {
    limparConversas();
    const config = configStand(env, provedores);
    const motivo = motivoDesligado(config);
    res.json({
      ok: true,
      ligado: !motivo,
      provedor: config.nome,
      motivo,
      voz: config.voz ?? null,
      escuta: !motivo && escutaLigada(env, config),
      limites: config.provedor?.turnos ? { ...LIMITES_STAND, ...LIMITES_TURNO } : LIMITES_STAND,
      sessoes_na_hora: guarda.usadas(conta(req)),
      ...(config.provedor?.turnos ? { creditos_dia: teto.resumo() } : {}),
    });
  });

  app.post('/api/stand/sessao', async (req, res) => {
    limparConversas();
    const config = configStand(env, provedores);
    const motivo = motivoDesligado(config);
    if (motivo) return res.status(503).json({ ok: false, error: 'stand_desligado', motivo });
    if (!guarda.tentar(conta(req))) {
      res.setHeader('Retry-After', '600');
      return res.status(429).json({ ok: false, error: 'stand_teto_sessoes', limites: LIMITES_STAND });
    }
    // Aquece o cache de embeddings do roteador enquanto o navegador conecta.
    obterRoteador().then((r) => r.preaquecer()).catch(() => {});
    if (config.provedor.turnos) {
      // Pré-aquecimento: resolve a voz enquanto o microfone conecta.
      resolverVoz({ chave: config.chave, voz: config.voz, fetchImpl }).then((id) => { vozId ??= id; }).catch(() => {});
    }
    try {
      const token = await config.provedor.pedirToken({ chave: config.chave, fetchImpl });
      if (!token.ok) {
        console.warn(`[stand] token recusado por ${config.nome}: HTTP ${token.status}`);
        return res.status(502).json({ ok: false, error: 'stand_provedor_recusou', status: token.status });
      }
      const corpo = {
        ok: true,
        provedor: config.nome,
        token: token.token,
        expira_em: token.expira_em,
        conexao: config.provedor.conexao(token.token),
        sessao: config.provedor.sessao({ instrucoes: instrucoes(), ferramentas: FERRAMENTAS_STAND, voz: config.voz }),
        limites: LIMITES_STAND,
      };
      if (config.provedor.turnos) {
        const conversa = novaConversa({ conta: conta(req), agora: agora() });
        conversas.set(conversa.id, conversa);
        corpo.conversa_id = conversa.id;
        corpo.limites = { ...LIMITES_STAND, ...LIMITES_TURNO };
      }
      res.json(corpo);
    } catch (erro) {
      console.warn(`[stand] falha ao pedir token a ${config.nome}: ${erro?.name || 'erro'}`);
      res.status(502).json({ ok: false, error: 'stand_provedor_indisponivel' });
    }
  });

  // Um turno da conversa (provedor em turnos). Corpo: {conversa_id, texto} ou
  // {conversa_id, evento: 'saudacao' | 'video_terminou' | 'fim', id?}.
  // Resposta NDJSON, uma linha por item: {t:'frase'|'audio'|'evento'|'aviso'|'fim', ...}.
  // Um turno novo da mesma conversa aborta o anterior (barge-in).
  app.post('/api/stand/turno', async (req, res) => {
    const { conversa_id: id, texto, evento, id: idVideo } = req.body || {};
    const conversa = conversas.get(String(id || ''));
    if (!conversa || conversa.conta !== conta(req)) return res.status(404).json({ ok: false, error: 'conversa_desconhecida' });
    const config = configStand(env, provedores);
    if (!config.provedor?.turnos || !config.chave) {
      return res.status(503).json({ ok: false, error: 'stand_desligado', motivo: config.chave ? 'provedor_sem_turnos' : config.motivo });
    }
    conversa.turno?.abort();
    conversa.turno = null;
    if (evento === 'fim') {
      despejar(conversa.id, { estimado: false });
      return res.json({ ok: true, creditos_dia: teto.resumo() });
    }
    if (agora() - conversa.criadaEm > validadeMs) {
      despejar(conversa.id);
      return res.status(410).json({ ok: false, error: 'conversa_expirada' });
    }
    if (teto.estourou()) return res.status(503).json({ ok: false, error: 'stand_desligado', motivo: 'teto_diario' });
    const entrada = evento === 'saudacao' ? { evento }
      : evento === 'video_terminou' ? { evento, id: String(idVideo || '').slice(0, 80) }
        : { texto: String(texto || '').trim().slice(0, 500) };
    if (!entrada.evento && !entrada.texto) return res.status(400).json({ ok: false, error: 'texto_vazio' });

    const controle = new AbortController();
    conversa.turno = controle;
    conversa.ultimoUso = agora();
    res.on('close', () => { if (!res.writableFinished) controle.abort(); });
    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const emitir = (linha) => { if (!controle.signal.aborted) res.write(`${JSON.stringify(linha)}\n`); };
    const sintetizar = sintetizarCom(config);
    const modeloTts = modeloTtsStand(env);
    try {
      const { metricas, motivo } = await executarTurno({
        conversa,
        entrada,
        emitir,
        sinal: controle.signal,
        deps: {
          chamarModelo,
          sintetizar,
          falaPronta: falasProntas(config, sintetizar),
          rotear,
          buscar: (texto) => buscarNoRepo(texto, { limite: 3, maxChars: 500 }),
          executarFerramenta: (nome, args) => executarFerramenta(nome, args),
          instrucoes,
          aoCobrarTts: (caracteres) => teto.somar(caracteres * fatorCreditosTts(modeloTts)),
          agora,
        },
      });
      console.info(`[stand] turno ${motivo} modelo=${metricas.modelo ?? '-'} 1o_audio=${metricas.primeiro_audio_ms ?? '-'}ms total=${metricas.total_ms ?? '-'}ms`);
    } catch (erro) {
      console.warn('[stand] turno falhou:', erro?.message || erro);
      emitir({ t: 'fim', motivo: 'falha' });
    } finally {
      if (conversa.turno === controle) conversa.turno = null;
      res.end();
    }
  });

  // Falas prontas guardadas por voz e modelo (trocar a env troca o cache).
  const cacheFalas = new Map();
  function falasProntas(config, sintetizar) {
    const chave = `${config.voz}|${modeloTtsStand(env)}`;
    if (!cacheFalas.has(chave)) cacheFalas.set(chave, criarFalasProntas(sintetizar));
    return cacheFalas.get(chave);
  }

  app.post('/api/stand/ferramenta', async (req, res) => {
    const { nome, args } = req.body || {};
    const resultado = await executarFerramenta(nome, args);
    res.status(resultado.erro === 'ferramenta_desconhecida' ? 400 : 200).json(resultado);
  });

  // Pergunta transcrita → decisão de vídeo da M7 ({id, confianca, decisao} ou null).
  // Vídeo sem mp4 publicado vira null: a IA responde ao vivo em vez de prometer
  // um vídeo que `tocar_video` recusaria.
  app.post('/api/stand/rotear', async (req, res) => {
    const texto = String(req.body?.texto || '').trim().slice(0, 500);
    if (!texto) return res.status(400).json({ ok: false, error: 'texto_vazio' });
    try {
      res.json({ ok: true, decisao: await rotear(texto) });
    } catch {
      res.json({ ok: true, decisao: null });
    }
  });
}
