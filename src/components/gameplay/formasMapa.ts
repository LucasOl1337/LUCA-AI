/**
 * Acabamento visual do mapa do operador (pedido do Linz, 24/10 12:18): zonas e
 * manchas de risco com contorno arredondado em vez de blocos quadrados, e o
 * trator em azul. Só desenho: nenhuma função aqui decide geofence, colisão,
 * distância ou alerta. Essas continuam em `geofenceTalhao`, `circuito` e
 * `fisicaTrator`, com os mesmos números.
 *
 * Tudo em metros, na convenção de tela do `MapaTalhao` (x da tela = z do
 * palco, y da tela = -x do palco).
 */
import { relevoRampaLateral, RAMPA_LATERAL } from './rampaLateral';

export interface PontoPalco { x: number; z: number }

/** Azul do trator no mapa e contorno claro para destacar sobre verde, amarelo e vermelho. */
export const COR_TRATOR_MAPA = Object.freeze({ corpo: '#1f7aff', contorno: '#eaf3ff', velho: '#8ec5ff' });

/**
 * Retângulo de zona (anel do `geofenceTalhao`) desenhado com cantos redondos
 * de raio `raioM`. Para o desenho nunca parecer menor que a zona real, a forma
 * cresce `raio·(1 − 1/√2)` para fora: assim o arco ainda passa por cima do
 * canto verdadeiro. A zona que vale para o alerta segue sendo o retângulo.
 */
export function retanguloArredondado(anel: readonly PontoPalco[], raioM = 3) {
  const xs = anel.map((p) => p.x), zs = anel.map((p) => p.z);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const r = Math.max(0, Math.min(raioM, (x1 - x0) / 2, (z1 - z0) / 2));
  const d = r * (1 - Math.SQRT1_2);
  // Tela: esquerda = z0, direita = z1, topo = -x1, base = -x0.
  const l = z0 - d, rt = z1 + d, t = -x1 - d, b = -x0 + d;
  const n = (v: number) => +v.toFixed(3);
  return `M${n(l + r)},${n(t)}H${n(rt - r)}A${r},${r} 0 0 1 ${n(rt)},${n(t + r)}V${n(b - r)}`
    + `A${r},${r} 0 0 1 ${n(rt - r)},${n(b)}H${n(l + r)}A${r},${r} 0 0 1 ${n(l)},${n(b - r)}`
    + `V${n(t + r)}A${r},${r} 0 0 1 ${n(l + r)},${n(t)}Z`;
}

/**
 * Inclinação do terreno da rampa lateral em graus, pela mesma diferença central
 * de 0,25 m que o mapa de encosta usa. É a máxima do ponto; a rolagem real
 * depende do rumo.
 */
export function inclinacaoTerrenoGraus(x: number, z: number, h = 0.25) {
  const gx = (relevoRampaLateral(x + h, z) - relevoRampaLateral(x - h, z)) / (2 * h);
  const gz = (relevoRampaLateral(x, z + h) - relevoRampaLateral(x, z - h)) / (2 * h);
  return Math.atan(Math.hypot(gx, gz)) * 180 / Math.PI;
}

type Laco = PontoPalco[];

/**
 * Curvas de nível `campo(x, z) = limiar` por marching squares numa grade de
 * `passoM`. Devolve laços fechados em metros do palco. A grade começa uma
 * casa fora da caixa, onde o campo está abaixo do limiar, então todo laço fecha.
 */
