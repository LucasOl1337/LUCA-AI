/** Cliente da fila da bancada (`/api/bancada/fila`, server/bancada-fila.js). */
export type EstadoFila = 'na_fila' | 'processando' | 'pronto' | 'falhou';

export interface CorridaFila {
  veiculo: string; cenario: string; desfecho: string | null; desfechoTitulo: string | null;
  tempoMs: number | null; nota: number | null; avisos: number | null; semResposta: number | null;
  sinistrosEvitados: number | null; reacaoMediaMs: number | null; runId: string | null;
}
/** Resumo do `analysis.verdict` (contrato veredicto v1): estimativa, não laudo. Ausente/null em caso antigo. */
export interface VeredictoFila { culpado: string; rotulo: string; confianca: number; faixaMinBrl: number | null; faixaMaxBrl: number | null }
export interface ParecerFila { status: 'completo' | 'parcial'; eixos: string; resumo: string; hipoteses: number; principal: string | null; veredicto?: VeredictoFila | null }
export interface ItemFila {
  id: string; caseId: string; caseName: string; estado: EstadoFila; posicao: number;
  criadoEm: string; iniciadoEm: string | null; concluidoEm: string | null; tentativas: number; erro: string | null;
  analysisId: string | null; corrida: CorridaFila; parecer: ParecerFila | null; proprio: boolean; conta?: string;
}
export interface LimitesFila { concorrencia: number; tetoDia: number; enviadosHoje: number; naFila: number; processando: number }
export interface EnvioFila {
  caso: { rawCsv: string; sourceName: string; name: string; metadata: Record<string, unknown>; map: Record<string, unknown> };
  corrida?: Partial<Pick<CorridaFila, 'veiculo' | 'cenario' | 'desfecho' | 'desfechoTitulo' | 'tempoMs' | 'nota' | 'avisos' | 'runId'>>;
  foco?: string;
}

export const ROTULO_ESTADO: Record<EstadoFila, string> = { na_fila: 'Na fila', processando: 'Processando', pronto: 'Pronto', falhou: 'Falhou' };

