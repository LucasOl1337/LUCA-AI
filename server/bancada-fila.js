import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { contextoCircuito } from '../shared/circuito-context.js';

/**
 * Fila da bancada (pedido do Lucas, 24/10): a corrida vai para a investigação do
 * Laboratório (3 eixos + revisão, server/lab-cases.js) sem a pessoa esperar na tela.
 * Persistida em LUCA_DATA_DIR/bancada-fila.json; o worker roda no processo, em ordem
 * de chegada, com concorrência e teto diário configuráveis (cada análise chama modelos pagos).
 */
export const ESTADOS_FILA = Object.freeze(['na_fila', 'processando', 'pronto', 'falhou']);
export const MAX_TENTATIVAS = 2;
const ESPERA_RETENTATIVA_MS = 30_000;
const MAX_ITENS = 2000;
const ID = /^fila_[a-f0-9]{32}$/;

class FilaError extends Error {
  constructor(message, status = 400, code = 'fila_invalida') { super(message); this.status = status; this.code = code; }
}

/** Data de Brasília (YYYY-MM-DD) de um instante ISO. */
export function diaBrasilia(iso) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

export function lerConcorrencia(raw) {
  const n = Number(raw);
  return raw != null && raw !== '' && Number.isInteger(n) && n >= 0 && n <= 4 ? n : 1;
}
export function lerTetoDia(raw) {
  const n = Number(raw);
  return raw != null && raw !== '' && Number.isInteger(n) && n >= 0 && n <= 10_000 ? n : 60;
}

const textoCurto = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const numero = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Resumo da corrida para a tabela: o registro validado do circuito manda; o resto vem do cliente, só como rótulo. */
export function resumoDaCorrida(caso, corrida = {}) {
  const c = contextoCircuito(caso?.metadata?.circuito);
  const bruto = corrida && typeof corrida === 'object' && !Array.isArray(corrida) ? corrida : {};
  return {
    veiculo: textoCurto(bruto.veiculo, 40) ?? 'trator',
    cenario: textoCurto(bruto.cenario, 60) ?? (c ? 'circuito' : 'percurso'),
    desfecho: c?.resultado.motivo ?? textoCurto(bruto.desfecho, 40),
    desfechoTitulo: textoCurto(bruto.desfechoTitulo, 80),
    tempoMs: c ? Math.round(c.metricas.elapsedMs) : numero(bruto.tempoMs),
    nota: numero(bruto.nota),
    avisos: c ? c.episodios.length : numero(bruto.avisos),
    semResposta: c ? c.metricas.semResposta : numero(bruto.semResposta),
    sinistrosEvitados: c ? c.metricas.sinistrosEvitados : numero(bruto.sinistrosEvitados),
    reacaoMediaMs: c ? (c.metricas.reacaoMediaMs === null ? null : Math.round(c.metricas.reacaoMediaMs)) : numero(bruto.reacaoMediaMs),
    runId: c?.runId ?? textoCurto(bruto.runId, 80),
  };
}

/** Parecer curto: resumo da revisão (ou do primeiro eixo concluído) e a hipótese principal. */
export function parecerDaAnalise(analysis) {
  const concluidos = (analysis.axes || []).filter((a) => a.status === 'completed');
  const revisao = concluidos.find((a) => a.id === 'review') ?? concluidos[0];
  return {
    status: analysis.status === 'completed' ? 'completo' : 'parcial',
    eixos: `${concluidos.length}/${(analysis.axes || []).length}`,
    resumo: (revisao?.summary || analysis.error || '').slice(0, 600),
    hipoteses: (analysis.hypotheses || []).length,
    principal: analysis.hypotheses?.[0]?.title?.slice(0, 200) ?? null,
  };
}

