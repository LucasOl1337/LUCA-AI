/**
 * Controle como volante (grill r1, Direcao Q8 e Q9). Puro: entra o retrato do
 * pad (Gamepad API, mapping standard) e as setas; sai o comando que a física usa.
 * Esterço: zona morta 0,12, curva sinal·|x|^1,35 (Lupa 24/10: 1,8 dava raio de 25 m
 * com meio curso) e volante com taxa limitada
 * (2,5/s: do centro ao batente em 0,4 s). R2/L2: curva x^1,5.
 */
import { applyDeadZone, type GamepadLike } from '../sompo/gamepadMapping';
import { COMANDOS_CABINE, setaDoComando } from './comandosCabine';

export const VOLANTE = Object.freeze({
  zonaMorta: 0.12,
  expoenteEsterco: 1.35,
  expoenteGatilho: 1.5,
  /** Unidades de esterço (-1..1) por segundo. */
  taxaEsterco: 2.5,
  /** Gatilho abaixo disso é ruído do DualSense em repouso. */
  corteGatilho: 0.04,
});

/**
 * Razão aro/esterço: esterço ±1 (batente das rodas, 0,48 rad) = aro ±1 volta.
 * Trator de direção hidrostática passa de 2 voltas batente a batente; aqui fica
 * em 2 para o giro ler bem no totem sem o aro parecer solto.
 */
export const ARO_RAD_POR_ESTERCO = 2 * Math.PI;

/**
 * Ângulo do nó `rig-volante` (Visual) para o esterço atual, em rad no eixo da
 * coluna. Positivo = horário visto do banco (esterço à direita). Use o
 * `comandos.esterco` do retrato, que já passou pela taxa do volante.
 */
export function anguloAroRad(esterco: number) {
  const valor = Math.max(-1, Math.min(1, Number.isFinite(esterco) ? esterco : 0)) * ARO_RAD_POR_ESTERCO;
  return valor === 0 ? 0 : valor;
}

/** Índices do layout standard que o gameplay lê. PS (16) é do /stand; L1 (4) e R1 (5) não trocam mais de modo (21/10). */
export const BOTAO_REINICIAR = COMANDOS_CABINE.pausa.botao;
const R2 = COMANDOS_CABINE.acelerar.botao, L2 = COMANDOS_CABINE.frear.botao;

export interface ComandoVolante { esterco: number; acelerador: number; freio: number }
export const COMANDO_PARADO: ComandoVolante = Object.freeze({ esterco: 0, acelerador: 0, freio: 0 });

/** Setas seguradas agora. */
export interface SetasVolante { cima: boolean; baixo: boolean; esquerda: boolean; direita: boolean }
export const SETAS_SOLTAS: SetasVolante = Object.freeze({ cima: false, baixo: false, esquerda: false, direita: false });

const limitar = (valor: number, min: number, max: number) => Math.max(min, Math.min(max, valor));
/** Sem -0, que vaza para comparação e JSON. */
const semZeroNegativo = (valor: number) => (valor === 0 ? 0 : valor);

/** Analógico esquerdo X cru (-1..1) → esterço desejado, com zona morta e curva. */
export function curvaEsterco(eixo: number) {
  const fora = applyDeadZone(eixo, VOLANTE.zonaMorta);
  return semZeroNegativo(Math.sign(fora) * Math.abs(fora) ** VOLANTE.expoenteEsterco);
}

/** Gatilho cru (0..1) → pedal, com corte de ruído e curva. */
export function curvaGatilho(valor: number) {
  if (!Number.isFinite(valor) || valor <= VOLANTE.corteGatilho) return 0;
  return Math.min(1, valor) ** VOLANTE.expoenteGatilho;
}

const gatilho = (pad: GamepadLike, indice: number) => {
  const botao = pad.buttons[indice];
  if (!botao) return 0;
  return curvaGatilho(Number.isFinite(botao.value) ? botao.value : botao.pressed ? 1 : 0);
};

/**
 * Comando desejado neste quadro: pad e setas somados pelo maior módulo, para
 * quem pega o teclado no meio do pad não brigar com ele.
 */
export function comandoDesejado(pad: GamepadLike | null | undefined, setas: SetasVolante = SETAS_SOLTAS): ComandoVolante {
  const doPad = pad && pad.mapping === 'standard'
    ? { esterco: curvaEsterco(pad.axes[COMANDOS_CABINE.esquerda.eixo] ?? 0), acelerador: gatilho(pad, R2), freio: gatilho(pad, L2) }
    : COMANDO_PARADO;
  const estercoSetas = (setas.direita ? 1 : 0) - (setas.esquerda ? 1 : 0);
  return {
    esterco: Math.abs(estercoSetas) > Math.abs(doPad.esterco) ? estercoSetas : doPad.esterco,
    acelerador: Math.max(doPad.acelerador, setas.cima ? 1 : 0),
    freio: Math.max(doPad.freio, setas.baixo ? 1 : 0),
  };
}

/** O volante anda até o esterço desejado a no máximo `taxaEsterco` por segundo; pedais seguem direto. */
export function passoVolante(atual: ComandoVolante, desejado: ComandoVolante, dt: number): ComandoVolante {
  const segundos = limitar(Number.isFinite(dt) ? dt : 0, 0, 0.1);
  const passo = VOLANTE.taxaEsterco * segundos;
  const esterco = limitar(desejado.esterco, atual.esterco - passo, atual.esterco + passo);
  return { esterco: semZeroNegativo(limitar(esterco, -1, 1)), acelerador: limitar(desejado.acelerador, 0, 1), freio: limitar(desejado.freio, 0, 1) };
}

/** Options apertado agora e não no quadro anterior. */
export function bordaReiniciar(pad: GamepadLike | null | undefined, antes: boolean) {
  const agora = !!pad && pad.mapping === 'standard' && !!pad.buttons[BOTAO_REINICIAR]?.pressed;
  return { reiniciar: agora && !antes, segurado: agora };
}

/** Tecla do teclado → seta do volante, ou null. */
export function setaDaTecla(tecla: string): keyof SetasVolante | null {
  return setaDoComando(tecla);
}
