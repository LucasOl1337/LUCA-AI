// Conteúdo do laudo em PDF (pedido do Lucas, 24/10): o que entra, já resumido e limitado,
// a partir do caso do Laboratório e da análise escolhida. Não chama modelo nenhum: com
// veredicto (analysis.verdict, contrato veredicto v1) usa a hipótese dele; caso antigo
// usa o resumo da revisão já gravado. O desenho fica em desenhar-laudo.js.
import { formatLabTime, hasPosition, labCaseVehicle, polygonDistance } from '../../shared/lab-telemetry.js';

const CULPADOS = { operador: 'Operador humano', maquina: 'Máquina', manutencao: 'Manutenção', ambiente: 'Ambiente', terceiro: 'Terceiro', indeterminado: 'Indeterminado' };
const DESFECHOS = { chegada: 'Percurso concluído', colisao: 'Colisão com obstáculo', atolamento: 'Atolou na área alagada', tombamento: 'Tombou na encosta', abandono: 'Corrida abandonada' };
const SERIES_SECUNDARIAS = [
  ['obstacle_distance_cm', 'Distância ao obstáculo', 'cm'], ['roll_deg', 'Inclinação lateral', '°'],
  ['coolant_temp_c', 'Temperatura do motor', '°C'], ['engine_rpm', 'Rotação', 'rpm'],
];
const corta = (texto, max) => {
  const t = String(texto ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cortado = t.slice(0, max);
  const ponto = Math.max(cortado.lastIndexOf('. '), cortado.lastIndexOf('; '));
  return ponto > max * 0.55 ? cortado.slice(0, ponto + 1) : `${cortado.slice(0, cortado.lastIndexOf(' ')).trim()}…`;
};
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
export const dataBrasilia = (iso, comHora = true) => {
  const data = new Date(iso);
  if (!iso || Number.isNaN(data.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', ...(comHora ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(data);
};
const diaArquivo = (iso) => {
  const data = Number.isNaN(new Date(iso).getTime()) ? new Date() : new Date(iso);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(data);
};

/** Nome legível para o WhatsApp: LUCA-laudo-<data>-<caso>.pdf, só ASCII. */
export function nomeArquivoLaudo(record, agora = new Date()) {
  const slug = String(record.name || record.id).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40) || 'caso';
  return `LUCA-laudo-${diaArquivo(record.createdAt || agora)}-${slug}.pdf`;
}

/** Análise do laudo: a pedida, senão a mais recente concluída/com veredicto, senão a última que não está rodando. */
export function escolherAnalise(record, analiseId = null) {
  const lista = Array.isArray(record.analyses) ? record.analyses : [];
  if (analiseId) return lista.find((a) => a.id === analiseId) ?? null;
  const prontas = [...lista].reverse().filter((a) => a.status !== 'running');
  return prontas.find((a) => a.verdict) ?? prontas.find((a) => a.status === 'completed') ?? prontas[0] ?? null;
}

function instanteCritico(analise, parsed) {
  const ev = analise?.verdict?.evidencias?.find((e) => Number.isFinite(e.elapsedMs));
  if (ev) return { elapsedMs: ev.elapsedMs, frame: Number.isInteger(ev.frame) ? ev.frame : null };
  const comFrame = analise?.verdict?.evidencias?.find((e) => Number.isInteger(e.frame));
  const circuito = parsed.manifest?.circuito;
  if (circuito?.resultado && circuito.resultado.motivo !== 'chegada') {
    const ep = [...(circuito.episodios || [])].reverse().find((e) => e.gravidade === 'critico') ?? circuito.episodios?.at(-1);
    return { elapsedMs: ep?.inicioMs ?? circuito.resultado.tempoMs, frame: comFrame?.frame ?? null };
  }
  const evento = parsed.events.find((e) => e.transition !== 'end');
  const hipotese = analise?.hypotheses?.find((h) => h.evidence?.length);
  return { elapsedMs: evento?.elapsedMs ?? hipotese?.evidence[0].elapsedMs ?? null, frame: comFrame?.frame ?? null };
}

function serie(parsed, campo, maximo = 240) {
  const passo = Math.max(1, Math.ceil(parsed.samples.length / maximo));
  const pontos = [];
  for (let i = 0; i < parsed.samples.length; i += passo) {
    const v = parsed.samples[i][campo];
    pontos.push([parsed.samples[i].elapsedMs, typeof v === 'number' && Number.isFinite(v) ? v : null]);
  }
  return pontos.some(([, v]) => v !== null) ? pontos : null;
}

/** Distância calculada até a água (m) a cada amostra, pelas mesmas regras dos eventos near_water. */
function serieAgua(parsed, maximo = 240) {
  const agua = parsed.polygons.filter((p) => p.role === 'water');
  if (!agua.length) return null;
  const passo = Math.max(1, Math.ceil(parsed.samples.length / maximo));
  const pontos = [];
  for (let i = 0; i < parsed.samples.length; i += passo) {
    const a = parsed.samples[i];
    pontos.push([a.elapsedMs, hasPosition(a) ? Math.round(Math.min(...agua.map((p) => polygonDistance(a, p))) * 10) / 10 : null]);
  }
  return pontos.some(([, v]) => v !== null) ? pontos : null;
}

/**
 * Segunda série do gráfico, a que conta a história do caso (título, evidência e gráfico do mesmo caso):
 * água → distância até a água; obstáculo/feno → distância ao obstáculo; superaquecimento → temperatura;
 * encosta/tombamento → inclinação. Sem tema, a primeira série disponível.
 */
function serieDoCaso(parsed, v) {
  const tipos = new Set(parsed.events.map((e) => e.type));
  const circuito = parsed.manifest?.circuito;
  const texto = `${v?.hipotese ?? ''} ${v?.porque ?? ''} ${circuito?.resultado?.motivo ?? ''} ${(circuito?.episodios ?? []).map((e) => e.sensor).join(' ')}`.toLowerCase();
  const candidatos = [];
  if (tipos.has('near_water') || /água|agua|alag|atol/.test(texto)) candidatos.push(['__agua', 'Distância até a água', 'm']);
  if (tipos.has('device_collision_warning') || /obst|fardo|feno|colis/.test(texto)) candidatos.push(SERIES_SECUNDARIAS[0]);
  if (tipos.has('coolant_warning') || /temperatura|aquec/.test(texto)) candidatos.push(SERIES_SECUNDARIAS[2]);
  if (tipos.has('device_inclination_warning') || /encosta|tomb|inclina/.test(texto)) candidatos.push(SERIES_SECUNDARIAS[1]);
  for (const [campo, rotulo, unidade] of [...candidatos, ...SERIES_SECUNDARIAS]) {
    const pontos = campo === '__agua' ? serieAgua(parsed) : serie(parsed, campo);
    if (pontos) return { campo, rotulo, unidade, pontos };
  }
  return null;
}

/** Tudo o que o PDF mostra, em texto final (pt-BR) e séries numéricas. */
export function dadosDoLaudo(record, parsed, analise, agora = new Date()) {
  const v = analise?.verdict ?? null;
  const circuito = parsed.manifest?.circuito ?? null;
  const veiculo = labCaseVehicle(parsed.manifest);
  const revisao = analise?.axes?.find((e) => e.id === 'review' && e.status === 'completed') ?? analise?.axes?.find((e) => e.status === 'completed');
  const hipoteseTexto = v?.hipotese || v?.porque || revisao?.summary || '';
  const evidenciasVeredicto = (v?.evidencias ?? []).map((e) => ({ tempo: Number.isFinite(e.elapsedMs) ? formatLabTime(e.elapsedMs) : null, texto: corta(e.descricao, 230) }));
  const evidenciasHipoteses = (analise?.hypotheses ?? []).filter((h) => h.evidence?.length).map((h) => ({ tempo: formatLabTime(h.evidence[0].elapsedMs), texto: corta(`${h.title}: ${h.evidence[0].description}`, 230) }));
  const evidenciasEventos = parsed.events.filter((e) => e.transition !== 'end').map((e) => ({ tempo: formatLabTime(e.elapsedMs), texto: corta(`${e.title}. ${e.description}`, 230) }));
  const evidencias = [...evidenciasVeredicto, ...(evidenciasVeredicto.length >= 3 ? [] : evidenciasHipoteses), ...(evidenciasVeredicto.length + evidenciasHipoteses.length >= 3 ? [] : evidenciasEventos)].slice(0, 5);
  const secundaria = serieDoCaso(parsed, v);
  const impacto = v?.impacto_financeiro;
  const situacao = !analise ? 'sem_analise' : v ? (v.status === 'concluido' ? 'veredicto' : 'veredicto_indeterminado') : 'sem_veredicto';
  return {
    titulo: record.name, casoId: record.id, sintetico: parsed.synthetic === true,
    geradoEm: dataBrasilia(agora), dataCaso: dataBrasilia(parsed.startedAt || record.createdAt),
    veiculo: veiculo ? `${veiculo.veiculo} · ${veiculo.placa}` : parsed.machineId === 'trator-simulador' ? 'Trator (simulador do totem)' : parsed.machineId,
    cenario: parsed.manifest?.site?.name || parsed.title,
    desfecho: circuito?.resultado ? DESFECHOS[circuito.resultado.motivo] ?? circuito.resultado.motivo : null,
    duracao: formatLabTime(parsed.durationMs),
    situacao,
    hipotese: hipoteseTexto ? corta(hipoteseTexto, 620) : 'A investigação dos agentes ainda não foi concluída para este caso. Os eventos abaixo foram calculados da telemetria, sem interpretação.',
    origemHipotese: v ? 'veredicto' : revisao ? 'revisao' : 'eventos',
    veredicto: {
      culpado: v ? (v.culpadoRotulo || CULPADOS[v.culpado] || 'Indeterminado') : 'Sem veredicto',
      confianca: v && Number.isFinite(v.confianca) ? Math.max(0, Math.min(1, v.confianca)) : null,
      porque: v ? corta(v.porque, 300) : situacao === 'sem_analise' ? 'Caso ainda não analisado pelos agentes.' : 'Esta análise é anterior ao veredicto final; a hipótese acima vem da revisão dos agentes.',
      fatores: (v?.fatores_contribuintes ?? []).slice(0, 3).map((f) => corta(f, 90)),
    },
    evidencias,
    prevencao: (v?.prevencao ?? []).slice(0, 4).map((p) => ({ acao: corta(p.acao, 170), responsavel: corta(p.responsavel, 40), prazo: p.prazo ? corta(p.prazo, 30) : null })),
    impacto: impacto ? {
      faixa: impacto.faixa_min_brl == null ? 'Sem estimativa' : impacto.faixa_max_brl === 0 ? 'Sem dano material estimado'
        : impacto.faixa_min_brl === impacto.faixa_max_brl ? brl.format(impacto.faixa_min_brl) : `${brl.format(impacto.faixa_min_brl)} a ${brl.format(impacto.faixa_max_brl)}`,
      componentes: (Array.isArray(impacto.componentes) ? impacto.componentes : []).slice(0, 3).map((c) => ({ item: corta(c.item, 60), valor: c.valor_min_brl === c.valor_max_brl ? brl.format(c.valor_min_brl) : `${brl.format(c.valor_min_brl)}–${brl.format(c.valor_max_brl)}`, base: corta(c.base, 90) })),
      premissas: (Array.isArray(impacto.premissas) ? impacto.premissas : []).slice(0, 3).map((p) => corta(p, 150)),
    } : null,
    aviso: v?.aviso || 'Estimativa dos agentes de IA, não acusação nem laudo pericial.',
    modelo: v?.modelo || analise?.model || null,
    analise: analise ? { versao: analise.version, data: dataBrasilia(analise.completedAt || analise.createdAt) } : null,
    critico: instanteCritico(analise, parsed),
    graficos: { velocidade: serie(parsed, 'ground_speed_kmh'), secundaria: secundaria ?? null, duracaoMs: parsed.durationMs },
    mapa: {
      poligonos: parsed.polygons.map((p) => ({ papel: p.role, aneis: p.rings.map((r) => r.map((pt) => [pt.x, pt.z])) })),
      trajeto: parsed.samples.filter((s) => s.x !== null && s.z !== null).filter((_, i, l) => i % Math.max(1, Math.ceil(l.length / 400)) === 0).map((s) => [s.x, s.z, s.elapsedMs]),
    },
    frame: null,
  };
}
