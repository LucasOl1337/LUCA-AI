/**
 * Física do `caminhao` na serra. Pura, cinemática (bicicleta) com dinâmica
 * longitudinal: gravidade pela rampa da pista, rolagem + ar, motor, freio de
 * serviço com eficiência (cai a 0 na falha) e freio-motor (desce marcha).
 * Mesmo referencial do trator: frente = (cos h, -sin h), rumo + = esquerda.
 */
import type { ComandoVolante } from '../gameplay/volante';
import { MEIA_PISTA_M, GUARD_RAIL_M, naAreaDeEscape, projetarNaPista, SERRA, type PistaSerra } from './pistaSerra';

const G = 9.81;
export const CAMINHAO = Object.freeze({
  entreEixosM: 5.2,
  meiaLarguraM: 1.3,
  frenteM: 4.6,
  /** Esterço máximo parado; encolhe com a velocidade (teclado não fica nervoso a 80 km/h). */
  estercoMaxRad: 0.55,
  estercoVRef: 9,
  guinadaTauS: 0.22,
  tetoMotorKph: 80,
  aceleracao: 1.5,
  frenagem: 4.8,
  rolagem: 0.012 * G,
  ar: 0.00042,
  /** Freio-motor no topo; some abaixo de ~25 km/h (rotação baixa). */
  freioMotor: 0.6,
  freioMotorVRef: 7.5,
  /** Leito de cascalho da área de escape. */
  cascalho: 6.5,
  /** Aceleração lateral: aviso, perigo e tombo (sustentado). */
  latAvisoG: 0.28, latPerigoG: 0.4, latTomboG: 0.52, tomboS: 0.5,
  /** Velocidade normal ao guard-rail que rompe a barreira. */
  rompeRailMs: 4.5,
});
const MARCHAS_KPH = [12, 20, 30, 40, 52, 64, 78, 96] as const;

export interface EstadoCaminhao {
  x: number; z: number; y: number; rumo: number; velocidade: number; guinada: number;
  s: number; lateral: number; indice: number; rampa: number; curvatura: number;
  aLatG: number; tomboS: number; marcha: number; rpm: number;
  freioMotor: boolean; noCascalho: boolean; raspou: boolean; rompeu: boolean;
}

export function criarCaminhao(pista: PistaSerra, s = 12, lateral = 1.8): EstadoCaminhao {
  const p = pista.amostras[Math.round(s / 2)];
  const x = p.x + Math.sin(p.rumo) * lateral, z = p.z + Math.cos(p.rumo) * lateral;
  return { x, z, y: p.y, rumo: p.rumo, velocidade: 0, guinada: 0, s, lateral, indice: Math.round(s / 2), rampa: p.rampa, curvatura: p.curvatura,
    aLatG: 0, tomboS: 0, marcha: 1, rpm: 650, freioMotor: false, noCascalho: false, raspou: false, rompeu: false };
}

const limitar = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function marchaPara(kph: number, freioMotor: boolean) {
  let m = MARCHAS_KPH.findIndex((top) => kph < top * 0.92) + 1 || MARCHAS_KPH.length;
  if (freioMotor) m = Math.max(1, m - 1);
  const rpm = limitar(650 + 1650 * kph / MARCHAS_KPH[m - 1], 650, 2700);
  return { marcha: m, rpm: Math.round(rpm) };
}

/**
 * Um passo. `eficienciaFreio` 0..1 (1 = freio bom). O pedal sem eficiência não
 * faz nada; o freio-motor e o cascalho seguem funcionando.
 */
export function passoCaminhao(e: EstadoCaminhao, comando: ComandoVolante, freioMotor: boolean, eficienciaFreio: number, dt: number, pista: PistaSerra): EstadoCaminhao {
  const sg = limitar(Number.isFinite(dt) ? dt : 0, 0, 0.1);
  const acel = limitar(comando.acelerador, 0, 1), freio = limitar(comando.freio, 0, 1), esterco = limitar(comando.esterco, -1, 1);
  let v = e.velocidade;
  const kph = v * 3.6;
  const motor = acel > 0 && kph < CAMINHAO.tetoMotorKph * acel ? CAMINHAO.aceleracao * (1 - 0.5 * kph / CAMINHAO.tetoMotorKph) : 0;
  const gravidade = -G * e.rampa;
  const resistencia = v > 0.01 ? CAMINHAO.rolagem + CAMINHAO.ar * v * v : 0;
  const fm = freioMotor && v > 0.5 ? CAMINHAO.freioMotor * Math.min(1, v / CAMINHAO.freioMotorVRef) : 0;
  const servico = freio * CAMINHAO.frenagem * limitar(eficienciaFreio, 0, 1);
  const cascalho = e.noCascalho && v > 0.01 ? CAMINHAO.cascalho : 0;
  const freios = resistencia + fm + servico + cascalho;
  // Parado, freio segura a rampa (não desliza para trás nem anda sozinho).
  if (v <= 0.05 && motor + gravidade <= freios) v = 0;
  else v = Math.max(0, v + (motor + gravidade - freios) * sg);
  const maxRad = CAMINHAO.estercoMaxRad / (1 + (v / CAMINHAO.estercoVRef) ** 2);
  const alvo = -(v / CAMINHAO.entreEixosM) * Math.tan(esterco * maxRad);
  const ret = Math.exp(-sg / CAMINHAO.guinadaTauS);
  const guinada = v === 0 ? 0 : alvo + (e.guinada - alvo) * ret;
  const giro = v === 0 ? 0 : alvo * sg + (e.guinada - alvo) * CAMINHAO.guinadaTauS * (1 - ret);
  let rumo = e.rumo + giro;
  let x = e.x + Math.cos(rumo) * v * sg, z = e.z - Math.sin(rumo) * v * sg;
  let p = projetarNaPista(pista, x, z, e.indice);
  let raspou = false, rompeu = e.rompeu;
  const limite = GUARD_RAIL_M - CAMINHAO.meiaLarguraM;
  // Na boca da área de escape não há guard-rail do lado direito.
  const bocaEscape = p.lateral > 0 && p.s >= SERRA.escape.s0 && p.s <= SERRA.escape.s1;
  if (!rompeu && Math.abs(p.lateral) > limite && !bocaEscape) {
    // Batida no guard-rail: velocidade normal à barreira decide se rompe ou raspa.
    const erro = rumo - p.rumo;
    const normal = Math.abs(v * Math.sin(erro));
    if (normal > CAMINHAO.rompeRailMs) rompeu = true;
    else {
      const lado = Math.sign(p.lateral), volta = (Math.abs(p.lateral) - limite) * lado;
      x -= Math.sin(p.rumo) * volta; z -= Math.cos(p.rumo) * volta;
      rumo = p.rumo + erro * 0.3; v = Math.max(0, v - 2.5 * sg - normal * 0.25); raspou = true;
      p = projetarNaPista(pista, x, z, p.indice);
    }
  }
  const aLatG = Math.abs(v * guinada) / G;
  const tomboS = aLatG >= CAMINHAO.latTomboG ? e.tomboS + sg : Math.max(0, e.tomboS - sg * 2);
  const { marcha, rpm } = marchaPara(v * 3.6, freioMotor);
  return { x, z, y: p.y, rumo, velocidade: v, guinada, s: p.s, lateral: p.lateral, indice: p.indice, rampa: p.rampa, curvatura: p.curvatura,
    aLatG, tomboS, marcha, rpm, freioMotor, noCascalho: naAreaDeEscape(p.s, p.lateral) && p.lateral > MEIA_PISTA_M + 2.2, raspou, rompeu };
}