async function pedir<T>(caminho: string, corpo?: unknown): Promise<T> {
  const resposta = await fetch(`/api/bancada/fila${caminho}`, {
    method: corpo === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    headers: corpo === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    throw new Error(dados.message || (resposta.status === 401 ? 'O totem precisa estar com a conta entrada para enviar à bancada.' : `A bancada respondeu ${resposta.status}.`));
  }
  return dados as T;
}

export const enviarParaFila = (envio: EnvioFila) => pedir<{ item: ItemFila; limites: LimitesFila }>('', envio);
export const lerItemFila = (id: string) => pedir<{ item: ItemFila }>(`/${encodeURIComponent(id)}`);
export function listarFila(filtro: { estado?: EstadoFila | ''; dia?: string } = {}) {
  const busca = new URLSearchParams();
  if (filtro.estado) busca.set('estado', filtro.estado);
  if (filtro.dia) busca.set('dia', filtro.dia);
  const q = busca.toString();
  return pedir<{ itens: ItemFila[]; limites: LimitesFila }>(q ? `?${q}` : '');
}

/** "Na fila: 3º" / "Processando agora" / "Pronto" — o mesmo texto no resultado e na tabela. */
export function textoPosicao(item: Pick<ItemFila, 'estado' | 'posicao'>) {
  if (item.estado === 'na_fila') return `Na fila: ${item.posicao}º`;
  if (item.estado === 'processando') return 'Processando agora';
  return ROTULO_ESTADO[item.estado];
}

/** Dia de Brasília (YYYY-MM-DD) de um instante ISO, igual ao filtro do servidor. */
export function diaBrasilia(iso: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

const MOTIVOS: Record<string, string> = { chegada: 'Chegou', colisao: 'Colisão', atolamento: 'Atolou', tombamento: 'Tombou', abandono: 'Abandonou' };
/** Desfecho curto para a tabela: título enviado pela tela, ou o motivo validado do registro. */
export function textoDesfecho(c: CorridaFila) {
  return c.desfechoTitulo || (c.desfecho ? MOTIVOS[c.desfecho] ?? c.desfecho : '—');
}
/** "Nota 82" / "2 avisos, 1 sem resposta" / "—". */
export function textoNota(c: CorridaFila) {
  const partes: string[] = [];
  if (c.nota !== null) partes.push(`Nota ${c.nota}`);
  if (c.avisos !== null) partes.push(`${c.avisos} ${c.avisos === 1 ? 'aviso' : 'avisos'}${c.semResposta ? `, ${c.semResposta} sem resposta` : ''}`);
  return partes.join(' · ') || '—';
}
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
/** "Culpado provável: Operador humano (72%)"; null sem veredicto ou indeterminado sem confiança. */
export function textoCulpado(v: VeredictoFila | null | undefined) {
  if (!v || !Number.isFinite(v.confianca)) return null;
  return `Culpado provável: ${v.rotulo} (${Math.round(v.confianca * 100)}%)`;
}
/** "R$ 8.000 – R$ 32.000" (mesmo texto do textoFaixa do Veredicto); null quando a faixa não foi calculada. */
export function textoFaixaFila(v: VeredictoFila | null | undefined) {
  if (!v || v.faixaMinBrl == null || v.faixaMaxBrl == null) return null;
  if (v.faixaMaxBrl === 0) return 'sem dano material estimado';
  return v.faixaMinBrl === v.faixaMaxBrl ? brl(v.faixaMinBrl) : `${brl(v.faixaMinBrl)} – ${brl(v.faixaMaxBrl)}`;
}
export const quandoBrasilia = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export type ColunaFila = 'quando' | 'veiculo' | 'desfecho' | 'nota' | 'estado';
const ORDEM_ESTADO: Record<EstadoFila, number> = { processando: 0, na_fila: 1, pronto: 2, falhou: 3 };
export function ordenarFila(itens: readonly ItemFila[], coluna: ColunaFila, crescente: boolean) {
  const valor = (i: ItemFila): string | number => {
    if (coluna === 'quando') return i.criadoEm;
    if (coluna === 'veiculo') return `${i.corrida.veiculo} ${i.corrida.cenario}`;
    if (coluna === 'desfecho') return textoDesfecho(i.corrida);
    if (coluna === 'nota') return i.corrida.nota ?? -1;
    return ORDEM_ESTADO[i.estado];
  };
  return [...itens].sort((a, b) => {
    const va = valor(a), vb = valor(b);
    const d = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR');
    return (crescente ? d : -d) || b.criadoEm.localeCompare(a.criadoEm);
  });
}

/** Célula CSV: aspas, e fórmula de planilha (= + - @) neutralizada com apóstrofo. */
function celula(valor: unknown) {
  let texto = valor == null ? '' : String(valor);
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return /[;"\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}
/** CSV (separador `;`, BOM para o Excel em pt-BR) com o que a tabela mostra e os ids para cruzar com o Laboratório. */
export function csvDaFila(itens: readonly ItemFila[]) {
  const cabecalho = ['enviado_em', 'estado', 'veiculo', 'cenario', 'desfecho', 'nota', 'tempo_s', 'avisos', 'sem_resposta', 'riscos_evitados', 'reacao_media_ms', 'parecer', 'eixos', 'hipotese_principal', 'culpado_provavel_estimativa', 'confianca_estimativa', 'impacto_min_brl_estimativa', 'impacto_max_brl_estimativa', 'erro', 'caso', 'run_id', 'id'];
  const linhas = itens.map((i) => [
    i.criadoEm, ROTULO_ESTADO[i.estado], i.corrida.veiculo, i.corrida.cenario, textoDesfecho(i.corrida), i.corrida.nota,
    i.corrida.tempoMs === null ? '' : (i.corrida.tempoMs / 1000).toFixed(1), i.corrida.avisos, i.corrida.semResposta, i.corrida.sinistrosEvitados,
    i.corrida.reacaoMediaMs, i.parecer?.resumo, i.parecer?.eixos, i.parecer?.principal,
    i.parecer?.veredicto?.rotulo, i.parecer?.veredicto ? i.parecer.veredicto.confianca.toFixed(2) : '', i.parecer?.veredicto?.faixaMinBrl, i.parecer?.veredicto?.faixaMaxBrl, i.erro, i.caseId, i.corrida.runId, i.id,
  ].map(celula).join(';'));
  return `\uFEFF${[cabecalho.join(';'), ...linhas].join('\r\n')}\r\n`;
}
