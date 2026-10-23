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
import { executarTurno, FALAS, LIMITES_TURNO, criarChamadaDeModelo, limparTela, novaConversa } from './cerebro.js';
import { idTurno, lembrarTurno, prepararJanela, TEXTOS_PAUSA } from './continuidade.js';
import { FERRAMENTAS_STAND, executarFerramentaStand, videoPublicado } from './ferramentas.js';
import { buscarNoRepo, montarPromptBase } from './conhecimento.js';
import { provedorXai } from './provedor-xai.js';
import {
  CREDITOS_STT_POR_MINUTO, VERIFICACAO_VOZ_MS, VOZES_STAND, fatorCreditosTts, modeloTtsStand,
  provedorElevenlabs, resolverVoz, sintetizarElevenlabs, verificarVoz, vozDaChave,
} from './provedor-elevenlabs.js';
import { criarConfigTotem } from './config-totem.js';
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
  configTotem = criarConfigTotem(),
  requireAdmin = (req, res, next) => req.auth?.user?.role === 'admin' ? next() : res.status(403).json({ ok: false, error: 'admin_required' }),
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

  /** Conversas por id: janela renovável, expiração por inatividade. */
  const conversas = new Map();
  const validadeMs = (LIMITES_STAND.teto_s + 60) * 1000;
  /**
   * Cobra o trecho ainda não contado de STT: minutos de microfone aberto.
   * Sem 'fim' (aba fechada, queda) estima pelo último turno + o relógio de
   * silêncio do navegador + 30 s de folga. Trechos já pagos não são repetidos.
   */
  const cobrarStt = (conversa, { estimado = false } = {}) => {
    const desde = conversa.sttAte ?? conversa.criadaEm;
    const ultimo = (conversa.ultimoUso ?? conversa.criadaEm) + (LIMITES_STAND.silencio_s + 30) * 1000;
    const fimMs = estimado ? Math.min(agora(), ultimo) : agora();
    const minutos = Math.max(0, fimMs - desde) / 60_000;
    conversa.sttAte = Math.max(desde, fimMs);
    teto.somar(minutos * CREDITOS_STT_POR_MINUTO);
  };
  // Conversa que sumiu sem 'fim' é cobrada pela estimativa ao ser despejada.
  const despejar = (id, { estimado = true } = {}) => {
    const c = conversas.get(id);
    if (!c) return;
    c.turno?.abort();
    cobrarStt(c, { estimado });
    if (c.origem === 'escuta' && !c.perguntas) teto.contar('falsos');
    conversas.delete(id);
  };
  const limparConversas = () => {
    for (const [id, c] of conversas) {
      if (!c.turno && agora() - c.ultimoUso > validadeMs) despejar(id);
    }
    while (conversas.size > CONVERSAS_MAX) despejar(conversas.keys().next().value);
  };

  const motivoDesligado = (config) => {
    if (!config.chave) return config.motivo;
    if (config.provedor.turnos && teto.estourou()) return 'teto_diario';
    return null;
  };

  // TTS da conversa em turnos: voz pelo nome (skill elevenlabs-voz) ou voice_id
  // da lista branca, modelo por env. Cada conversa guarda a voz escolhida no Totem.
  const vozesIds = new Map();
  const vozesOk = new Map();
  const sintetizarCom = (config, voz = config.voz) => {
    const modelo = modeloTtsStand(env);
    return async function* sintetizar({ texto, anterior = '', sinal, pronta = false }) {
      const vozId = await resolverVoz({ chave: config.chave, voz, fetchImpl, cache: vozesIds });
      if (pronta) teto.somar(texto.length * fatorCreditosTts(modelo));
      yield* sintetizarElevenlabs({ chave: config.chave, vozId, texto, modelo, anterior, sinal, fetchImpl });
    };
  };

  /**
   * Voz pedida pelo navegador (só a chave da lista branca) → {chave, voz}.
   * Fora da lista vira o padrão; voz da lista que a conta não tem (Andrea sem
   * adicionar) também cai no padrão, com `aviso`, para a conversa não ficar muda.
   */
  const escolherVoz = async (config, pedido) => {
    const padrao = configTotem.obter();
    const chave = typeof pedido === 'string' && Object.hasOwn(VOZES_STAND, pedido) ? pedido : padrao;
    const voz = vozDaChave(chave, config.voz);
    if (chave === padrao) return { chave, voz };
    const ok = await verificarVoz({ chave: config.chave, voz, fetchImpl, cache: vozesOk, agora: agora() });
    return ok ? { chave, voz } : { chave: padrao, voz: vozDaChave(padrao, config.voz), aviso: { pedida: chave, motivo: 'voz_indisponivel' } };
  };

  /** Vozes do seletor do Totem; `disponivel:null` enquanto a 1ª conferência não volta. */
  const vozesDoStatus = (config) => Object.entries(VOZES_STAND).map(([chave, { rotulo, detalhe }]) => {
    const voz = vozDaChave(chave, config.voz);
    const salvo = vozesOk.get(voz);
    if (config.chave && (!salvo || agora() - salvo.em >= VERIFICACAO_VOZ_MS)) {
      verificarVoz({ chave: config.chave, voz, fetchImpl, cache: vozesOk, agora: agora() }).catch(() => {});
    }
    return { chave, rotulo, detalhe, padrao: chave === configTotem.obter(), disponivel: salvo ? salvo.ok : null };
  });

  app.put('/api/stand/voz-padrao', requireAdmin, (req, res) => {
    const chave = req.body?.totemDefaultVoice;
    if (typeof chave !== 'string' || !Object.hasOwn(VOZES_STAND, chave)) return res.status(400).json({ ok: false, error: 'voz_invalida' });
    try {
      res.json({ ok: true, totemDefaultVoice: configTotem.salvar(chave) });
    } catch {
      res.status(500).json({ ok: false, error: 'config_nao_salva' });
    }
  });

  app.get('/api/stand/status', (req, res) => {
    limparConversas();
    const config = configStand(env, provedores);
    const motivo = motivoDesligado(config);
    res.json({
      ok: true,
      ligado: !motivo,
      provedor: config.nome,
      motivo,
      voz: config.provedor?.turnos ? vozDaChave(configTotem.obter(), config.voz) : config.voz ?? null,
      totemDefaultVoice: configTotem.obter(),
      escuta: !motivo && escutaLigada(env, config),
      limites: config.provedor?.turnos ? { ...LIMITES_STAND, ...LIMITES_TURNO } : LIMITES_STAND,
      sessoes_na_hora: guarda.usadas(conta(req)),
      ...(config.provedor?.turnos ? { creditos_dia: teto.resumo(), vozes: vozesDoStatus(config) } : {}),
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
    try {
      // A voz escolhida é conferida junto com o pedido do token.
      const [token, voz] = await Promise.all([
        config.provedor.pedirToken({ chave: config.chave, fetchImpl }),
        config.provedor.turnos ? escolherVoz(config, req.body?.voz) : null,
      ]);
      // Pré-aquecimento: resolve a voz enquanto o microfone conecta.
      if (voz) resolverVoz({ chave: config.chave, voz: voz.voz, fetchImpl, cache: vozesIds }).catch(() => {});
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
        // Origem só para a contagem do dia: Despertar da Escuta ou toque.
        conversa.origem = req.body?.origem === 'escuta' ? 'escuta' : 'toque';
        conversa.perguntas = 0;
        conversa.voz = voz.voz;
        if (conversa.origem === 'escuta') teto.contar('despertares');
        conversas.set(conversa.id, conversa);
        corpo.conversa_id = conversa.id;
        corpo.voz = voz.chave;
        if (voz.aviso) corpo.voz_aviso = voz.aviso;
        corpo.limites = { ...LIMITES_STAND, ...LIMITES_TURNO };
      }
      res.json(corpo);
    } catch (erro) {
      console.warn(`[stand] falha ao pedir token a ${config.nome}: ${erro?.name || 'erro'}`);
      res.status(502).json({ ok: false, error: 'stand_provedor_indisponivel' });
    }
  });

  // Um turno da conversa (provedor em turnos). Corpo: {conversa_id, texto, tela?, camera?} ou
  // {conversa_id, evento: 'saudacao' | 'video_terminou' | 'acao_falhou' | 'fim', id?}.
  // `tela` (retrato da página do site) e `camera` (presença de rosto detectada no
  // navegador, sem imagem) são dados do navegador: cerebro.js limpa e rotula.
  // Resposta NDJSON, uma linha por item: {t:'frase'|'audio'|'evento'|'aviso'|'fim', ...}.
  // Um turno novo da mesma conversa aborta o anterior (barge-in).
  app.post('/api/stand/turno', async (req, res) => {
    const { conversa_id: id, turno_id: turnoIdBruto, texto, evento, id: idVideo, tela, camera } = req.body || {};
    const conversa = conversas.get(String(id || ''));
    if (!conversa || conversa.conta !== conta(req)) return res.status(404).json({ ok: false, error: 'conversa_desconhecida' });
    const config = configStand(env, provedores);
    if (!config.provedor?.turnos || !config.chave) {
      return res.status(503).json({ ok: false, error: 'stand_desligado', motivo: config.chave ? 'provedor_sem_turnos' : config.motivo });
    }
    const turnoId = idTurno(turnoIdBruto);
    if (turnoIdBruto !== undefined && !turnoId) return res.status(400).json({ ok: false, error: 'turno_id_invalido' });
    const anterior = turnoId && conversa.turnosRecebidos?.get(turnoId);
    if (anterior === 'ativo') return res.status(409).json({ ok: false, error: 'turno_em_andamento' });
    if (anterior) {
      return res.type('application/x-ndjson').send(`${JSON.stringify({ t: 'fim', motivo: 'ja_processado', turno_id: turnoId })}\n`);
    }
    if (evento === 'fim') {
      despejar(conversa.id, { estimado: false });
      return res.json({ ok: true, creditos_dia: teto.resumo() });
    }
    if (!conversa.turno && agora() - conversa.ultimoUso > validadeMs) {
      despejar(conversa.id);
      return res.status(410).json({ ok: false, error: 'conversa_expirada' });
    }
    let entrada = evento === 'saudacao' ? { evento }
      : evento === 'video_terminou' ? { evento, id: String(idVideo || '').slice(0, 80) }
        // Falha na tela: fala pronta; não conta pergunta nem conversa.
        : evento === 'acao_falhou' ? { evento }
          : { texto: String(texto || '').trim().slice(0, 500), tela: limparTela(tela), camera: limparTela(camera) };
    if (!entrada.evento && !entrada.texto) return res.status(400).json({ ok: false, error: 'texto_vazio' });
    if (evento === 'saudacao' && conversa.saudou) {
      return res.type('application/x-ndjson').send(`${JSON.stringify({ t: 'fim', motivo: 'ja_processado' })}\n`);
    }
    // Uma nova pergunta interrompe; retry com o mesmo id foi recusado acima.
    const fimAnterior = conversa.turnoFim;
    conversa.turno?.abort();
    const controle = new AbortController();
    conversa.turno = controle;
    let liberarTurno;
    conversa.turnoFim = new Promise((ok) => { liberarTurno = ok; });
    lembrarTurno(conversa, turnoId, 'ativo');
    res.on('close', () => { if (!res.writableFinished) controle.abort(); });
    try {
      // O anterior termina seu histórico antes da renovação/compactação.
      await fimAnterior;
      if (controle.signal.aborted) return res.end();
      if (/^continuar[.!?]?$/i.test(entrada.texto || '') && conversa.perguntaPendente) {
        entrada = { ...conversa.perguntaPendente, tela: entrada.tela || conversa.perguntaPendente.tela };
      }
      // Cobra o tempo já usado antes de renovar, inclusive se o diário acabou.
      cobrarStt(conversa);
      const janela = prepararJanela(conversa, {
        agora: agora(), limites: LIMITES_TURNO, tetoS: LIMITES_STAND.teto_s,
        permitir: () => guarda.tentar(conta(req)), diario: () => teto.estourou(),
      });
      if (!janela.ok) {
        if (entrada.texto) conversa.perguntaPendente = entrada;
        lembrarTurno(conversa, turnoId, 'pausado');
        // Sem modelo, TTS, ferramenta ou cobrança extra em uma pausa de custo.
        return res.type('application/x-ndjson').send(`${JSON.stringify({
          t: 'fim', motivo: 'pausa_limite', causa: janela.causa,
          texto: TEXTOS_PAUSA[janela.causa], turno_id: turnoId,
        })}\n`);
      }
      if (janela.renovada) console.info(`[stand] janela renovada total=${conversa.renovacoes} sessoes_hora=${guarda.usadas?.(conta(req)) ?? '-'}`);
      conversa.perguntaPendente = null;
      conversa.eventosJanela += 1;
      if (evento === 'saudacao') conversa.saudou = true;
      lembrarTurno(conversa, turnoId, 'ativo');
      if (entrada.texto) {
        conversa.perguntas = (conversa.perguntas ?? 0) + 1;
        if (conversa.perguntas === 1) teto.contar('conversas');
      }

      conversa.ultimoUso = agora();
      res.status(200);
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
      const emitir = (linha) => { if (!controle.signal.aborted) res.write(`${JSON.stringify(linha)}\n`); };
      const vozConversa = conversa.voz ?? config.voz;
      const sintetizar = sintetizarCom(config, vozConversa);
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
            falaPronta: falasProntas(vozConversa, sintetizar),
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
        res.end();
      }
    } finally {
      lembrarTurno(conversa, turnoId, 'concluido');
      if (conversa.turno === controle) conversa.turno = null;
      liberarTurno();
    }
  });

  // Falas prontas guardadas por voz e modelo (trocar a env troca o cache).
  const cacheFalas = new Map();
  function falasProntas(voz, sintetizar) {
    const chave = `${voz}|${modeloTtsStand(env)}`;
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
