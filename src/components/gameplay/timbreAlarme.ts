/**
 * Timbre dos alarmes da cabine (Lucas, 24/10: "os efeitos sonoros de alerta não
 * tão parecendo alerta de máquina da vida real"). Antes eram senoides e ondas
 * quadradas cruas de 90 ms em 520–1180 Hz, que soam como bipe de brinquedo.
 *
 * Máquina pesada de verdade usa:
 * - sensor de proximidade/colisão: buzzer piezo de cabine (~2,5–3 kHz, pulso
 *   curto e seco, cadência que acelera até ficar contínuo);
 * - alarme de ré: buzina eletromecânica de ~1,2 kHz, áspera (rica em harmônicos),
 *   meio segundo ligado e meio desligado; ou o de ruído branco ("chh-chh");
 * - fadiga (Caterpillar DSS, Guardian): alarme alto e insistente, que não se
 *   confunde com o sensor; aqui dois tons alternados ou rajada 3+2.
 *
 * Cada categoria tem as opções A e B só como dado; `ESCOLHA_ALARME` diz qual
 * toca. Todos os sons passam por `agendarRajada`: uma fonte por rajada, com o
 * envelope de vários pulsos no ganho (sem estalo, ataque 2 ms, soltura 6 ms).
 */

export type VozAlarme = 'piezo' | 'buzina' | 'ruido';
export type SomAlarme = 'proximidade' | 'zona' | 'inclinacao' | 're' | 'sono';
export type CategoriaAlarme = 'colisao' | 're' | 'sono';
export type OpcaoAlarme = 'A' | 'B';
/** Pulso de um padrão: início e duração em ms, frequência como múltiplo da base. */
export type PulsoPadrao = readonly [inicioMs: number, duracaoMs: number, multiplicador: number];

export interface DefinicaoAlarme {
  voz: VozAlarme;
  hz: number;
  /** Cadência fixa (ré, sono). Proximidade, zona e inclinação têm cadência do painel. */
  periodoMs: number;
  padrao: readonly PulsoPadrao[];
}

/** Série de Fourier (senos) por voz; índice = harmônico. */
const HARMONICOS: Record<Exclude<VozAlarme, 'ruido'>, readonly number[]> = {
  // Disco piezo na ressonância: fundamental forte, 2º e 3º presentes (o "chiado" do buzzer).
  piezo: [0, 1, 0.3, 0.42, 0.1, 0.18, 0.04, 0.07],
  // Buzina de ré: quase quadrada, ímpares fortes e um pouco de par (o "rasgado").
  buzina: [0, 1, 0.12, 0.62, 0.08, 0.45, 0.05, 0.32, 0.03, 0.22, 0, 0.15, 0, 0.1],
};
/**
 * Ganho por voz: RMS parecido entre as vozes e pico abaixo de 1 em cada uma
 * sozinha (render offline, sem limitador). Era 0,3/0,24/0,5, pico < 0,5;
 * triplicou em 24/10 (evento com muita caixa de som, alarmes inaudíveis). A
 * soma com o motor passa pelo limitador mestre de `somCompartilhado`.
 */
export const VOLUME_VOZ: Record<VozAlarme, number> = { piezo: 0.9, buzina: 0.72, ruido: 0.95 };

const pulsoSensor = (hz: number): DefinicaoAlarme => ({ voz: 'piezo', hz, periodoMs: 0, padrao: [[0, 80, 1]] });

export const OPCOES_ALARME = {
  colisao: {
    A: { proximidade: pulsoSensor(2800), zona: pulsoSensor(2300), inclinacao: pulsoSensor(1750) },
    B: {
      proximidade: { voz: 'buzina', hz: 1250, periodoMs: 0, padrao: [[0, 100, 1]] },
      zona: { voz: 'buzina', hz: 990, periodoMs: 0, padrao: [[0, 100, 1]] },
      inclinacao: { voz: 'buzina', hz: 700, periodoMs: 0, padrao: [[0, 100, 1]] },
    },
  },
  re: {
    A: { re: { voz: 'buzina', hz: 1200, periodoMs: 1000, padrao: [[0, 500, 1]] } },
    B: { re: { voz: 'ruido', hz: 1800, periodoMs: 900, padrao: [[0, 450, 1]] } },
  },
  sono: {
    // Dois tons alternados, sem pausa: insistente, não se confunde com o sensor.
    A: { sono: { voz: 'piezo', hz: 2900, periodoMs: 500, padrao: [[0, 120, 1], [125, 120, 0.78], [250, 120, 1], [375, 120, 0.78]] } },
    // Rajada 3+2 (padrão de alarme de alta prioridade), buzina de 1 kHz.
    B: { sono: { voz: 'buzina', hz: 1050, periodoMs: 1600, padrao: [[0, 110, 1], [150, 110, 1], [300, 110, 1], [600, 110, 1], [750, 110, 1]] } },
  },
} as const satisfies Record<CategoriaAlarme, Record<OpcaoAlarme, Partial<Record<SomAlarme, DefinicaoAlarme>>>>;

/** Padrão de quem toca (opção A até o Lucas escolher). */
export const ESCOLHA_ALARME: Record<CategoriaAlarme, OpcaoAlarme> = { colisao: 'A', re: 'A', sono: 'A' };

