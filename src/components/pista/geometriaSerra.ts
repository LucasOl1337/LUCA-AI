/**
 * Geometria da serra para o palco: fita de asfalto com faixas, acostamento,
 * guard-rail, barranco/encosta e leito de cascalho da área de escape. Tudo em
 * BufferGeometry por tiras ao longo da pista (poucos draw calls).
 */
import * as THREE from 'three';
import { ACOSTAMENTO_M, GUARD_RAIL_M, MEIA_PISTA_M, pontoLateral, SERRA, type PistaSerra } from './pistaSerra';

type Perfil = (s: number) => { lateral: number; dy: number; u: number }[];

/** Tira ao longo da pista: para cada `s`, uma linha de vértices com `perfil(s)`. */
export function fitaDaPista(pista: PistaSerra, perfil: Perfil, s0 = 0, s1 = pista.comprimentoM, passo = 2, vPorMetro = 0.1) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let linhas = 0, colunas = 0;
  for (let s = s0; s <= s1 + 1e-6; s += passo) {
    const cols = perfil(s); colunas = cols.length;
    for (const c of cols) {
      const p = pontoLateral(pista, s, c.lateral);
      pos.push(p.x, p.y + c.dy, p.z); uv.push(c.u, s * vPorMetro);
    }
    linhas += 1;
  }
  for (let i = 0; i < linhas - 1; i += 1) for (let j = 0; j < colunas - 1; j += 1) {
    const a = i * colunas + j, b = a + 1, c = a + colunas, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

const naEscape = (s: number) => s >= SERRA.escape.s0 - 4 && s <= SERRA.escape.s1;

/** Asfalto (u 0..1 entre as bordas) e acostamento de terra/cascalho fino. */
export function geometriasDaPista(pista: PistaSerra) {
  const asfalto = fitaDaPista(pista, () => [
    { lateral: -MEIA_PISTA_M, dy: 0.02, u: 0 }, { lateral: 0, dy: 0.05, u: 0.5 }, { lateral: MEIA_PISTA_M, dy: 0.02, u: 1 },
  ], 0, pista.comprimentoM, 2, 1 / 7.2);
  const acostamento = fitaDaPista(pista, (s) => [
    { lateral: -GUARD_RAIL_M - 0.6, dy: -0.02, u: 0 }, { lateral: -MEIA_PISTA_M, dy: 0.015, u: 0.3 },
    { lateral: MEIA_PISTA_M, dy: 0.015, u: 0.7 }, { lateral: naEscape(s) ? MEIA_PISTA_M + 2.2 : GUARD_RAIL_M + 0.6, dy: -0.02, u: 1 },
  ], 0, pista.comprimentoM, 2, 0.25);
  // Encosta: barranco subindo à esquerda e despenhadeiro descendo à direita (a serra cai para o vale).
  const barranco = fitaDaPista(pista, (s) => {
    const sobe = 8 + 5 * Math.sin(s * 0.013);
    // Faixa plana até -11 m: o animal sai do mato andando no chão, não de dentro do barranco.
    return [{ lateral: -70, dy: sobe + 22, u: 0 }, { lateral: -24, dy: sobe, u: 0.4 }, { lateral: -11, dy: 0.25, u: 0.8 }, { lateral: -GUARD_RAIL_M - 0.5, dy: 0, u: 1 }];
  }, 0, pista.comprimentoM, 4, 0.05);
  const vale = fitaDaPista(pista, (s) => {
    const fundo = 14 + 6 * Math.cos(s * 0.011);
    const borda = naEscape(s) ? SERRA.escape.lateral1 + 3 : GUARD_RAIL_M + 0.5;
    return [{ lateral: borda, dy: naEscape(s) ? 0.2 : -0.05, u: 0 }, { lateral: borda + 6, dy: -2.5, u: 0.3 }, { lateral: 40, dy: -fundo, u: 0.7 }, { lateral: 120, dy: -fundo - 18, u: 1 }];
  }, 0, pista.comprimentoM, 4, 0.05);
  // Leito de cascalho da área de escape: sobe de leve (rampa de frenagem).
  const e = SERRA.escape;
  const cascalho = fitaDaPista(pista, (s) => {
    const k = Math.min(1, (s - e.s0) / 30), sobe = Math.max(0, (s - e.s0) / (e.s1 - e.s0)) * 1.4;
    return [{ lateral: MEIA_PISTA_M + 0.6, dy: 0.03, u: 0 }, { lateral: MEIA_PISTA_M + 2.2 + (e.lateral1 - MEIA_PISTA_M - 2.2) * k, dy: 0.08 + sobe, u: 1 }];
  }, e.s0 - 4, e.s1, 2, 0.3);
  return { asfalto, acostamento, barranco, vale, cascalho };
}

/** Faixas: bordas brancas contínuas e eixo amarelo duplo (proibido ultrapassar na serra). */
export function geometriaFaixas(pista: PistaSerra) {
  const tira = (lateral: number, largura: number) => fitaDaPista(pista, () => [
    { lateral: lateral - largura / 2, dy: 0.065, u: 0 }, { lateral: lateral + largura / 2, dy: 0.065, u: 1 },
  ], 0, pista.comprimentoM, 2, 1);
  return { brancas: [tira(-MEIA_PISTA_M + 0.25, 0.15), tira(MEIA_PISTA_M - 0.25, 0.15)], amarelas: [tira(-0.12, 0.1), tira(0.12, 0.1)] };
}

/** Postes e lâmina do guard-rail como instâncias (lâmina em segmentos de 4 m). */
export function guardRail(pista: PistaSerra, material: THREE.Material, postMaterial: THREE.Material) {
  const grupo = new THREE.Group(); grupo.name = 'serra-guard-rail';
  const lados: { s: number; lateral: number }[] = [];
  for (let s = 2; s < pista.comprimentoM - 2; s += 4) for (const lado of [-1, 1]) {
    if (lado > 0 && s >= SERRA.escape.s0 - 2 && s <= SERRA.escape.s1 + 2) continue;
    lados.push({ s, lateral: lado * GUARD_RAIL_M });
  }
  const lamina = new THREE.InstancedMesh(new THREE.BoxGeometry(4.05, 0.32, 0.06), material, lados.length);
  const poste = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.8, 0.12), postMaterial, lados.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), um = new THREE.Vector3(1, 1, 1);
  lados.forEach(({ s, lateral }, i) => {
    const a = pontoLateral(pista, s - 2, lateral), b = pontoLateral(pista, s + 2, lateral), c = pontoLateral(pista, s, lateral);
    const rumo = Math.atan2(-(b.z - a.z), b.x - a.x), arf = Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z));
    q.setFromEuler(e.set(0, rumo, arf, 'YZX'));
    lamina.setMatrixAt(i, m.compose(v.set(c.x, c.y + 0.62, c.z), q, um));
    poste.setMatrixAt(i, m.compose(v.set(c.x, c.y + 0.4, c.z), q, um));
  });
  lamina.castShadow = poste.castShadow = true; lamina.receiveShadow = true;
  grupo.add(lamina, poste);
  return grupo;
}

export { ACOSTAMENTO_M };
