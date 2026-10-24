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

/** Leitura anterior: botões apertados e, pra ver mudança, analógicos e gatilhos. */
export interface EstadoNavegacao extends PadState { eixos?: readonly number[]; valores?: readonly number[] }

export interface LeituraNavegacao {
  acoes: AcaoNavegacao[];
  /** Alguém mexeu no controle neste quadro: apertou/soltou botão, moveu gatilho ou analógico. */
  ativo: boolean;
  next: EstadoNavegacao;
}

const VAZIA: LeituraNavegacao = { acoes: [], ativo: false, next: { pressed: [] } };
/**
 * Atividade é mudança, não posição (24/10): analógico com drift ou gatilho meio apertado,
 * parados, liam como gente mexendo a cada segundo e o palco nunca ficava no totem.
 */
const MUDANCA = 0.15;

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

export function lerNavegacao(pad: GamepadLike | null | undefined, prev: EstadoNavegacao, modo: Modo): LeituraNavegacao {
  if (!pad || pad.mapping !== 'standard') return VAZIA;
  const pressed: number[] = [];
  const acoes: AcaoNavegacao[] = [];
  const valores = pad.buttons.map((botao) => botao?.value ?? 0);
  const eixos = pad.axes.map((valor) => applyDeadZone(valor));
  pad.buttons.forEach((botao, indice) => {
    if (!botao?.pressed) return;
    pressed.push(indice);
    if (prev.pressed.includes(indice)) return;
    const acao = acaoDoBotao(indice, modo);
    if (acao) acoes.push(acao);
  });
  const mudou = (agora: readonly number[], antes: readonly number[] | undefined) => agora.some((v, i) => Math.abs(v - (antes?.[i] ?? 0)) > MUDANCA);
  const ativo = pressed.length !== prev.pressed.length || pressed.some((i) => !prev.pressed.includes(i))
    || mudou(eixos, prev.eixos) || mudou(valores, prev.valores);
  return { acoes, ativo, next: { pressed, eixos, valores } };
}
