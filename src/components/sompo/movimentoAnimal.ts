/** Resposta visual ao contato; o jogo continua sendo a fonte da colisão. */
export interface MovimentoAnimal {
  /** Rumo próprio: no jogo a travessia é reta; no roteiro segue a curva do pasto. */
  yaw?: number;
  impacto?: { velocidadeMs: number; avancoX: number; avancoZ: number; avancoY?: number; lado: 1 | -1 };
}

export function poseImpactoAnimal(idadeMs: number | null, movimento?: MovimentoAnimal) {
  if (idadeMs === null) return { queda: 0, rolagem: 0, x: 0, y: 0, z: 0 };
  const impacto = movimento?.impacto;
  const v = Math.max(0, impacto?.velocidadeMs ?? 0);
  const duracaoMs = Math.max(650, 1400 - v * 18);
  const t = Math.max(0, idadeMs) / 1000;
  const progresso = Math.min(1, Math.max(0, idadeMs) / duracaoMs);
  const queda = progresso * progresso * (3 - 2 * progresso);
  // Começa na pose de contato. A queda acelera com a velocidade e assenta sem saltar.
  const assenta = Math.max(0, t - duracaoMs / 1000);
  const lado = impacto?.lado ?? 1;
  const rolagem = lado * (queda * 1.45 - .045 * Math.sin(assenta * 14) * Math.exp(-assenta * 6));
  return { queda, rolagem,
    x: (impacto?.avancoX ?? 0) + (impacto ? 0 : queda * .4),
    y: impacto?.avancoY ?? 0,
    z: (impacto?.avancoZ ?? 0) + (impacto ? 0 : queda * .35) };
}
