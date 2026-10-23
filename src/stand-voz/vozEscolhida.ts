/** Apenas preferência explícita. Ausência é enviada como null: servidor decide. */
export type ChaveVoz = string;
const ARMAZENAMENTO = 'luca:totem:voz';

export function lerVozEscolhida(): ChaveVoz | null {
  try {
    return window.localStorage.getItem(ARMAZENAMENTO) || null;
  } catch {
    return null;
  }
}

export function gravarVozEscolhida(chave: ChaveVoz | null): void {
  try {
    if (chave) window.localStorage.setItem(ARMAZENAMENTO, chave);
    else window.localStorage.removeItem(ARMAZENAMENTO);
  } catch {
    // Sem armazenamento, a próxima conversa segue o padrão do servidor.
  }
}
