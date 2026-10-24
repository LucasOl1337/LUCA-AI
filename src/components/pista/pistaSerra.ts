/**
 * Pista `serra-sem-freio`: rodovia de serra em descida, com curvas alternadas,
 * acostamento, guard-rail e área de escape. Pura (sem three.js): a física e o
 * palco leem a mesma polilinha. Referencial do palco agrícola: rumo 0 = +X,
 * rumo positivo gira para a esquerda, frente = (cos h, -sin h) em (x, z),
 * direita = (sin h, cos h). `lateral` positivo = à direita do sentido de descida.
 */

export interface TrechoSerra { comprimentoM: number; /** 1/m, positivo = curva à esquerda. */ curvatura: number; /** dy/ds (negativo desce). */ rampa: number; nome: string }
export interface AmostraPista { s: number; x: number; z: number; y: number; rumo: number; rampa: number; curvatura: number }

export const PASSO_PISTA_M = 2;
/** Meia largura do asfalto (duas faixas de 3,6 m), da pista até o fim do acostamento e até o guard-rail. */
export const MEIA_PISTA_M = 3.6;
export const ACOSTAMENTO_M = 5.6;
export const GUARD_RAIL_M = 5.9;
export const ALTURA_TOPO_M = 95;

const curva = (raioM: number, lado: 'esquerda' | 'direita') => (lado === 'esquerda' ? 1 : -1) / raioM;

export const TRECHOS_SERRA: readonly TrechoSerra[] = Object.freeze([
  { comprimentoM: 120, curvatura: 0, rampa: -0.02, nome: 'largada' },
  { comprimentoM: 140, curvatura: curva(220, 'esquerda'), rampa: -0.03, nome: 'curva suave' },
  { comprimentoM: 200, curvatura: 0, rampa: -0.02, nome: 'reta do pasto' },
  { comprimentoM: 120, curvatura: curva(120, 'direita'), rampa: -0.04, nome: 'curva do pasto' },
  { comprimentoM: 100, curvatura: 0, rampa: -0.07, nome: 'início da serra' },
  { comprimentoM: 140, curvatura: curva(110, 'esquerda'), rampa: -0.08, nome: 'curva da serra' },
  { comprimentoM: 160, curvatura: 0, rampa: -0.08, nome: 'reta da escape' },
  { comprimentoM: 150, curvatura: curva(100, 'direita'), rampa: -0.085, nome: 'curva fechada' },
  { comprimentoM: 100, curvatura: 0, rampa: -0.06, nome: 'reta baixa' },
  { comprimentoM: 130, curvatura: curva(130, 'esquerda'), rampa: -0.05, nome: 'última curva' },
  { comprimentoM: 200, curvatura: 0, rampa: -0.015, nome: 'pé da serra' },
].map((t) => Object.freeze(t)));

/** Marcos do cenário em metros de pista (s). */
export const SERRA = Object.freeze({
  /** Onde o Nelore atravessa (reta antes da curva à direita). */
  animalS: 400,
  /** O animal começa a andar quando o caminhão chega a esta distância dele. */
  animalGatilhoM: 120,
  /** O freio começa a falhar aqui (início da descida forte). */
  falhaFreioS: 620,
  /** Tempo da eficiência do freio cair de 1 a 0. */
  falhaFreioS_duracao: 1.5,
  /** Área de escape: leito de cascalho à direita, sem guard-rail. */
  escape: Object.freeze({ s0: 850, s1: 975, lateral0: GUARD_RAIL_M, lateral1: 15 }),
  chegadaS: 1520,
  /** Trecho de descida forte (hazard slope no mapa do Laboratório). */
  descida: Object.freeze({ s0: 580, s1: 1230 }),
});

export interface PistaSerra { amostras: readonly AmostraPista[]; comprimentoM: number }

