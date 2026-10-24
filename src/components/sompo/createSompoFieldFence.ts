import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Cerca de mourão e arame: vão entre mourões, altura e fios (m). */
export const CERCA_VAO_M = 3;
export const CERCA_ALTURA_M = 1.3;
export const CERCA_FIOS_M = [0.45, 0.8, 1.15] as const;

/** Grade dos carreadores do shader de talhões (createSompoPastureSurface: `/ vec2(46.0, 38.0) + vec2(.37, .61)`). */
export const CARREADOR_GRADE_M = [46, 38] as const;
export const CARREADOR_FASE = [0.37, 0.61] as const;
/** Porteira: vão livre (m) e folga mínima até o canto da cerca. */
export const PORTEIRA_VAO_M = 4.4;
const PORTEIRA_CANTO_M = 4;

/** Onde cada carreador cruza a cerca: centro da porteira e o lado (eixo que o carreador atravessa). */
export function porteirasDaCerca(meio: number) {
  const linhas = (grade: number, fase: number) => {
    const out: number[] = [];
    for (let k = Math.ceil((-meio) / grade + fase); k <= Math.floor(meio / grade + fase); k++) {
      const v = (k - fase) * grade;
      if (Math.abs(v) <= meio - PORTEIRA_CANTO_M) out.push(v);
    }
    return out;
  };
  const portas: { x: number; z: number; lado: 'x' | 'z' }[] = [];
  // Carreador em x constante corre ao longo de z: cruza os lados z = ±meio.
  for (const x of linhas(CARREADOR_GRADE_M[0], CARREADOR_FASE[0])) for (const z of [-meio, meio]) portas.push({ x, z, lado: 'z' });
  for (const z of linhas(CARREADOR_GRADE_M[1], CARREADOR_FASE[1])) for (const x of [-meio, meio]) portas.push({ x, z, lado: 'x' });
  return portas;
}

/** Porteira de fazenda em coordenadas locais (x ao longo da cerca, y para cima): 2 esteios, folha de 5 tábuas com mão-francesa. */
function geometriaPorteira() {
  const partes: THREE.BufferGeometry[] = [];
  const caixa = (w: number, h: number, d: number, x: number, y: number, rz = 0) => {
    const g = new THREE.BoxGeometry(w, h, d); g.rotateZ(rz); g.translate(x, y, 0); partes.push(g);
  };
  const meioVao = PORTEIRA_VAO_M / 2;
  for (const lado of [-1, 1]) {
    const esteio = new THREE.CylinderGeometry(0.1, 0.12, 1.9, 6); esteio.translate(lado * (meioVao + 0.12), 0.7, 0); partes.push(esteio);
  }
  const folha = PORTEIRA_VAO_M - 0.1;
  for (let i = 0; i < 5; i++) caixa(folha, 0.09, 0.04, 0, 0.25 + i * 0.25);
  for (const x of [-folha / 2 + 0.04, 0, folha / 2 - 0.04]) caixa(0.08, 1.12, 0.05, x, 0.75);
  const diag = Math.hypot(folha / 2, 1.0);
  caixa(diag, 0.08, 0.05, -folha / 4, 0.75, Math.atan2(1.0, folha / 2));
  caixa(diag, 0.08, 0.05, folha / 4, 0.75, -Math.atan2(1.0, folha / 2));
  const g = mergeGeometries(partes.map((p) => p.toNonIndexed()));
  partes.forEach((p) => p.dispose());
  return g;
}

/** Mourões ao longo do quadrado |x|,|z| = meio, um por vão, cantos incluídos uma vez. */
export function mouroesDaCerca(meio: number, vao = CERCA_VAO_M) {
  const porLado = Math.max(1, Math.round(2 * meio / vao));
  const passo = 2 * meio / porLado;
  const pontos: { x: number; z: number; canto: boolean }[] = [];
  const lados: [number, number, number, number][] = [[-meio, -meio, 1, 0], [meio, -meio, 0, 1], [meio, meio, -1, 0], [-meio, meio, 0, -1]];
  for (const [x0, z0, dx, dz] of lados) {
    for (let i = 0; i < porLado; i++) pontos.push({ x: x0 + dx * passo * i, z: z0 + dz * passo * i, canto: i === 0 });
  }
  return pontos;
}

/**
 * Cerca do limite físico do trator (TRATOR.cercaM): antes o trator parava numa
 * parede invisível. Só visual, sem colisor nem eco: o limite continua sendo o
 * da física. Mourões de eucalipto instanciados (4 faces; 1 draw call + sombra) e
 * três fios de arame instanciados (1 draw call), seguindo o relevo. ~12k triângulos
 * por quadro com a sombra (eram ~21k com mourão de 6 faces e fio em caixa).
 */
