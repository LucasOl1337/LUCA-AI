/** Props ambientais Scenario: metros, +Y chão. Fora do corredor dos desafios. */
export const MODELOS_RURAIS = {
  barril: { url: '/models/scenario/barril.glb', alturaM: 1.05, raioM: 0.54 },
  carroca: { url: '/models/scenario/carroca.glb', alturaM: 1.65, raioM: 1.4 },
  rochas: { url: '/models/scenario/rochas.glb', alturaM: 1.35, raioM: 1.9 },
} as const;
export type ModeloRural = keyof typeof MODELOS_RURAIS;
export const PROPS_RURAIS: readonly { id: string; modelo: ModeloRural; x: number; z: number; rumo: number }[] = Object.freeze([
  { id: 'barril-patio-1', modelo: 'barril', x: -5, z: -7, rumo: 0.2 },
  { id: 'barril-patio-2', modelo: 'barril', x: -3.6, z: -7.3, rumo: -0.4 },
  { id: 'carroca-patio', modelo: 'carroca', x: 2, z: -9, rumo: -0.7 },
  { id: 'rocha-margem', modelo: 'rochas', x: -4, z: -12, rumo: 0.3 },
]);
export const COLISORES_RURAIS = Object.freeze(PROPS_RURAIS.map((p) => Object.freeze({
  x: p.x, z: p.z, raioM: MODELOS_RURAIS[p.modelo].raioM, tipo: 'cenario' as const,
})));