export function curvasDeNivel(
  campo: (x: number, z: number) => number,
  limiar: number,
  caixa: { x0: number; x1: number; z0: number; z1: number },
  passoM = 0.5,
): Laco[] {
  const nx = Math.ceil((caixa.x1 - caixa.x0) / passoM) + 3, nz = Math.ceil((caixa.z1 - caixa.z0) / passoM) + 3;
  const X = (i: number) => caixa.x0 + (i - 1) * passoM, Z = (j: number) => caixa.z0 + (j - 1) * passoM;
  const v: number[][] = [];
  for (let i = 0; i < nx; i++) {
    v.push([]);
    for (let j = 0; j < nz; j++) v[i].push(i === 0 || j === 0 || i === nx - 1 || j === nz - 1 ? -Infinity : campo(X(i), Z(j)) - limiar);
  }
  // Ponto num lado da célula, interpolado; a chave é o lado, para emendar exato.
  const pontos = new Map<string, PontoPalco>();
  const lado = (i0: number, j0: number, i1: number, j1: number) => {
    const k = `${i0},${j0},${i1},${j1}`;
    if (!pontos.has(k)) {
      const a = v[i0][j0], b = v[i1][j1];
      const t = Number.isFinite(a) && Number.isFinite(b) ? a / (a - b) : Number.isFinite(a) ? 1 : 0;
      pontos.set(k, { x: X(i0) + (X(i1) - X(i0)) * t, z: Z(j0) + (Z(j1) - Z(j0)) * t });
    }
    return k;
  };
  const segs: [string, string][] = [];
  for (let i = 0; i < nx - 1; i++) {
    for (let j = 0; j < nz - 1; j++) {
      const a = v[i][j] >= 0, b = v[i + 1][j] >= 0, c = v[i + 1][j + 1] >= 0, d = v[i][j + 1] >= 0;
      const caso = (a ? 1 : 0) | (b ? 2 : 0) | (c ? 4 : 0) | (d ? 8 : 0);
      if (caso === 0 || caso === 15) continue;
      const ab = () => lado(i, j, i + 1, j), bc = () => lado(i + 1, j, i + 1, j + 1);
      const dc = () => lado(i, j + 1, i + 1, j + 1), ad = () => lado(i, j, i, j + 1);
      const centro = (v[i][j] + v[i + 1][j] + v[i + 1][j + 1] + v[i][j + 1]) / 4 >= 0;
      switch (caso) {
        case 1: case 14: segs.push([ad(), ab()]); break;
        case 2: case 13: segs.push([ab(), bc()]); break;
        case 4: case 11: segs.push([bc(), dc()]); break;
        case 8: case 7: segs.push([dc(), ad()]); break;
        case 3: case 12: segs.push([ad(), bc()]); break;
        case 6: case 9: segs.push([ab(), dc()]); break;
        case 5: if (centro) segs.push([ad(), dc()], [ab(), bc()]); else segs.push([ad(), ab()], [bc(), dc()]); break;
        case 10: if (centro) segs.push([ad(), ab()], [bc(), dc()]); else segs.push([ab(), bc()], [dc(), ad()]); break;
      }
    }
  }
  const vizinhos = new Map<string, string[]>();
  for (const [p, q] of segs) {
    vizinhos.set(p, [...(vizinhos.get(p) ?? []), q]);
    vizinhos.set(q, [...(vizinhos.get(q) ?? []), p]);
  }
  const usado = new Set<string>(), lacos: Laco[] = [];
  for (const inicio of vizinhos.keys()) {
    if (usado.has(inicio)) continue;
    const laco: string[] = [inicio];
    usado.add(inicio);
    let atual = inicio;
    for (;;) {
      const prox = (vizinhos.get(atual) ?? []).find((k) => !usado.has(k));
      if (!prox) break;
      usado.add(prox); laco.push(prox); atual = prox;
    }
    if (laco.length >= 3) lacos.push(laco.map((k) => pontos.get(k)!));
  }
  return lacos;
}

/**
 * Laço vira caminho SVG suave: passa pelo meio de cada lado e usa o vértice
 * como controle quadrático, o que tira o degrau sem mover a borda mais que
 * meia casa da grade.
 */
export function caminhoSuave(lacos: readonly Laco[]) {
  const n = (v: number) => +v.toFixed(2);
  return lacos.map((laco) => {
    const p = laco.map((q) => [q.z, -q.x] as const), m = p.length;
    const meio = (i: number) => [(p[i % m][0] + p[(i + 1) % m][0]) / 2, (p[i % m][1] + p[(i + 1) % m][1]) / 2];
    const ini = meio(0);
    let d = `M${n(ini[0])},${n(ini[1])}`;
    for (let i = 1; i <= m; i++) {
      const c = p[i % m], f = meio(i);
      d += `Q${n(c[0])},${n(c[1])} ${n(f[0])},${n(f[1])}`;
    }
    return `${d}Z`;
  }).join('');
}

/** Caixa onde a rampa lateral pode inclinar (fora dela o relevo extra é zero). */
const CAIXA_RAMPA = Object.freeze({ x0: RAMPA_LATERAL.inicioX, x1: RAMPA_LATERAL.fimX, z0: RAMPA_LATERAL.sopeZ, z1: RAMPA_LATERAL.peZ + 1 });

let cacheEncosta: { atencao: string; critica: string; lacosAtencao: Laco[]; lacosCritica: Laco[] } | null = null;
/**
 * Manchas de encosta para o mapa, nos limiares do `riscosCircuito` (12° atenção,
 * 20° crítica). `atencao` é o anel 12–20° (fill-rule evenodd), `critica` a
 * mancha ≥ 20°. Mesma região que a grade de células de 1 m, sem os degraus.
 * Calculado uma vez por página.
 */
export function manchasEncosta(atencaoGraus = 12, criticaGraus = 20) {
  if (!cacheEncosta) {
    const campo = (x: number, z: number) => inclinacaoTerrenoGraus(x, z);
    const lacosAtencao = curvasDeNivel(campo, atencaoGraus, CAIXA_RAMPA);
    const lacosCritica = curvasDeNivel(campo, criticaGraus, CAIXA_RAMPA);
    cacheEncosta = { atencao: caminhoSuave([...lacosAtencao, ...lacosCritica]), critica: caminhoSuave(lacosCritica), lacosAtencao, lacosCritica };
  }
  return cacheEncosta;
}

/** Ponto dentro de algum dos laços (par-ímpar). Usado no teste e por quem quiser conferir a mancha. */
export function dentroDosLacos(p: PontoPalco, lacos: readonly Laco[]) {
  let dentro = false;
  for (const laco of lacos) {
    for (let i = 0, j = laco.length - 1; i < laco.length; j = i++) {
      const a = laco[i], b = laco[j];
      if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) dentro = !dentro;
    }
  }
  return dentro;
}