export function alarmesDa(escolha: Record<CategoriaAlarme, OpcaoAlarme>): Record<SomAlarme, DefinicaoAlarme> {
  return { ...OPCOES_ALARME.colisao[escolha.colisao], ...OPCOES_ALARME.re[escolha.re], ...OPCOES_ALARME.sono[escolha.sono] };
}
export const ALARMES: Record<SomAlarme, DefinicaoAlarme> = alarmesDa(ESCOLHA_ALARME);

const ATAQUE_S = 0.002, SOLTURA_S = 0.006;
const ondas = new WeakMap<BaseAudioContext, Map<VozAlarme, PeriodicWave>>();
const ruidos = new WeakMap<BaseAudioContext, AudioBuffer>();

function onda(ctx: BaseAudioContext, voz: Exclude<VozAlarme, 'ruido'>) {
  let mapa = ondas.get(ctx);
  if (!mapa) { mapa = new Map(); ondas.set(ctx, mapa); }
  let w = mapa.get(voz);
  if (!w) {
    const imag = Float32Array.from(HARMONICOS[voz]);
    w = ctx.createPeriodicWave(new Float32Array(imag.length), imag);
    mapa.set(voz, w);
  }
  return w;
}

function ruido(ctx: BaseAudioContext) {
  let b = ruidos.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    // Ruído fixo (semente constante): o render de prova sai igual a cada vez.
    let s = 0x2f6b1d;
    for (let i = 0; i < d.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = s / 2 ** 31 - 1; }
    ruidos.set(ctx, b);
  }
  return b;
}

/** Rajada em andamento: `parar` corta com rampa de 6 ms (sem estalo). */
export interface Rajada { fonte: AudioScheduledSourceNode; ganho: GainNode; parar(): void }

function fonte(ctx: BaseAudioContext, def: DefinicaoAlarme, saida: AudioNode): { no: AudioScheduledSourceNode; hz: AudioParam } {
  if (def.voz === 'ruido') {
    // Alarme de ré de ruído branco: chiado em banda (~1,2 a 3 kHz), sem tom.
    const b = ctx.createBufferSource();
    b.buffer = ruido(ctx); b.loop = true;
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'bandpass'; filtro.frequency.value = def.hz; filtro.Q.value = 0.9;
    b.connect(filtro).connect(saida);
    return { no: b, hz: filtro.frequency };
  }
  const o = ctx.createOscillator();
  o.setPeriodicWave(onda(ctx, def.voz));
  o.frequency.value = def.hz;
  o.connect(saida);
  return { no: o, hz: o.frequency };
}

function rajada(ctx: BaseAudioContext, no: AudioScheduledSourceNode, ganho: GainNode): Rajada {
  let parada = false;
  no.onended = () => { try { no.disconnect(); ganho.disconnect(); } catch { /* já solto */ } };
  return {
    fonte: no, ganho,
    parar() {
      if (parada) return;
      parada = true;
      const t = ctx.currentTime;
      ganho.gain.cancelScheduledValues(t);
      ganho.gain.setValueAtTime(ganho.gain.value, t);
      ganho.gain.linearRampToValueAtTime(0, t + SOLTURA_S);
      try { no.stop(t + SOLTURA_S + 0.002); } catch { /* já parado */ }
    },
  };
}

/**
 * Agenda o padrão inteiro de `def` a partir de `t0` (s, relógio do contexto):
 * uma fonte, envelope de pulsos no ganho. `escala` multiplica o volume da voz.
 */
export function agendarRajada(ctx: BaseAudioContext, def: DefinicaoAlarme, destino: AudioNode, t0 = ctx.currentTime, escala = 1): Rajada {
  const ganho = ctx.createGain();
  const v = VOLUME_VOZ[def.voz] * escala;
  const g = ganho.gain;
  g.setValueAtTime(0, t0);
  const { no, hz } = fonte(ctx, def, ganho);
  ganho.connect(destino);
  let fim = t0;
  for (const [inicioMs, duracaoMs, mult] of def.padrao) {
    const a = t0 + inicioMs / 1000, b = a + duracaoMs / 1000;
    hz.setValueAtTime(def.hz * mult, a);
    g.setValueAtTime(0, a);
    g.linearRampToValueAtTime(v, a + ATAQUE_S);
    g.setValueAtTime(v, b - SOLTURA_S);
    g.linearRampToValueAtTime(0, b);
    fim = Math.max(fim, b);
  }
  no.start(t0);
  no.stop(fim + 0.01);
  return rajada(ctx, no, ganho);
}

/** Tom contínuo (sensor na iminência e contato): a mesma voz, sem pulso. */
export function ligarTom(ctx: BaseAudioContext, def: DefinicaoAlarme, destino: AudioNode, escala = 0.8): Rajada {
  const ganho = ctx.createGain();
  const t = ctx.currentTime, v = VOLUME_VOZ[def.voz] * escala;
  ganho.gain.setValueAtTime(0, t);
  // Entra depois da soltura do último pulso: os dois não somam (pico do render < 1).
  ganho.gain.setValueAtTime(0, t + SOLTURA_S);
  ganho.gain.linearRampToValueAtTime(v, t + SOLTURA_S + ATAQUE_S);
  const { no } = fonte(ctx, def, ganho);
  ganho.connect(destino);
  no.start(t);
  return rajada(ctx, no, ganho);
}
