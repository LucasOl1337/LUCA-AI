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
  /** Resposta da guinada: alcança 95% do alvo em ~0,54 s, sem salto ao inverter o volante. */
  guinadaTauS: 0.18,
  bitolaM: 2.087, // eixo traseiro: 2 × z 1.0435 do mesmo layout
  /** L2 segurado depois de parar só engata a ré após este tempo parado (ou numa nova pressão). */
  esperaReS: 0.5,
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
  /** s parado com L2 segurado depois de frear; ao chegar em `esperaReS` engata a ré. */
  freioParadoS?: number;
  /** L2 solto com o trator parado: a próxima pressão engata a ré na hora. */
  reArmada?: boolean;
}

export interface MundoTrator { obstaculos: readonly ObstaculoGameplay[]; tetoKph: number }

export function criarTrator(x: number, z = 0, rumo = 0): EstadoTrator {
  return { x, z, rumo, velocidade: 0, percurso: 0, guinada: 0, contato: false, freioParadoS: 0, reArmada: true };
}

const limitar = (valor: number, min: number, max: number) => Math.max(min, Math.min(max, valor));

/** Distância do emissor até a superfície do obstáculo na linha da frente, ou null fora do alcance/eixo. */
/**
 * Folga à frente até o obstáculo mais próximo. `meiaLarguraM` = 0 é um raio no
 * eixo (contato frontal da física); a leitura do sensor usa a meia bitola, o
 * corredor da largura do trator, como sensor de ré: o que vai raspar a lateral
 * também ecoa antes de bater.
 */
export function distanciaSensorM(estado: Pick<EstadoTrator, 'x' | 'z' | 'rumo'>, obstaculos: readonly ObstaculoGameplay[], meiaLarguraM = 0) {
  const fx = Math.cos(estado.rumo), fz = -Math.sin(estado.rumo);
  const sx = estado.x + fx * TRATOR.sensorFrenteM, sz = estado.z + fz * TRATOR.sensorFrenteM;
  let melhor: number | null = null;
  for (const item of obstaculos) {
    const ox = item.x - sx, oz = item.z - sz;
    const aoLongo = ox * fx + oz * fz;
    const lado = Math.max(0, Math.abs(ox * fz - oz * fx) - meiaLarguraM);
    const r2 = item.raioM * item.raioM;
    if (lado * lado > r2) continue;
    const batida = aoLongo - Math.sqrt(r2 - lado * lado);
    if (batida < -item.raioM) continue;
    const distancia = Math.max(0, batida);
    if (distancia * 100 <= GAMEPLAY_ECO_MAXIMO_CM && (melhor === null || distancia < melhor)) melhor = distancia;
  }
  return melhor;
}

/**
 * Um passo de `dt` s. L2 freia; parado, a ré lenta só engata com o L2 segurado
 * por `esperaReS` ou numa nova pressão (sem isso, frear até parar recuava sozinho).
 * Ao encostar no obstáculo pela frente, para ali (sem atravessar).
 */
