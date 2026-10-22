/**
 * Áudio do stand no navegador, comum aos dois modos de voz: microfone em PCM16
 * a 24 kHz pelo worklet, saída com analisador para o lip-sync e a fila que
 * toca os pedaços de PCM em sequência.
 */
import { registrarVoz } from './diagnosticoVoz';
import { floatDeBase64Pcm16, nivelNormalizado, rms } from './protocolo';

export const HZ_STAND = 24000;
/** 50 ms de PCM16 a 24 kHz: o tamanho do bloco que vai ao provedor. */
const BLOCO = 1200;
/**
 * `audioWorklet.addModule` pode ficar pendente para sempre (visto em 19/10 com
 * o Chromium sob automação: nem um módulo vazio carrega). Passado o prazo, a
 * captura sai pelo ScriptProcessor, que é obsoleto mas funciona em todo lugar.
 */
export const PRAZO_WORKLET_MS = 2500;

export type Captura = 'worklet' | 'script';
type AoMicrofone = (pcm: Int16Array, nivel: number) => void;

export interface AudioStand {
  contexto: AudioContext;
  saida: GainNode;
  microfone: MediaStream;
  /** Por onde o microfone é lido; `script` quando o worklet não carregou no prazo. */
  captura: Captura;
  /** Recebe o microfone em blocos de 50 ms de PCM16 a 24 kHz, com o RMS do bloco. */
  ouvir(cb: AoMicrofone): void;
  /** Liga o relógio de nível (33 ms) e devolve a função que o desliga. */
  medirNivel(cb: (nivel: number) => void): () => void;
  fechar(): void;
}

/** Junta amostras float (em qualquer taxa) em blocos de PCM16 a 24 kHz. Mesma conta do worklet. */
export class Bloqueador {
  private passo: number;
  private posicao = 0;
  private anterior = 0;
  private bloco = new Int16Array(BLOCO);
  private n = 0;
  private soma = 0;

  constructor(taxa: number, private entregar: AoMicrofone) {
    this.passo = taxa / HZ_STAND;
  }

  private empurrar(valor: number): void {
    const v = Math.max(-1, Math.min(1, valor));
    this.bloco[this.n++] = v < 0 ? v * 0x8000 : v * 0x7fff;
    this.soma += v * v;
    if (this.n === BLOCO) {
      this.entregar(this.bloco, Math.sqrt(this.soma / BLOCO));
      this.bloco = new Int16Array(BLOCO);
      this.n = 0;
      this.soma = 0;
    }
  }

  alimentar(canal: Float32Array): void {
    if (this.passo === 1) {
      for (let i = 0; i < canal.length; i++) this.empurrar(canal[i]);
      return;
    }
    while (this.posicao < canal.length) {
      const i = Math.floor(this.posicao);
      const fracao = this.posicao - i;
      const a = i === 0 ? this.anterior : canal[i - 1];
      this.empurrar(a + (canal[i] - a) * fracao);
      this.posicao += this.passo;
    }
    this.posicao -= canal.length;
    this.anterior = canal[canal.length - 1];
  }
}

function comPrazo<T>(promessa: Promise<T>, ms: number): Promise<T> {
  return new Promise((ok, falha) => {
    const relogio = window.setTimeout(() => falha(new Error('worklet_sem_resposta')), ms);
    promessa.then((v) => { window.clearTimeout(relogio); ok(v); }, (e) => { window.clearTimeout(relogio); falha(e); });
  });
}

/**
 * Abre o microfone e só depois cria o AudioContext: com a captura já ativa, o
 * Chrome deixa o contexto nascer `running` sem gesto (permissão do microfone
 * guardada no perfil do kiosk). Criado antes, nasce `suspended` e a escuta
 * ficaria esperando um toque, com ou sem `--autoplay-policy` (prova de 19/10).
 */
