/**
 * Um AudioContext só por página para os bipes da cabine (gameplay, totem e
 * tablet do operador). Por que existe (Lucas, 21/10: "a Simulação está ficando
 * sem som"):
 *
 * - o Chrome só deixa um AudioContext tocar depois de um gesto na página
 *   (clique, toque, tecla) ou com captura de câmera/microfone ativa. Controle
 *   (gamepad) não conta como gesto;
 * - no totem a Simulação abre pelo controle ou pela voz e, ali, a Escuta fecha
 *   o microfone. O bipe criava o contexto só no primeiro alerta, já sem gesto e
 *   sem captura: nascia `suspended` e o bipe ficava mudo;
 * - cada vez que a Simulação saía da tela o bipe fechava o contexto, e o da
 *   volta nascia de novo sem permissão;
 * - mesmo com permissão, o contexto recém-criado ainda está `suspended` por
 *   alguns milissegundos e o primeiro bipe era descartado.
 *
 * Aqui o contexto nasce no primeiro gesto (ou quando a câmera do totem liga),
 * é retomado a cada gesto e quando a aba volta a ficar visível, e nunca é
 * fechado por quem só toca bipe.
 */

type ConstrutorContexto = new (opcoes?: AudioContextOptions) => AudioContext;
type Alvo = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

/** Eventos que o Chrome aceita como gesto para liberar áudio. */
export const GESTOS_DE_SOM = ['pointerdown', 'pointerup', 'keydown', 'touchend', 'click'] as const;

export interface SomCompartilhado {
  /** O contexto (criado na primeira chamada); `null` sem Web Audio. */
  obter(): AudioContext | null;
  /** Pede `resume()`; resolve `true` quando o contexto está tocando. */
  destravar(): Promise<boolean>;
  /** Gesto na página e aba visível de novo destravam o som. Devolve quem desliga. */
  ligarDestravas(janela: Alvo, documento: Alvo & { hidden: boolean }): () => void;
}

export function criarSomCompartilhado(Contexto: ConstrutorContexto | undefined = globalThis.AudioContext): SomCompartilhado {
  let contexto: AudioContext | null = null;

  const obter = (): AudioContext | null => {
    if (!Contexto) return null;
    // Fechado por alguém de fora (ou pelo navegador): nasce outro.
    if (contexto?.state === 'closed') contexto = null;
    try {
      contexto ??= new Contexto({ latencyHint: 'interactive' });
    } catch {
      return null;
    }
    return contexto;
  };

  const destravar = async (): Promise<boolean> => {
    const ctx = obter();
    if (!ctx) return false;
    if (ctx.state === 'running') return true;
    try { await ctx.resume(); } catch { return false; }
    return (ctx.state as AudioContextState) === 'running';
  };

  const ligarDestravas: SomCompartilhado['ligarDestravas'] = (janela, documento) => {
    const aoGesto = () => { void destravar(); };
    const aoMostrar = () => { if (!documento.hidden) void destravar(); };
    for (const nome of GESTOS_DE_SOM) janela.addEventListener(nome, aoGesto, { capture: true, passive: true });
    documento.addEventListener('visibilitychange', aoMostrar);
    return () => {
      for (const nome of GESTOS_DE_SOM) janela.removeEventListener(nome, aoGesto, { capture: true });
      documento.removeEventListener('visibilitychange', aoMostrar);
    };
  };

  return { obter, destravar, ligarDestravas };
}

export const somCompartilhado = criarSomCompartilhado(typeof AudioContext === 'undefined' ? undefined : AudioContext);
