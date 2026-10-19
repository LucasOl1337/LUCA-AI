/**
 * Áudio do stand no navegador, comum aos dois modos de voz: microfone em PCM16
 * a 24 kHz pelo worklet, saída com analisador para o lip-sync e a fila que
 * toca os pedaços de PCM em sequência.
 */
import { floatDeBase64Pcm16, nivelNormalizado, rms } from './protocolo';

export const HZ_STAND = 24000;

export interface AudioStand {
  contexto: AudioContext;
  saida: GainNode;
  microfone: MediaStream;
  captura: AudioWorkletNode;
  /** Liga o relógio de nível (33 ms) e devolve a função que o desliga. */
  medirNivel(cb: (nivel: number) => void): () => void;
  fechar(): void;
}

export async function abrirAudio(): Promise<AudioStand> {
  const contexto = new AudioContext({ sampleRate: HZ_STAND, latencyHint: 'interactive' });
  try {
    const saida = contexto.createGain();
    const analisador = contexto.createAnalyser();
    analisador.fftSize = 1024;
    saida.connect(analisador);
    analisador.connect(contexto.destination);
    const microfone = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    await contexto.audioWorklet.addModule('/stand-voz/captura-pcm.worklet.js');
    const captura = new AudioWorkletNode(contexto, 'captura-pcm');
    contexto.createMediaStreamSource(microfone).connect(captura);
    const amostras = new Float32Array(analisador.fftSize);
    return {
      contexto,
      saida,
      microfone,
      captura,
      medirNivel(cb) {
        const relogio = window.setInterval(() => {
          analisador.getFloatTimeDomainData(amostras);
          cb(nivelNormalizado(rms(amostras)));
        }, 33);
        return () => window.clearInterval(relogio);
      },
      fechar() {
        captura.port.onmessage = null;
        microfone.getTracks().forEach((t) => t.stop());
        void contexto.close();
      },
    };
  } catch (erro) {
    void contexto.close();
    throw erro;
  }
}

/** Fila de pedaços PCM16 (base64) tocados em sequência, com corte imediato. */
export class FilaDeVoz {
  private fontes = new Set<AudioBufferSourceNode>();
  private proximoInicio = 0;

  constructor(private audio: Pick<AudioStand, 'contexto' | 'saida'>, private aoEsvaziar: () => void = () => {}) {}

  get tocando(): boolean {
    return this.fontes.size > 0;
  }

  /** Agenda um pedaço e devolve o instante (s, relógio do AudioContext) em que ele começa. */
  tocar(base64: string): number | null {
    const { contexto, saida } = this.audio;
    const amostras = floatDeBase64Pcm16(base64);
    if (!amostras.length || contexto.state === 'closed') return null;
    const buffer = contexto.createBuffer(1, amostras.length, HZ_STAND);
    buffer.copyToChannel(amostras, 0);
    const fonte = contexto.createBufferSource();
    fonte.buffer = buffer;
    fonte.connect(saida);
    const inicio = Math.max(contexto.currentTime + 0.02, this.proximoInicio);
    fonte.start(inicio);
    this.proximoInicio = inicio + buffer.duration;
    this.fontes.add(fonte);
    fonte.onended = () => {
      this.fontes.delete(fonte);
      if (!this.fontes.size) this.aoEsvaziar();
    };
    return inicio;
  }

  /** Milissegundos até o instante `inicio` do relógio de áudio. */
  msAte(inicio: number): number {
    return Math.max(0, (inicio - this.audio.contexto.currentTime) * 1000);
  }

  /** Resolve quando a fila esvaziar (na hora, se já estiver vazia). */
  terminou(): Promise<void> {
    if (!this.fontes.size) return Promise.resolve();
    return new Promise((ok) => {
      const espiar = window.setInterval(() => {
        if (!this.fontes.size) { window.clearInterval(espiar); ok(); }
      }, 50);
    });
  }

  cortar(): void {
    for (const fonte of this.fontes) {
      fonte.onended = null;
      try { fonte.stop(); } catch { /* já parou */ }
    }
    this.fontes.clear();
    this.proximoInicio = 0;
  }
}
