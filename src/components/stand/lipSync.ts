/** Funções puras do lip-sync: medir o áudio e suavizar a abertura da boca. */

/** RMS de um bloco de amostras (-1..1), levado a 0..1 com ganho para fala. */
export function nivelDeAmostras(amostras: ArrayLike<number>, ganho = 4): number {
  if (amostras.length === 0) return 0;
  let soma = 0;
  for (let i = 0; i < amostras.length; i += 1) soma += amostras[i] * amostras[i];
  const rms = Math.sqrt(soma / amostras.length);
  return Math.min(1, rms * ganho);
}

/**
 * Aproxima a boca do alvo: abre rápido (ataque) e fecha devagar (soltura),
 * para não tremer entre sílabas. `dtMs` é o tempo desde o último quadro.
 */
export function suavizarBoca(atual: number, alvo: number, dtMs: number, ataqueMs = 45, solturaMs = 140): number {
  const alvoLimitado = Math.max(0, Math.min(1, alvo));
  const tau = alvoLimitado > atual ? ataqueMs : solturaMs;
  const fator = 1 - Math.exp(-Math.max(0, dtMs) / tau);
  return atual + (alvoLimitado - atual) * fator;
}
