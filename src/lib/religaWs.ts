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
/**
 * Recusa por teto de sockets da conta (1013, server/ws-limites.js): cada recusa
 * seguida dobra o prazo (3 → 6 → 12 → 24 → 30 s), sem passar do teto, e o
 * jitter segue por cima. Uma conexão aceita volta ao prazo normal (A3 da revisão).
 */
export const RELIGA_RECUSA_TETO_MS = 30_000;
export const WS_CODIGO_LIMITE = 1013;

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
  let recusas = 0;

  function prazoBase() {
    if (recusas === 0) return intervaloMs;
    return Math.min(intervaloMs * 2 ** (recusas - 1), Math.max(intervaloMs, RELIGA_RECUSA_TETO_MS));
  }

  function agendar() {
    if (parado || pausado || timer !== null) return;
    const jitter = Math.floor(Math.min(Math.max(aleatorio(), 0), 0.999) * RELIGA_JITTER_MS);
    timer = relogio.agendar(() => { timer = null; void tentar(); }, prazoBase() + jitter);
  }

  /** O servidor recusou com 1013 (teto da conta): a próxima religação espera o dobro. */
  function recusado() {
    recusas = Math.min(recusas + 1, 16);
  }

  /** Conexão aceita (chegou o `state`): volta ao prazo normal. */
  function aceito() {
    recusas = 0;
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

  return { tentar, agendar, parar, pausar, retomar, recusado, aceito, pausado: () => pausado, prazoBase };
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
