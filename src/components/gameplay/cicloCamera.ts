/**
 * Ciclo da página para a webcam da cabine (`/gameplay?webcam=1`).
 * Aba oculta ou página saindo (pagehide, inclusive para o bfcache): libera a
 * câmera e marca a pausa. Aba visível de novo ou volta do bfcache (pageshow
 * com `persisted`): reabre, uma vez só, se estava pausada.
 * Antes, o pagehide parava a câmera sem marcar a pausa: ao voltar do bfcache
 * o quadro dizia "rodando" sem track nem worker (soak do item 5, 21/10).
 */
export interface CameraDaCabine {
  /** Há monitor abrindo ou rodando (a câmera pode estar ligada). */
  ligada(): boolean;
  /** Foi pausada por aba oculta ou pagehide e espera a volta. */
  pausada(): boolean;
  /** Para a câmera e marca a pausa. */
  pausar(): void;
  /** Reabre; precisa sair do estado pausado antes de qualquer espera. */
  retomar(): void;
}

type Alvo = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

export function ligarCicloDaCamera(janela: Alvo, documento: Alvo & { hidden: boolean }, camera: CameraDaCabine) {
  const pausarSeLigada = () => { if (camera.ligada()) camera.pausar(); };
  const retomarSePausada = () => { if (!documento.hidden && camera.pausada()) camera.retomar(); };
  const aoTrocarVisibilidade = () => { if (documento.hidden) pausarSeLigada(); else retomarSePausada(); };
  const aoMostrar = (evento: Event) => { if ((evento as PageTransitionEvent).persisted) retomarSePausada(); };
  documento.addEventListener('visibilitychange', aoTrocarVisibilidade);
  janela.addEventListener('pagehide', pausarSeLigada);
  janela.addEventListener('pageshow', aoMostrar);
  return () => {
    documento.removeEventListener('visibilitychange', aoTrocarVisibilidade);
    janela.removeEventListener('pagehide', pausarSeLigada);
    janela.removeEventListener('pageshow', aoMostrar);
  };
}