export async function abrirAudio({ prazoWorkletMs = PRAZO_WORKLET_MS } = {}): Promise<AudioStand> {
  const microfone = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  });
  const ajustes = microfone.getAudioTracks()[0]?.getSettings();
  registrarVoz('captura', {
    echoCancellation: ajustes?.echoCancellation ?? 'nao_informado',
    noiseSuppression: ajustes?.noiseSuppression ?? 'nao_informado',
    autoGainControl: ajustes?.autoGainControl ?? 'nao_informado',
    sampleRate: ajustes?.sampleRate, channelCount: ajustes?.channelCount,
  });
  let contexto: AudioContext;
  try {
    contexto = new AudioContext({ sampleRate: HZ_STAND, latencyHint: 'interactive' });
  } catch (erro) {
    microfone.getTracks().forEach((t) => t.stop());
    throw erro;
  }
  try {
    // Sobra de suspensão (navegador sem a regra da captura): tenta sem gesto; o toque é a reserva.
    if (contexto.state === 'suspended') void contexto.resume().catch(() => {});
    const saida = contexto.createGain();
    const analisador = contexto.createAnalyser();
    analisador.fftSize = 1024;
    saida.connect(analisador);
    analisador.connect(contexto.destination);
    const fonte = contexto.createMediaStreamSource(microfone);
    let aoMicrofone: AoMicrofone = () => {};
    let no: AudioNode;
    let captura: Captura;
    try {
      await comPrazo(contexto.audioWorklet.addModule('/stand-voz/captura-pcm.worklet.js'), prazoWorkletMs);
      const worklet = new AudioWorkletNode(contexto, 'captura-pcm');
      worklet.port.onmessage = (ev: MessageEvent<{ pcm: Int16Array; rms: number }>) => aoMicrofone(ev.data.pcm, ev.data.rms);
      no = worklet;
      captura = 'worklet';
    } catch (erro) {
      console.warn('[stand] worklet do microfone falhou, captura pelo ScriptProcessor:', erro instanceof Error ? erro.message : erro);
      const bloqueador = new Bloqueador(contexto.sampleRate, (pcm, nivel) => aoMicrofone(pcm, nivel));
      const script = contexto.createScriptProcessor(2048, 1, 1);
      script.onaudioprocess = (ev) => bloqueador.alimentar(ev.inputBuffer.getChannelData(0));
      // O ScriptProcessor só roda ligado ao destino; o ganho zero não deixa o microfone vazar na caixa.
      const mudo = contexto.createGain();
      mudo.gain.value = 0;
      script.connect(mudo);
      mudo.connect(contexto.destination);
      no = script;
      captura = 'script';
    }
    fonte.connect(no);
    const amostras = new Float32Array(analisador.fftSize);
    return {
      contexto,
      saida,
      microfone,
      captura,
      ouvir(cb) { aoMicrofone = cb; },
      medirNivel(cb) {
        const relogio = window.setInterval(() => {
          analisador.getFloatTimeDomainData(amostras);
          cb(nivelNormalizado(rms(amostras)));
        }, 33);
        return () => window.clearInterval(relogio);
      },
      fechar() {
        // A escuta entrega o áudio à sessão; quem desistir primeiro fecha, e fechar de novo não faz nada.
        if (contexto.state === 'closed') return;
        aoMicrofone = () => {};
        fonte.disconnect();
        microfone.getTracks().forEach((t) => t.stop());
        void contexto.close();
      },
    };
  } catch (erro) {
    microfone.getTracks().forEach((t) => t.stop());
    void contexto.close();
    throw erro;
  }
}

/** Fila de pedaços PCM16 (base64) tocados em sequência, com corte imediato. */
export class FilaDeVoz {
  private fontes = new Set<AudioBufferSourceNode>();
  private proximoInicio = 0;

  constructor(
    private audio: Pick<AudioStand, 'contexto' | 'saida'>,
    private aoEsvaziar: () => void = () => {},
    private aoAgendar: (pcm: Float32Array, inicio: number) => void = () => {},
  ) {}

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
    this.aoAgendar(amostras, inicio);
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
