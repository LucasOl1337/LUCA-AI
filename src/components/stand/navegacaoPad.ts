import { applyDeadZone, type GamepadLike, type PadState } from '../sompo/gamepadMapping';
import type { Modo } from './modoStand';

/**
 * DualSense → navegação do Modo do stand (grill r1, Q5). Puro, por borda.
 * Layout standard: 0 ✕, 1 ○, 2 □, 3 △, 14 D-pad ←, 15 D-pad →, 16 PS.
 * L1/R1 não trocam mais de modo (Lucas, 21/10: quem joga apertava sem querer);
 * a troca é pela barra (toque/mouse), pelo D-pad (foco, `focoPad.ts`) e pela voz.
 * Ida e volta em tudo (Lucas, 24/10): ✕ escolhe o item focado, ○ volta um nível,
 * △ abre o menu e □ a tela cheia. Na Simulação, △ □ ficam livres e ✕ ○ só valem
 * com a pausa ou o resultado na tela (a página decide); R2/L2/L1/Options são do jogo.
 */

export type AcaoNavegacao =
  | { tipo: 'ir'; modo: Modo }
  | { tipo: 'trocar_video'; direcao: 1 | -1 }
  | { tipo: 'pausar' }
  | { tipo: 'conversar' }
  /** ✕ onde ele não tem sentido próprio: aperta o item focado pelo D-pad. */
  | { tipo: 'escolher' }
  | { tipo: 'voltar' }
  | { tipo: 'menu' }
  | { tipo: 'tela_cheia' };

export const BOTOES_NAVEGACAO = { cruz: 0, bola: 1, quadrado: 2, triangulo: 3, esquerda: 14, direita: 15, ps: 16 } as const;

export interface LeituraNavegacao {
  acoes: AcaoNavegacao[];
  /** Alguém mexeu no controle neste quadro (qualquer botão, gatilho ou analógico). */
  ativo: boolean;
  next: PadState;
}

const VAZIA: LeituraNavegacao = { acoes: [], ativo: false, next: { pressed: [] } };

function acaoDoBotao(indice: number, modo: Modo): AcaoNavegacao | null {
  const b = BOTOES_NAVEGACAO;
  if (indice === b.ps) return { tipo: 'ir', modo: 'coruja' };
  if (indice === b.bola) return { tipo: 'voltar' };
  if (modo !== 'simulacao' && indice === b.triangulo) return { tipo: 'menu' };
  if (modo !== 'simulacao' && indice === b.quadrado) return { tipo: 'tela_cheia' };
  if (modo === 'vitrine') {
    if (indice === b.esquerda) return { tipo: 'trocar_video', direcao: -1 };
    if (indice === b.direita) return { tipo: 'trocar_video', direcao: 1 };
    if (indice === b.cruz) return { tipo: 'pausar' };
  }
  if (modo === 'coruja' && indice === b.cruz) return { tipo: 'conversar' };
  if (indice === b.cruz) return { tipo: 'escolher' };
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
