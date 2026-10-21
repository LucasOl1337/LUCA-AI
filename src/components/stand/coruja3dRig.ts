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

/** Moldura: a coruja (≈1 m, pés em y=0) inteira com folga, centro um pouco acima do peito. */
export const ENQUADRAMENTO = Object.freeze({ alvoY: 0.5, altura: 1.08, largura: 1.12, fov: 24 });

export interface MemoriaBrilho { nivel: number }

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
