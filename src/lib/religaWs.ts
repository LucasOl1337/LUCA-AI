/**
 * Religa o /ws sozinho depois de uma queda de rede, sem F5 (ensaio da feira, cenário 1).
 * Antes, uma tentativa que achava o servidor fora do ar desistia e o tablet ficava
 * em "sem sinal" até alguém recarregar a página.
 */
export const RELIGA_MS = 3000;
/**
 * Espalha as religações (0–1 s a mais): depois de um restart do servidor, os
 * tablets da feira não voltam todos no mesmo instante.
 */
export const RELIGA_JITTER_MS = 1000;

interface Relogio {
  agendar: (fn: () => void, ms: number) => unknown;
  cancelar: (id: unknown) => void;
}

const relogioReal: Relogio = {
  agendar: (fn, ms) => setTimeout(fn, ms),
  cancelar: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

/**
 * `conectar` devolve true quando abriu um socket (o `close` dele chama `agendar`)
 * e false quando não deu para tentar; nesse caso tenta de novo em `intervaloMs`
 * + até `RELIGA_JITTER_MS` (`aleatorio` em [0, 1), injetável no teste).
 * Uma tentativa por vez, um agendamento por vez.
 */
export function criarReligador(
  conectar: () => Promise<boolean>,
  relogio: Relogio = relogioReal,
  intervaloMs = RELIGA_MS,
  aleatorio: () => number = Math.random,
) {
  let timer: unknown = null;
  let parado = false;
  let tentando = false;

  function agendar() {
    if (parado || timer !== null) return;
    const jitter = Math.floor(Math.min(Math.max(aleatorio(), 0), 0.999) * RELIGA_JITTER_MS);
    timer = relogio.agendar(() => { timer = null; void tentar(); }, intervaloMs + jitter);
  }

  async function tentar() {
    if (parado || tentando) return;
    tentando = true;
    let abriu = false;
    try { abriu = await conectar(); } catch { abriu = false; }
    tentando = false;
    if (!abriu) agendar();
  }

  function parar() {
    parado = true;
    if (timer !== null) relogio.cancelar(timer);
    timer = null;
  }

  return { tentar, agendar, parar };
}