export function passoTrator(estado: EstadoTrator, comando: ComandoVolante, dt: number, mundo: MundoTrator): EstadoTrator {
  const segundos = limitar(Number.isFinite(dt) ? dt : 0, 0, 0.1);
  const acelerador = limitar(comando.acelerador, 0, 1), freio = limitar(comando.freio, 0, 1), esterco = limitar(comando.esterco, -1, 1);
  const vMax = limitar(Number.isFinite(mundo.tetoKph) ? mundo.tetoKph : GAMEPLAY_TETO_LIVRE_KPH, 0, GAMEPLAY_TETO_LIVRE_KPH) / 3.6;
  const vRe = -TRATOR.reKph / 3.6;
  let v = estado.velocidade;
  const parado = Math.abs(v) <= 0.05;
  const freando = freio > 0.2 && acelerador === 0;
  // Nova pressão: L2 solto com o trator parado arma a ré; andar para a frente desarma.
  const reArmada = v > 0.05 ? false : parado && !freando ? true : (estado.reArmada ?? true);
  const freioParadoS = parado && freando ? (estado.freioParadoS ?? 0) + segundos : 0;
  const reLiberada = v < -0.05 || reArmada || freioParadoS >= TRATOR.esperaReS;
  if (v > 0.05 || (acelerador > 0 && v >= -0.05)) {
    // Arrasto só rolando sem pedal (TRATOR.arrasto): com ele junto do acelerador, meio R2 não tirava o trator do lugar.
    v += (acelerador * TRATOR.aceleracao - freio * TRATOR.frenagem - (acelerador > 0 ? 0 : TRATOR.arrasto)) * segundos;
    // Acima do teto (o desafio baixou para 6 km/h): desacelera no ritmo do freio, sem teleporte.
    v = limitar(v, 0, Math.max(vMax, estado.velocidade - TRATOR.frenagem * segundos));
  } else if (freando && !reLiberada) {
    v = 0;
  } else if (freando) {
    v = Math.max(vRe, v - freio * TRATOR.aceleracao * 0.6 * segundos);
  } else {
    v = Math.min(0, v + (TRATOR.arrasto + acelerador * TRATOR.frenagem) * segundos);
  }
  const alvoGuinada = -(v / TRATOR.entreEixosM) * Math.tan(esterco * TRATOR.estercoMaxRad);
  const retencao = Math.exp(-segundos / TRATOR.guinadaTauS);
  // Integral exata do filtro para alvo constante: não muda a curva só por trocar o FPS.
  const guinada = v === 0 ? 0 : alvoGuinada + (estado.guinada - alvoGuinada) * retencao;
  const giro = v === 0 ? 0 : alvoGuinada * segundos
    + (estado.guinada - alvoGuinada) * TRATOR.guinadaTauS * (1 - retencao);
  const rumo = estado.rumo + giro;
  let passo = v * segundos;
  let contato = false;
  if (passo > 0) {
    const folga = distanciaSensorM({ x: estado.x, z: estado.z, rumo }, mundo.obstaculos);
    if (folga !== null && folga <= passo) { passo = folga; v = 0; contato = true; }
  }
  // Props sólidos: corpo aproximado por círculo, também nas laterais e em ré.
  // Fardos/estacas conservam a física original do percurso.
  for (const item of mundo.obstaculos) {
    if (item.tipo !== 'cenario') continue;
    const nx = estado.x + Math.cos(rumo) * passo, nz = estado.z - Math.sin(rumo) * passo;
    const atual = Math.hypot(estado.x - item.x, estado.z - item.z);
    const proxima = Math.hypot(nx - item.x, nz - item.z);
    if (proxima < item.raioM + TRATOR.bitolaM / 2 && proxima < atual) {
      passo = 0; v = 0; contato = true;
    }
  }
  const livreX = estado.x + Math.cos(rumo) * passo, livreZ = estado.z - Math.sin(rumo) * passo;
  const x = limitar(livreX, -TRATOR.cercaM, TRATOR.cercaM), z = limitar(livreZ, -TRATOR.cercaM, TRATOR.cercaM);
  if (x !== livreX || z !== livreZ) v = 0;
  return {
    x, z, rumo, velocidade: v, percurso: estado.percurso + passo, guinada: v === 0 ? 0 : guinada, freioParadoS, reArmada,
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

/** HC-SR04 simulado, no formato do painel: 2..400 cm, alerta <= 150 cm, corredor da largura do trator. */
export function leituraSensor(estado: EstadoTrator, obstaculos: readonly ObstaculoGameplay[]) {
  const folga = distanciaSensorM(estado, obstaculos, TRATOR.bitolaM / 2);
  const distanciaCm = folga === null ? GAMEPLAY_ECO_MAXIMO_CM : Math.max(2, Math.round(folga * 100));
  return { distanciaCm, eco: folga !== null, alerta: distanciaCm <= GAMEPLAY_ALERTA_CM };
}
