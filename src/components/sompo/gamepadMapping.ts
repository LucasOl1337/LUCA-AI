/**
 * DualSense (ou qualquer controle com `mapping === 'standard'`) → comandos do stand.
 * Puro: recebe um retrato do controle e devolve olhar, condução e ações por borda.
 * Layout standard da Gamepad API: botões 0 ✕, 1 ○, 2 □, 3 △, 6 L2, 7 R2, 9 Options;
 * eixos 0/1 analógico esquerdo, 2/3 analógico direito (para baixo = positivo).
 */

export interface GamepadButtonLike { pressed: boolean; value: number }
export interface GamepadLike {
  mapping: string;
  axes: readonly number[];
  buttons: readonly GamepadButtonLike[];
}

export type StandPadAction = 'toggle-cabin' | 'scenario:a' | 'scenario:b' | 'scenario:c' | 'restart';

/** Botões já pressionados no quadro anterior: ação só na borda de subida. */
export type PadState = { pressed: readonly number[] };
export const EMPTY_PAD_STATE: PadState = { pressed: [] };

export interface StandPadReading {
  /** -1..1; yaw positivo = olhar para a esquerda, pitch positivo = olhar para cima. */
  look: { yaw: number; pitch: number };
  /** Condução livre: steer -1 (esquerda)..1 (direita); throttle/brake 0..1 (R2/L2 progressivos). */
  drive: { steer: number; throttle: number; brake: number; stick: number };
  actions: StandPadAction[];
  next: PadState;
}

export const STAND_PAD_DEAD_ZONE = 0.12;

export const STAND_PAD_BUTTONS: Readonly<Record<number, StandPadAction>> = Object.freeze({
  0: 'toggle-cabin',
  2: 'scenario:a',
  3: 'scenario:b',
  1: 'scenario:c',
  9: 'restart',
});

/** Zona morta radial por eixo, reescalada para 0..1 fora dela (sem salto na borda). */
export function applyDeadZone(value: number, deadZone = STAND_PAD_DEAD_ZONE) {
  if (!Number.isFinite(value)) return 0;
  const magnitude = Math.abs(value);
  if (magnitude <= deadZone) return 0;
  return Math.sign(value) * Math.min(1, (magnitude - deadZone) / (1 - deadZone));
}

const axis = (pad: GamepadLike, index: number) => applyDeadZone(pad.axes[index] ?? 0);
/** Eixo invertido sem produzir -0 (que vaza para comparações e JSON). */
const inverted = (pad: GamepadLike, index: number) => 0 - axis(pad, index);
const trigger = (pad: GamepadLike, index: number) => {
  const button = pad.buttons[index];
  if (!button) return 0;
  const value = Number.isFinite(button.value) ? button.value : button.pressed ? 1 : 0;
  return value <= 0.04 ? 0 : Math.min(1, value);
};

const IDLE: Omit<StandPadReading, 'next'> = Object.freeze({
  look: { yaw: 0, pitch: 0 },
  drive: { steer: 0, throttle: 0, brake: 0, stick: 0 },
  actions: [],
});

export function readStandPad(pad: GamepadLike | null | undefined, prev: PadState = EMPTY_PAD_STATE): StandPadReading {
  // Sem mapping standard os índices não significam nada: não chuta.
  if (!pad || pad.mapping !== 'standard') return { ...IDLE, actions: [], next: EMPTY_PAD_STATE };
  const pressed: number[] = [];
  const actions: StandPadAction[] = [];
  for (const [key, action] of Object.entries(STAND_PAD_BUTTONS)) {
    const index = Number(key);
    if (!pad.buttons[index]?.pressed) continue;
    pressed.push(index);
    if (!prev.pressed.includes(index)) actions.push(action);
  }
  return {
    look: { yaw: inverted(pad, 2), pitch: inverted(pad, 3) },
    drive: { steer: axis(pad, 0), throttle: trigger(pad, 7), brake: trigger(pad, 6), stick: inverted(pad, 1) },
    actions,
    next: { pressed },
  };
}
