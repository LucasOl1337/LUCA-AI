/**
 * Evento `animal-na-pista`: um Nelore atravessa a reta antes da curva do pasto.
 * Puro. Começa a andar quando o caminhão chega a `SERRA.animalGatilhoM` dele,
 * sai do acostamento esquerdo, para no meio da pista (boi para) e termina a
 * travessia. `lateral` positivo = à direita do sentido de descida.
 */
import { pontoLateral, SERRA, type PistaSerra } from './pistaSerra';
import { CAMINHAO, type EstadoCaminhao } from './fisicaCaminhao';
import { SOMPO_ANIMAL_SIZE } from '../../../shared/sompo-scenario-effects.js';

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

type QuadroContato = { animal: EstadoAnimal; caminhao: EstadoCaminhao };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const giro = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const eixos = (rumo: number) => [{ x: Math.cos(rumo), z: -Math.sin(rumo) }, { x: Math.sin(rumo), z: Math.cos(rumo) }];

/**
 * SAT contínuo: os retângulos varrem o deslocamento relativo no quadro, inclusive
 * quando os dois extremos estão livres. Animal: largura ao longo da pista,
 * comprimento atravessando-a (a mesma orientação e medidas do modelo).
 * Giros são divididos em arcos de até 2°; a margem do arco cobre a rotação
 * entre as poses sem deixar passar uma quina durante um quadro lento.
 * Retorna a fração do primeiro contato, para congelar a corrida nesse ponto.
 */
export function instanteDoContato(a: EstadoAnimal, c: EstadoCaminhao, anterior?: QuadroContato): number | null {
  if (!a.ativo || a.atingido) return null;
  const a0 = anterior?.animal ?? a, c0 = anterior?.caminhao ?? c;
  const dc = giro(c0.rumo, c.rumo), da = giro(a0.rumo, a.rumo);
  const partes = Math.max(1, Math.ceil(Math.max(Math.abs(dc), Math.abs(da)) / (Math.PI / 90)));
  const hc = [(CAMINHAO.frenteM + CAMINHAO.trasM) / 2, CAMINHAO.meiaLarguraM];
  const ha = [SOMPO_ANIMAL_SIZE.width / 2, SOMPO_ANIMAL_SIZE.length / 2];
  const centro = (t: number) => {
    const rumo = c0.rumo + dc * t, offset = (CAMINHAO.frenteM - CAMINHAO.trasM) / 2;
    return { x: lerp(a0.x, a.x, t) - lerp(c0.x, c.x, t) - Math.cos(rumo) * offset,
      z: lerp(a0.z, a.z, t) - lerp(c0.z, c.z, t) + Math.sin(rumo) * offset };
  };
  for (let i = 0; i < partes; i += 1) {
    const t0 = i / partes, t1 = (i + 1) / partes, meio = (t0 + t1) / 2;
    const ec = eixos(c0.rumo + dc * meio), ea = eixos(a0.rumo + da * meio);
    const inicio = centro(t0), fim = centro(t1);
    const margem = Math.hypot(...hc) * Math.abs(dc) / partes / 2 + Math.hypot(...ha) * Math.abs(da) / partes / 2;
    let entrada = 0, saida = 1;
    for (const eixo of [...ec, ...ea]) {
      const produto = (v: { x: number; z: number }) => v.x * eixo.x + v.z * eixo.z;
      const raio = hc[0] * Math.abs(produto(ec[0])) + hc[1] * Math.abs(produto(ec[1]))
        + ha[0] * Math.abs(produto(ea[0])) + ha[1] * Math.abs(produto(ea[1])) + margem;
      const p = produto(inicio), v = produto(fim) - p;
      if (Math.abs(v) < 1e-10) { if (Math.abs(p) > raio) { entrada = Infinity; break; } }
      else {
        const u = (-raio - p) / v, w = (raio - p) / v;
        entrada = Math.max(entrada, Math.min(u, w)); saida = Math.min(saida, Math.max(u, w));
        if (entrada > saida) break;
      }
    }
    if (entrada <= saida) return lerp(t0, t1, entrada);
  }
  return null;
}

/** Corpo do caminhão encosta no envoltório orientado do animal. */
export function bateuNoAnimal(a: EstadoAnimal, c: EstadoCaminhao) {
  return instanteDoContato(a, c) !== null;
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
