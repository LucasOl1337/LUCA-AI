/**
 * Retorno da batida (Lupa D4, 24/10): o trator parava seco num quadro, sem a
 * imagem mexer nem som; parecia travamento, não colisão. No evento `contato`
 * do motor, a máquina dá um tranco curto de arfagem (nariz desce e volta) e
 * toca um baque grave, ambos proporcionais à velocidade de entrada. A física
 * não muda: é só pose e som. Puro e sem three.js, para o teste medir.
 */
import { saidaEfeito, somCompartilhado, type SomCompartilhado } from './somCompartilhado';

export const IMPACTO = Object.freeze({
  /** Abaixo disso é encostar devagar: sem tranco nem baque. */
  minKph: 0.8,
  /** Amplitude do tranco por km/h de entrada, com teto. */
  grausPorKph: 0.4,
  maxGraus: 4.5,
  /** Oscilação amortecida que termina em zero exato no fim da janela. */
  freqHz: 4.5,
  tauS: 0.12,
  duracaoS: 0.45,
});

/** Arfagem extra (graus, negativo = nariz para baixo) `desdeS` depois de bater a `velocidadeKph`. */
export function arfagemImpacto(velocidadeKph: number, desdeS: number) {
  if (!Number.isFinite(velocidadeKph) || !Number.isFinite(desdeS)) return 0;
  if (velocidadeKph < IMPACTO.minKph || desdeS <= 0 || desdeS >= IMPACTO.duracaoS) return 0;
  const amplitude = Math.min(IMPACTO.maxGraus, velocidadeKph * IMPACTO.grausPorKph);
  const envelope = Math.exp(-desdeS / IMPACTO.tauS) * (1 - desdeS / IMPACTO.duracaoS);
  const valor = -amplitude * Math.sin(2 * Math.PI * IMPACTO.freqHz * desdeS) * envelope;
  return valor === 0 ? 0 : valor;
}

/** Estado do tranco em curso; `inicioMs` no relógio de `agora`. */
export interface Tranco { velocidadeKph: number; inicioMs: number }

export function arfagemDoTranco(tranco: Tranco | null, agoraMs: number, reduzirMovimento = false) {
  if (!tranco || reduzirMovimento) return 0;
  return arfagemImpacto(tranco.velocidadeKph, (agoraMs - tranco.inicioMs) / 1000);
}

/** Volume do baque (0..0,35) pela velocidade de entrada. */
export function volumeBaque(velocidadeKph: number) {
  if (!Number.isFinite(velocidadeKph) || velocidadeKph < IMPACTO.minKph) return 0;
  return Math.min(0.35, 0.08 + velocidadeKph * 0.024);
}

/** Baque grave sintetizado (seno que cai de 110 para 45 Hz em 0,22 s), pela chave dos efeitos. */
export function criarBaque(som: SomCompartilhado = somCompartilhado) {
  return {
    tocar(velocidadeKph: number) {
      const volume = volumeBaque(velocidadeKph);
      const ctx = volume > 0 ? som.obter() : null;
      if (!ctx || ctx.state !== 'running') return false;
      const osc = ctx.createOscillator(), ganho = ctx.createGain(), t = ctx.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(110, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.22);
      ganho.gain.setValueAtTime(0, t);
      ganho.gain.linearRampToValueAtTime(volume, t + 0.008);
      ganho.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
      ganho.gain.setValueAtTime(0, t + 0.27);
      osc.connect(ganho).connect(saidaEfeito(som, ctx));
      osc.onended = () => { osc.disconnect(); ganho.disconnect(); };
      osc.start(t); osc.stop(t + 0.28);
      return true;
    },
  };
}
