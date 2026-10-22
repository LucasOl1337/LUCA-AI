import { formatLabTime } from '../../../shared/lab-telemetry.js';

/**
 * Cliente da análise do percurso: salva o caso no Laboratório e pede a investigação
 * EXISTENTE (3 eixos + revisão, server/lab-cases.js). A resposta do POST pode levar
 * ~3 min e passar do corte do proxy; por isso o progresso vem do GET do caso, que o
 * servidor grava como 'running' antes de chamar os agentes. Nada é inventado: sem
 * resposta válida, mostra a mensagem do servidor ou o prazo vencido.
 */
export type EstadoAnalise =
  | { tipo: 'parada' }
  | { tipo: 'enviando' }
  | { tipo: 'analisando'; segundos: number; amostras: number }
  | { tipo: 'pronta'; titulo: string; resumo: string; achados: string[]; caso: string }
  | { tipo: 'falha'; mensagem: string };

export interface CasoPercurso {
  rawCsv: string;
  sourceName: string;
  name: string;
  metadata: Record<string, unknown>;
  map: Record<string, unknown>;
}

interface Evidencia { elapsedMs: number; description: string }
interface Hipotese { title: string; evidence: Evidencia[] }
interface Eixo { id: string; title: string; status: string; summary: string; hypotheses: Hipotese[] }
export interface AnaliseLab { id: string; status: string; createdAt: string; error?: string; axes: Eixo[]; hypotheses: Hipotese[] }
interface CasoLab { id: string; name: string; sampleCount: number; analyses: AnaliseLab[] }

/** Orientação dos agentes: descreve a montagem do registro para não lerem o reposicionamento entre trechos como evento. */
export const FOCO_ANALISE = 'Percurso guiado do simulador do totem em três trechos: fardo à frente, encosta lateral e área alagada. '
  + 'Entre um trecho e outro a máquina é reposicionada pelo simulador (lacuna de 1 s e salto de posição): não é movimento real. '
  + 'Relacione cada reação do operador (velocidade, freio) aos avisos registrados naquele trecho.';

/** Prazo do cliente: a cadeia do servidor tem teto de 90 s + 90 s; 4 min cobre isso com folga. */
export const PRAZO_ANALISE_MS = 240_000;
const INTERVALO_MS = 3000;

async function pedir<T>(caminho: string, corpo?: unknown): Promise<{ status: number; dados: T & { message?: string } }> {
  const resposta = await fetch(`/api/lab/cases${caminho}`, {
    method: corpo === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: corpo === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const dados = await resposta.json().catch(() => ({}));
  return { status: resposta.status, dados };
}

const mensagemDoServidor = (status: number, dados: { message?: string }) =>
  dados.message || (status === 401 ? 'O totem precisa estar com a conta entrada para usar o Laboratório.' : `O Laboratório respondeu ${status}.`);

/** Texto curto da análise: resumo da revisão (ou do primeiro eixo concluído) e até 4 hipóteses com o instante da evidência. */
export function textoDaAnalise(analise: AnaliseLab, nomeCaso: string): Extract<EstadoAnalise, { tipo: 'pronta' }> {
  const concluidos = analise.axes.filter((eixo) => eixo.status === 'completed');
  const revisao = concluidos.find((eixo) => eixo.id === 'review') ?? concluidos[0];
  const achados = analise.hypotheses.slice(0, 4).map((h) => {
    const ev = h.evidence[0];
    return ev ? `${h.title} — em ${formatLabTime(ev.elapsedMs)}: ${ev.description}` : h.title;
  });
  const completa = analise.status === 'completed';
  return {
    tipo: 'pronta',
    titulo: completa ? 'Análise dos agentes:' : `Análise parcial (${concluidos.length}/${analise.axes.length} eixos):`,
    resumo: revisao?.summary || analise.error || 'Os agentes não devolveram resumo.',
    achados: achados.length ? achados : ['Nenhuma hipótese com evidência suficiente neste registro.'],
    caso: nomeCaso,
  };
}

/** Dispara a análise; devolve a função que para de acompanhar (a análise no servidor segue). */
export function analisarPercurso(caso: CasoPercurso, aoMudar: (estado: EstadoAnalise) => void): () => void {
  let ativo = true;
  let relogio = 0;
  const avisar = (estado: EstadoAnalise) => { if (ativo) aoMudar(estado); };

  void (async () => {
    avisar({ tipo: 'enviando' });
    try {
      const salvo = await pedir<{ case: CasoLab }>('', caso);
      if (salvo.status >= 400 || !salvo.dados.case) { avisar({ tipo: 'falha', mensagem: mensagemDoServidor(salvo.status, salvo.dados) }); return; }
      const registro = salvo.dados.case;
      const antes = new Set(registro.analyses.map((a) => a.id));
      const inicio = Date.now();
      avisar({ tipo: 'analisando', segundos: 0, amostras: registro.sampleCount });

      let respostaFalhou: string | null = null;
      // A resposta longa pode ser cortada no caminho: só vale como falha se vier rápida e sem análise gravada.
      // Só 4xx do próprio Laboratório (sessão, limite) é falha; 5xx/524 da borda é corte da resposta longa e o GET continua.
      void pedir<{ analysis?: AnaliseLab }>(`/${encodeURIComponent(registro.id)}/analyses`, { focus: FOCO_ANALISE })
        .then(({ status, dados }) => { if (status >= 400 && status < 500 && status !== 409 && !dados.analysis) respostaFalhou = mensagemDoServidor(status, dados); })
        .catch(() => undefined);

      const acompanhar = async () => {
        if (!ativo) return;
        const segundos = Math.round((Date.now() - inicio) / 1000);
        if (respostaFalhou) { avisar({ tipo: 'falha', mensagem: respostaFalhou }); return; }
        try {
          const { status, dados } = await pedir<{ case: CasoLab }>(`/${encodeURIComponent(registro.id)}`);
          if (status >= 400 || !dados.case) throw new Error(mensagemDoServidor(status, dados));
          const nova = dados.case.analyses.find((a) => !antes.has(a.id));
          if (nova && nova.status !== 'running') { avisar(textoDaAnalise(nova, dados.case.name)); return; }
        } catch (erro) {
          if (Date.now() - inicio > PRAZO_ANALISE_MS) { avisar({ tipo: 'falha', mensagem: `Sem contato com o Laboratório: ${(erro as Error).message}` }); return; }
        }
        if (Date.now() - inicio > PRAZO_ANALISE_MS) {
          avisar({ tipo: 'falha', mensagem: 'Os agentes não terminaram em 4 minutos. O caso ficou salvo no Laboratório; a análise pode aparecer lá depois.' });
          return;
        }
        avisar({ tipo: 'analisando', segundos, amostras: registro.sampleCount });
        relogio = window.setTimeout(acompanhar, INTERVALO_MS);
      };
      relogio = window.setTimeout(acompanhar, INTERVALO_MS);
    } catch (erro) {
      avisar({ tipo: 'falha', mensagem: `Sem contato com o Laboratório: ${(erro as Error).message}` });
    }
  })();

  return () => { ativo = false; window.clearTimeout(relogio); };
}
