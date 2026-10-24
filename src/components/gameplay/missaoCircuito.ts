import { metricasCircuito, textoResultadoCircuito, type EpisodioCircuito, type RegistroCircuito } from './circuito';
import type { RelatorioCircuito } from './sessaoCircuito';
import { CHAVE_CHAT_CIRCUITO } from '../stand/fimDeVisita';

/**
 * Corrida do totem → bancada de agentes do LUCA-AI (pedido do Lucas, 24/10: a análise
 * do simulador do totem não é do Laboratório; é a bancada, como a simulação padrão
 * do SOMPO). Puro: monta a missão, o anexo com o registro e guarda/recupera a sessão
 * aberta na aba. Quem cria a sessão e abre a página é o `SimuladorKiosk`.
 */

/** Mesma equipe que o SOMPO usa por padrão: síntese, veredito e o relatório visual no fim. */
export const PRESET_BANCADA_CIRCUITO = { id: 'conselho-estrategia', label: 'Conselho de Estratégia' } as const;
/** Teto da missão aceito pelo runtime da bancada. */
export const LIMITE_MISSAO = 6000;

/** Texto inicial do campo que o visitante vê; a instrução técnica aos agentes fica em `focoCircuito`. */
export const PERGUNTA_PADRAO_CIRCUITO = 'Avalie minha corrida: tempo, desfecho, riscos evitados e resposta aos sensores.';
export function focoCircuito(relatorio: RelatorioCircuito, pergunta: string) {
  const r = relatorio.registro;
  return `Circuito contínuo SIMULAÇÃO, sem reposicionamentos. Avalie tempo ativo em ms, desfecho, sinistros evitados por heurística (não acidentes reais), reações pós-aviso e ausências. Não inferir risco de seguro, culpa ou lesão. Trace integral no campo telemetry.circuito, derivado do manifesto validado.\n${JSON.stringify({ runId: r.runId, resultado: r.resultado, metricas: metricasCircuito(r) })}\nPergunta do visitante: ${pergunta}`;
}

const SENSOR: Record<EpisodioCircuito['sensor'], string> = {
  feno: 'obstáculo à frente', agua: 'área alagada', encosta: 'encosta', sonolencia: 'olhos fechados',
  animal: 'animal na pista', freio: 'freio sem resposta', curva: 'curva fechada',
};
const ACAO: Record<NonNullable<EpisodioCircuito['resposta']>['acao'], string> = { frenagem: 'freou', esterco: 'esterçou', freio_motor: 'usou o freio motor' };
const VEICULO: Record<string, string> = { trator: 'Trator MAX no circuito do talhão', caminhao: 'Caminhão na serra (descida sem freio)' };