/** Integra os trechos em amostras a cada `PASSO_PISTA_M`, a partir da origem, rumo 0, no topo. */
export function criarPistaSerra(trechos: readonly TrechoSerra[] = TRECHOS_SERRA): PistaSerra {
  const amostras: AmostraPista[] = [];
  let x = 0, z = 0, y = ALTURA_TOPO_M, rumo = 0, s = 0;
  amostras.push({ s, x, z, y, rumo, rampa: trechos[0].rampa, curvatura: trechos[0].curvatura });
  for (const t of trechos) {
    const passos = Math.round(t.comprimentoM / PASSO_PISTA_M);
    for (let i = 0; i < passos; i += 1) {
      const meio = rumo + t.curvatura * PASSO_PISTA_M / 2;
      x += Math.cos(meio) * PASSO_PISTA_M; z -= Math.sin(meio) * PASSO_PISTA_M;
      rumo += t.curvatura * PASSO_PISTA_M; y += t.rampa * PASSO_PISTA_M; s += PASSO_PISTA_M;
      amostras.push({ s, x, z, y, rumo, rampa: t.rampa, curvatura: t.curvatura });
    }
  }
  return { amostras: Object.freeze(amostras), comprimentoM: s };
}

export const PISTA_SERRA = criarPistaSerra();

/** Amostra interpolada na distância `s` (presa às pontas). */
export function pontoNaPista(pista: PistaSerra, s: number): AmostraPista {
  const a = pista.amostras;
  const f = Math.max(0, Math.min(a.length - 1, s / PASSO_PISTA_M));
  const i = Math.min(a.length - 2, Math.floor(f)), t = f - i, p = a[i], q = a[i + 1];
  return { s: p.s + (q.s - p.s) * t, x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t, y: p.y + (q.y - p.y) * t, rumo: p.rumo + (q.rumo - p.rumo) * t, rampa: p.rampa, curvatura: p.curvatura };
}

/** Ponto do mundo a `lateral` m do eixo (positivo à direita), na distância `s`. */
export function pontoLateral(pista: PistaSerra, s: number, lateral: number) {
  const p = pontoNaPista(pista, s);
  return { x: p.x + Math.sin(p.rumo) * lateral, z: p.z + Math.cos(p.rumo) * lateral, y: p.y, rumo: p.rumo };
}

export interface ProjecaoPista { s: number; lateral: number; y: number; rumo: number; rampa: number; curvatura: number; indice: number }

/**
 * Projeta (x, z) na pista. `dica` é o índice do quadro anterior: procura numa
 * janela em volta (a pista serpenteia, uma busca global podia pular de perna).
 */
export function projetarNaPista(pista: PistaSerra, x: number, z: number, dica = -1): ProjecaoPista {
  const a = pista.amostras;
  const de = dica < 0 ? 0 : Math.max(0, dica - 40), ate = dica < 0 ? a.length - 1 : Math.min(a.length - 1, dica + 40);
  let melhor = de, d2 = Infinity;
  for (let i = de; i <= ate; i += 1) { const dx = x - a[i].x, dz = z - a[i].z, d = dx * dx + dz * dz; if (d < d2) { d2 = d; melhor = i; } }
  const p = a[melhor];
  const fx = Math.cos(p.rumo), fz = -Math.sin(p.rumo);
  const along = (x - p.x) * fx + (z - p.z) * fz;
  const lateral = (x - p.x) * Math.sin(p.rumo) + (z - p.z) * Math.cos(p.rumo);
  const s = Math.max(0, Math.min(pista.comprimentoM, p.s + along));
  const q = pontoNaPista(pista, s);
  return { s, lateral, y: q.y, rumo: q.rumo, rampa: p.rampa, curvatura: p.curvatura, indice: melhor };
}

export function naAreaDeEscape(s: number, lateral: number) {
  const e = SERRA.escape;
  return s >= e.s0 && s <= e.s1 && lateral >= e.lateral0 - 0.3 && lateral <= e.lateral1;
}

/** Próxima curva à frente de `s` (até `alcanceM`): distância, lado e velocidade segura (0,3 g). */
export function proximaCurva(pista: PistaSerra, s: number, alcanceM = 220) {
  const a = pista.amostras;
  for (let i = Math.max(0, Math.floor(s / PASSO_PISTA_M)); i < a.length && a[i].s <= s + alcanceM; i += 1) {
    if (Math.abs(a[i].curvatura) > 1e-4) {
      const raio = 1 / Math.abs(a[i].curvatura);
      return { distanciaM: Math.max(0, a[i].s - s), lado: a[i].curvatura > 0 ? 'esquerda' as const : 'direita' as const, raioM: raio, seguraKph: Math.round(Math.sqrt(0.3 * 9.81 * raio) * 3.6 / 5) * 5 };
    }
  }
  return null;
}
