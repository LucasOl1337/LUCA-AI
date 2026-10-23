/** Referência local de TTS, sem gravação: só remove cópia muito próxima do PCM tocado.
 * Complementa o AEC do navegador; não é um cancelador adaptativo de sala.
 * Falha aberta: mistura, reverberação ou correspondência incerta seguem ao Scribe.
 */
const HZ = 24000;
const PASSO = 8; // PCM24k → médias a 3kHz (evita alias de decimação simples).
const ATRASO_MAX = 10800; // 450ms: propagação + fila da captura + cauda curta.

type Trecho = { inicio: number; dados: Float32Array };
export type AnaliseEco = { eco: boolean; correlacao: number; residual: number; referencia: boolean };

function reduzir(pcm: ArrayLike<number>, escala: number): Float32Array {
  const dados = new Float32Array(Math.floor(pcm.length / PASSO));
  for (let i = 0; i < dados.length; i++) {
    let soma = 0;
    for (let j = 0; j < PASSO; j++) soma += pcm[i * PASSO + j] * escala;
    dados[i] = soma / PASSO;
  }
  return dados;
}

export class ReferenciaEco {
  private trechos: Trecho[] = [];
  private atrasoConfirmado: number | null = null;
  // Reusados a cada bloco de 50 ms do microfone: evita ~2 MB/s de lixo para o GC durante a fala.
  private referencia = new Float32Array(0);
  private medias = new Float32Array(0);

  agendar(pcm: Float32Array, inicioSegundos: number): void {
    this.trechos.push({ inicio: Math.round(inicioSegundos * HZ), dados: pcm });
  }

  /** Corte para a voz parar agora; mantém apenas a cauda já efetivamente tocada. */
  cortar(agoraSegundos: number): void {
    const agora = Math.round(agoraSegundos * HZ);
    this.trechos = this.trechos.filter((t) => t.inicio < agora).map((t) => ({
      inicio: t.inicio, dados: t.dados.subarray(0, Math.max(0, agora - t.inicio)),
    }));
  }

  analisar(pcm: Int16Array, fimSegundos: number): AnaliseEco {
    const microfone = reduzir(pcm, 1 / 32768);
    const fim = Math.round(fimSegundos * HZ);
    const inicio = fim - pcm.length - ATRASO_MAX;
    this.trechos = this.trechos.filter((t) => t.inicio + t.dados.length > inicio);
    if (this.referencia.length !== ATRASO_MAX + pcm.length) {
      this.referencia = new Float32Array(ATRASO_MAX + pcm.length);
      this.medias = new Float32Array(this.referencia.length);
    } else this.referencia.fill(0);
    const referencia = this.referencia;
    let temReferencia = false;
    for (const t of this.trechos) {
      const de = Math.max(inicio, t.inicio);
      const ate = Math.min(fim, t.inicio + t.dados.length);
      if (ate <= de) continue;
      referencia.set(t.dados.subarray(de - t.inicio, ate - t.inicio), de - inicio);
      temReferencia = true;
    }
    let energiaMic = 0;
    for (const v of microfone) energiaMic += v * v;
    const vazio = { eco: false, correlacao: 0, residual: Math.sqrt(energiaMic / (microfone.length || 1)), referencia: temReferencia };
    if (!temReferencia || !microfone.length || vazio.residual < 0.003) return vazio;
    // Médias móveis na referência preservam a fase de24kHz. A busca grossa
    // usa3kHz, depois refina o melhor atraso amostra a amostra (não só múltiplos de8).
    const medias = this.medias;
    let soma = 0;
    for (let i = referencia.length - 1; i >= 0; i--) {
      soma += referencia[i] - (referencia[i + PASSO] || 0);
      medias[i] = soma / PASSO;
    }
    let melhor = 0;
    let melhorAtraso = 0;
    const comparar = (atraso: number): void => {
      const offset = ATRASO_MAX - atraso;
      let energiaRef = 0;
      let produto = 0;
      for (let i = 0; i < microfone.length; i++) {
        const r = medias[offset + i * PASSO];
        energiaRef += r * r;
        produto += r * microfone[i];
      }
      if (energiaRef < 0.00001) return;
      const quadrado = produto * produto / (energiaMic * energiaRef);
      if (quadrado > melhor) { melhor = Math.min(1, quadrado); melhorAtraso = atraso; }
    };
    // Eco mantém um percurso relativamente estável. Refinar o último atraso
    // confirmado evita trocar a fase correta por outro período da mesma vogal.
    if (this.atrasoConfirmado !== null) {
      for (let atraso = Math.max(0, this.atrasoConfirmado - 24); atraso <= Math.min(ATRASO_MAX, this.atrasoConfirmado + 24); atraso++) comparar(atraso);
    }
    for (let atraso = 0; atraso <= ATRASO_MAX; atraso += PASSO) comparar(atraso);
    const candidato = melhorAtraso;
    for (let atraso = Math.max(0, candidato - PASSO + 1); atraso <= Math.min(ATRASO_MAX, candidato + PASSO - 1); atraso++) comparar(atraso);
    const residual = Math.sqrt(energiaMic * (1 - melhor) / microfone.length);
    const eco = melhor >= 0.96 ** 2 && residual < 0.008;
    if (eco) this.atrasoConfirmado = melhorAtraso;
    // >=96% de correlação e residual absoluto baixo: não silenciar fala dupla.
    return { eco, correlacao: Math.sqrt(melhor), residual, referencia: true };
  }
}
