import type { EstadoVoz } from './canal';
import { suavizarBoca } from './lipSync';
import coruja3dGlbComHash from '../../../public/stand/avatar/coruja-3d/coruja-3d.glb?url';

/**
 * Coruja 3D (variante `coruja-3d`): parâmetros puros, sem three.js, para o
 * componente e os testes. O GLB e a origem estão em
 * `public/stand/avatar/coruja-3d/` (ver `.provenance.json`); o pipeline em
 * `scripts/stand/package-coruja-3d.py`.
 */

/**
 * GLB pelo `?url` do Vite: no build sai `/assets/coruja-3d-<hash>.glb`, que o
 * servidor marca `immutable` (sem revalidar 1 MB a cada F5 do quiosque).
 */
export const CORUJA_3D_URL = coruja3dGlbComHash;
/** Caminho público fixo: o manifesto `.textures.json` e os JPGs ficam ao lado dele. */
export const CORUJA_3D_PUBLICO = '/stand/avatar/coruja-3d/coruja-3d.glb';

/** Um clipe em laço por estado de voz; `aceno` toca uma vez quando a cena abre. */
export const CLIPE_POR_VOZ: Readonly<Record<EstadoVoz, string>> = Object.freeze({
  ocioso: 'ocioso', ouvindo: 'ouvindo', pensando: 'pensando', falando: 'falando',
});
export const CLIPE_ENTRADA = 'aceno';
/** Toca uma vez quando a fala termina e a coruja volta ao ocioso. */
export const CLIPE_FELIZ = 'feliz';
/** Malha da tela dos olhos no visor (textura em canvas, ver `coruja3dOlhos.ts`). */
export const MALHA_OLHOS = 'CorujaOlhos';
export const CROSSFADE_S = 0.35;

/** Osso do pescoço (rig avian do Tripo) que soma o aceno de cabeça da fala por cima do clipe. */
export const OSSO_PESCOCO = 'tripoHead_1';
/** Osso da cabeça: segue o olhar e balança de leve por cima do clipe. */
export const OSSO_CABECA = 'tripoHead_2';
/** Inclinação máxima extra da cabeça com o áudio no máximo, em radianos. */
export const ACENO_FALA_RAD = 0.14;

/** Moldura de busto, como a arte da Coruja A: topo dos tufos até o peito (coruja ≈1 m, pés em y=0). */
export const ENQUADRAMENTO = Object.freeze({ alvoY: 0.72, altura: 0.6, largura: 0.6, fov: 24 });

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

/**
 * Bico: morph `bico_abre` na malha principal (bico de cima sobe 20° na
 * dobradiça) e em `CorujaRosto` (boca escura e bico de baixo), ver
 * `scripts/stand/coruja3d_rosto.py`. 0 = fechado, 1 = aberto. A piscada não é
 * morph: `rostoCoruja3D().piscar` vai para a tela dos olhos.
 */
export const MORPH_BICO = 'bico_abre';
/**
 * A fala de teste fica em ~0,4 de nível suavizado (p90 0,65): sem ganho o bico
 * passa a maior parte da fala meio aberto e não se lê a 2–3 m do totem.
 */
export const GANHO_BICO = 1.6;
export const PISCADA_MS = 120;
export const PISCADA_INTERVALO_MS = Object.freeze({ min: 2000, max: 6000 });
/** Pensando: pálpebra só um pouco baixa; mais que isso, a tela dos olhos lê como sono ou tristeza (juiz cego, 21/10). */
export const PALPEBRA_PENSANDO = 0.12;

export interface MemoriaRosto {
  /** Quando a próxima piscada começa (ms, relógio do rAF). */
  proxima: number;
  /** Início da piscada em curso, ou -1. */
  inicio: number;
  bico: number;
  anterior: number;
}

export function novaMemoriaRosto(agoraMs: number, sorteio: () => number = Math.random): MemoriaRosto {
  return { proxima: agoraMs + intervaloPiscada(sorteio), inicio: -1, bico: 0, anterior: agoraMs };
}

function intervaloPiscada(sorteio: () => number): number {
  const { min, max } = PISCADA_INTERVALO_MS;
  return min + sorteio() * (max - min);
}

