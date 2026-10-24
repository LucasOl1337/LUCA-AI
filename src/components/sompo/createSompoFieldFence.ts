import * as THREE from 'three';

/** Cerca de mourão e arame: vão entre mourões, altura e fios (m). */
export const CERCA_VAO_M = 3;
export const CERCA_ALTURA_M = 1.3;
export const CERCA_FIOS_M = [0.45, 0.8, 1.15] as const;

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
 * da física. Mourões de eucalipto instanciados (1 draw call + sombra) e três
 * fios de arame instanciados (1 draw call), seguindo o relevo.
 */
export function createSompoFieldFence(parent: THREE.Object3D, meio: number, ground: (x: number, z: number) => number) {
  const root = new THREE.Group(); root.name = 'sompo-cerca-talhao';
  const pontos = mouroesDaCerca(meio);
  const mouraoGeo = new THREE.CylinderGeometry(0.055, 0.075, CERCA_ALTURA_M + 0.25, 6); mouraoGeo.translate(0, (CERCA_ALTURA_M + 0.25) / 2 - 0.25, 0);
  const madeira = new THREE.MeshStandardMaterial({ color: 0x6b5638, roughness: 0.95 });
  const mouroes = new THREE.InstancedMesh(mouraoGeo, madeira, pontos.length);
  mouroes.name = 'cerca-mouroes'; mouroes.castShadow = true; mouroes.receiveShadow = true;
  const fioGeo = new THREE.BoxGeometry(1, 0.018, 0.018); fioGeo.translate(0.5, 0, 0);
  const arame = new THREE.MeshStandardMaterial({ color: 0x5d5f5c, roughness: 0.55, metalness: 0.6 });
  const fios = new THREE.InstancedMesh(fioGeo, arame, pontos.length * CERCA_FIOS_M.length);
  fios.name = 'cerca-fios';
  const t = new THREE.Object3D(), a = new THREE.Vector3(), b = new THREE.Vector3();
  const alturas = pontos.map((p) => ground(p.x, p.z));
  pontos.forEach((p, i) => {
    // Variação leve por mourão (prumo e espessura) para não ler como grade.
    const r = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    t.position.set(p.x, alturas[i], p.z); t.rotation.set(r * 0.05, r * 3, -r * 0.04);
    const s = p.canto ? 1.6 : 0.9 + Math.abs(r) * 0.2; t.scale.set(s, 1, s);
    t.updateMatrix(); mouroes.setMatrixAt(i, t.matrix);
    const j = (i + 1) % pontos.length, q = pontos[j];
    CERCA_FIOS_M.forEach((h, k) => {
      a.set(p.x, alturas[i] + h, p.z); b.set(q.x, alturas[j] + h, q.z);
      const d = b.clone().sub(a);
      t.position.copy(a); t.rotation.set(0, 0, 0); t.scale.set(d.length(), 1, 1);
      t.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.normalize());
      t.updateMatrix(); fios.setMatrixAt(i * CERCA_FIOS_M.length + k, t.matrix);
    });
  });
  mouroes.instanceMatrix.needsUpdate = true; fios.instanceMatrix.needsUpdate = true;
  mouroes.computeBoundingSphere(); fios.computeBoundingSphere();
  root.add(mouroes, fios); parent.add(root);
  return {
    root, mouroes: pontos.length,
    dispose() {
      root.removeFromParent();
      mouroes.dispose(); fios.dispose(); mouraoGeo.dispose(); fioGeo.dispose(); madeira.dispose(); arame.dispose();
    },
  };
}
