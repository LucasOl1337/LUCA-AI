/**
 * Rampa lateral do Gameplay (item 3): um talude ao lado do percurso do fardo,
 * só no palco do gameplay. Quem dirige ao longo da face (rumo +X, z ≈ -15,75)
 * roda com o lado esquerdo para cima a ~22°, o bastante para o classificador
 * de inclinação da Operador (20°) acender. Puro, em metros, no referencial do
 * palco agrícola; o palco soma isto ao relevo do talhão e a física lê o mesmo
 * `groundHeight`, então o que se vê é o que inclina.
 */
import { TRATOR } from './fisicaTrator';

export const RAMPA_LATERAL = Object.freeze({
  /** Inclinação da face, em graus. */
  graus: 22,
  /** A face começa em z = pe e sobe para -z (à esquerda de quem anda em +X). */
  peZ: -12,
  /** Largura da face medida em z, com cantos arredondados de `cantoM`. */
  larguraM: 7.5,
  cantoM: 1.5,
  /** Fim do platô e sopé do lado de trás (descida suave). */
  planaltoZ: -24,
  sopeZ: -40,
  /** Entrada e saída em x: a face cresce de 0 a plena entre inicio e plena. */
  inicioX: 4,
  plenaX: 20,
  fimPlenaX: 50,
  fimX: 66,
});

/** Linha de quem dirige pela face, no meio do trecho de 22° pleno. */
export const RAMPA_LINHA_Z = RAMPA_LATERAL.peZ - RAMPA_LATERAL.larguraM / 2;

const suave = (a: number, b: number, t: number) => { const u = Math.max(0, Math.min(1, (t - a) / (b - a))); return u * u * (3 - 2 * u); };

/** Rampa de inclinação 1 até `largura`, com cantos de raio `canto` (derivada contínua). */
function rampaArredondada(u: number, largura: number, canto: number) {
  if (u <= 0) return 0;
  if (u < canto) return (u * u) / (2 * canto);
  if (u <= largura - canto) return u - canto / 2;
  if (u < largura) return largura - canto - ((largura - u) ** 2) / (2 * canto);
  return largura - canto;
}

/** Altura extra do talude em (x, z); zero no percurso do fardo (z = 0) e longe da rampa. */
export function relevoRampaLateral(x: number, z: number) {
  const r = RAMPA_LATERAL;
  const tangente = Math.tan(r.graus * Math.PI / 180);
  const alturaM = tangente * (r.larguraM - r.cantoM);
  const face = tangente * rampaArredondada(r.peZ - z, r.larguraM, r.cantoM);
  const descida = alturaM * (1 - suave(-r.planaltoZ, -r.sopeZ, -z));
  const perfilX = suave(r.inicioX, r.plenaX, x) * (1 - suave(r.fimPlenaX, r.fimX, x));
  return Math.min(face, descida) * perfilX;
}

export type ChaoGameplay = (x: number, z: number) => number;

/**
 * Atitude da máquina pelo chão sob as rodas, na convenção do palco
 * (`machine.rotation` = rolagem em x, arfagem em z, ordem YZX):
 * arfagem positiva = nariz para cima; rolagem positiva = lado direito para baixo.
 */
export function atitudeNoChao(chao: ChaoGameplay, x: number, z: number, rumo: number) {
  const fx = Math.cos(rumo), fz = -Math.sin(rumo);
  const dx = Math.sin(rumo), dz = Math.cos(rumo); // direita
  const meioEixos = TRATOR.entreEixosM / 2, meiaBitola = TRATOR.bitolaM / 2;
  const frente = chao(x + fx * meioEixos, z + fz * meioEixos), tras = chao(x - fx * meioEixos, z - fz * meioEixos);
  const direita = chao(x + dx * meiaBitola, z + dz * meiaBitola), esquerda = chao(x - dx * meiaBitola, z - dz * meiaBitola);
  const valido = [frente, tras, direita, esquerda].every(Number.isFinite);
  if (!valido) return { rolagemGraus: 0, arfagemGraus: 0 };
  return {
    rolagemGraus: Math.atan2(esquerda - direita, TRATOR.bitolaM) * 180 / Math.PI,
    arfagemGraus: Math.atan2(frente - tras, TRATOR.entreEixosM) * 180 / Math.PI,
  };
}
