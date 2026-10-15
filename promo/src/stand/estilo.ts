// Base visual comum dos Vídeos do stand (M5 dona; M6 importa).
// Assets esperados no --public-dir do render: brand/cyber-owl.jpg e
// brand/jetbrains-mono.woff2 (copiados de promo/public/brand).

export const FPS = 30;
export const LARGURA = 1920;
export const ALTURA = 1080;
/** Margem segura: a moldura de MDF do trator come as bordas do monitor. */
export const MARGEM = Math.round(LARGURA * 0.04);

export const COR = {
  fundo: '#090c11',
  superficie: '#10141b',
  azul: '#0a84ff',
  ciano: '#64d2ff',
  verde: '#30d158',
  alerta: '#ff9f0a',
  perigo: '#ff453a',
  texto: 'rgba(255,255,255,.94)',
  suave: 'rgba(255,255,255,.72)',
  mudo: 'rgba(255,255,255,.55)',
} as const;

export const FONTE = {
  texto: "Inter, -apple-system, 'Segoe UI', sans-serif",
  mono: "'Luca Mono', ui-monospace, monospace",
} as const;

export const s = (segundos: number) => Math.round(segundos * FPS);

/** Ponto em pixels da captura, no tempo t (segundos desde o início do vídeo capturado). */
export type PontoNoTempo = { t: number; x: number; y: number };

/** Rastro gravado pela captura (timings.json): base do zoom no cursor. */
export type Rastro = {
  viewport: { largura: number; altura: number };
  cliques: PontoNoTempo[];
  cursor: PontoNoTempo[];
  /** Marca nomeada de cada bloco do roteiro, em segundos da captura. */
  marcas: Record<string, number>;
};

/** Trecho de legenda; a mesma lista gera a legenda na tela e o .srt. */
export type Trecho = { inicio: number; fim: number; texto: string };

/** Rótulo de verdade exibido na tela: o vídeo nunca mistura simulado com real sem dizer. */
export type Verdade = 'real' | 'simulado' | 'esquema' | 'equipamento físico' | 'demonstrativo';
