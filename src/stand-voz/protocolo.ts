/**
 * Peças puras do cérebro de voz (M1): PCM16 ↔ base64, nível de áudio, legenda
 * da frase corrente e detector local de fala para o barge-in. Sem DOM, para
 * os testes `node --test` importarem direto.
 */

/** Amostras PCM16 little-endian → base64 (formato `input_audio_buffer.append`). */
export function base64DePcm16(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binario);
}

/** base64 de PCM16 little-endian (`response.output_audio.delta`) → Float32 -1..1. */
export function floatDeBase64Pcm16(base64: string): Float32Array<ArrayBuffer> {
  const binario = atob(base64);
  const saida = new Float32Array(binario.length >> 1);
  for (let i = 0; i < saida.length; i++) {
    let valor = binario.charCodeAt(2 * i) | (binario.charCodeAt(2 * i + 1) << 8);
    if (valor >= 0x8000) valor -= 0x10000;
    saida[i] = valor / 0x8000;
  }
  return saida;
}

export function rms(amostras: ArrayLike<number>): number {
  if (!amostras.length) return 0;
  let soma = 0;
  for (let i = 0; i < amostras.length; i++) soma += amostras[i] * amostras[i];
  return Math.sqrt(soma / amostras.length);
}

/** RMS de voz (~0,02 a 0,25) → 0..1 para o lip-sync da M2. */
export function nivelNormalizado(valorRms: number): number {
  return Math.min(1, Math.max(0, valorRms * 4));
}

/** Última frase do texto (completa ou em curso); a legenda mostra só ela. */
export function fraseCorrente(texto: string): string {
  const frases = texto.split(/(?<=[.!?…])\s+/).map((f) => f.trim()).filter(Boolean);
  return frases.length ? frases[frases.length - 1] : '';
}

export class LegendaCorrente {
  private texto = '';

  reiniciar(): void {
    this.texto = '';
  }

  adicionar(delta: string): string {
    this.texto += delta;
    return fraseCorrente(this.texto);
  }
}

/**
 * Barge-in local: dispara quando o microfone (já com cancelamento de eco)
 * passa do limiar por `minimoMs` seguidos. O VAD do servidor leva ~0,8–1,1 s
 * para notar a interrupção; este corta o áudio da IA na hora.
 */
export function criarDetectorFala({ limiar = 0.06, minimoMs = 150 }: { limiar?: number; minimoMs?: number } = {}) {
  let acumulado = 0;
  return {
    alimentar(valorRms: number, duracaoMs: number): boolean {
      acumulado = valorRms >= limiar ? acumulado + duracaoMs : 0;
      return acumulado >= minimoMs;
    },
    zerar(): void {
      acumulado = 0;
    },
  };
}
