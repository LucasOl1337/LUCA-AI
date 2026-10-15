/** Olhar livre da cabine: velocidade angular integrada, limites e retorno ao centro. Puro, em graus. */

export interface LookState { yaw: number; pitch: number }

export const FIRST_PERSON_LOOK_LIMITS = Object.freeze({ yaw: 100, pitch: 35 });
/** Graus por segundo com o analógico no fim de curso. */
export const FIRST_PERSON_LOOK_SPEED = 160;
/** Constante de tempo do retorno ao centro: ~0,6 s para chegar a 2% do desvio. */
export const FIRST_PERSON_RECENTER_TAU = 0.15;

const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

export function clampLook(state: LookState): LookState {
  return { yaw: clamp(state.yaw, FIRST_PERSON_LOOK_LIMITS.yaw), pitch: clamp(state.pitch, FIRST_PERSON_LOOK_LIMITS.pitch) };
}

/**
 * Integra a entrada do analógico (-1..1) por `dt` segundos. Com `recenter` e
 * entrada nula, o olhar volta ao para-brisa (o mouse não pede retorno).
 */
export function stepLook(state: LookState, input: { yaw: number; pitch: number }, dt: number, { recenter = false } = {}): LookState {
  const seconds = Math.max(0, Math.min(0.1, Number.isFinite(dt) ? dt : 0));
  if (input.yaw === 0 && input.pitch === 0) {
    if (!recenter) return state;
    const keep = Math.exp(-seconds / FIRST_PERSON_RECENTER_TAU);
    const next = { yaw: state.yaw * keep, pitch: state.pitch * keep };
    return { yaw: Math.abs(next.yaw) < 0.05 ? 0 : next.yaw, pitch: Math.abs(next.pitch) < 0.05 ? 0 : next.pitch };
  }
  return clampLook({
    yaw: state.yaw + input.yaw * FIRST_PERSON_LOOK_SPEED * seconds,
    pitch: state.pitch + input.pitch * FIRST_PERSON_LOOK_SPEED * seconds,
  });
}

/** Arrasto do mouse (ou setas): deslocamento direto em graus, com os mesmos limites. */
export function nudgeLook(state: LookState, deltaYaw: number, deltaPitch: number): LookState {
  return clampLook({ yaw: state.yaw + deltaYaw, pitch: state.pitch + deltaPitch });
}
