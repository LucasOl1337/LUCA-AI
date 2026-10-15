// Captura do microfone (M1): converte para PCM16 mono a 24 kHz em blocos de
// 50 ms e manda para a página com o RMS do bloco. Se o AudioContext não
// estiver em 24 kHz, reamostra por interpolação linear.
const ALVO_HZ = 24000;
const BLOCO = 1200;

class CapturaPcm extends AudioWorkletProcessor {
  constructor() {
    super();
    this.passo = sampleRate / ALVO_HZ;
    this.posicao = 0;
    this.anterior = 0;
    this.bloco = new Int16Array(BLOCO);
    this.n = 0;
    this.soma = 0;
  }

  empurrar(valor) {
    const v = Math.max(-1, Math.min(1, valor));
    this.bloco[this.n++] = v < 0 ? v * 0x8000 : v * 0x7fff;
    this.soma += v * v;
    if (this.n === BLOCO) {
      this.port.postMessage({ pcm: this.bloco, rms: Math.sqrt(this.soma / BLOCO) }, [this.bloco.buffer]);
      this.bloco = new Int16Array(BLOCO);
      this.n = 0;
      this.soma = 0;
    }
  }

  process(inputs) {
    const canal = inputs[0] && inputs[0][0];
    if (!canal) return true;
    if (this.passo === 1) {
      for (let i = 0; i < canal.length; i++) this.empurrar(canal[i]);
      return true;
    }
    while (this.posicao < canal.length) {
      const i = Math.floor(this.posicao);
      const fracao = this.posicao - i;
      const a = i === 0 ? this.anterior : canal[i - 1];
      const b = canal[i];
      this.empurrar(a + (b - a) * fracao);
      this.posicao += this.passo;
    }
    this.posicao -= canal.length;
    this.anterior = canal[canal.length - 1];
    return true;
  }
}

registerProcessor('captura-pcm', CapturaPcm);
