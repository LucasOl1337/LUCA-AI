/**
 * Queda e parada do caminhão depois do fim da corrida (a física congela no
 * quadro do fim; isto é só a cena). Pura, em função do tempo desde o impacto:
 * no tombamento a carroceria gira em volta da roda de fora (a linha de contato
 * fica no chão, nada afunda no asfalto), deslizando de lado até parar, com um
 * ricochete curto ao bater; nos outros fins o caminhão desacelera até parar e a
 * rolagem da suspensão volta a zero.
 */
import type { MotivoCircuito } from '../gameplay/circuito';
import { CAMINHAO } from './fisicaCaminhao';

export const QUEDA = Object.freeze({
  /** Tombado de lado: 86° (a carroceria apoia na lateral, não em 90° cravado). */
  anguloFinalRad: 1.5,
  /** Tempo da carroceria sair da rolagem da suspensão até bater de lado. */
  duracaoS: 1.1,
  /** Ricochete ao bater de lado: amplitude (rad), período (s) e decaimento (1/s). */
  ricocheteRad: 0.07, ricochetePeriodoS: 0.45, ricocheteDecaimento: 4,
  /** Desaceleração depois do fim (m/s²): de lado no asfalto, batida, saída pelo barranco, chegada rolando, cascalho. */
  desaceleracao: Object.freeze<Record<MotivoCircuito | 'padrao', number>>({ tombamento: 5.5, colisao: 7, saida_pista: 4.5, chegada: 2.5, area_escape: 6, atolamento: 6, abandono: 6, padrao: 6 }),
  /** Teto do deslize para a chegada não rolar a serra inteira. */
  deslizeMaxM: 60,
});

export interface Impacto { motivo: MotivoCircuito; velocidadeMs: number; rolagemRad: number; /** +1 = tomba para a direita. */ lado: 1 | -1 }
export interface PoseQueda {
  /** Rolagem da carroceria (rad, positivo = lado direito para baixo). */
  rolagemRad: number;
  /** Quanto o caminhão andou no rumo do impacto (m) e a velocidade que resta (m/s). */
  avancoM: number; velocidadeMs: number;
  /** Deslocamento lateral do pivô (m, positivo à direita) e altura do pivô sobre o chão (m). */
  lateralM: number; alturaM: number;
  /** Já parou e assentou. */
  parado: boolean;
}

const limitar = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Ângulo da carroceria `t` s depois do tombamento, a partir da rolagem que a suspensão já tinha. */
export function anguloDoTombo(tS: number, rolagemInicialRad: number) {
  const inicio = limitar(Math.abs(rolagemInicialRad), 0, QUEDA.anguloFinalRad * 0.5);
  if (tS <= 0) return inicio;
  if (tS < QUEDA.duracaoS) {
    // Cai como pêndulo invertido: devagar no começo, rápido no fim (∝ t²).
    const f = (tS / QUEDA.duracaoS) ** 2;
    return inicio + (QUEDA.anguloFinalRad - inicio) * f;
  }
  const dt = tS - QUEDA.duracaoS;
  return QUEDA.anguloFinalRad - QUEDA.ricocheteRad * Math.sin(Math.PI * 2 * dt / QUEDA.ricochetePeriodoS) * Math.exp(-dt * QUEDA.ricocheteDecaimento);
}

/** Deslize no rumo do impacto com desaceleração constante. */
export function deslize(tS: number, v0: number, desaceleracao: number) {
  const v = Math.max(0, v0 - desaceleracao * Math.max(0, tS));
  const tParada = desaceleracao > 0 ? v0 / desaceleracao : 0;
  const t = Math.min(Math.max(0, tS), tParada);
  const avanco = Math.min(QUEDA.deslizeMaxM, v0 * t - desaceleracao * t * t / 2);
  return { avancoM: avanco, velocidadeMs: avanco >= QUEDA.deslizeMaxM ? 0 : v };
}

/**
 * Pose da carroceria `tS` s depois do impacto. O pivô do modelo fica a
 * `alturaPivoM` do chão sobre o eixo; ao tombar, gira em volta da linha de
 * contato da roda de fora (meia largura `w`): o pivô vai para
 * (w − w·cosθ + h·sinθ, w·sinθ + h·cosθ), e a 90° fica deitado a w do chão.
 */
export function poseDaQueda(impacto: Impacto, tS: number, alturaPivoM: number): PoseQueda {
  const h = alturaPivoM, w = CAMINHAO.meiaLarguraM;
  const a = QUEDA.desaceleracao[impacto.motivo] ?? QUEDA.desaceleracao.padrao;
  const { avancoM, velocidadeMs } = deslize(tS, Math.max(0, impacto.velocidadeMs), a);
  if (impacto.motivo === 'tombamento') {
    const ang = anguloDoTombo(tS, impacto.rolagemRad);
    return {
      rolagemRad: impacto.lado * ang, avancoM, velocidadeMs,
      lateralM: impacto.lado * (w - w * Math.cos(ang) + h * Math.sin(ang)), alturaM: w * Math.sin(ang) + h * Math.cos(ang),
      parado: velocidadeMs === 0 && tS > QUEDA.duracaoS + 1.5,
    };
  }
  // Sem tombo: a suspensão assenta (rolagem → 0 em ~0,6 s) e o caminhão só para.
  const assenta = Math.exp(-Math.max(0, tS) * 5);
  return { rolagemRad: impacto.rolagemRad * assenta, avancoM, velocidadeMs, lateralM: 0, alturaM: h, parado: velocidadeMs === 0 && assenta < 0.05 };
}
