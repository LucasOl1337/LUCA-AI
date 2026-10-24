/** Cliente da fila da bancada (`/api/bancada/fila`, server/bancada-fila.js). */
export type EstadoFila = 'na_fila' | 'processando' | 'pronto' | 'falhou';

export interface CorridaFila {
  veiculo: string; cenario: string; desfecho: string | null; desfechoTitulo: string | null;
  tempoMs: number | null; nota: number | null; avisos: number | null; semResposta: number | null;
  sinistrosEvitados: number | null; reacaoMediaMs: number | null; runId: string | null;
}
export interface ParecerFila { status: 'completo' | 'parcial'; eixos: string; resumo: string; hipoteses: number; principal: string | null }
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
