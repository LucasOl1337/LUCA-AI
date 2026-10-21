/**
 * Geofence do talhão no gameplay (pedido do Linz, 20/10 12:29): uma zona de
 * risco desenhada no talhão e o LUCA avisando quando a máquina vai para ela.
 * Puro, em metros, no referencial do palco (estadoGameplay.ts: rumo 0 = +X,
 * frente = (cos h, -sin h)). O ponto-no-polígono é o do laboratório
 * (shared/lab-telemetry.js), o mesmo do geofence do /sompo.
 */
import { polygonContains, type LabPolygon } from '../../../shared/lab-telemetry.js';
import { RAMPA_LATERAL } from './rampaLateral';

export interface ZonaRisco { id: string; rotulo: string; poligono: LabPolygon }
export type NivelGeofence = 'fora' | 'rumo' | 'dentro';
export interface GeofenceTalhao { nivel: NivelGeofence; zona: ZonaRisco | null }

/** Retângulo fechado (o anel repete o primeiro ponto, como no GeoJSON). */
const retangulo = (id: string, x0: number, x1: number, z0: number, z1: number): LabPolygon => ({
  id, role: 'hazard',
  rings: [[{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }, { x: x0, z: z0 }]],
});

/** Contorno do talhão no minimapa: 100 × 100 m em volta da partida. */
export const TALHAO = Object.freeze({ x0: -20, x1: 80, z0: -50, z1: 50 });

/**
 * Área alagada à direita do percurso do fardo: quem segue reto não entra,
 * quem esterça para a direita entra em ~10 m. Longe da rampa (lado esquerdo).
 */
export const ZONAS_TALHAO: readonly ZonaRisco[] = Object.freeze([
  { id: 'alagado', rotulo: 'Área alagada', poligono: retangulo('alagado', 12, 42, 9, 24) },
]);

/** Encosta da rampa lateral: só contexto no mapa (a inclinação já tem alerta próprio). */
export const ENCOSTA_TALHAO = retangulo('encosta', RAMPA_LATERAL.inicioX, RAMPA_LATERAL.fimX, RAMPA_LATERAL.planaltoZ, RAMPA_LATERAL.peZ);

/** Olha 3 s à frente no sentido do movimento; abaixo de 2 km/h não projeta (manobra parada não apita). */
export const GEOFENCE_HORIZONTE_S = 3;
export const GEOFENCE_MIN_KPH = 2;
const PASSO_S = 0.25;

export function geofenceTalhao(
  maquina: { x: number; z: number; rumoGraus: number; velocidadeKph: number; re: boolean },
  zonas: readonly ZonaRisco[] = ZONAS_TALHAO,
): GeofenceTalhao {
  const ponto = { x: maquina.x, z: maquina.z };
  const dentro = zonas.find((zona) => polygonContains(ponto, zona.poligono));
  if (dentro) return { nivel: 'dentro', zona: dentro };
  if (maquina.velocidadeKph < GEOFENCE_MIN_KPH) return { nivel: 'fora', zona: null };
  const h = maquina.rumoGraus * Math.PI / 180, sentido = maquina.re ? -1 : 1;
  const ms = maquina.velocidadeKph / 3.6 * sentido;
  for (let t = PASSO_S; t <= GEOFENCE_HORIZONTE_S + 1e-9; t += PASSO_S) {
    const adiante = { x: maquina.x + Math.cos(h) * ms * t, z: maquina.z - Math.sin(h) * ms * t };
    const zona = zonas.find((z) => polygonContains(adiante, z.poligono));
    if (zona) return { nivel: 'rumo', zona };
  }
  return { nivel: 'fora', zona: null };
}
