// Planos do pipeline-completo em tempo de VÍDEO (segundos de cena.mp4).
// O webm do Playwright atrasa em relação ao relógio da captura (até ~7 s, não
// linear), então os cortes vêm de âncoras conferidas quadro a quadro
// (calibracao.json no diretório da captura) e o rastro do cursor é convertido
// para o mesmo relógio, senão o zoom erra o clique.

import type { Rastro } from '../estilo.ts';
import type { LinhaDoTempo, PlanoCaptura } from '../sompo/linha-do-tempo.ts';

/** [relógio da captura, tempo no vídeo] em ordem crescente. */
export type Ancora = [number, number];

/** Converte relógio da captura → tempo no vídeo, linear entre âncoras. */
export function paraVideo(t: number, ancoras: Ancora[]): number {
  if (ancoras.length < 2) throw new Error('calibração precisa de 2 âncoras ou mais');
  let i = 1;
  while (i < ancoras.length - 1 && t > ancoras[i][0]) i++;
  const [a, b] = [ancoras[i - 1], ancoras[i]];
  return Math.max(0, a[1] + ((t - a[0]) * (b[1] - a[1])) / (b[0] - a[0]));
}

export function rastroEmVideo(r: Rastro, ancoras: Ancora[]): Rastro {
  const conv = <P extends { t: number }>(p: P) => ({ ...p, t: paraVideo(p.t, ancoras) });
  return {
    viewport: r.viewport,
    cliques: r.cliques.map(conv),
    cursor: r.cursor.map(conv),
    marcas: Object.fromEntries(Object.entries(r.marcas).map(([k, v]) => [k, paraVideo(v, ancoras)])),
  };
}

/** Momentos do vídeo usados nos cortes (todos em tempo de vídeo, ver calibracao.json). */
export const CORTES = [
  'campo', 'simulador', 'aproximacao', 'cliqueGravar', 'gravando', 'painel', 'etapas', 'artefatos', 'entrega', 'safra', 'frames',
] as const;
export type Cortes = Record<(typeof CORTES)[number], number>;

export type Recorte = { x: number; y: number; largura: number; altura: number };
/** Recortes fixos do viewport 1920×1080 da captura (16:9). */
export const ENQUADRA = {
  campo: { x: 356, y: 345, largura: 1044, altura: 587 }, // só o 3D, abaixo dos mostradores
  palco: { x: 340, y: 236, largura: 1044, altura: 587 }, // simulador 3D com os mostradores de distância e alerta
  gravacao: { x: 940, y: 300, largura: 960, altura: 540 }, // frente do trator + status da gravação
  entrega: { x: 450, y: 90, largura: 960, altura: 540 }, // coluna do veredito (a linha "Veredito" fica no quadro antes e depois da rolagem)
  safra: { x: 853, y: 440, largura: 1067, altura: 600 }, // cartão do último episódio com as imagens
} satisfies Record<string, Recorte>;

export type PlanoPipeline = PlanoCaptura & { enquadra?: Recorte };

export function planosDoPipeline(c: Cortes): Record<string, PlanoPipeline[]> {
  for (const nome of CORTES) if (typeof c[nome] !== 'number') throw new Error(`corte ${nome} ausente em calibracao.json`);
  return {
    b1: [{ inicio: c.campo, enquadra: ENQUADRA.campo }],
    b2: [{ inicio: null }],
    b3: [{ inicio: c.simulador, dur: 3.5 }, { inicio: c.aproximacao, enquadra: ENQUADRA.palco }],
    b4: [{ inicio: c.cliqueGravar - 1.2, dur: 3 }, { inicio: c.gravando, enquadra: ENQUADRA.gravacao }],
    b5: [{ inicio: c.painel, dur: 5.5 }, { inicio: c.etapas }],
    b6: [{ inicio: c.artefatos, dur: 6.5 }, { inicio: c.entrega, enquadra: ENQUADRA.entrega }],
    b7: [{ inicio: c.safra, dur: 3.5 }, { inicio: c.frames, enquadra: ENQUADRA.safra }],
    b8: [{ inicio: null }],
  };
}

/**
 * Silêncio extra no fim de blocos (tempo para ler o veredito, por exemplo):
 * estica o último plano do bloco e empurra o resto. Legendas do bloco não mudam.
 */
export function comPausas(linha: LinhaDoTempo, pausas: Record<string, number>): LinhaDoTempo {
  // Quanto empurrar algo que começa em t: soma das pausas dos blocos já terminados.
  const deslocaAte = (t: number) => linha.blocos.reduce((n, b) => n + (t >= b.de + b.dur - 1e-9 ? pausas[b.id] ?? 0 : 0), 0);
  const blocos = linha.blocos.map((b) => ({ ...b, de: b.de + deslocaAte(b.de), dur: b.dur + (pausas[b.id] ?? 0) }));
  const planos = linha.planos.map((p, i) => {
    const ultimoDoBloco = linha.planos[i + 1]?.bloco !== p.bloco;
    return { ...p, de: p.de + deslocaAte(p.de), dur: p.dur + (ultimoDoBloco ? pausas[p.bloco] ?? 0 : 0) };
  });
  const trechos = linha.trechos.map((x) => ({ ...x, inicio: x.inicio + deslocaAte(x.inicio), fim: x.fim + deslocaAte(x.inicio) }));
  const extra = Object.values(pausas).reduce((n, x) => n + x, 0);
  return { total: linha.total + extra, blocos, planos, trechos };
}
