import { useEffect, useRef } from 'react';
import type { BipeCabine } from './alertaCabine';

/**
 * Bipe em Web Audio. Sem permissão de autoplay (kiosk sem
 * `--autoplay-policy=no-user-gesture-required`) fica mudo, sem erro na tela.
 */
export function useBipeCabine(bipe: BipeCabine | null) {
  const motor = useRef<MotorBipe | null>(null);
  const intervalo = bipe?.intervaloMs ?? null;
  const frequencia = bipe?.frequenciaHz ?? 0;
  useEffect(() => () => { motor.current?.fechar(); motor.current = null; }, []);
  useEffect(() => {
    if (intervalo === null) { motor.current?.parar(); return; }
    motor.current ??= criarMotorBipe();
    motor.current.tocar(intervalo, frequencia);
  }, [intervalo, frequencia]);
}

interface MotorBipe { tocar(intervaloMs: number, frequenciaHz: number): void; parar(): void; fechar(): void }

const DURACAO_BIPE_S = 0.09;
const VOLUME = 0.18;

export function criarMotorBipe(): MotorBipe {
  let contexto: AudioContext | null = null;
  let relogio: number | null = null;
  let continuo: { osc: OscillatorNode; ganho: GainNode } | null = null;

  const abrir = (): AudioContext | null => {
    try {
      contexto ??= new AudioContext({ latencyHint: 'interactive' });
      if (contexto.state === 'suspended') void contexto.resume().catch(() => undefined);
      return contexto.state === 'running' ? contexto : null;
    } catch { return null; }
  };

  const bipar = (hz: number) => {
    const ctx = abrir();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const ganho = ctx.createGain();
    const agora = ctx.currentTime;
    osc.type = 'square';
    osc.frequency.value = hz;
    ganho.gain.setValueAtTime(0, agora);
    ganho.gain.linearRampToValueAtTime(VOLUME, agora + 0.005);
    ganho.gain.setValueAtTime(VOLUME, agora + DURACAO_BIPE_S - 0.01);
    ganho.gain.linearRampToValueAtTime(0, agora + DURACAO_BIPE_S);
    osc.connect(ganho).connect(ctx.destination);
    osc.start(agora);
    osc.stop(agora + DURACAO_BIPE_S + 0.02);
  };

  const parar = () => {
    if (relogio !== null) { window.clearInterval(relogio); relogio = null; }
    if (continuo) {
      try { continuo.osc.stop(); } catch { /* já parado */ }
      continuo = null;
    }
  };

  const motor: MotorBipe = {
    tocar(intervaloMs, hz) {
      parar();
      if (intervaloMs === 0) {
        const ctx = abrir();
        if (!ctx) {
          // Autoplay ainda travado: tenta de novo no próximo ciclo sem insistir em erro.
          relogio = window.setInterval(() => { if (abrir()) motor.tocar(0, hz); }, 500);
          return;
        }
        const osc = ctx.createOscillator();
        const ganho = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = hz;
        ganho.gain.value = VOLUME * 0.8;
        osc.connect(ganho).connect(ctx.destination);
        osc.start();
        continuo = { osc, ganho };
        return;
      }
      bipar(hz);
      relogio = window.setInterval(() => bipar(hz), intervaloMs);
    },
    parar,
    fechar() {
      parar();
      if (contexto) { void contexto.close().catch(() => undefined); contexto = null; }
    },
  };
  return motor;
}
