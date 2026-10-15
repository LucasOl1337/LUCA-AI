import type { EstadoVoz } from './canal';
import { suavizarBoca } from './lipSync';

/**
 * Rig do Avatar LUCA. Cada peça animável do SVG leva `data-rig` e os
 * parâmetros em `data-*`; o laço escreve só o atributo `transform`, sem
 * re-render do React. Atributo (e não CSS) para o SVG exportado ficar igual.
 *
 * - abre:    escala vertical a partir do topo (cx, cy), de `min` a 1, pela boca.
 * - desce:   desce `k` px pela boca (bico de baixo, queixo).
 * - pisca:   escala vertical no centro (cx, cy) pela pálpebra.
 * - olhar:   desloca `k` px na direção do olhar.
 * - respira: sobe e desce `k` px devagar.
 */

export interface ValoresRig { boca: number; palpebra: number; olharX: number; olharY: number; respiro: number }

export const RIG_PARADO: ValoresRig = { boca: 0, palpebra: 1, olharX: 0, olharY: 0, respiro: 0 };

function escalaY(cx: number, cy: number, s: number) {
  return `translate(${cx} ${cy}) scale(1 ${s.toFixed(3)}) translate(${-cx} ${-cy})`;
}

export function rigTransform(tipo: string, p: { cx?: number; cy?: number; k?: number; min?: number }, v: ValoresRig): string {
  const { cx = 0, cy = 0, k = 0, min = 0.12 } = p;
  switch (tipo) {
    case 'abre': return escalaY(cx, cy, min + (1 - min) * v.boca);
    case 'desce': return `translate(0 ${(v.boca * k).toFixed(2)})`;
    case 'pisca': return escalaY(cx, cy, Math.max(0.06, v.palpebra));
    case 'olhar': return `translate(${(v.olharX * k).toFixed(2)} ${(v.olharY * k).toFixed(2)})`;
    case 'respira': return `translate(0 ${(v.respiro * k).toFixed(2)})`;
    default: return '';
  }
}

/** Pálpebra numa piscada de `duracao` ms que começou em `inicio`: 1 aberto, ~0 fechado. */
export function palpebraNaPiscada(agora: number, inicio: number, duracao = 150): number {
  const t = (agora - inicio) / duracao;
  if (t <= 0 || t >= 1) return 1;
  return Math.abs(1 - 2 * t);
}

interface PecaRig { el: SVGElement; tipo: string; p: { cx?: number; cy?: number; k?: number; min?: number } }

function lerPecas(svg: SVGSVGElement): PecaRig[] {
  return Array.from(svg.querySelectorAll<SVGElement>('[data-rig]')).map((el) => ({
    el,
    tipo: el.dataset.rig || '',
    p: {
      cx: Number(el.dataset.cx || 0), cy: Number(el.dataset.cy || 0),
      k: Number(el.dataset.k || 0), min: el.dataset.min ? Number(el.dataset.min) : undefined,
    },
  }));
}

/** Liga o laço de animação; devolve a função que para. */
export function animarAvatar(svg: SVGSVGElement, lerVoz: () => EstadoVoz, nivelRef: { current: number }): () => void {
  const pecas = lerPecas(svg);
  const v: ValoresRig = { ...RIG_PARADO };
  let anterior = performance.now();
  let proximaPiscada = anterior + 1200;
  let piscadaInicio = -1;
  let proximoOlhar = anterior + 1500;
  let alvoX = 0;
  let quadro = 0;

  const passo = (agora: number) => {
    const dt = Math.min(100, agora - anterior);
    anterior = agora;
    const voz = lerVoz();
    const alvoBoca = voz === 'falando' ? nivelRef.current : 0;
    v.boca = suavizarBoca(v.boca, alvoBoca, dt);

    if (agora >= proximaPiscada) { piscadaInicio = agora; proximaPiscada = agora + 2400 + Math.random() * 3200; }
    const aberto = voz === 'pensando' ? 0.62 : 1;
    v.palpebra = aberto * palpebraNaPiscada(agora, piscadaInicio);

    if (agora >= proximoOlhar) { alvoX = (Math.random() * 2 - 1) * 0.6; proximoOlhar = agora + 1400 + Math.random() * 2600; }
    const alvoY = voz === 'pensando' ? -1 : 0;
    const xAlvo = voz === 'pensando' ? 0.5 : voz === 'ouvindo' ? 0 : alvoX;
    v.olharX += (xAlvo - v.olharX) * Math.min(1, dt / 90);
    v.olharY += (alvoY - v.olharY) * Math.min(1, dt / 160);

    v.respiro = Math.sin(agora / (voz === 'ocioso' ? 900 : 650));

    for (const peca of pecas) peca.el.setAttribute('transform', rigTransform(peca.tipo, peca.p, v));
    quadro = requestAnimationFrame(passo);
  };
  quadro = requestAnimationFrame(passo);
  return () => cancelAnimationFrame(quadro);
}
