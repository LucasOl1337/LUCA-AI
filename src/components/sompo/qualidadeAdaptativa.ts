/**
 * Qualidade automática do render no totem (kiosk). Pura: recebe o FPS medido a
 * cada segundo e devolve em que degrau ficar. Desce quando falta quadro, mas só
 * mantém a descida se ela rendeu FPS: num aparelho limitado por CPU, tirar pixel
 * e sombra não ajuda e só piora a imagem, então a descida sem ganho é desfeita e
 * o regulador trava ali. Sobe devagar e não volta a um degrau que falhou há pouco.
 */

export interface DegrauQualidade {
  /** Teto do pixel ratio; o efetivo é o menor entre ele e o devicePixelRatio. */
  pixelRatio: number;
  /** Cadeia de pós (oclusão, bloom, grade). Sem ela o quadro sai num render só. */
  pos: boolean;
  sombras: boolean;
}

export const DEGRAUS: readonly DegrauQualidade[] = Object.freeze([
  { pixelRatio: 2, pos: true, sombras: true },
  { pixelRatio: 1, pos: true, sombras: true },
  { pixelRatio: 1, pos: false, sombras: true },
  { pixelRatio: 0.75, pos: false, sombras: true },
  { pixelRatio: 0.6, pos: false, sombras: false },
]);

/** Abaixo disso por `SEGUNDOS_PARA_DESCER` seguidos, desce um degrau. */
export const FPS_MINIMO = 40;
/** A partir disso por `SEGUNDOS_PARA_SUBIR` seguidos, tenta subir um degrau. */
export const FPS_FOLGADO = 57;
export const SEGUNDOS_PARA_DESCER = 3;
export const SEGUNDOS_PARA_SUBIR = 10;
/** Segundos medidos no degrau novo antes de julgar se a descida valeu (o 1º, da recompilação, não conta). */
export const SEGUNDOS_DE_PROVA = 3;
/** A descida precisa render pelo menos isto (15 %) para ficar. */
export const GANHO_MINIMO = 1.15;
/** Degrau que falhou fica vetado por este tempo. */
export const VETO_MS = 60_000;

export interface EstadoQualidade {
  degrau: number;
  lentos: number;
  folgados: number;
  /** Até quando cada degrau acima do atual fica vetado (índice → instante). */
  vetos: Readonly<Record<number, number>>;
  /** FPS médio da janela lenta que causou a descida em prova; somas do degrau novo. */
  prova: { antes: number; soma: number; n: number } | null;
  /** Descida sem ganho: o gargalo não é o render, não desce mais. */
  travado: boolean;
  /** Soma dos FPS da janela lenta corrente (para a média de `prova.antes`). */
  somaLentos: number;
}

export function qualidadeInicial(degrau = 0): EstadoQualidade {
  return { degrau: Math.max(0, Math.min(DEGRAUS.length - 1, degrau)), lentos: 0, folgados: 0, vetos: {}, prova: null, travado: false, somaLentos: 0 };
}

/** Uma leitura de FPS (um segundo de quadros) → próximo estado. */
export function regularQualidade(estado: EstadoQualidade, fps: number, agora: number): EstadoQualidade {
  if (!Number.isFinite(fps)) return estado;
  if (estado.prova) {
    // Primeiro segundo do degrau novo paga a recompilação dos shaders: descarta.
    if (estado.prova.n < 0) return { ...estado, prova: { ...estado.prova, n: 0 } };
    const prova = { ...estado.prova, soma: estado.prova.soma + fps, n: estado.prova.n + 1 };
    if (prova.n < SEGUNDOS_DE_PROVA) return { ...estado, prova };
    if (prova.soma / prova.n >= prova.antes * GANHO_MINIMO) return { ...estado, prova: null, lentos: 0, folgados: 0, somaLentos: 0 };
    // Não rendeu: volta ao degrau de cima e para de descer.
    return { ...estado, degrau: estado.degrau - 1, prova: null, travado: true, lentos: 0, folgados: 0, somaLentos: 0 };
  }
  if (fps < FPS_MINIMO) {
    const lentos = estado.lentos + 1;
    const somaLentos = estado.somaLentos + fps;
    if (estado.travado || lentos < SEGUNDOS_PARA_DESCER || estado.degrau >= DEGRAUS.length - 1) return { ...estado, lentos, somaLentos, folgados: 0 };
    return {
      ...estado, degrau: estado.degrau + 1, lentos: 0, folgados: 0, somaLentos: 0,
      vetos: { ...estado.vetos, [estado.degrau]: agora + VETO_MS },
      prova: { antes: somaLentos / lentos, soma: 0, n: -1 },
    };
  }
  if (fps >= FPS_FOLGADO) {
    const folgados = estado.folgados + 1;
    const acima = estado.degrau - 1;
    if (folgados < SEGUNDOS_PARA_SUBIR || acima < 0 || (estado.vetos[acima] ?? 0) > agora) return { ...estado, lentos: 0, somaLentos: 0, folgados };
    return { ...estado, degrau: acima, lentos: 0, somaLentos: 0, folgados: 0 };
  }
  return { ...estado, lentos: 0, somaLentos: 0, folgados: 0 };
}

/** Pixel ratio efetivo do degrau neste aparelho. */
export function pixelRatioDoDegrau(degrau: DegrauQualidade, devicePixelRatio: number) {
  return Math.min(degrau.pixelRatio, Math.max(0.5, devicePixelRatio || 1));
}
