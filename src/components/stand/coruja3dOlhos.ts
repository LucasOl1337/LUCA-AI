import type { EstadoVoz } from './canal';

/**
 * Olhos da Coruja 3D: a malha `CorujaOlhos` do GLB é uma tela 2 mm à frente do
 * visor (uma grade por olho, UV plano: metade esquerda = olho da esquerda na
 * tela). O olho é o pintado pelo Tripo, que fica no modelo; o pipeline grava o
 * recorte dele de frente (`coruja-3d-olhos.jpg`, mesmo enquadramento da tela).
 * Aqui fica o estado puro (olhar, abertura, feliz) e o desenho num canvas 2D
 * que vira a textura da tela: dentro da abertura, o próprio recorte deslocado
 * (a íris olha), o brilho e as pálpebras feitas da pele de cima e de baixo
 * esticada. Fora da abertura a tela é transparente. Sem three.js, para os testes.
 */

export const OLHOS_CANVAS = Object.freeze({ largura: 1024, altura: 512 });
/** Arquivo do recorte, ao lado do GLB (fora do manifesto de texturas). */
export const OLHOS_RECORTE = 'coruja-3d-olhos.jpg';
/** Cada metade do canvas cobre 9 cm do visor (TELA_MEIA 0,045 m em coruja3d_rosto.py). */
const MEIA = OLHOS_CANVAS.altura;
/**
 * Abertura do olho pintado na metade esquerda (px do recorte): elipse girada,
 * canto de dentro mais baixo (cara brava da Coruja A). A da direita é o espelho.
 */
export const ABERTURA = Object.freeze({ cx: 250, cy: 205, rx: 170, ry: 125, giro: (14 * Math.PI) / 180 });
const PUPILA_PINTADA = Object.freeze({ x: 258, y: 200 });
/** Quanto a íris anda no olhar extremo (px): ~4,5 mm de lado, ~3 mm na vertical. */
const ANDA = Object.freeze({ x: 26, y: 18 });
/** Altura da linha escura do cílio que vai junto na pálpebra (px). */
const CILIO = 18;
const FAIXA = 8;
/** Cor do traço da borda da pálpebra (o azul-marinho do contorno pintado). */
const COR_CILIO = '#0d1f45';

