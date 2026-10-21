import { useSyncExternalStore } from 'react';
import type { EstadoGameplay } from '@/components/gameplay/estadoGameplay';

/**
 * Gameplay ao vivo (inventário #3): o totem manda o retrato pelo /ws e o
 * tablet do operador, na mesma conta, recebe. O provider do /ws liga o
 * transporte; quem joga só chama `enviar`, quem assiste lê `useRetratoAoVivo`.
 * Fica fora do LucaContext para os 4 Hz não re-renderizarem o app inteiro.
 */
export const TIPO_RETRATO = 'gameplay:retrato';
/** Abaixo dos 5 Hz do servidor com folga para o jitter do rAF. */
export const ENVIO_INTERVALO_MS = 250;
/** Sem retrato há mais que isso: o tablet mostra "sem sinal". */
export const SEM_SINAL_MS = 2000;

export interface RetratoAoVivo { estado: EstadoGameplay; recebidoEm: number }
export type SinalAoVivo = { nivel: 'aguardando' } | { nivel: 'ao-vivo' } | { nivel: 'sem-sinal'; segundos: number };

/** Puro: o que o selo do tablet diz agora. */
export function sinalAoVivo(ultimo: RetratoAoVivo | null, agora: number): SinalAoVivo {
  if (!ultimo) return { nivel: 'aguardando' };
  const idade = agora - ultimo.recebidoEm;
  return idade <= SEM_SINAL_MS ? { nivel: 'ao-vivo' } : { nivel: 'sem-sinal', segundos: Math.floor(idade / 1000) };
}

export function criarAoVivo(agora: () => number = Date.now) {
  let transporte: ((texto: string) => void) | null = null;
  let ultimoEnvio = -Infinity;
  let ultimo: RetratoAoVivo | null = null;
  const assinantes = new Set<() => void>();
  return {
    /** O provider do /ws liga na abertura e desliga (null) no fechamento. */
    ligar(enviar: ((texto: string) => void) | null) { transporte = enviar; },
    /** Totem: no máximo um retrato a cada ENVIO_INTERVALO_MS; sem /ws, não faz nada. */
    enviar(estado: EstadoGameplay) {
      const t = agora();
      if (!transporte || t - ultimoEnvio < ENVIO_INTERVALO_MS) return false;
      ultimoEnvio = t;
      try { transporte(JSON.stringify({ kind: TIPO_RETRATO, estado })); } catch { return false; }
      return true;
    },
    /** Tablet: `idadeMs` vem do servidor (o retrato guardado pode ter alguns segundos). */
    receber(estado: EstadoGameplay, idadeMs = 0) {
      ultimo = { estado, recebidoEm: agora() - Math.max(0, idadeMs) };
      for (const fn of [...assinantes]) fn();
    },
    ler: () => ultimo,
    assinar(fn: () => void) { assinantes.add(fn); return () => { assinantes.delete(fn); }; },
  };
}

export const aoVivo = criarAoVivo();

export function useRetratoAoVivo(): RetratoAoVivo | null {
  return useSyncExternalStore(aoVivo.assinar, aoVivo.ler, () => null);
}
