import { useEffect, useRef } from 'react';
import type { BipeCabine } from './alertaCabine';
import { saidaEfeito, somCompartilhado, type SomCompartilhado } from './somCompartilhado';
import { agendarRajada, ALARMES, ligarTom, type DefinicaoAlarme, type Rajada, type SomAlarme } from './timbreAlarme';

/**
 * Alarme da cabine em Web Audio, no contexto compartilhado da página
 * (`somCompartilhado`). O timbre vem de `timbreAlarme` (buzzer piezo, buzina de
 * ré, dois tons do sono); aqui fica só a cadência. Sem permissão de áudio
 * (nenhum gesto e nenhuma captura ativa) fica mudo, sem erro na tela, e volta
 * a tocar no primeiro gesto.
 */
export function useBipeCabine(bipe: BipeCabine | null) {
  const motor = useRef<MotorBipe | null>(null);
  const intervalo = bipe?.intervaloMs ?? null;
  const som = bipe?.som ?? 'proximidade';
  useEffect(() => () => { motor.current?.fechar(); motor.current = null; }, []);
  useEffect(() => {
    if (intervalo === null) { motor.current?.parar(); return; }
    motor.current ??= criarMotorBipe();
    motor.current.tocar(intervalo, som);
  }, [intervalo, som]);
}

export interface MotorBipe { tocar(intervaloMs: number, som: SomAlarme): void; parar(): void; fechar(): void }

/** Contexto ainda travado: tenta de novo a cada meio segundo. */
const RETENTATIVA_MS = 500;

/** `alarmes` só muda no render de audição das opções (`scripts/render-alarmes.mjs`). */
export function criarMotorBipe(som: SomCompartilhado = somCompartilhado, alarmes: Record<SomAlarme, DefinicaoAlarme> = ALARMES): MotorBipe {
  let relogio: number | null = null;
  let retentativa: number | null = null;
  let continuo: Rajada | null = null;
  /** Rajadas ainda soando: `parar` corta todas (a buzina de ré dura meio segundo). */
  const soando = new Set<Rajada>();
  /** Muda a cada `tocar`/`parar`: um resume que chega atrasado não toca o pedido velho. */
  let geracao = 0;
  let intervaloAtual = 0, fase = 0;
  let somAtual: SomAlarme = 'proximidade';

  /** Contexto tocando agora, ou `null` (e pede o resume para a próxima vez). */
  const pronto = (): AudioContext | null => {
    const ctx = som.obter();
    if (!ctx) return null;
    if (ctx.state === 'running') return ctx;
    void som.destravar();
    return null;
  };

  const bipar = (ctx: AudioContext, qual: SomAlarme) => {
    const r = agendarRajada(ctx, alarmes[qual], saidaEfeito(som, ctx));
    soando.add(r);
    const fim = r.fonte.onended;
    r.fonte.onended = (ev) => { soando.delete(r); fim?.call(r.fonte, ev); };
  };

  const ligarContinuo = (ctx: AudioContext, qual: SomAlarme) => {
    continuo = ligarTom(ctx, alarmes[qual], saidaEfeito(som, ctx));
  };

  const parar = () => {
    geracao += 1;
    if (relogio !== null) { window.clearInterval(relogio); relogio = null; }
    if (retentativa !== null) { window.clearInterval(retentativa); retentativa = null; }
    continuo?.parar();
    continuo = null;
    for (const r of soando) r.parar();
    soando.clear();
  };

  const motor: MotorBipe = {
    tocar(intervaloMs, qual) {
      // Distância chega ~15 vezes/s. Atualizar a curva não reinicia o pulso:
      // mantém a fase, em vez de bipar a cada retrato do sensor.
      // Trocar de som no meio (zona → obstáculo) também mantém a fase: o próximo pulso já sai no timbre novo.
      const mesmoSom = qual === somAtual;
      intervaloAtual = intervaloMs; somAtual = qual;
      if (intervaloMs > 0 && relogio !== null) return;
      // Tom contínuo de outro som: religa (parar + caminho normal abaixo).
      if (intervaloMs === 0 && continuo && mesmoSom) return;
      parar();
      fase = 0;
      const minha = geracao;
      if (intervaloMs === 0) {
        const ctx = pronto();
        if (ctx) { ligarContinuo(ctx, qual); return; }
        // Contexto ainda travado: o tom liga assim que destravar (resume ou gesto).
        void som.destravar().then((ok) => {
          if (ok && minha === geracao && !continuo) { const c = som.obter(); if (c) ligarContinuo(c, qual); }
        });
        retentativa = window.setInterval(() => {
          const c = pronto();
          if (!c || minha !== geracao) return;
          if (retentativa !== null) { window.clearInterval(retentativa); retentativa = null; }
          if (!continuo) ligarContinuo(c, qual);
        }, RETENTATIVA_MS);
        return;
      }
      const tique = () => {
        fase += 10 / intervaloAtual;
        if (fase < 1 - 1e-9) return;
        fase = Math.max(0, fase - 1);
        const ctx = pronto(); if (ctx) bipar(ctx, somAtual);
      };
      const ctx = pronto();
      if (ctx) bipar(ctx, qual);
      // Recém-criado o contexto fica `suspended` por um instante: o 1º bipe sai quando ele destravar.
      else void som.destravar().then((ok) => { if (ok && minha === geracao) { const c = som.obter(); if (c) bipar(c, qual); } });
      relogio = window.setInterval(tique, 10);
    },
    parar,
    // O contexto é da página: quem só toca bipe nunca o fecha (a volta à Simulação herdaria um contexto travado).
    fechar: parar,
  };
  return motor;
}
