// Uma lista de trechos gera a legenda da tela e o .srt (mesma fonte).

import type { Trecho } from './estilo.ts';

export function trechoEm(t: number, trechos: Trecho[]): Trecho | null {
  return trechos.find((x) => t >= x.inicio && t < x.fim) ?? null;
}

const carimbo = (seg: number) => {
  const ms = Math.round(seg * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const sc = Math.floor((ms % 60_000) / 1000);
  const r = ms % 1000;
  const p = (n: number, d = 2) => String(n).padStart(d, '0');
  return `${p(h)}:${p(m)}:${p(sc)},${p(r, 3)}`;
};

export function paraSrt(trechos: Trecho[]): string {
  return trechos
    .map((x, i) => `${i + 1}\n${carimbo(x.inicio)} --> ${carimbo(x.fim)}\n${x.texto}\n`)
    .join('\n');
}
