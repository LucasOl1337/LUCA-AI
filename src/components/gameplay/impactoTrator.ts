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

/**
 * Trepidação da cabine pela velocidade (Lupa D6, 24/10). No modo dirigir o palco
 * zera aspereza e trepidação do roteiro, então a cabine a 12 km/h era tão imóvel
 * quanto parada e a velocidade só aparecia no número. Aqui o olho treme pouco e
 * rápido (motor e rodado no chão arado), com amplitude proporcional à velocidade
 * em relação ao teto livre. Só a câmera de cabine; a física e a vista externa não mudam.
 */
export const TREPIDACAO = Object.freeze({
  /** Velocidade de amplitude cheia (teto livre). */
  cheiaKph: 12,
  arfagemGraus: 0.22,
  rolagemGraus: 0.14,
  alturaM: 0.012,
});

/** Deslocamento do olho em `tS` segundos a `velocidadeKph` (ré conta igual). Determinístico. */
export function trepidacaoCabine(velocidadeKph: number, tS: number, reduzirMovimento = false) {
  const k = reduzirMovimento || !Number.isFinite(velocidadeKph) || !Number.isFinite(tS) ? 0 : Math.min(1, Math.abs(velocidadeKph) / TREPIDACAO.cheiaKph);
  if (k === 0) return { arfagemGraus: 0, rolagemGraus: 0, alturaM: 0 };
  const dois = 2 * Math.PI;
  // Somas de senos em frequências não harmônicas: tremor que não vira balanço regular.
  const arfagem = (Math.sin(dois * 8.7 * tS) + 0.6 * Math.sin(dois * 13.3 * tS + 1.1)) / 1.6;
  const rolagem = (Math.sin(dois * 6.1 * tS + 0.4) + 0.5 * Math.sin(dois * 11.9 * tS + 2.3)) / 1.5;
  const altura = (Math.sin(dois * 2.3 * tS) + 0.4 * Math.sin(dois * 9.1 * tS + 0.8)) / 1.4;
  return {
    arfagemGraus: k * TREPIDACAO.arfagemGraus * arfagem,
    rolagemGraus: k * TREPIDACAO.rolagemGraus * rolagem,
    alturaM: k * TREPIDACAO.alturaM * altura,
  };
}

/**
 * Arfagem de carga (Lupa, fila vazia item 1, 24/10). No plano, frear forte (3,5 m/s²) e arrancar
 * davam arfagem 0°: o freio só aparecia no velocímetro. Agora a suspensão/pneus cedem: o nariz
 * desce ao frear e sobe um pouco ao acelerar, proporcional à aceleração longitudinal, amortecido.
 * Só pose (pitchDeg do drive); a física não muda.
 */
export const CARGA = Object.freeze({
  /** graus por m/s² (negativo = nariz para baixo na desaceleração). */
  grausPorMs2: 0.25,
  maxGraus: 1.2,
  tauS: 0.15,
  /** Acima disso (m/s²) é salto de estado, não frenagem: freio cheio é 3,5. */
  descontinuidadeMs2: 20,
});

/** Estado amortecido; `passo(velocidade m/s com sinal, dt)` devolve a arfagem extra em graus (positivo = nariz para cima). */
export function criarArfagemCarga() {
  let anterior: number | null = null, arfagem = 0;
  return {
    passo(velocidade: number, dt: number, reduzirMovimento = false) {
      if (!Number.isFinite(velocidade) || !(dt > 0) || !Number.isFinite(dt) || reduzirMovimento) {
        anterior = Number.isFinite(velocidade) ? velocidade : null;
        if (reduzirMovimento) arfagem = 0;
        return arfagem;
      }
      const passoS = Math.min(dt, 0.1);
      // Aceleração com sinal do referencial da máquina: frear de frente ou acelerar de ré afundam o nariz (inércia para a frente).
      let acel = anterior === null ? 0 : (velocidade - anterior) / passoS;
      anterior = velocidade;
      // Descontinuidade (batida, reinício, teleporte) não é carga: a batida já tem o tranco do D4.
      if (Math.abs(acel) > CARGA.descontinuidadeMs2) acel = 0;
      const alvo = Math.max(-CARGA.maxGraus, Math.min(CARGA.maxGraus, acel * CARGA.grausPorMs2));
      arfagem += (alvo - arfagem) * (1 - Math.exp(-passoS / CARGA.tauS));
      return arfagem;
    },
    reiniciar() { anterior = null; arfagem = 0; },
  };
}
