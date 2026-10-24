/**
 * Mapa do painel do operador (pedido do Linz, 24/10): trator em escala e zonas
 * de risco do talhão pintadas pelas regras que o circuito já usa. Puro, em
 * metros, no referencial do palco (rumo 0 = +X, frente = (cos h, -sin h)).
 * Nada aqui cria limite novo: cada número vem de uma regra existente, citada.
 */
import { INICIO_CIRCUITO } from './circuito';
import { TRATOR } from './fisicaTrator';
import { ZONAS_TALHAO } from './geofenceTalhao';
import { COLISORES_RURAIS } from './propsRurais';
import { RAMPA_LATERAL, relevoRampaLateral } from './rampaLateral';

/**
 * Medidas do Trator MAX no jogo. Escala de configuração do brinquedo MAX TRATOR
 * (`max-tractor.provenance.json`), não máquina real.
 * Corpo: `SOMPO_AGRI_EQUIPMENT['max-tractor'].nominalSizeM` (4,5 × 2,7 m).
 * Rodas: `SOMPO_AGRI_RIG_LAYOUT['max-tractor'].axles` (x à frente, z meia bitola).
 */
export const TRATOR_MAX_MAPA = Object.freeze({
  comprimentoM: 4.5,
  larguraM: 2.7,
  entreEixosM: TRATOR.entreEixosM,
  bitolaM: TRATOR.bitolaM,
  sensorFrenteM: TRATOR.sensorFrenteM,
  rodas: Object.freeze([
    Object.freeze({ x: 1.3391, z: 0.8972, raio: 0.6827, interno: 0.7022 }),
    Object.freeze({ x: -1.3234, z: 1.0435, raio: 0.8972, interno: 0.7705 }),
  ]),
});

/** `riscosCircuito`: encosta em atenção a partir de 12° de rolagem, crítica a partir de 20°. */
export const ENCOSTA_ATENCAO_GRAUS = 12;
export const ENCOSTA_CRITICA_GRAUS = 20;
/** `REGRAS_CIRCUITO`: colisão com o corpo a menos de raio do fardo + 1,05 m. */
export const FOLGA_COLISAO_M = 1.05;
/** `passoTrator`: props do cenário param a máquina a raio + meia bitola. */
export const FOLGA_PROP_M = TRATOR.bitolaM / 2;

export type CenarioMapa = 'circuito' | 'desafios' | 'percurso' | null;
export interface CelulaEncosta { x: number; z: number; graus: number }

/**
 * Inclinação máxima do terreno da rampa lateral (o único relevo que a física
 * do gameplay inclina), numa grade de 1 m. É o pior caso: a rolagem real
 * depende do rumo, por isso o mapa chama de "pode tombar" e não de "tombou".
 */
export function celulasEncosta(passoM = 1): CelulaEncosta[] {
  const r = RAMPA_LATERAL, h = 0.25, celulas: CelulaEncosta[] = [];
  for (let x = r.inicioX; x < r.fimX; x += passoM) {
    for (let z = r.sopeZ; z < r.peZ + passoM; z += passoM) {
      const cx = x + passoM / 2, cz = z + passoM / 2;
      const gx = (relevoRampaLateral(cx + h, cz) - relevoRampaLateral(cx - h, cz)) / (2 * h);
      const gz = (relevoRampaLateral(cx, cz + h) - relevoRampaLateral(cx, cz - h)) / (2 * h);
      const graus = Math.atan(Math.hypot(gx, gz)) * 180 / Math.PI;
      if (graus >= ENCOSTA_ATENCAO_GRAUS) celulas.push({ x, z, graus: Math.round(graus * 10) / 10 });
    }
  }
  return celulas;
}

let cache: { atencao: CelulaEncosta[]; critica: CelulaEncosta[] } | null = null;
/** Grade calculada uma vez por página (são ~500 células). */
export function encostaPorFaixa() {
  if (!cache) {
    const todas = celulasEncosta();
    cache = { atencao: todas.filter((c) => c.graus < ENCOSTA_CRITICA_GRAUS), critica: todas.filter((c) => c.graus >= ENCOSTA_CRITICA_GRAUS) };
  }
  return cache;
}

/** Obstáculos com raio de colisão. Fardos e estacas só são conhecidos no circuito; os do desafio mudam por desafio. */
export function obstaculosDoMapa(cenario: CenarioMapa) {
  const circuito = cenario === 'circuito'
    ? (INICIO_CIRCUITO.obstaculos ?? []).map((o) => ({ x: o.x, z: o.z, raioM: o.raioM, folgaM: FOLGA_COLISAO_M, tipo: o.tipo === 'estaca' ? 'estaca' as const : 'fardo' as const }))
    : [];
  const props = COLISORES_RURAIS.map((o) => ({ x: o.x, z: o.z, raioM: o.raioM, folgaM: FOLGA_PROP_M, tipo: 'cenario' as const }));
  return [...circuito, ...props];
}

const distRetangulo = (p: { x: number; z: number }, x0: number, x1: number, z0: number, z1: number) =>
  Math.hypot(Math.max(x0 - p.x, 0, p.x - x1), Math.max(z0 - p.z, 0, p.z - z1));

/**
 * Distância do centro da máquina até a faixa vermelha mais perto (área alagada,
 * encosta ≥ 20° ou raio de colisão de um obstáculo conhecido). 0 = dentro dela.
 */
export function faixaVermelhaMaisPerto(p: { x: number; z: number }, cenario: CenarioMapa): { rotulo: string; distanciaM: number } {
  let melhor = { rotulo: '', distanciaM: Infinity };
  const ver = (rotulo: string, d: number) => { if (d < melhor.distanciaM) melhor = { rotulo, distanciaM: Math.max(0, d) }; };
  for (const zona of ZONAS_TALHAO) {
    const anel = zona.poligono.rings[0], xs = anel.map((a) => a.x), zs = anel.map((a) => a.z);
    ver(zona.rotulo, distRetangulo(p, Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)));
  }
  for (const c of encostaPorFaixa().critica) ver(`Encosta ≥ ${ENCOSTA_CRITICA_GRAUS}°`, distRetangulo(p, c.x, c.x + 1, c.z, c.z + 1));
  for (const o of obstaculosDoMapa(cenario)) {
    ver(o.tipo === 'fardo' ? 'Fardo' : o.tipo === 'estaca' ? 'Estaca' : 'Obstáculo do cenário', Math.hypot(p.x - o.x, p.z - o.z) - o.raioM - o.folgaM);
  }
  return melhor;
}
