import type { EstadoVoz } from './canal';
import { palpebraNaPiscada } from './avatarRig';
import { suavizarBoca } from './lipSync';

/**
 * Rig 2D da coruja A (arte aprovada, PNG com fundo recortado). A imagem fica
 * parada; por cima entram pálpebras com a textura da própria imagem, íris que
 * desliza, brilho do visor, luz do microfone e halo que segue `nivel_audio`.
 * Sem boca: a fala aparece na luz do headset e no halo. Coordenadas no espaço
 * da imagem 1024×1024.
 */

export const IMAGEM_CORUJA_A = '/stand/avatar/coruja-a/coruja-a.webp';
export const LADO = 1024;

export interface Olho { cx: number; cy: number; rx: number; ry: number; rot: number; iris: number }
/** Medidos na arte ampliada (olho esquerdo e direito de quem vê). */
export const OLHOS: readonly Olho[] = [
  { cx: 355, cy: 386, rx: 62, ry: 48, rot: 4, iris: 52 },
  { cx: 672, cy: 385, rx: 64, ry: 48, rot: -4, iris: 52 },
];
/** Contorno das lentes do visor. */
export const VISOR = 'M180 292 Q500 296 848 288 L854 420 Q840 478 760 492 L620 490 Q560 480 548 446 L476 446 Q462 482 400 492 L262 492 Q186 478 174 420 Z';
export const MICROFONE = { cx: 688, cy: 603 };
export const FONES = [{ cx: 92, cy: 404 }, { cx: 934, cy: 404 }];

export interface PoseCorujaA {
  /** 0 aberto, 1 fechado. */
  palpebra: number;
  /** -1..1 em cada eixo. */
  olharX: number;
  olharY: number;
  /** -1..1, respiração. */
  respiro: number;
  /** 0..1, voz suavizada (só falando). */
  voz: number;
  /** 0..1, brilho base do visor e dos fones por estado. */
  brilho: number;
  /** graus, inclinação da cabeça (pensando). */
  inclina: number;
  /** 0..1, posição da varredura no visor; <0 desligada. */
  varredura: number;
}

export const POSE_REPOUSO: PoseCorujaA = { palpebra: 0, olharX: 0, olharY: 0, respiro: 0, voz: 0, brilho: 0.2, inclina: 0, varredura: -1 };

/** Quanto do olho a pálpebra cobre em repouso, por estado: atenta ouvindo, meio baixa pensando. */
const PALPEBRA_BASE: Record<EstadoVoz, number> = { ocioso: 0.06, ouvindo: 0, pensando: 0.28, falando: 0.04 };
const BRILHO: Record<EstadoVoz, number> = { ocioso: 0.18, ouvindo: 0.55, pensando: 0.4, falando: 0.35 };

/** Pálpebra de um olho: centro da elipse que recorta e quanto a pena de cima desliza. */
export function geometriaPalpebra(olho: Olho, fechada: number) {
  const f = Math.max(0, Math.min(1, fechada));
  const ryTampa = olho.ry * 1.7;
  const topo = olho.cy - olho.ry;
  // Borda de baixo: de 3 px acima do olho (aberto) até 3 px abaixo (fechado).
  const borda = topo - 3 + f * (2 * olho.ry + 6);
  return {
    cy: borda - ryTampa,
    rx: olho.rx * 1.5,
    ry: ryTampa,
    /** A textura de pena logo acima do olho desce junto com a borda (só translada, sem esticar). */
    desliza: borda - topo + 3,
    visivel: f > 0.01,
  };
}

/** Transform do corpo: respira (1–2% no total), acena um pouco com a voz e inclina pensando. */
export function transformCorpo(p: PoseCorujaA): string {
  const escala = 1 + 0.006 * p.respiro;
  const y = 5 * p.respiro + 4 * p.voz;
  return `translate(0 ${y.toFixed(2)}) rotate(${p.inclina.toFixed(2)} 512 700) translate(512 1024) scale(${escala.toFixed(4)}) translate(-512 -1024)`;
}

export interface MemoriaCorujaA {
  anterior: number;
  proximaPiscada: number;
  piscadaInicio: number;
  duplaEm: number;
  proximoOlhar: number;
  alvoX: number;
  alvoY: number;
  pose: PoseCorujaA;
}

export function memoriaInicial(agora: number): MemoriaCorujaA {
  return { anterior: agora, proximaPiscada: agora + 1500, piscadaInicio: -1e9, duplaEm: -1, proximoOlhar: agora + 1800, alvoX: 0, alvoY: 0, pose: { ...POSE_REPOUSO } };
}

const aproxima = (atual: number, alvo: number, dt: number, tau: number) => atual + (alvo - atual) * (1 - Math.exp(-dt / tau));

/** Avança a pose um quadro. `aleatorio` injetável para teste. */
export function passoCorujaA(m: MemoriaCorujaA, voz: EstadoVoz, nivel: number, agora: number, aleatorio: () => number = Math.random): PoseCorujaA {
  const dt = Math.max(0, Math.min(100, agora - m.anterior));
  m.anterior = agora;
  const p = m.pose;

  // Piscar a cada 3–6 s; de vez em quando, piscada dupla.
  if (agora >= m.proximaPiscada) {
    m.piscadaInicio = agora;
    m.duplaEm = aleatorio() < 0.18 ? agora + 260 : -1;
    m.proximaPiscada = agora + 3000 + aleatorio() * 3000;
  }
  if (m.duplaEm > 0 && agora >= m.duplaEm) { m.piscadaInicio = agora; m.duplaEm = -1; }
  const piscada = 1 - palpebraNaPiscada(agora, m.piscadaInicio, 170);
  const base = PALPEBRA_BASE[voz];
  p.palpebra = base + (1 - base) * piscada;

  // Olhar: vagueia ocioso, fixo no público ouvindo, para cima e ao lado pensando, pequenos saltos falando.
  if (agora >= m.proximoOlhar) {
    const amplitude = voz === 'ocioso' ? 0.8 : 0.3;
    m.alvoX = (aleatorio() * 2 - 1) * amplitude;
    m.alvoY = (aleatorio() * 2 - 1) * amplitude * 0.5;
    m.proximoOlhar = agora + (voz === 'falando' ? 700 : 1500) + aleatorio() * 2200;
  }
  const xAlvo = voz === 'pensando' ? 0.7 : voz === 'ouvindo' ? 0 : m.alvoX;
  const yAlvo = voz === 'pensando' ? -0.9 : voz === 'ouvindo' ? 0.1 : m.alvoY;
  p.olharX = aproxima(p.olharX, xAlvo, dt, 70);
  p.olharY = aproxima(p.olharY, yAlvo, dt, 70);

  p.respiro = Math.sin(agora / (voz === 'ocioso' ? 1100 : 800));
  p.voz = suavizarBoca(p.voz, voz === 'falando' ? nivel : 0, dt, 50, 180);
  p.brilho = aproxima(p.brilho, BRILHO[voz], dt, 250);
  p.inclina = aproxima(p.inclina, voz === 'pensando' ? -2.2 : 0, dt, 400);

  // Varredura no visor: contínua pensando, uma passada a cada ~7 s nos outros estados.
  const ciclo = voz === 'pensando' ? 1100 : 7000;
  const t = (agora % ciclo) / (voz === 'pensando' ? ciclo : 1300);
  p.varredura = t <= 1 ? t : -1;
  return p;
}
