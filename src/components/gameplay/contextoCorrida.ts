/** Snapshot local; consultar não dispara evento, fala ou requisição. */
export interface ContextoCorrida {
  velocidadeKph: number;
  distanciaCm: number | null;
  fase: 'dirigindo' | 'pausa' | 'fim';
}
let ler: (() => ContextoCorrida) | null = null;
export function registrarContextoCorrida(fonte: () => ContextoCorrida) {
  ler = fonte;
  return () => { if (ler === fonte) ler = null; };
}
export function contextoDaCorrida(tela: string) {
  if (!tela.includes('Tela atual: simulacao')) return tela;
  const atual = ler?.();
  if (!atual) return `${tela} Corrida: preparação antes de dirigir.`;
  const distancia = atual.distanciaCm === null || atual.distanciaCm > 400 ? 'fora do alcance de 4 m' : `${Math.max(0, atual.distanciaCm).toFixed(0)} cm`;
  return `${tela} Corrida: ${atual.fase}; velocidade ${atual.velocidadeKph.toFixed(1)} km/h; obstáculo frontal ${distancia}.`;
}
