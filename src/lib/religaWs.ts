/**
 * Religa o /ws sozinho depois de uma queda de rede, sem F5 (ensaio da feira, cenário 1).
 * Antes, uma tentativa que achava o servidor fora do ar desistia e o tablet ficava
 * em "sem sinal" até alguém recarregar a página.
 */
export const RELIGA_MS = 3000;

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
 * e false quando não deu para tentar; nesse caso tenta de novo em `intervaloMs`.
 * Uma tentativa por vez, um agendamento por vez.
 */
export function criarReligador(conectar: () => Promise<boolean>, relogio: Relogio = relogioReal, intervaloMs = RELIGA_MS) {
  let timer: unknown = null;
  let parado = false;
  let tentando = false;

  function agendar() {
    if (parado || timer !== null) return;
    timer = relogio.agendar(() => { timer = null; void tentar(); }, intervaloMs);
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
