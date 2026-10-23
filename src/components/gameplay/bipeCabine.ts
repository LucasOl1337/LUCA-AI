import { useEffect, useRef } from 'react';
import type { BipeCabine } from './alertaCabine';
import { saidaEfeito, somCompartilhado, type SomCompartilhado } from './somCompartilhado';

/**
 * Bipe em Web Audio, no contexto compartilhado da página (`somCompartilhado`).
 * Sem permissão de áudio (nenhum gesto e nenhuma captura ativa) fica mudo, sem
 * erro na tela, e volta a tocar no primeiro gesto.
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

export interface MotorBipe { tocar(intervaloMs: number, frequenciaHz: number): void; parar(): void; fechar(): void }

const DURACAO_BIPE_S = 0.09;
const VOLUME = 0.18;
/** Contexto ainda travado: tenta de novo a cada meio segundo. */
const RETENTATIVA_MS = 500;

export function criarMotorBipe(som: SomCompartilhado = somCompartilhado): MotorBipe {
  let relogio: number | null = null;
  let retentativa: number | null = null;
  let continuo: { osc: OscillatorNode; ganho: GainNode } | null = null;
  /** Muda a cada `tocar`/`parar`: um resume que chega atrasado não toca o pedido velho. */
  let geracao = 0;
  let intervaloAtual = 0, hzAtual = 0, fase = 0;

  /** Contexto tocando agora, ou `null` (e pede o resume para a próxima vez). */
  const pronto = (): AudioContext | null => {
    const ctx = som.obter();
    if (!ctx) return null;
    if (ctx.state === 'running') return ctx;
    void som.destravar();
    return null;
  };

  const bipar = (ctx: AudioContext, hz: number) => {
    const osc = ctx.createOscillator();
    const ganho = ctx.createGain();
    const agora = ctx.currentTime;
    osc.type = 'square';
    osc.frequency.value = hz;
    ganho.gain.setValueAtTime(0, agora);
    ganho.gain.linearRampToValueAtTime(VOLUME, agora + 0.005);
    ganho.gain.setValueAtTime(VOLUME, agora + DURACAO_BIPE_S - 0.01);
    ganho.gain.linearRampToValueAtTime(0, agora + DURACAO_BIPE_S);
    osc.connect(ganho).connect(saidaEfeito(som, ctx));
    osc.start(agora);
    osc.stop(agora + DURACAO_BIPE_S + 0.02);
  };

  const ligarContinuo = (ctx: AudioContext, hz: number) => {
    const osc = ctx.createOscillator();
    const ganho = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = hz;
    ganho.gain.value = VOLUME * 0.8;
    osc.connect(ganho).connect(saidaEfeito(som, ctx));
    osc.start();
    continuo = { osc, ganho };
  };

  const parar = () => {
    geracao += 1;
    if (relogio !== null) { window.clearInterval(relogio); relogio = null; }
    if (retentativa !== null) { window.clearInterval(retentativa); retentativa = null; }
    if (continuo) {
      try { continuo.osc.stop(); } catch { /* já parado */ }
      try { continuo.osc.disconnect(); } catch { /* já solto */ }
      continuo = null;
    }
  };

  const motor: MotorBipe = {
    tocar(intervaloMs, hz) {
      // Distância chega ~15 vezes/s. Atualizar a curva não reinicia o pulso:
      // mantém a fase, em vez de bipar a cada retrato do sensor.
      intervaloAtual = intervaloMs; hzAtual = hz;
      if (intervaloMs > 0 && relogio !== null) return;
      if (intervaloMs === 0 && continuo) { continuo.osc.frequency.value = hz; return; }
      parar();
      fase = 0;
      const minha = geracao;
      if (intervaloMs === 0) {
        const ctx = pronto();
        if (ctx) { ligarContinuo(ctx, hz); return; }
        // Contexto ainda travado: o tom liga assim que destravar (resume ou gesto).
        void som.destravar().then((ok) => {
          if (ok && minha === geracao && !continuo) { const c = som.obter(); if (c) ligarContinuo(c, hz); }
        });
        retentativa = window.setInterval(() => {
          const c = pronto();
          if (!c || minha !== geracao) return;
          if (retentativa !== null) { window.clearInterval(retentativa); retentativa = null; }
          if (!continuo) ligarContinuo(c, hz);
        }, RETENTATIVA_MS);
        return;
      }
      const tique = () => {
        fase += 10 / intervaloAtual;
        if (fase < 1 - 1e-9) return;
        fase = Math.max(0, fase - 1);
        const ctx = pronto(); if (ctx) bipar(ctx, hzAtual);
      };
      const ctx = pronto();
      if (ctx) bipar(ctx, hz);
      // Recém-criado o contexto fica `suspended` por um instante: o 1º bipe sai quando ele destravar.
      else void som.destravar().then((ok) => { if (ok && minha === geracao) { const c = som.obter(); if (c) bipar(c, hz); } });
      relogio = window.setInterval(tique, 10);
    },
    parar,
    // O contexto é da página: quem só toca bipe nunca o fecha (a volta à Simulação herdaria um contexto travado).
    fechar: parar,
  };
  return motor;
}
