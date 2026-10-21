import type { EstadoVoz } from './canal';

/**
 * Olhos da Coruja 3D: a malha `CorujaOlhos` do GLB é uma tela no visor (uma
 * grade por olho, UV plano: metade esquerda = olho da esquerda na tela). Aqui
 * fica o estado puro (olhar, abertura, feliz) e o desenho num canvas 2D que
 * vira a textura da tela. Sem three.js, para os testes.
 */

export const OLHOS_CANVAS = Object.freeze({ largura: 512, altura: 256 });
/** Cada metade do canvas cobre 9 cm do visor (TELA_MEIA 0,045 m em coruja3d_rosto.py). */
const PX_POR_M = 256 / 0.09;
/** Olho desenhado e fundo que tapa o relevo do olho pintado de origem (raio 0,040 x 0,031 m). */
const OLHO = Object.freeze({ rx: 0.031 * PX_POR_M, ry: 0.027 * PX_POR_M });
const FUNDO = Object.freeze({ rx: 0.0445 * PX_POR_M, ry: 0.04 * PX_POR_M });

/** Para onde o olhar vai por estado (-1..1; x para a direita da tela, y para cima). */
const OLHAR_ESTADO: Readonly<Record<EstadoVoz, { x: number; y: number; espalho: number }>> = {
  ocioso: { x: 0, y: 0, espalho: 0.42 },
  ouvindo: { x: 0, y: 0.04, espalho: 0.08 },
  pensando: { x: 0.5, y: 0.5, espalho: 0.14 },
  falando: { x: 0, y: 0, espalho: 0.18 },
};
/** Abertura e pupila por estado: ouvindo arregala e dilata, pensando estreita de leve (olha para cima, sem cara de sono). */
const ABERTURA_ESTADO: Readonly<Record<EstadoVoz, number>> = { ocioso: 1, ouvindo: 1.1, pensando: 0.96, falando: 1 };
const PUPILA_ESTADO: Readonly<Record<EstadoVoz, number>> = { ocioso: 1, ouvindo: 1.18, pensando: 0.85, falando: 1.04 };
export const SACADA_MS = Object.freeze({ min: 900, max: 3200 });
/** Depois da fala, os olhos sorriem (^^) por este tempo. */
export const FELIZ_DEPOIS_FALA_MS = 1800;

export interface MemoriaOlhos {
  x: number; y: number;
  alvoX: number; alvoY: number;
  proximaSacada: number;
  feliz: number;
  felizAte: number;
  abertura: number;
  pupila: number;
  vozAnterior: EstadoVoz | null;
  anterior: number;
}

export interface Olhos {
  /** 0 fechado .. ~1,1 arregalado; já inclui piscada e pálpebra de pensando. */
  abertura: number;
  /** -1..1, posição da íris no olho. */
  x: number; y: number;
  /** 0..1: quanto o olho virou ^^. */
  feliz: number;
  /** Escala da pupila. */
  pupila: number;
}

export function novaMemoriaOlhos(agoraMs: number): MemoriaOlhos {
  return {
    x: 0, y: 0, alvoX: 0, alvoY: 0, proximaSacada: agoraMs + SACADA_MS.min, feliz: 0, felizAte: 0,
    abertura: 1, pupila: 1, vozAnterior: null, anterior: agoraMs,
  };
}

/** Aproxima `atual` de `alvo` com meia-vida `meiaMs`, independente da taxa de quadros. */
function aproximar(atual: number, alvo: number, dtMs: number, meiaMs: number): number {
  return alvo + (atual - alvo) * Math.pow(0.5, dtMs / meiaMs);
}

/**
 * Estado dos olhos por quadro. `piscar` vem de `rostoCoruja3D` (0 aberto, 1
 * fechado, com a pálpebra de pensando). O olhar dá sacadas curtas a cada
 * 0,9–3,2 s em torno do ponto do estado; ouvindo olha para quem fala. `feliz`
 * acende quando pedido (entrada) e depois de cada fala.
 */
export function olhosCoruja3D(
  m: MemoriaOlhos,
  voz: EstadoVoz,
  piscar: number,
  agoraMs: number,
  { feliz = false, movimentoReduzido = false, sorteio = Math.random }:
    { feliz?: boolean; movimentoReduzido?: boolean; sorteio?: () => number } = {},
): Olhos {
  const dt = Math.min(100, Math.max(0, agoraMs - m.anterior));
  m.anterior = agoraMs;
  if (m.vozAnterior === 'falando' && voz !== 'falando') m.felizAte = agoraMs + FELIZ_DEPOIS_FALA_MS;
  if (voz === 'falando' || voz === 'ouvindo') m.felizAte = Math.min(m.felizAte, agoraMs);
  m.vozAnterior = voz;

  const base = OLHAR_ESTADO[voz];
  if (movimentoReduzido) {
    m.alvoX = base.x;
    m.alvoY = base.y;
  } else if (agoraMs >= m.proximaSacada) {
    m.alvoX = base.x + (sorteio() * 2 - 1) * base.espalho;
    m.alvoY = base.y + (sorteio() * 2 - 1) * base.espalho * 0.55;
    m.proximaSacada = agoraMs + SACADA_MS.min + sorteio() * (SACADA_MS.max - SACADA_MS.min);
  }
  // Sacada: rápida (meia-vida 35 ms), como olho de verdade.
  m.x = aproximar(m.x, m.alvoX, dt, 35);
  m.y = aproximar(m.y, m.alvoY, dt, 35);
  m.abertura = aproximar(m.abertura, ABERTURA_ESTADO[voz], dt, 120);
  m.pupila = aproximar(m.pupila, PUPILA_ESTADO[voz], dt, 160);
  const querFeliz = feliz || agoraMs < m.felizAte;
  m.feliz = aproximar(m.feliz, querFeliz ? 1 : 0, dt, 90);

  return {
    abertura: Math.max(0, m.abertura * (1 - Math.min(1, Math.max(0, piscar)))),
    x: clamp(m.x, -1, 1), y: clamp(m.y, -1, 1),
    feliz: m.feliz < 0.01 ? 0 : m.feliz,
    pupila: m.pupila,
  };
}

