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
  /** Onde os efeitos ligam a saída (bipe, tons): passa pela chave de `segurar`. */
  destino?(): AudioNode | null;
  /**
   * Saída mestre do contexto, com o limitador na frente (Lucas, 24/10: evento
   * com muita caixa de som, "aumentar o máximo possível sem estourar").
   * Motor e efeitos ligam aqui, não em `ctx.destination`: cada um pode chegar
   * perto de 0 dBFS sozinho e a soma deles nunca clipa.
   */
  saida?(): AudioNode | null;
  /**
   * Um som por vez no Totem (Lucas, 23/10): com a Coruja falando os efeitos
   * ficam mudos e voltam quando ela termina. O alarme de sono não espera: ele
   * corta a fala, e quem o toca liga direto no destino.
   */
  segurar?(sim: boolean): void;
}

/** Saída de um efeito: a chave mestre do contexto compartilhado, ou o destino direto. */
export function saidaEfeito(som: SomCompartilhado, ctx: AudioContext): AudioNode {
  return som.destino?.() ?? saidaMestre(som, ctx);
}

/** Saída de quem não passa pela chave (motor): o limitador mestre, ou o destino direto. */
export function saidaMestre(som: SomCompartilhado, ctx: AudioContext): AudioNode {
  return som.saida?.() ?? ctx.destination;
}

/**
 * Limitador mestre: 20:1 acima de -12 dBFS, joelho curto, ataque 3 ms. O
 * compressor da Web Audio aplica ganho de compensação sozinho (full-range
 * makeup): o que fica abaixo do limiar sobe ~7 dB e o pico de saída para em
 * cerca de -4,6 dBFS por mais fontes que somem. Release de 250 ms: o pulso do
 * motor é mais rápido que isso e não bombeia.
 */
export const LIMITADOR = { threshold: -12, knee: 4, ratio: 20, attack: 0.003, release: 0.25 } as const;

export function criarSomCompartilhado(Contexto: ConstrutorContexto | undefined = globalThis.AudioContext): SomCompartilhado {
  let contexto: AudioContext | null = null;
  let mestre: GainNode | null = null;
  let limitador: AudioNode | null = null;
  let segurado = false;

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

  const saida = (): AudioNode | null => {
    const ctx = obter();
    if (!ctx) return null;
    if (limitador?.context !== ctx) {
      // Sem compressor (contexto mínimo de teste): direto no destino.
      const c = ctx.createDynamicsCompressor?.();
      if (!c) return ctx.destination;
      for (const [k, v] of Object.entries(LIMITADOR)) c[k as keyof typeof LIMITADOR].value = v;
      c.connect(ctx.destination);
      limitador = c;
    }
    return limitador;
  };

  const destino = (): AudioNode | null => {
    const ctx = obter();
    if (!ctx) return null;
    if (mestre?.context !== ctx) {
      mestre = ctx.createGain();
      mestre.gain.value = segurado ? 0 : 1;
      mestre.connect(saida() ?? ctx.destination);
    }
    return mestre;
  };

  const segurar = (sim: boolean): void => {
    segurado = sim;
    if (!mestre || mestre.context.state === 'closed') return;
    const agora = mestre.context.currentTime;
    mestre.gain.cancelScheduledValues(agora);
    mestre.gain.setValueAtTime(sim ? 0 : 1, agora);
  };

  return { obter, destravar, ligarDestravas, destino, saida, segurar };
}

export const somCompartilhado = criarSomCompartilhado(typeof AudioContext === 'undefined' ? undefined : AudioContext);
