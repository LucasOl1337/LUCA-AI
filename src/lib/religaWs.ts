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
  let pausado = false;
  let tentando = false;

  function agendar() {
    if (parado || pausado || timer !== null) return;
    const jitter = Math.floor(Math.min(Math.max(aleatorio(), 0), 0.999) * RELIGA_JITTER_MS);
    timer = relogio.agendar(() => { timer = null; void tentar(); }, intervaloMs + jitter);
  }

  async function tentar() {
    if (parado || pausado || tentando) return;
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

  /** Página escondida: nada de tentativa nem agendamento até `retomar`. */
  function pausar() {
    pausado = true;
    if (timer !== null) relogio.cancelar(timer);
    timer = null;
  }

  /** Página de volta: religa pelo caminho normal (prazo + jitter). */
  function retomar() {
    if (parado || !pausado) return;
    pausado = false;
    agendar();
  }

  return { tentar, agendar, parar, pausar, retomar, pausado: () => pausado };
}

type Religador = ReturnType<typeof criarReligador>;

/**
 * Back/forward cache: o Chromium guarda a página congelada com o /ws aberto por
 * até ~10 min depois de navegar para fora, e o servidor segue contando o socket
 * no teto por conta (1013). No `pagehide` (com ou sem `persisted`) o socket fecha
 * e o religador pausa; no `pageshow` vindo do cache (`persisted`) ele retoma, com
 * o mesmo prazo + jitter de qualquer religação. Devolve quem desliga os ouvintes.
 */
export function ligarCicloDaPagina(
  janela: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>,
  religador: Pick<Religador, 'pausar' | 'retomar'>,
  fecharSocket: () => void,
) {
  const aoEsconder = () => { religador.pausar(); fecharSocket(); };
  const aoMostrar = (evento: Event) => {
    if ((evento as PageTransitionEvent).persisted) religador.retomar();
  };
  janela.addEventListener('pagehide', aoEsconder);
  janela.addEventListener('pageshow', aoMostrar);
  return () => {
    janela.removeEventListener('pagehide', aoEsconder);
    janela.removeEventListener('pageshow', aoMostrar);
  };
}
