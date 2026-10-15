/**
 * Canal entre o cérebro de voz (M1) e a página /stand (M2).
 *
 * Os tipos copiam o contrato 1 de missoes/stand-trator/README.md até a M1
 * publicar shared/stand/eventos.ts; quando sair, troque esta cópia por um
 * re-export daquele arquivo. É o único ponto de troca.
 *
 * Semântica combinada (respostas r1):
 * - `legenda.texto` é a frase corrente inteira e substitui a anterior.
 * - `nivel_audio` chega a ~30 Hz, RMS normalizado 0..1; a página suaviza.
 * - A página devolve `video_terminou`, `reiniciar` e `encerrar`.
 */

export type EstadoVoz = 'ocioso' | 'ouvindo' | 'pensando' | 'falando';

export type EventoStand =
  | { tipo: 'estado'; valor: EstadoVoz }
  | { tipo: 'nivel_audio'; valor: number }
  | { tipo: 'legenda'; texto: string }
  | { tipo: 'tocar_video'; id: string }
  | { tipo: 'acao_site'; acao: string; args?: Record<string, unknown> };

export type EventoPagina =
  | { tipo: 'video_terminou'; id: string }
  | { tipo: 'reiniciar' }
  | { tipo: 'encerrar' };

export interface CanalStand {
  /** Recebe os eventos do cérebro. Devolve a função que cancela a assinatura. */
  assinar(fn: (evento: EventoStand) => void): () => void;
  /** Avisa o cérebro do que aconteceu na página. */
  enviar(evento: EventoPagina): void;
}

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