const seg = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
function tempo(ms: number) {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`;
}
function linhaEpisodio(e: EpisodioCircuito, i: number) {
  const reacao = e.resposta ? `${ACAO[e.resposta.acao]} ${seg(e.resposta.latenciaMs)} depois do aviso` : 'sem reação registrada';
  return `${i + 1}. ${seg(e.inicioMs)} · ${SENSOR[e.sensor] ?? e.sensor} (${e.gravidade}) a ${Math.round(e.velocidadeKph)} km/h · ${reacao}${e.evitado ? ' · risco evitado' : ''}`;
}

export interface MissaoCorrida {
  caseId: string;
  mission: string;
  /** Registro completo (episódios, métricas e amostras 5 Hz em CSV); sem prints, que são imagens do laudo. */
  anexo: { nome: string; conteudo: string; tipo: 'application/json' };
}

/** Missão da bancada e anexo com o registro inteiro da corrida (trator ou caminhão). */
export function missaoDaCorrida(relatorio: RelatorioCircuito): MissaoCorrida {
  const r: RegistroCircuito = relatorio.registro;
  const m = metricasCircuito(r);
  const veiculo = r.veiculo ?? 'trator';
  const resultado = textoResultadoCircuito(r);
  const episodios = r.episodios.slice(0, 20).map(linhaEpisodio);
  const nomeAnexo = `corrida-${r.runId}.json`;
  const linhas = [
    `Corrida SIMULAÇÃO no totem LUCA-AI · ${VEICULO[veiculo] ?? veiculo}`,
    `Equipe selecionada para avaliar: ${PRESET_BANCADA_CIRCUITO.label}`,
    '',
    `Desfecho: ${resultado.titulo}`,
    `Tempo dirigindo: ${tempo(m.elapsedMs)} · Avisos: ${r.episodios.length} (${r.episodios.length - m.semResposta} respondidos, ${m.semResposta} sem resposta) · Riscos evitados (estimativa do jogo): ${m.sinistrosEvitados} · Reação média após aviso: ${m.reacaoMediaMs === null ? 'sem reação medida' : seg(m.reacaoMediaMs)}`,
    r.pausas.length ? `Pausas declaradas: ${r.pausas.length} (tempo parado não conta).` : null,
    '',
    'Avisos dos sensores, na ordem:',
    ...(episodios.length ? episodios : ['- nenhum aviso nesta corrida']),
    r.episodios.length > 20 ? `(mais ${r.episodios.length - 20} avisos no anexo)` : null,
    '',
    `Registro completo no anexo ${nomeAnexo}: episódios com instante, velocidade, distância, rolagem e comando inicial; métricas; amostras da física a 5 Hz em CSV (tempo, posição, velocidade, rolagem, comandos).`,
    '',
    'Objetivo: relatório da bancada sobre esta corrida, para o visitante ler no totem. Avaliem a condução (o que foi bem, o que faltou), expliquem o desfecho pelas evidências do registro (instante e sensor), e recomendem o que treinar na próxima corrida. Respondam em pt-BR, direto, sem jargão.',
    '',
    `Regras: ${r.regras}`,
    'É uma simulação didática: não inferir risco de seguro, culpa, lesão ou valor financeiro. Não inventar dados fora do registro; o que não estiver no anexo é pendente. Riscos evitados são heurística do jogo, não acidentes reais.',
    `Pergunta do visitante: ${PERGUNTA_PADRAO_CIRCUITO}`,
  ].filter((l): l is string => l !== null);
  let mission = linhas.join('\n');
  if (mission.length > LIMITE_MISSAO) mission = `${mission.slice(0, LIMITE_MISSAO - 1).trimEnd()}…`;
  const { prints: _prints, ...caso } = relatorio.caso;
  return {
    caseId: `totem-corrida-${veiculo}-${r.runId}`,
    mission,
    anexo: { nome: nomeAnexo, tipo: 'application/json', conteudo: JSON.stringify({ origem: 'SIMULAÇÃO', registro: r, metricas: m, caso }) },
  };
}

/** Sessão da bancada aberta pela corrida; fica na aba (sobrevive a recarregar) e some no fim de visita. */
export interface BancadaCircuito { sessao: string; runId: string }
export function guardarBancadaCircuito(b: BancadaCircuito, armazem: Pick<Storage, 'setItem'> | null = typeof sessionStorage === 'undefined' ? null : sessionStorage) {
  try { armazem?.setItem(CHAVE_CHAT_CIRCUITO, JSON.stringify({ bancada: b })); } catch { /* falta de cota não derruba a sessão aberta */ }
}
export function recuperarBancadaCircuito(armazem: Pick<Storage, 'getItem'> | null = typeof sessionStorage === 'undefined' ? null : sessionStorage): BancadaCircuito | null {
  try {
    const texto = armazem?.getItem(CHAVE_CHAT_CIRCUITO);
    if (!texto) return null;
    const b = JSON.parse(texto)?.bancada;
    return b && typeof b.sessao === 'string' && b.sessao && typeof b.runId === 'string' ? { sessao: b.sessao, runId: b.runId } : null;
  } catch { return null; }
}
export function esquecerBancadaCircuito(armazem: Pick<Storage, 'removeItem'> | null = typeof sessionStorage === 'undefined' ? null : sessionStorage) {
  try { armazem?.removeItem(CHAVE_CHAT_CIRCUITO); } catch { /* nada a apagar */ }
}
