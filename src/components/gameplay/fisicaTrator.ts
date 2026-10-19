/**
 * Física do Trator MAX no Gameplay: bicicleta cinemática (a mesma base da
 * Condução livre de `sompo/firstPersonDrive.ts`, que fica intocada para o
 * /sompo), com teto de velocidade por desafio, obstáculos do desafio e cerca
 * de ±90 m. Pura, em metros e segundos, no referencial do palco agrícola:
 * frente = (cos h, 0, -sin h); rumo positivo gira para a esquerda.
 */
import { GAMEPLAY_ALERTA_CM, GAMEPLAY_ECO_MAXIMO_CM, GAMEPLAY_TETO_LIVRE_KPH, type ObstaculoGameplay } from './estadoGameplay';
import type { ComandoVolante } from './volante';

export const TRATOR = Object.freeze({
  reKph: 4,
  aceleracao: 1.2, // m/s² com R2 no fim de curso
  frenagem: 3.5, // m/s² com L2 no fim de curso
  arrasto: 0.5, // m/s² rolando sem pedal
  estercoMaxRad: 0.48, // limite visual do rig (sompoSteeringAngle)
  entreEixosM: 2.6625, // SOMPO_AGRI_RIG_LAYOUT['max-tractor']
  /** Emissor do HC-SR04 à frente da origem da máquina. */
  sensorFrenteM: 2.2461,
  cercaM: 90,
});

export interface EstadoTrator {
  x: number; z: number;
  /** rad */
  rumo: number;
  /** m/s com sinal: negativo é ré. */
  velocidade: number;
  /** Odômetro com sinal, para girar as rodas. */
  percurso: number;
  /** rad/s */
  guinada: number;
  contato: boolean;
}

export interface MundoTrator { obstaculos: readonly ObstaculoGameplay[]; tetoKph: number }

export function criarTrator(x: number, z = 0, rumo = 0): EstadoTrator {
  return { x, z, rumo, velocidade: 0, percurso: 0, guinada: 0, contato: false };
}

const limitar = (valor: number, min: number, max: number) => Math.max(min, Math.min(max, valor));

/** Distância do emissor até a superfície do obstáculo na linha da frente, ou null fora do alcance/eixo. */
export function distanciaSensorM(estado: Pick<EstadoTrator, 'x' | 'z' | 'rumo'>, obstaculos: readonly ObstaculoGameplay[]) {
  const fx = Math.cos(estado.rumo), fz = -Math.sin(estado.rumo);
  const sx = estado.x + fx * TRATOR.sensorFrenteM, sz = estado.z + fz * TRATOR.sensorFrenteM;
  let melhor: number | null = null;
  for (const item of obstaculos) {
    const ox = item.x - sx, oz = item.z - sz;
    const aoLongo = ox * fx + oz * fz;
    const lado2 = ox * ox + oz * oz - aoLongo * aoLongo;
    const r2 = item.raioM * item.raioM;
    if (lado2 > r2) continue;
    const batida = aoLongo - Math.sqrt(r2 - lado2);
    if (batida < -item.raioM) continue;
    const distancia = Math.max(0, batida);
    if (distancia * 100 <= GAMEPLAY_ECO_MAXIMO_CM && (melhor === null || distancia < melhor)) melhor = distancia;
  }
  return melhor;
}

/**
 * Um passo de `dt` s. L2 freia; parado e com L2 segurado, engata ré lenta.
 * Ao encostar no obstáculo pela frente, para ali (sem atravessar).
 */
export function passoTrator(estado: EstadoTrator, comando: ComandoVolante, dt: number, mundo: MundoTrator): EstadoTrator {
  const segundos = limitar(Number.isFinite(dt) ? dt : 0, 0, 0.1);
  const acelerador = limitar(comando.acelerador, 0, 1), freio = limitar(comando.freio, 0, 1), esterco = limitar(comando.esterco, -1, 1);
  const vMax = limitar(Number.isFinite(mundo.tetoKph) ? mundo.tetoKph : GAMEPLAY_TETO_LIVRE_KPH, 0, GAMEPLAY_TETO_LIVRE_KPH) / 3.6;
  const vRe = -TRATOR.reKph / 3.6;
  let v = estado.velocidade;
  if (v > 0.05 || (acelerador > 0 && v >= -0.05)) {
    // Arrasto só rolando sem pedal (TRATOR.arrasto): com ele junto do acelerador, meio R2 não tirava o trator do lugar.
    v += (acelerador * TRATOR.aceleracao - freio * TRATOR.frenagem - (acelerador > 0 ? 0 : TRATOR.arrasto)) * segundos;
    // Acima do teto (o desafio baixou para 6 km/h): desacelera no ritmo do freio, sem teleporte.
    v = limitar(v, 0, Math.max(vMax, estado.velocidade - TRATOR.frenagem * segundos));
  } else if (freio > 0.2 && acelerador === 0) {
    v = Math.max(vRe, v - freio * TRATOR.aceleracao * 0.6 * segundos);
  } else {
    v = Math.min(0, v + (TRATOR.arrasto + acelerador * TRATOR.frenagem) * segundos);
  }
  const guinada = -(v / TRATOR.entreEixosM) * Math.tan(esterco * TRATOR.estercoMaxRad);
  const rumo = estado.rumo + guinada * segundos;
  let passo = v * segundos;
  let contato = false;
  if (passo > 0) {
    const folga = distanciaSensorM({ x: estado.x, z: estado.z, rumo }, mundo.obstaculos);
    if (folga !== null && folga <= passo) { passo = folga; v = 0; contato = true; }
  }
  const livreX = estado.x + Math.cos(rumo) * passo, livreZ = estado.z - Math.sin(rumo) * passo;
  const x = limitar(livreX, -TRATOR.cercaM, TRATOR.cercaM), z = limitar(livreZ, -TRATOR.cercaM, TRATOR.cercaM);
  if (x !== livreX || z !== livreZ) v = 0;
  return {
    x, z, rumo, velocidade: v, percurso: estado.percurso + passo, guinada,
    // Continua encostado enquanto empurra o fardo parado.
    contato: contato || (estado.contato && v === 0 && acelerador > 0),
  };
}

/** Raio do fardo de feno do palco (HAY_BALE_RADIUS em sompo/createSompoAgriStage.ts). */
export const RAIO_FARDO_M = 0.72;

/** Fardo com a face a `distanciaM` do emissor do HC-SR04, na linha da frente da pose dada (para o desafio montar o `reiniciar`). */
export function fardoAFrente(pose: { x: number; z: number; rumoGraus: number }, distanciaM: number, raioM = RAIO_FARDO_M): ObstaculoGameplay {
  const rumo = pose.rumoGraus * Math.PI / 180, alcance = TRATOR.sensorFrenteM + distanciaM + raioM;
  return { x: pose.x + Math.cos(rumo) * alcance, z: pose.z - Math.sin(rumo) * alcance, raioM };
}

/** HC-SR04 simulado, no formato do painel: 2..400 cm, alerta <= 150 cm. */
export function leituraSensor(estado: EstadoTrator, obstaculos: readonly ObstaculoGameplay[]) {
  const folga = distanciaSensorM(estado, obstaculos);
  const distanciaCm = folga === null ? GAMEPLAY_ECO_MAXIMO_CM : Math.max(2, Math.round(folga * 100));
  return { distanciaCm, eco: folga !== null, alerta: distanciaCm <= GAMEPLAY_ALERTA_CM };
}
