/**
 * Escuta do stand (pedido do Lucas, 19/10 13:28): na Coruja o microfone fica
 * aberto no navegador e a conversa abre sozinha quando alguém fala, sem toque.
 * Nada sai do navegador até o despertar: o volume é medido aqui, de graça.
 * Funções puras, com o tempo entrando em ms, para testar sem áudio.
 */

/** Blocos de 50 ms guardados antes do despertar: o começo da frase não se perde. */
export const PRE_ROLAGEM_BLOCOS = 12;
/** Sessão aberta pela escuta sem fala de verdade neste tempo fecha como `sem_fala`. */
export const SEM_FALA_MS = 6000;

export interface OpcoesDespertador {
  /** Quantas vezes acima do ruído de fundo a voz precisa estar. */
  fator?: number;
  /** RMS mínimo para despertar, mesmo numa sala silenciosa. */
  minimo?: number;
  /** Tempo seguido acima do limiar. */
  minimoMs?: number;
  /** Quanto o piso anda a cada bloco abaixo do limiar (média móvel). */
  adaptacao?: number;
}

/**
 * Desperta com voz próxima e contínua acima do ruído de fundo. O piso segue o
 * ruído da feira (sobe devagar com o barulho e desce no silêncio), então
 * barulho constante não abre sessão; uma pessoa falando no microfone abre.
 */
export function criarDespertador({ fator = 3, minimo = 0.03, minimoMs = 250, adaptacao = 0.02 }: OpcoesDespertador = {}) {
  let piso: number | null = null;
  let acima = 0;
  const limiar = () => Math.max(minimo, (piso ?? 0) * fator);
  return {
    alimentar(nivel: number, duracaoMs: number): boolean {
      if (piso === null) piso = nivel;
      if (nivel >= limiar()) {
        // Barulho que sobe e fica (a feira enche) também puxa o piso, só que devagar.
        piso += (nivel - piso) * (adaptacao / 10);
        acima += duracaoMs;
        if (acima < minimoMs) return false;
        acima = 0;
        return true;
      }
      acima = 0;
      piso += (nivel - piso) * adaptacao;
      return false;
    },
    get piso(): number { return piso ?? 0; },
    get limiar(): number { return limiar(); },
  };
}

/**
 * Pausa da escuta depois de despertares falsos seguidos (sessão sem fala): o
 * 1º é de graça, depois 10 s, 20 s, 40 s… até 2 min.
 */
export function pausaAposFalsos(falsos: number): number {
  if (falsos <= 1) return 0;
  return Math.min(120_000, 10_000 * 2 ** (falsos - 2));
}
