/**
 * Evento `animal-na-pista`: um Nelore atravessa a reta antes da curva do pasto.
 * Puro. Começa a andar quando o caminhão chega a `SERRA.animalGatilhoM` dele,
 * sai do acostamento esquerdo, para no meio da pista (boi para) e termina a
 * travessia. `lateral` positivo = à direita do sentido de descida.
 */
import { pontoLateral, SERRA, type PistaSerra } from './pistaSerra';
import { CAMINHAO, type EstadoCaminhao } from './fisicaCaminhao';

export const ANIMAL = Object.freeze({
  lateralInicio: -8.5, lateralParada: 1.8, lateralFim: 10,
  velocidadeMs: 1.6, paradaS: 3, raioM: 0.75,
  /** Alcance do radar frontal do caminhão (m) e meia largura do feixe (m). */
  // Radar 50% mais longe (Lucas, 24/10): 70 -> 105 m, junto com o TTC de RADAR_ANIMAL em corridaPista.
  radarM: 105, radarMeiaLarguraM: 1.9,
});

export interface EstadoAnimal { ativo: boolean; t: number; lateral: number; andando: boolean; atingido: boolean; x: number; z: number; rumo: number }

export function criarAnimal(pista: PistaSerra): EstadoAnimal {
  const p = pontoLateral(pista, SERRA.animalS, ANIMAL.lateralInicio);
  return { ativo: false, t: 0, lateral: ANIMAL.lateralInicio, andando: false, atingido: false, x: p.x, z: p.z, rumo: p.rumo };
}

/** Lateral do animal `t` s depois de partir: anda, para, anda. */
export function lateralDoAnimal(t: number) {
  const ida = (ANIMAL.lateralParada - ANIMAL.lateralInicio) / ANIMAL.velocidadeMs;
  if (t <= ida) return { lateral: ANIMAL.lateralInicio + t * ANIMAL.velocidadeMs, andando: true };
  if (t <= ida + ANIMAL.paradaS) return { lateral: ANIMAL.lateralParada, andando: false };
  const l = ANIMAL.lateralParada + (t - ida - ANIMAL.paradaS) * ANIMAL.velocidadeMs;
  return { lateral: Math.min(ANIMAL.lateralFim, l), andando: l < ANIMAL.lateralFim };
}

export function passoAnimal(a: EstadoAnimal, caminhao: EstadoCaminhao, dt: number, pista: PistaSerra): EstadoAnimal {
  if (a.atingido) return a;
  const ativo = a.ativo || caminhao.s >= SERRA.animalS - SERRA.animalGatilhoM;
  if (!ativo) return a;
  const t = a.t + Math.max(0, dt);
  const { lateral, andando } = lateralDoAnimal(t);
  const p = pontoLateral(pista, SERRA.animalS, lateral);
  return { ativo, t, lateral, andando, atingido: false, x: p.x, z: p.z, rumo: p.rumo };
}

/** Animal no referencial do caminhão: `frente` m à frente do pivô, `lado` m à direita. */
export function animalNoCaminhao(a: Pick<EstadoAnimal, 'x' | 'z'>, c: Pick<EstadoCaminhao, 'x' | 'z' | 'rumo'>) {
  const dx = a.x - c.x, dz = a.z - c.z;
  return { frente: dx * Math.cos(c.rumo) - dz * Math.sin(c.rumo), lado: dx * Math.sin(c.rumo) + dz * Math.cos(c.rumo) };
}

/** Corpo do caminhão (retângulo) encosta no animal. */
export function bateuNoAnimal(a: EstadoAnimal, c: EstadoCaminhao) {
  if (!a.ativo || a.atingido) return false;
  const r = animalNoCaminhao(a, c);
  return r.frente > -4.5 - ANIMAL.raioM && r.frente < CAMINHAO.frenteM + ANIMAL.raioM && Math.abs(r.lado) < CAMINHAO.meiaLarguraM + ANIMAL.raioM;
}

/**
 * Radar frontal (didático): distância da frente do caminhão ao animal quando ele
 * está no feixe à frente. TTC = distância / velocidade.
 */
export function radarAnimal(a: EstadoAnimal, c: EstadoCaminhao) {
  if (!a.ativo || a.atingido) return null;
  const r = animalNoCaminhao(a, c);
  const distanciaM = r.frente - CAMINHAO.frenteM - ANIMAL.raioM;
  if (distanciaM < -0.5 || distanciaM > ANIMAL.radarM || Math.abs(r.lado) > CAMINHAO.meiaLarguraM + ANIMAL.radarMeiaLarguraM) return null;
  const d = Math.max(0, distanciaM);
  return { distanciaM: d, ttcS: c.velocidade > 0.3 ? d / c.velocidade : Infinity };
}
