/**
 * Canal entre o cérebro de voz (M1) e a página /stand (M2).
 *
 * Tipos do contrato da M1 (`shared/stand/eventos.ts`). Dois canais com a
 * mesma forma: o real (barramento de `src/stand-voz/`) e o stub de teste.
 */
import type { EstadoStand, EventoCerebro, EventoPagina } from '../../../shared/stand/eventos.ts';
import { assinarEventosCerebro, emitirEventoStand } from '../../stand-voz/barramento';

export type EstadoVoz = EstadoStand;
export type EventoStand = EventoCerebro;
export type { EventoPagina };

export interface CanalStand {
  /** Recebe os eventos do cérebro. Devolve a função que cancela a assinatura. */
  assinar(fn: (evento: EventoStand) => void): () => void;
  /** Avisa o cérebro do que aconteceu na página. */
  enviar(evento: EventoPagina): void;
}

/** Canal do cérebro de voz real (M1). */
export const canalReal: CanalStand = { assinar: assinarEventosCerebro, enviar: emitirEventoStand };

/** Barramento em memória: base do stub e dos testes. */
export function criarBarramento() {
  const ouvintes = new Set<(evento: EventoStand) => void>();
  const enviados: EventoPagina[] = [];
  const voltas = new Set<(evento: EventoPagina) => void>();
  return {
    assinar(fn: (evento: EventoStand) => void) {
      ouvintes.add(fn);
      return () => { ouvintes.delete(fn); };
    },
    enviar(evento: EventoPagina) {
      enviados.push(evento);
      for (const fn of voltas) fn(evento);
    },
    emitir(evento: EventoStand) {
      for (const fn of ouvintes) fn(evento);
    },
    aoReceberDaPagina(fn: (evento: EventoPagina) => void) {
      voltas.add(fn);
      return () => { voltas.delete(fn); };
    },
    enviados,
  };
}