/** Para onde o olhar vai por estado (-1..1; x para a direita da tela, y para cima). */
const OLHAR_ESTADO: Readonly<Record<EstadoVoz, { x: number; y: number; espalho: number }>> = {
  ocioso: { x: 0, y: 0, espalho: 0.24 },
  ouvindo: { x: 0, y: 0.04, espalho: 0.08 },
  pensando: { x: 0.28, y: 0.45, espalho: 0.12 },
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
  'clearRect' | 'save' | 'restore' | 'beginPath' | 'ellipse' | 'fill' | 'clip' | 'translate' | 'scale' |
  'drawImage' | 'createRadialGradient' | 'moveTo' | 'lineTo' | 'stroke'
> & { fillStyle: unknown; strokeStyle: unknown; lineWidth: number; lineCap: CanvasLineCap; globalAlpha: number };

interface Abertura { cx: number; cy: number; rx: number; ry: number; giro: number }

/** Abertura de cada metade: a da direita é o espelho da da esquerda. */
function aberturaDe(lado: number): Abertura {
  return lado === 0 ? ABERTURA : { ...ABERTURA, cx: MEIA - ABERTURA.cx, giro: -ABERTURA.giro };
}

/** Borda de cima e de baixo da abertura na coluna x (px), ou null fora dela. */
export function bordasAbertura(a: Abertura, x: number): [number, number] | null {
  const X = x - a.cx;
  const c = Math.cos(a.giro), s = Math.sin(a.giro);
  const rx2 = a.rx * a.rx, ry2 = a.ry * a.ry;
  const A = (s * s) / rx2 + (c * c) / ry2;
  const B = 2 * X * c * s * (1 / rx2 - 1 / ry2);
  const C = X * X * ((c * c) / rx2 + (s * s) / ry2) - 1;
  const d = B * B - 4 * A * C;
  if (d <= 0) return null;
  const r = Math.sqrt(d);
  return [a.cy + (-B - r) / (2 * A), a.cy + (-B + r) / (2 * A)];
}

/**
 * Desenha os dois olhos no canvas da tela (1024 x 512). Sem o recorte (ainda
 * carregando ou falhou) a tela fica transparente e aparece o olho pintado, parado.
 */
export function desenharOlhos(ctx: Ctx, o: Olhos, recorte: CanvasImageSource | null) {
  const { largura, altura } = OLHOS_CANVAS;
  ctx.clearRect(0, 0, largura, altura);
  if (!recorte) return;
  for (let lado = 0; lado < 2; lado += 1) {
    ctx.save();
    ctx.translate(lado * MEIA, 0);
    desenharUm(ctx, o, recorte, lado);
    ctx.restore();
  }
}

function desenharUm(ctx: Ctx, o: Olhos, img: CanvasImageSource, lado: number) {
  const a = aberturaDe(lado);
  const sx = lado * MEIA;
  const px = lado === 0 ? PUPILA_PINTADA.x : MEIA - PUPILA_PINTADA.x;
  // Recorta na abertura (um tico para dentro: a borda escura pintada fica parada).
  ctx.beginPath();
  ctx.ellipse(a.cx, a.cy, a.rx * 0.97, a.ry * 0.95, a.giro, 0, Math.PI * 2);
  ctx.clip();

  // Íris: o próprio olho pintado, deslocado pelo olhar e com a pupila mais ou menos aberta.
  const dx = o.x * ANDA.x, dy = -o.y * ANDA.y;
  const escala = 1 + (o.pupila - 1) * 0.35 + Math.max(0, o.abertura - 1) * 0.3;
  ctx.save();
  ctx.translate(px + dx, PUPILA_PINTADA.y + dy);
  ctx.scale(escala, escala);
  ctx.drawImage(img, sx, 0, MEIA, MEIA, -px, -PUPILA_PINTADA.y, MEIA, MEIA);
  ctx.restore();

  // Brilho da luz principal (alto, à direita), que anda menos que a íris.
  const bx = px + dx * 0.6 + 42, by = PUPILA_PINTADA.y + dy * 0.6 - 46;
  const brilho = ctx.createRadialGradient(bx, by, 0, bx, by, 24);
  brilho.addColorStop(0, 'rgba(255,255,255,0.9)');
  brilho.addColorStop(0.55, 'rgba(235,248,255,0.55)');
  brilho.addColorStop(1, 'rgba(235,248,255,0)');
  ctx.fillStyle = brilho;
  ctx.beginPath();
  ctx.ellipse(bx, by, 24, 21, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.ellipse(px + dx * 0.6 - 34, PUPILA_PINTADA.y + dy * 0.6 + 40, 8, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Pálpebras: faixas verticais da pele pintada esticadas até a linha da pálpebra.
  // Piscar desce a de cima até fechar; feliz (^^) é o olho que sorri: a de baixo
  // sobe em arco e deixa só o alto da íris, a de cima desce um pouco. Um traço
  // escuro marca a borda de cada pálpebra, senão o olho fechado lê como vazio.
  const fecha = Math.min(1, Math.max(0, 1 - o.abertura));
  const f = Math.min(1, Math.max(0, o.feliz));
  if (fecha < 0.01 && f < 0.01) return;
  const x0 = a.cx - a.rx - 4, x1 = a.cx + a.rx + 4;
  const tracoCima: [number, number][] = [];
  const tracoBaixo: [number, number][] = [];
  for (let x = x0; x < x1; x += FAIXA) {
    const b = bordasAbertura(a, x + FAIXA / 2);
    if (!b) continue;
    const [cima, baixo] = b;
    const alto = baixo - cima;
    const u = (x + FAIXA / 2 - a.cx) / a.rx;
    const sorriso = baixo - alto * (0.16 + 0.3 * (1 - u * u));
    const linhaBaixo = baixo + (sorriso - baixo) * f;
    const linhaCima = Math.min(cima + alto * Math.max(fecha, 0.08 * f), linhaBaixo);
    if (f > 0.01) {
      ctx.drawImage(img, sx + x, baixo - CILIO, FAIXA, MEIA - baixo + CILIO, x, linhaBaixo - CILIO, FAIXA + 1, MEIA - linhaBaixo + CILIO);
      tracoBaixo.push([x + FAIXA / 2, linhaBaixo]);
    }
    ctx.drawImage(img, sx + x, 0, FAIXA, cima + CILIO, x, 0, FAIXA + 1, linhaCima + CILIO);
    tracoCima.push([x + FAIXA / 2, linhaCima]);
  }
  ctx.strokeStyle = COR_CILIO;
  ctx.lineCap = 'round';
  tracar(ctx, tracoBaixo, f, 9);
  tracar(ctx, tracoCima, Math.max(0, fecha * 2 - 1), 8);
  ctx.globalAlpha = 1;
}

function tracar(ctx: Ctx, pontos: [number, number][], alfa: number, largura: number) {
  if (alfa < 0.02 || pontos.length < 2) return;
  ctx.globalAlpha = alfa;
  ctx.lineWidth = largura;
  ctx.beginPath();
  ctx.moveTo(pontos[0][0], pontos[0][1]);
  for (const [x, y] of pontos.slice(1)) ctx.lineTo(x, y);
  ctx.stroke();
}
