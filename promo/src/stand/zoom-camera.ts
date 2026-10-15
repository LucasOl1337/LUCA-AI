// Câmera estilo Screen Studio guiada pelo rastro da captura. Função pura,
// sem React nem Remotion, para testar com node --test.

import type { PontoNoTempo, Rastro } from './estilo.ts';

export type Camera = { escala: number; tx: number; ty: number };

export const ZOOM = {
  maximo: 1.6,
  antecipa: 0.6, // começa a aproximar antes do clique
  subida: 0.5,
  segura: 1.2, // permanece perto depois do clique
  descida: 0.7,
  suaviza: 0.3, // janela de média do cursor (s)
} as const;

const suave = (x: number) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

/** 0..1: quanto o zoom de um clique vale no instante t. */
function envelope(t: number, clique: number) {
  const inicio = clique - ZOOM.antecipa;
  const fimSegura = clique + ZOOM.segura;
  if (t <= inicio || t >= fimSegura + ZOOM.descida) return 0;
  if (t < inicio + ZOOM.subida) return suave((t - inicio) / ZOOM.subida);
  if (t <= fimSegura) return 1;
  return 1 - suave((t - fimSegura) / ZOOM.descida);
}

export function cursorEm(t: number, cursor: PontoNoTempo[]): { x: number; y: number } | null {
  if (!cursor.length) return null;
  if (t <= cursor[0].t) return { x: cursor[0].x, y: cursor[0].y };
  for (let i = 1; i < cursor.length; i++) {
    const b = cursor[i];
    if (t <= b.t) {
      const a = cursor[i - 1];
      const k = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
  }
  const ultimo = cursor[cursor.length - 1];
  return { x: ultimo.x, y: ultimo.y };
}

/** Foco amortecido: média do cursor nos últimos `suaviza` segundos. */
function foco(t: number, rastro: Rastro) {
  const passos = 6;
  let x = 0;
  let y = 0;
  let n = 0;
  for (let i = 0; i < passos; i++) {
    const p = cursorEm(t - (ZOOM.suaviza * i) / (passos - 1), rastro.cursor);
    if (p) { x += p.x; y += p.y; n++; }
  }
  const { largura, altura } = rastro.viewport;
  return n ? { x: x / n, y: y / n } : { x: largura / 2, y: altura / 2 };
}

/**
 * Transformação para `transform-origin: 0 0; translate(tx,ty) scale(escala)`
 * sobre uma tela do tamanho do viewport. Nunca deixa aparecer fora da captura.
 */
export function cameraEm(t: number, rastro: Rastro): Camera {
  const { largura, altura } = rastro.viewport;
  const peso = rastro.cliques.reduce((max, c) => Math.max(max, envelope(t, c.t)), 0);
  const escala = 1 + (ZOOM.maximo - 1) * peso;
  if (escala === 1) return { escala: 1, tx: 0, ty: 0 };
  const f = foco(t, rastro);
  const meiaL = largura / (2 * escala);
  const meiaA = altura / (2 * escala);
  const cx = Math.min(largura - meiaL, Math.max(meiaL, f.x));
  const cy = Math.min(altura - meiaA, Math.max(meiaA, f.y));
  return { escala, tx: largura / 2 - cx * escala, ty: altura / 2 - cy * escala };
}

/** 0..1: pulso visual do cursor logo depois de um clique. */
export function pulsoEm(t: number, cliques: PontoNoTempo[]) {
  for (const c of cliques) {
    const d = t - c.t;
    if (d >= 0 && d < 0.45) return 1 - d / 0.45;
  }
  return 0;
}

/**
 * Câmera num recorte fixo da captura, com aproximação lenta (2% em 6 s), para
 * planos sem clique (ex.: o palco 3D). Mesma convenção de `cameraEm`.
 */
export function cameraFixa(
  recorte: { x: number; y: number; largura: number; altura: number },
  viewport: { largura: number; altura: number },
  segundos: number,
): Camera {
  const base = Math.min(viewport.largura / recorte.largura, viewport.altura / recorte.altura);
  const escala = base * (1 + 0.02 * Math.min(1, segundos / 6));
  const cx = recorte.x + recorte.largura / 2;
  const cy = recorte.y + recorte.altura / 2;
  const meiaL = viewport.largura / (2 * escala);
  const meiaA = viewport.altura / (2 * escala);
  const fx = Math.min(viewport.largura - meiaL, Math.max(meiaL, cx));
  const fy = Math.min(viewport.altura - meiaA, Math.max(meiaA, cy));
  return { escala, tx: viewport.largura / 2 - fx * escala, ty: viewport.altura / 2 - fy * escala };
}