function clamp(v: number, a: number, b: number) { return Math.min(b, Math.max(a, v)); }

/** Ganchos mínimos do CanvasRenderingContext2D (os testes passam um falso). */
type Ctx = Pick<CanvasRenderingContext2D,
  'clearRect' | 'save' | 'restore' | 'beginPath' | 'ellipse' | 'fill' | 'stroke' | 'clip' | 'moveTo' |
  'quadraticCurveTo' | 'createRadialGradient' | 'translate' | 'rect' | 'closePath'
> & { fillStyle: unknown; strokeStyle: unknown; lineWidth: number; lineCap: CanvasLineCap; globalAlpha: number };

const COR = Object.freeze({
  vidro: 'rgba(205, 228, 252, 1)',
  vidroBorda: 'rgba(205, 228, 252, 0)',
  esclera: '#f4f9ff',
  irisFora: '#0a3f9e',
  irisMeio: '#1f86f0',
  irisDentro: '#7fdcff',
  pupila: '#071226',
  contorno: '#123a78',
  feliz: '#1a5fd0',
});

/** Desenha os dois olhos no canvas da tela (512 x 256). */
export function desenharOlhos(ctx: Ctx, o: Olhos) {
  const { largura, altura } = OLHOS_CANVAS;
  ctx.clearRect(0, 0, largura, altura);
  for (let lado = 0; lado < 2; lado += 1) {
    ctx.save();
    ctx.translate(lado * 256 + 128, 128);
    desenharUm(ctx, o);
    ctx.restore();
  }
}

function desenharUm(ctx: Ctx, o: Olhos) {
  // Fundo de vidro liso: tapa o relevo do olho de origem e funde na borda.
  const g = ctx.createRadialGradient(0, 0, Math.min(FUNDO.rx, FUNDO.ry) * 0.88, 0, 0, FUNDO.rx);
  g.addColorStop(0, COR.vidro);
  g.addColorStop(1, COR.vidroBorda);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, FUNDO.rx, FUNDO.ry, 0, 0, Math.PI * 2);
  ctx.fill();

  const { rx, ry } = OLHO;
  const aberto = Math.min(1.15, o.abertura) * (1 - o.feliz);
  if (aberto > 0.04) {
    // Olho: esclera clara, íris grande, pupila, dois brilhos. A pálpebra corta por cima.
    const meiaAltura = ry * Math.min(1.12, aberto);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, (ry - meiaAltura) * 0.35, rx, Math.max(1, meiaAltura), 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = COR.esclera;
    ctx.beginPath();
    ctx.rect(-rx, -ry * 1.3, rx * 2, ry * 2.6);
    ctx.fill();
    const ix = o.x * rx * 0.32;
    const iy = -o.y * ry * 0.3;
    const rIris = ry * 0.86;
    const gi = ctx.createRadialGradient(ix, iy - rIris * 0.25, rIris * 0.1, ix, iy, rIris);
    gi.addColorStop(0, COR.irisDentro);
    gi.addColorStop(0.55, COR.irisMeio);
    gi.addColorStop(1, COR.irisFora);
    ctx.fillStyle = gi;
    ctx.beginPath();
    ctx.ellipse(ix, iy, rIris, rIris, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COR.pupila;
    ctx.beginPath();
    ctx.ellipse(ix, iy, rIris * 0.46 * o.pupila, rIris * 0.5 * o.pupila, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.ellipse(ix - rIris * 0.34, iy - rIris * 0.38, rIris * 0.2, rIris * 0.17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.ellipse(ix + rIris * 0.3, iy + rIris * 0.34, rIris * 0.08, rIris * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Contorno e cílio de cima (mais grosso), para o olho ler a 2–3 m.
    ctx.strokeStyle = COR.contorno;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.ellipse(0, (ry - meiaAltura) * 0.35, rx, Math.max(1, meiaAltura), 0, Math.PI * 1.04, Math.PI * 1.96);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, (ry - meiaAltura) * 0.35, rx, Math.max(1, meiaAltura), 0, 0, Math.PI);
    ctx.stroke();
  } else if (o.feliz < 0.5) {
    // Fechado (piscada): só a linha da pálpebra.
    ctx.strokeStyle = COR.contorno;
    ctx.lineCap = 'round';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-rx * 0.92, ry * 0.12);
    ctx.quadraticCurveTo(0, ry * 0.42, rx * 0.92, ry * 0.12);
    ctx.stroke();
  }
  if (o.feliz > 0) {
    // ^^: arco para cima, mais grosso, entra por cima do olho que fecha.
    ctx.globalAlpha = Math.min(1, o.feliz * 1.4);
    ctx.strokeStyle = COR.feliz;
    ctx.lineCap = 'round';
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(-rx * 0.8, ry * 0.42);
    ctx.quadraticCurveTo(0, -ry * 0.75, rx * 0.8, ry * 0.42);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
