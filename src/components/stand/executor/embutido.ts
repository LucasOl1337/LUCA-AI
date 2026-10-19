/**
 * Página do site dentro do iframe do `/stand` (grill Totem-Site r1, Q3).
 * Nesse caso o app renderiza só a página, sem menu nem chat, e o Executor
 * liga. Mesma origem: o frame lê o caminho da janela de cima. Fora de um
 * frame do `/stand`, ou com o pai de outra origem (bloqueado pelo
 * frame-ancestors), devolve false.
 */
export function dentroDoStand(janela: Pick<Window, 'parent' | 'self'> | undefined = typeof window === 'undefined' ? undefined : window): boolean {
  if (!janela || janela.parent === janela.self) return false;
  try {
    return /^\/stand\/?$/.test(janela.parent.location.pathname);
  } catch {
    return false;
  }
}

/** Lido uma vez, na carga: a página embutida não muda de pai. */
export const EMBUTIDO_NO_STAND = dentroDoStand();
