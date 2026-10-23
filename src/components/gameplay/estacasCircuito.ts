import type { ObstaculoGameplay } from './estadoGameplay';

/** Projeção horizontal da placa (0,12 × 0,65 m), incluindo o poste. */
export const RAIO_ESTACA_M = Math.hypot(0.12, 0.65) / 2;

/** Fonte única para desenho, sensor e contato. A faixa de chegada é transitável. */
export function estacasCircuito(rota: readonly { x: number; z: number }[]): ObstaculoGameplay[] {
  return rota.flatMap((p) => [-1, 1].map((lado) => ({
    x: p.x, z: p.z + lado * 5, raioM: RAIO_ESTACA_M, tipo: 'estaca' as const,
  })));
}
