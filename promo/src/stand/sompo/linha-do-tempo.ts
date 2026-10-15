// Linha do tempo dos vídeos M6, função pura (testável com node --test):
// blocos do roteiro + duração real de cada narração + planos da captura
// → planos no vídeo final, trechos de legenda (tela e .srt) e duração total.

import type { Trecho, Verdade } from '../estilo.ts';

/** Trecho da captura usado num bloco: `inicio` em segundos da captura (null = cartão da marca), `dur` em segundos de vídeo. */
export type PlanoCaptura = { inicio: number | null; dur?: number };

export type BlocoMontagem = {
  id: string;
  texto: string;
  narracao: string | null; // arquivo wav no public dir
  duracaoNarracao: number;
  verdade: Verdade;
  detalhe: string;
  fonte?: string;
  /** Planos da captura; vazio = cartão de fechamento (sem tela de produto). */
  planos: PlanoCaptura[];
};

export type PlanoFinal = { bloco: string; de: number; dur: number; inicioCaptura: number | null };

export type LinhaDoTempo = {
  total: number;
  blocos: Array<BlocoMontagem & { de: number; dur: number }>;
  planos: PlanoFinal[];
  trechos: Trecho[];
};

export const RESPIRO = { antes: 0.35, depois: 0.55, fim: 1.2 } as const;
const MAX_CARACTERES = 74;

/**
 * Quebra a narração no menor número de legendas de até MAX_CARACTERES,
 * equilibradas (sem palavra órfã no fim), cortando em pontuação perto do
 * meio quando der, senão no espaço mais próximo do meio.
 */
export function quebrarLegenda(texto: string): string[] {
  const partes: string[] = [];
  let resto = texto.trim();
  while (resto.length > MAX_CARACTERES) {
    const alvo = resto.length / Math.ceil(resto.length / MAX_CARACTERES);
    const janela = resto.slice(0, MAX_CARACTERES + 1);
    const espacos = [...janela.matchAll(/ /g)].map((x) => x.index ?? 0).filter((i) => i > 0);
    const pontuados = espacos.filter((i) => /[.,:?;]/.test(janela[i - 1]) && Math.abs(i - alvo) <= alvo * 0.35);
    const candidatos = pontuados.length ? pontuados : espacos;
    const corte = candidatos.reduce((a, b) => (Math.abs(b - alvo) < Math.abs(a - alvo) ? b : a), candidatos[0] ?? MAX_CARACTERES);
    partes.push(resto.slice(0, corte).trim());
    resto = resto.slice(corte).trim();
  }
  if (resto) partes.push(resto);
  return partes;
}

export function montarLinhaDoTempo(blocos: BlocoMontagem[]): LinhaDoTempo {
  let t = 0;
  const saida: LinhaDoTempo = { total: 0, blocos: [], planos: [], trechos: [] };
  blocos.forEach((bloco, i) => {
    const ultimo = i === blocos.length - 1;
    const dur = RESPIRO.antes + bloco.duracaoNarracao + (ultimo ? RESPIRO.fim : RESPIRO.depois);
    saida.blocos.push({ ...bloco, de: t, dur });

    // Planos: os com `dur` fixo primeiro; o último ocupa o que sobrar do bloco.
    let p = t;
    if (!bloco.planos.length) saida.planos.push({ bloco: bloco.id, de: t, dur, inicioCaptura: null });
    bloco.planos.forEach((plano, j) => {
      const restante = t + dur - p;
      const d = j === bloco.planos.length - 1 ? restante : Math.min(plano.dur ?? restante, restante);
      if (d > 0) saida.planos.push({ bloco: bloco.id, de: p, dur: d, inicioCaptura: plano.inicio });
      p += d;
    });

    // Legenda proporcional ao número de caracteres de cada pedaço.
    const pedacos = quebrarLegenda(bloco.texto);
    const totalChars = pedacos.reduce((n, x) => n + x.length, 0);
    let l = t + RESPIRO.antes;
    for (const pedaco of pedacos) {
      const d = (bloco.duracaoNarracao * pedaco.length) / totalChars;
      saida.trechos.push({ inicio: round(l), fim: round(l + d), texto: pedaco });
      l += d;
    }
    t += dur;
  });
  saida.total = t;
  return saida;
}

const round = (x: number) => Math.round(x * 1000) / 1000;
