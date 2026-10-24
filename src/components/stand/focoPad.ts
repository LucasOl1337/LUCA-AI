import { applyDeadZone, type GamepadLike } from '../sompo/gamepadMapping';

/**
 * Navegação de ida e volta pelo DualSense em todo o Totem (Lucas, 24/10: "navegação
 * completa de ida e volta com o controle do PS5 em tudo, com ícone do atalho").
 * Puro: leitura das setas com repetição ao segurar e a escolha espacial do próximo
 * item na direção apertada. O DOM fica em `focoPadDom.ts`.
 *
 * Layout standard: 12 ↑, 13 ↓, 14 ←, 15 → (D-pad) e o analógico esquerdo.
 */

export type Direcao = 'cima' | 'baixo' | 'esquerda' | 'direita';

export const BOTOES_DPAD: Readonly<Record<Direcao, number>> = Object.freeze({ cima: 12, baixo: 13, esquerda: 14, direita: 15 });

/** Segurar a seta: primeiro passo na hora, repete depois de `REPETE_APOS_MS` a cada `REPETE_CADA_MS`. */
export const REPETE_APOS_MS = 420;
export const REPETE_CADA_MS = 160;
/** Analógico vale como seta só bem inclinado (não disputa com o olhar da cabine). */
export const LIMIAR_ANALOGICO = 0.6;

/** De onde veio a seta: na Simulação o analógico é o volante, só o D-pad anda o foco do HUD. */
export type OrigemSeta = 'dpad' | 'analogico';
export interface EstadoSetas { direcao: Direcao | null; origem: OrigemSeta; desde: number; ultimo: number }
export const SETAS_SOLTAS: EstadoSetas = { direcao: null, origem: 'dpad', desde: 0, ultimo: 0 };

function direcaoSegurada(pad: GamepadLike): { direcao: Direcao; origem: OrigemSeta } | null {
  for (const [direcao, indice] of Object.entries(BOTOES_DPAD) as [Direcao, number][]) {
    if (pad.buttons[indice]?.pressed) return { direcao, origem: 'dpad' };
  }
  const x = applyDeadZone(pad.axes[0] ?? 0);
  const y = applyDeadZone(pad.axes[1] ?? 0);
  if (Math.max(Math.abs(x), Math.abs(y)) < LIMIAR_ANALOGICO) return null;
  const direcao: Direcao = Math.abs(x) > Math.abs(y) ? (x > 0 ? 'direita' : 'esquerda') : (y > 0 ? 'baixo' : 'cima');
  return { direcao, origem: 'analogico' };
}

/** Um passo por toque e repetição ao segurar; trocar de direção conta como toque novo. */
export function lerSetas(pad: GamepadLike | null | undefined, prev: EstadoSetas, agora: number): { passo: Direcao | null; origem: OrigemSeta; next: EstadoSetas } {
  const segurada = pad && pad.mapping === 'standard' ? direcaoSegurada(pad) : null;
  if (!segurada) return { passo: null, origem: 'dpad', next: SETAS_SOLTAS };
  const { direcao, origem } = segurada;
  if (direcao !== prev.direcao || origem !== prev.origem) return { passo: direcao, origem, next: { direcao, origem, desde: agora, ultimo: agora } };
  if (agora - prev.desde >= REPETE_APOS_MS && agora - prev.ultimo >= REPETE_CADA_MS) {
    return { passo: direcao, origem, next: { ...prev, ultimo: agora } };
  }
  return { passo: null, origem, next: prev };
}

export interface Caixa { x: number; y: number; w: number; h: number }

const centro = (c: Caixa) => ({ x: c.x + c.w / 2, y: c.y + c.h / 2 });

/**
 * Próximo item na direção: só candidatos à frente da borda do atual; vence o de
 * menor distância no eixo da direção, com o desvio lateral pesando 3×, e quem se
 * sobrepõe na faixa lateral ganha preferência (fila e grade andam como se espera).
 * Sem nada à frente, fica onde está (null).
 */
export function proximoNaDirecao(caixas: readonly Caixa[], atual: number, direcao: Direcao): number | null {
  const de = caixas[atual];
  if (!de) return null;
  const c = centro(de);
  const horizontal = direcao === 'esquerda' || direcao === 'direita';
  let melhor = -1;
  let menorCusto = Infinity;
  caixas.forEach((caixa, indice) => {
    if (indice === atual) return;
    const p = centro(caixa);
    const frente = direcao === 'direita' ? caixa.x - (de.x + de.w) : direcao === 'esquerda' ? de.x - (caixa.x + caixa.w)
      : direcao === 'baixo' ? caixa.y - (de.y + de.h) : de.y - (caixa.y + caixa.h);
    // Tolera um pouco de sobreposição (botões colados), mas o centro tem de estar à frente.
    const avanco = direcao === 'direita' ? p.x - c.x : direcao === 'esquerda' ? c.x - p.x : direcao === 'baixo' ? p.y - c.y : c.y - p.y;
    if (avanco <= 1 || frente < -Math.min(de.w, de.h, caixa.w, caixa.h) / 2) return;
    const lateral = horizontal ? Math.abs(p.y - c.y) : Math.abs(p.x - c.x);
    const sobrepoe = horizontal
      ? caixa.y < de.y + de.h && caixa.y + caixa.h > de.y
      : caixa.x < de.x + de.w && caixa.x + caixa.w > de.x;
    const custo = Math.max(0, frente) + lateral * 3 + (sobrepoe ? 0 : 10_000);
    if (custo < menorCusto) { melhor = indice; menorCusto = custo; }
  });
  return melhor < 0 ? null : melhor;
}

/** Primeiro foco quando ninguém está focado: o mais de cima, e à esquerda no empate da linha. */
export function primeiroItem(caixas: readonly Caixa[]): number | null {
  if (caixas.length === 0) return null;
  let melhor = 0;
  for (let indice = 1; indice < caixas.length; indice += 1) {
    const caixa = caixas[indice];
    const m = caixas[melhor];
    const mesmaLinha = Math.abs(caixa.y - m.y) < Math.min(caixa.h, m.h) / 2;
    if (mesmaLinha ? caixa.x < m.x : caixa.y < m.y) melhor = indice;
  }
  return melhor;
}
