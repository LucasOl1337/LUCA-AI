/**
 * Voz da coruja escolhida no Totem antes de abrir o stand (Lucas, 21/10). O
 * navegador guarda e manda só a chave; o servidor confere numa lista branca
 * (`VOZES_STAND` em server/stand/provedor-elevenlabs.js) e nunca aceita voice_id.
 */
export type ChaveVoz = 'lucas' | 'andrea';

export const VOZ_PADRAO: ChaveVoz = 'lucas';
export const VOZES_TOTEM: ReadonlyArray<{ chave: ChaveVoz; rotulo: string; detalhe: string }> = [
  { chave: 'lucas', rotulo: 'Lucas Oliveira', detalhe: 'Voz padrão do LUCA' },
  { chave: 'andrea', rotulo: 'Andrea Lot', detalhe: 'Voz feminina de narradora brasileira' },
];

const ARMAZENAMENTO = 'luca:totem:voz';

export function normalizarVoz(valor: unknown): ChaveVoz {
  return VOZES_TOTEM.some((v) => v.chave === valor) ? (valor as ChaveVoz) : VOZ_PADRAO;
}

/** Lida a cada sessão aberta: trocar no Totem vale para a próxima conversa. */
export function lerVozEscolhida(): ChaveVoz {
  try {
    return normalizarVoz(window.localStorage.getItem(ARMAZENAMENTO));
  } catch {
    return VOZ_PADRAO;
  }
}

export function gravarVozEscolhida(chave: ChaveVoz): void {
  try {
    window.localStorage.setItem(ARMAZENAMENTO, normalizarVoz(chave));
  } catch {
    // Sem armazenamento (aba anônima, bloqueio): a conversa usa a voz padrão.
  }
}