export function createSompoFieldFence(parent: THREE.Object3D, meio: number, ground: (x: number, z: number) => number) {
  const root = new THREE.Group(); root.name = 'sompo-cerca-talhao';
  const portas = porteirasDaCerca(meio);
  // Mourão dentro do vão de uma porteira sai; o fio que atravessaria o vão também.
  const noVao = (x: number, z: number) => portas.some((p) => (p.lado === 'z'
    ? Math.abs(z - p.z) < 0.01 && Math.abs(x - p.x) < PORTEIRA_VAO_M / 2 + 0.3
    : Math.abs(x - p.x) < 0.01 && Math.abs(z - p.z) < PORTEIRA_VAO_M / 2 + 0.3));
  const todos = mouroesDaCerca(meio);
  const pontos = todos.filter((p) => p.canto || !noVao(p.x, p.z));
  const mouraoGeo = new THREE.CylinderGeometry(0.055, 0.075, CERCA_ALTURA_M + 0.25, 4); mouraoGeo.translate(0, (CERCA_ALTURA_M + 0.25) / 2 - 0.25, 0);
  const madeira = new THREE.MeshStandardMaterial({ color: 0x6b5638, roughness: 0.95 });
  const mouroes = new THREE.InstancedMesh(mouraoGeo, madeira, pontos.length);
  mouroes.name = 'cerca-mouroes'; mouroes.castShadow = true; mouroes.receiveShadow = true;
  // Arame: prisma de 3 faces sem tampa (6 triângulos) em vez de caixa (12); de 1 cm não se distingue.
  const fioGeo = new THREE.CylinderGeometry(0.009, 0.009, 1, 3, 1, true); fioGeo.rotateZ(-Math.PI / 2); fioGeo.translate(0.5, 0, 0);
  const arame = new THREE.MeshStandardMaterial({ color: 0x5d5f5c, roughness: 0.55, metalness: 0.6 });
  const fios = new THREE.InstancedMesh(fioGeo, arame, pontos.length * CERCA_FIOS_M.length);
  fios.name = 'cerca-fios';
  const t = new THREE.Object3D(), a = new THREE.Vector3(), b = new THREE.Vector3();
  const alturas = pontos.map((p) => ground(p.x, p.z));
  let nFios = 0;
  pontos.forEach((p, i) => {
    // Variação leve por mourão (prumo e espessura) para não ler como grade.
    const r = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    t.position.set(p.x, alturas[i], p.z); t.rotation.set(r * 0.05, r * 3, -r * 0.04);
    const s = p.canto ? 1.6 : 0.9 + Math.abs(r) * 0.2; t.scale.set(s, 1, s);
    t.updateMatrix(); mouroes.setMatrixAt(i, t.matrix);
    const j = (i + 1) % pontos.length, q = pontos[j];
    // Vizinhos que não são consecutivos no traçado original: entre eles há uma porteira.
    if (Math.hypot(q.x - p.x, q.z - p.z) > CERCA_VAO_M * 1.5) return;
    CERCA_FIOS_M.forEach((h, k) => {
      a.set(p.x, alturas[i] + h, p.z); b.set(q.x, alturas[j] + h, q.z);
      const d = b.clone().sub(a);
      t.position.copy(a); t.rotation.set(0, 0, 0); t.scale.set(d.length(), 1, 1);
      t.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.normalize());
      t.updateMatrix(); fios.setMatrixAt(nFios++, t.matrix);
    });
  });
  fios.count = nFios;
  let porteiraGeo: THREE.BufferGeometry | null = null, porteiras: THREE.InstancedMesh | null = null;
  if (portas.length) {
    porteiraGeo = geometriaPorteira();
    porteiras = new THREE.InstancedMesh(porteiraGeo, madeira, portas.length);
    porteiras.name = 'cerca-porteiras'; porteiras.castShadow = true; porteiras.receiveShadow = true;
    portas.forEach((p, i) => {
      t.position.set(p.x, ground(p.x, p.z), p.z); t.rotation.set(0, p.lado === 'z' ? 0 : Math.PI / 2, 0); t.scale.set(1, 1, 1);
      t.updateMatrix(); porteiras!.setMatrixAt(i, t.matrix);
    });
    porteiras.instanceMatrix.needsUpdate = true; porteiras.computeBoundingSphere();
  }
  mouroes.instanceMatrix.needsUpdate = true; fios.instanceMatrix.needsUpdate = true;
  mouroes.computeBoundingSphere(); fios.computeBoundingSphere();
  root.add(mouroes, fios); if (porteiras) root.add(porteiras); parent.add(root);
  return {
    root, mouroes: pontos.length, porteiras: portas.length,
    dispose() {
      root.removeFromParent();
      mouroes.dispose(); fios.dispose(); porteiras?.dispose(); porteiraGeo?.dispose(); mouraoGeo.dispose(); fioGeo.dispose(); madeira.dispose(); arame.dispose();
    },
  };
}