export function createBancadaFila({ lab, dataDir, concorrencia = 1, tetoDia = 60, agora = () => new Date(), log = console, esperaRetentativaMs = ESPERA_RETENTATIVA_MS }) {
  const arquivo = path.join(path.resolve(dataDir), 'bancada-fila.json');
  let itens = [];
  try { itens = JSON.parse(fs.readFileSync(arquivo, 'utf8')).itens ?? []; }
  catch (error) { if (error.code !== 'ENOENT') log.error('[fila] arquivo ilegível, começando vazia:', error.message); }
  let parada = false;
  // Instância parada (teste/encerramento) não grava mais: o arquivo é da instância viva.
  const salvar = () => {
    if (parada) return;
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    const tmp = `${arquivo}.${randomUUID()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ versao: 1, itens }), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, arquivo);
  };
  // Restart no meio de uma análise: volta para a fila (a tentativa já contou) ou falha se esgotou.
  let mudou = false;
  for (const item of itens) {
    if (item.estado !== 'processando') continue;
    mudou = true;
    if (item.tentativas >= MAX_TENTATIVAS) Object.assign(item, { estado: 'falhou', erro: 'A análise foi interrompida por reinício do servidor.', concluidoEm: agora().toISOString() });
    else Object.assign(item, { estado: 'na_fila', iniciadoEm: null });
  }
  if (mudou) salvar();

  const rodando = new Set();
  let relogio = null;
  const ociosos = [];

  const esperando = () => itens.filter((i) => i.estado === 'na_fila').sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
  const posicao = (item) => (item.estado === 'na_fila' ? esperando().findIndex((i) => i.id === item.id) + 1 : 0);
  const publico = (item, userId, admin) => {
    const { ownerId, ownerName, foco, proximaEm, ...resto } = item;
    return { ...resto, posicao: posicao(item), proprio: ownerId === userId, ...(admin ? { conta: ownerName } : {}) };
  };
  const enviadosHoje = () => { const hoje = diaBrasilia(agora().toISOString()); return itens.filter((i) => diaBrasilia(i.criadoEm) === hoje).length; };
  const limites = () => ({ concorrencia, tetoDia, enviadosHoje: enviadosHoje(), naFila: esperando().length, processando: rodando.size });

  const aposMudanca = () => { salvar(); bombear(); };
  const terminar = (item, campos) => { Object.assign(item, campos, { concluidoEm: agora().toISOString() }); };

  async function processar(item) {
    try {
      const { analysis } = await lab.investigate(item.ownerId, item.caseId, item.foco);
      const parecer = parecerDaAnalise(analysis);
      const algumEixo = (analysis.axes || []).some((a) => a.status === 'completed');
      if (algumEixo) terminar(item, { estado: 'pronto', analysisId: analysis.id, parecer, erro: null });
      else if (item.tentativas < MAX_TENTATIVAS) Object.assign(item, { estado: 'na_fila', erro: analysis.error || 'Nenhum eixo concluiu.', proximaEm: agora().getTime() + esperaRetentativaMs });
      else terminar(item, { estado: 'falhou', analysisId: analysis.id, parecer, erro: analysis.error || 'Os agentes não concluíram nenhum eixo.' });
    } catch (error) {
      const conhecido = lab.isLabError?.(error);
      if (!conhecido) log.error('[fila] análise falhou', item.id, error?.message || error);
      const definitivo = conhecido && error.status === 404;
      const mensagem = conhecido ? error.message : 'O Laboratório não concluiu a análise.';
      if (!definitivo && item.tentativas < MAX_TENTATIVAS) Object.assign(item, { estado: 'na_fila', erro: mensagem, proximaEm: agora().getTime() + esperaRetentativaMs });
      else terminar(item, { estado: 'falhou', erro: mensagem });
    } finally {
      rodando.delete(item.id);
      aposMudanca();
      if (!rodando.size && !itens.some((i) => i.estado === 'na_fila')) ociosos.splice(0).forEach((r) => r());
    }
  }

  function bombear() {
    if (parada) return;
    clearTimeout(relogio); relogio = null;
    const t = agora().getTime();
    let proxima = Infinity;
    for (const item of esperando()) {
      if (rodando.size >= concorrencia) break;
      if (item.proximaEm && item.proximaEm > t) { proxima = Math.min(proxima, item.proximaEm); continue; }
      Object.assign(item, { estado: 'processando', iniciadoEm: agora().toISOString(), tentativas: (item.tentativas || 0) + 1, proximaEm: null });
      rodando.add(item.id);
      salvar();
      void processar(item);
    }
    if (proxima < Infinity && rodando.size < concorrencia) { relogio = setTimeout(bombear, Math.max(50, proxima - t)); relogio.unref?.(); }
  }

  function enfileirar({ userId, userName, body }) {
    const caso = body?.caso;
    if (!caso || typeof caso !== 'object' || Array.isArray(caso)) throw new FilaError('Envie o caso da corrida (rawCsv, sourceName, metadata, map).');
    const foco = typeof body.foco === 'string' ? body.foco.slice(0, 4000) : '';
    const salvo = lab.createCase(userId, caso).case;
    const existente = itens.find((i) => i.ownerId === userId && i.caseId === salvo.id && (i.estado === 'na_fila' || i.estado === 'processando'));
    if (existente) return { criado: false, item: existente };
    if (enviadosHoje() >= tetoDia) throw new FilaError(`A bancada já recebeu ${tetoDia} corridas hoje (teto do dia). O caso ficou salvo no Laboratório.`, 429, 'fila_teto_dia');
    const item = {
      id: `fila_${randomUUID().replace(/-/g, '')}`, ownerId: userId, ownerName: String(userName || '').slice(0, 80),
      caseId: salvo.id, caseName: salvo.name, estado: 'na_fila', criadoEm: agora().toISOString(), iniciadoEm: null, concluidoEm: null,
      tentativas: 0, erro: null, analysisId: null, foco, corrida: resumoDaCorrida(caso, body.corrida), parecer: null,
    };
    itens.push(item);
    if (itens.length > MAX_ITENS) {
      const finais = itens.filter((i) => i.estado === 'pronto' || i.estado === 'falhou').sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
      const fora = new Set(finais.slice(0, itens.length - MAX_ITENS).map((i) => i.id));
      itens = itens.filter((i) => !fora.has(i.id));
    }
    aposMudanca();
    return { criado: true, item };
  }

  function listar({ userId, admin, estado, dia }) {
    return itens
      .filter((i) => (admin || i.ownerId === userId) && (!estado || i.estado === estado) && (!dia || diaBrasilia(i.criadoEm) === dia))
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
      .map((i) => publico(i, userId, admin));
  }

  function ler({ userId, admin, id }) {
    const item = ID.test(id) ? itens.find((i) => i.id === id && (admin || i.ownerId === userId)) : null;
    if (!item) throw new FilaError('Item da fila não encontrado.', 404, 'fila_item_nao_encontrado');
    return publico(item, userId, admin);
  }

  bombear();
  return {
    enfileirar, listar, ler, limites, publico, bombear,
    /** Resolve quando não houver nada rodando nem esperando (testes). */
    ocioso: () => (!rodando.size && !itens.some((i) => i.estado === 'na_fila') ? Promise.resolve() : new Promise((r) => ociosos.push(r))),
    parar: () => { parada = true; clearTimeout(relogio); },
  };
}

export function registerBancadaFilaRoutes(app, {
  lab, dataDir = process.env.LUCA_DATA_DIR || path.resolve(process.cwd(), '.luca'),
  concorrencia = lerConcorrencia(process.env.LUCA_FILA_BANCADA_CONCORRENCIA),
  tetoDia = lerTetoDia(process.env.LUCA_FILA_BANCADA_TETO_DIA), agora, esperaRetentativaMs,
} = {}) {
  const fila = createBancadaFila({ lab, dataDir, concorrencia, tetoDia, agora, ...(esperaRetentativaMs ? { esperaRetentativaMs } : {}) });
  const rota = (handler) => async (req, res) => {
    const user = req.auth?.user;
    if (!user?.id || user.id === 'system') { res.status(401).json({ ok: false, error: 'authentication_required' }); return; }
    try { await handler(req, res, { userId: user.id, userName: user.name, admin: user.role === 'admin' }); }
    catch (error) {
      const conhecido = error instanceof FilaError || lab.isLabError?.(error);
      if (!conhecido) console.error('[fila]', error?.message || error);
      res.status(conhecido ? error.status : 500).json({ ok: false, error: conhecido ? error.code : 'fila_erro', message: conhecido ? error.message : 'Não foi possível acessar a fila da bancada.' });
    }
  };

  app.get('/api/bancada/fila', rota((req, res, quem) => {
    const estado = ESTADOS_FILA.includes(req.query.estado) ? req.query.estado : '';
    const dia = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.dia || '')) ? req.query.dia : '';
    res.json({ ok: true, itens: fila.listar({ ...quem, estado, dia }), limites: fila.limites() });
  }));
  app.post('/api/bancada/fila', rota((req, res, quem) => {
    const { criado, item } = fila.enfileirar({ ...quem, body: req.body || {} });
    res.status(criado ? 202 : 200).json({ ok: true, item: fila.publico(item, quem.userId, quem.admin), limites: fila.limites() });
  }));
  app.get('/api/bancada/fila/:id', rota((req, res, quem) => {
    res.json({ ok: true, item: fila.ler({ ...quem, id: req.params.id }) });
  }));
  return fila;
}
