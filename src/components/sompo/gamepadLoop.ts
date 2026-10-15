import { useEffect, useRef, useState } from 'react';
import { EMPTY_PAD_STATE, readStandPad, type GamepadLike, type StandPadAction, type StandPadReading } from './gamepadMapping';
import { stepLook, type LookState } from './firstPersonLook';

/** Primeiro controle com mapping standard; o resto (volantes, joysticks genéricos) é ignorado. */
export function firstStandardPad(): Gamepad | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
  for (const pad of navigator.getGamepads()) if (pad?.connected && pad.mapping === 'standard') return pad;
  return null;
}

/**
 * Lê o controle a cada quadro: o analógico direito move `lookRef` (com retorno
 * ao centro), `driveRef` recebe analógico esquerdo e gatilhos, e cada botão
 * dispara `onAction` uma vez por toque. Devolve se há um controle conectado.
 */
export function useStandGamepad({ enabled, lookRef, driveRef, onAction }: {
  enabled: boolean;
  lookRef: { current: LookState };
  driveRef: { current: StandPadReading['drive'] };
  onAction: (action: StandPadAction) => void;
}) {
  const [connected, setConnected] = useState(false);
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;

  useEffect(() => {
    if (!enabled) return undefined;
    let frameId = 0;
    let previous = performance.now();
    let state = EMPTY_PAD_STATE;
    let wasConnected = false;
    const tick = (time: number) => {
      const dt = (time - previous) / 1000;
      previous = time;
      const pad = firstStandardPad();
      if (!!pad !== wasConnected) { wasConnected = !!pad; setConnected(wasConnected); }
      const reading = readStandPad(pad as GamepadLike | null, state);
      state = reading.next;
      lookRef.current = stepLook(lookRef.current, reading.look, dt, { recenter: !!pad });
      driveRef.current = reading.drive;
      for (const action of reading.actions) onActionRef.current(action);
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frameId);
      driveRef.current = { steer: 0, throttle: 0, brake: 0, stick: 0 };
    };
  }, [enabled, lookRef, driveRef]);

  return connected;
}

/** Vibração do DualSense: fraca no alerta, forte no contato. Sem atuador, não faz nada. */
export function rumble(kind: 'alert' | 'contact') {
  const actuator = (firstStandardPad() as (Gamepad & { vibrationActuator?: GamepadHapticActuator | null }) | null)?.vibrationActuator;
  if (!actuator?.playEffect) return;
  const effect = kind === 'alert'
    ? { duration: 220, weakMagnitude: 0.55, strongMagnitude: 0.1 }
    : { duration: 420, weakMagnitude: 1, strongMagnitude: 1 };
  void actuator.playEffect('dual-rumble', { startDelay: 0, ...effect }).catch(() => undefined);
}