/**
 * Pesos dos morph targets por quadro. Pisca a cada 2–6 s por 120 ms (fecha e
 * abre em triângulo), nunca durante o aceno de entrada nem com movimento
 * reduzido. Pensando deixa a pálpebra meio caída. O bico só abre falando,
 * pelo nível de áudio suavizado como a boca da Coruja A (`suavizarBoca`).
 */
export function rostoCoruja3D(
  m: MemoriaRosto,
  voz: EstadoVoz,
  nivelAudio: number,
  agoraMs: number,
  { acenando = false, movimentoReduzido = false, sorteio = Math.random }:
    { acenando?: boolean; movimentoReduzido?: boolean; sorteio?: () => number } = {},
): { piscar: number; bico: number } {
  const dt = Math.min(100, Math.max(0, agoraMs - m.anterior));
  m.anterior = agoraMs;
  m.bico = suavizarBoca(m.bico, voz === 'falando' ? nivelAudio : 0, dt);

  const base = voz === 'pensando' ? PALPEBRA_PENSANDO : 0;
  if (movimentoReduzido || acenando) {
    // Sem piscada: com movimento reduzido nunca; no aceno, adia para depois dele.
    m.inicio = -1;
    if (acenando && m.proxima <= agoraMs) m.proxima = agoraMs + intervaloPiscada(sorteio);
    return { piscar: base, bico: Math.min(1, m.bico * GANHO_BICO) };
  }
  if (m.inicio < 0 && agoraMs >= m.proxima) {
    m.inicio = agoraMs;
    m.proxima = agoraMs + PISCADA_MS + intervaloPiscada(sorteio);
  }
  let fechado = 0;
  if (m.inicio >= 0) {
    const t = (agoraMs - m.inicio) / PISCADA_MS;
    if (t >= 1) m.inicio = -1;
    else fechado = 1 - Math.abs(1 - 2 * t);
  }
  return { piscar: base + (1 - base) * fechado, bico: Math.min(1, m.bico * GANHO_BICO) };
}

/** Aceno de cabeça extra na fala (rad), a partir do nível suavizado em `MemoriaBrilho`. */
export function acenoFala(m: MemoriaBrilho, voz: EstadoVoz): number {
  return voz === 'falando' ? m.nivel * ACENO_FALA_RAD : 0;
}

export interface MemoriaCabeca { guinada: number; arfagem: number; rolagem: number; anterior: number }

export function novaMemoriaCabeca(): MemoriaCabeca {
  return { guinada: 0, arfagem: 0, rolagem: 0, anterior: -1 };
}

/** Pensando inclina a cabeça de lado (curiosa); ouvindo, um pouco. Radianos. */
const ROLAGEM_ESTADO: Readonly<Record<EstadoVoz, number>> = { ocioso: 0, ouvindo: 0.06, pensando: 0.13, falando: 0 };

/**
 * Micro-movimento da cabeça por cima do clipe (radianos, eixos da cena: guinada
 * em Y, arfagem em X, rolagem em Z). A cabeça segue o olhar com atraso de mola
 * (meia-vida ~200 ms), mais um balanço lento de duas senoides.
 */
export function cabecaViva(
  m: MemoriaCabeca,
  olhar: { x: number; y: number },
  voz: EstadoVoz,
  agoraMs: number,
): { guinada: number; arfagem: number; rolagem: number } {
  const dt = m.anterior < 0 ? 16 : Math.min(100, Math.max(0, agoraMs - m.anterior));
  m.anterior = agoraMs;
  const k = 1 - Math.pow(0.5, dt / 200);
  const t = agoraMs / 1000;
  m.guinada += (olhar.x * 0.17 - m.guinada) * k;
  m.arfagem += (-olhar.y * 0.1 - m.arfagem) * k;
  m.rolagem += (ROLAGEM_ESTADO[voz] - m.rolagem) * (1 - Math.pow(0.5, dt / 350));
  return {
    guinada: m.guinada + Math.sin(t * 0.53) * 0.025 + Math.sin(t * 1.31) * 0.01,
    arfagem: m.arfagem + Math.sin(t * 0.71 + 1.3) * 0.015,
    rolagem: m.rolagem + Math.sin(t * 0.37 + 0.6) * 0.012,
  };
}
