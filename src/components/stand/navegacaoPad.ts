import { applyDeadZone, type GamepadLike, type PadState } from '../sompo/gamepadMapping';
import type { Modo } from './modoStand';

/**
 * DualSense → navegação do Modo do stand (grill r1, Q5). Puro, por borda.
 * Layout standard: 0 ✕, 4 L1, 5 R1, 14 D-pad ←, 15 D-pad →, 16 PS.
 * Na Simulação, ✕ □ △ ○ Options e L2/R2 continuam do simulador.
 */

export type AcaoNavegacao =
  | { tipo: 'passo'; direcao: 1 | -1 }
  | { tipo: 'ir'; modo: Modo }
  | { tipo: 'trocar_video'; direcao: 1 | -1 }
  | { tipo: 'pausar' }
  | { tipo: 'conversar' };

export const BOTOES_NAVEGACAO = { cruz: 0, l1: 4, r1: 5, esquerda: 14, direita: 15, ps: 16 } as const;

export interface LeituraNavegacao {
  acoes: AcaoNavegacao[];
  /** Alguém mexeu no controle neste quadro (qualquer botão, gatilho ou analógico). */
  ativo: boolean;
  next: PadState;
}

const VAZIA: LeituraNavegacao = { acoes: [], ativo: false, next: { pressed: [] } };

function acaoDoBotao(indice: number, modo: Modo): AcaoNavegacao | null {
  const b = BOTOES_NAVEGACAO;
  if (indice === b.l1) return { tipo: 'passo', direcao: -1 };
  if (indice === b.r1) return { tipo: 'passo', direcao: 1 };
  if (indice === b.ps) return { tipo: 'ir', modo: 'coruja' };
  if (modo === 'vitrine') {
    if (indice === b.esquerda) return { tipo: 'trocar_video', direcao: -1 };
    if (indice === b.direita) return { tipo: 'trocar_video', direcao: 1 };
    if (indice === b.cruz) return { tipo: 'pausar' };
  }
  if (modo === 'coruja' && indice === b.cruz) return { tipo: 'conversar' };
  return null;
}

export function lerNavegacao(pad: GamepadLike | null | undefined, prev: PadState, modo: Modo): LeituraNavegacao {
  if (!pad || pad.mapping !== 'standard') return VAZIA;
  const pressed: number[] = [];
  const acoes: AcaoNavegacao[] = [];
  let ativo = false;
  pad.buttons.forEach((botao, indice) => {
    if (!botao?.pressed) {
      if ((botao?.value ?? 0) > 0.04) ativo = true;
      return;
    }
    ativo = true;
    pressed.push(indice);
    if (prev.pressed.includes(indice)) return;
    const acao = acaoDoBotao(indice, modo);
    if (acao) acoes.push(acao);
  });
  if (pad.axes.some((valor) => applyDeadZone(valor) !== 0)) ativo = true;
  return { acoes, ativo, next: { pressed } };
}
