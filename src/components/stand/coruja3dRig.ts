import type { EstadoVoz } from './canal';

/**
 * Coruja 3D (variante `coruja-3d`): parâmetros puros, sem three.js, para o
 * componente e os testes. O GLB e a origem estão em
 * `public/stand/avatar/coruja-3d/` (ver `.provenance.json`); o pipeline em
 * `scripts/stand/package-coruja-3d.py`.
 */

export const CORUJA_3D_URL = '/stand/avatar/coruja-3d/coruja-3d.glb';

/** Um clipe em laço por estado de voz; `aceno` toca uma vez quando a cena abre. */
export const CLIPE_POR_VOZ: Readonly<Record<EstadoVoz, string>> = Object.freeze({
  ocioso: 'ocioso', ouvindo: 'ouvindo', pensando: 'pensando', falando: 'falando',
});
export const CLIPE_ENTRADA = 'aceno';
export const CROSSFADE_S = 0.35;

/** Osso do pescoço (rig avian do Tripo) que soma o aceno de cabeça da fala por cima do clipe. */
export const OSSO_PESCOCO = 'tripoHead_1';
/** Inclinação máxima extra da cabeça com o áudio no máximo, em radianos. */
export const ACENO_FALA_RAD = 0.14;

/** Moldura de busto, como a arte da Coruja A: topo dos tufos até o peito (coruja ≈1 m, pés em y=0). */
export const ENQUADRAMENTO = Object.freeze({ alvoY: 0.71, altura: 0.76, largura: 0.76, fov: 24 });

export interface MemoriaBrilho { nivel: number }

/** Mesma caixa do SVG da Coruja A, para halo e ondas caírem no mesmo lugar. */
export const CAIXA_A = Object.freeze({ x: -90, y: -60, largura: 1204, altura: 1104, cx: 512, cy: 430 });
export const ONDAS = 3;
const ONDA_MS = 1500;
const BRILHO_BASE: Readonly<Record<EstadoVoz, number>> = { ocioso: 0.18, ouvindo: 0.55, pensando: 0.4, falando: 0.35 };

/** Halo e ondas da Coruja A (mesmas fórmulas): só a fala acende as ondas. `fala` é o nível suavizado 0..1. */
export function haloCoruja3D(voz: EstadoVoz, fala: number, agoraMs: number) {
  return {
    halo: 0.25 + BRILHO_BASE[voz] * 0.35 + fala * 0.5,
    ondas: Array.from({ length: ONDAS }, (_, i) => {
      const fase = ((agoraMs / ONDA_MS) + i / ONDAS) % 1;
      return { r: 400 + fase * 140, opacidade: fala * (1 - fase) * 0.9 };
    }),
  };
}

/**
 * Intensidade do emissivo (visor, fones, microfone, frisos) por quadro.
 * Falando: segue o áudio suavizado (sobe rápido, desce devagar). Ouvindo:
 * aceso e firme. Pensando: pulsa devagar. Ocioso: respira baixo.
 */
export function brilhoCoruja3D(m: MemoriaBrilho, voz: EstadoVoz, nivelAudio: number, agoraMs: number): number {
  const alvo = voz === 'falando' ? Math.min(1, Math.max(0, nivelAudio)) : 0;
  m.nivel += (alvo - m.nivel) * (alvo > m.nivel ? 0.45 : 0.12);
  const t = agoraMs / 1000;
  switch (voz) {
    case 'falando': return 0.75 + m.nivel * 2.2;
    case 'ouvindo': return 1.25 + Math.sin(t * 3.2) * 0.08;
    case 'pensando': return 0.7 + (Math.sin(t * 2.4) * 0.5 + 0.5) * 0.9;
    default: return 0.45 + (Math.sin(t * 1.05) * 0.5 + 0.5) * 0.25;
  }
}

/** Aceno de cabeça extra na fala (rad), a partir do nível suavizado em `MemoriaBrilho`. */
export function acenoFala(m: MemoriaBrilho, voz: EstadoVoz): number {
  return voz === 'falando' ? m.nivel * ACENO_FALA_RAD : 0;
}
