import * as THREE from 'three';

/** Paleta semântica: a mesma cor quer dizer a mesma coisa no chip, no caminhão e no HUD. */
export const LAB_COLORS = Object.freeze({
  plus: '#4fd8ff',
  minus: '#b18cff',
  force: '#ffb547',
  coriolis: '#ff5fa8',
  ok: '#5eead4',
  warn: '#ffc46b',
  danger: '#ff5a5a',
});

export function createLabPalette() {
  return {
    plus: new THREE.Color(LAB_COLORS.plus),
    minus: new THREE.Color(LAB_COLORS.minus),
    force: new THREE.Color(LAB_COLORS.force),
    coriolis: new THREE.Color(LAB_COLORS.coriolis),
    ok: new THREE.Color(LAB_COLORS.ok),
    warn: new THREE.Color(LAB_COLORS.warn),
    danger: new THREE.Color(LAB_COLORS.danger),
  };
}

export function createLabMaterials() {
  // Silício do dispositivo: metálico, polido e com filme fino de óxido (iridescência).
  const device = new THREE.MeshPhysicalMaterial({
    name: 'silício do dispositivo', color: 0xaab2bf, metalness: 0.5, roughness: 0.38,
    iridescence: 0.32, iridescenceIOR: 1.46, iridescenceThicknessRange: [180, 460], envMapIntensity: 0.7,
  });
  // Peças que se mexem (massa, dedos móveis, molas): o mesmo silício, um tom mais quente.
  const moving = device.clone();
  moving.name = 'silício móvel';
  moving.color.set(0xc7c0b5);
  const cavity = new THREE.MeshStandardMaterial({ name: 'fundo da cavidade', color: 0x3a3f49, metalness: 0.45, roughness: 0.6 });
  const dieSide = new THREE.MeshPhysicalMaterial({ name: 'lateral do die', color: 0x5c6371, metalness: 0.6, roughness: 0.34 });
  const aluminum = new THREE.MeshStandardMaterial({ name: 'alumínio', color: 0xe2e6eb, metalness: 1, roughness: 0.3 });
  const gold = new THREE.MeshStandardMaterial({ name: 'ouro', color: 0xffc46a, metalness: 1, roughness: 0.18, envMapIntensity: 1.4 });
  const mold = new THREE.MeshStandardMaterial({ name: 'epóxi do molde', color: 0x1d1f23, metalness: 0.04, roughness: 0.62 });
  const lead = new THREE.MeshStandardMaterial({ name: 'leadframe estanhado', color: 0xd9d2c4, metalness: 1, roughness: 0.26 });
  const attach = new THREE.MeshStandardMaterial({ name: 'cola de prata', color: 0xa6aab0, metalness: 0.6, roughness: 0.55 });
  const capSilicon = new THREE.MeshPhysicalMaterial({
    name: 'tampa de silício', color: 0x8b919d, metalness: 0.62, roughness: 0.28,
    iridescence: 0.45, iridescenceIOR: 1.5, iridescenceThicknessRange: [220, 520],
  });
  const frit = new THREE.MeshStandardMaterial({ name: 'vedação de vidro', color: 0xe8e2d4, roughness: 0.78 });
  const anodized = new THREE.MeshStandardMaterial({ name: 'alumínio anodizado', color: 0x181a1f, metalness: 0.55, roughness: 0.4 });
  const brushed = new THREE.MeshPhysicalMaterial({
    name: 'alumínio escovado', color: 0xa3aab4, metalness: 0.92, roughness: 0.3, anisotropy: 0.7, anisotropyRotation: 0,
  });
  const chrome = new THREE.MeshStandardMaterial({ name: 'cromo', color: 0xeef0f3, metalness: 1, roughness: 0.07 });
  const brass = new THREE.MeshStandardMaterial({ name: 'latão', color: 0xcaa35c, metalness: 1, roughness: 0.26 });
  const rubber = new THREE.MeshStandardMaterial({ name: 'borracha', color: 0x121314, roughness: 0.9 });
  const all = [device, moving, cavity, dieSide, aluminum, gold, mold, lead, attach, capSilicon, frit, anodized, brushed, chrome, brass, rubber];
  return {
    device, moving, cavity, dieSide, aluminum, gold, mold, lead, attach, capSilicon, frit, anodized, brushed, chrome, brass, rubber,
    dispose() { all.forEach((material) => material.dispose()); },
  };
}

export type LabMaterials = ReturnType<typeof createLabMaterials>;

/**
 * Ambiente para reflexos: uma caixa escura com a janela quente atrás, calhas
 * frias no teto e um rebatedor na frente. É o que o silício e o ouro refletem.
 */
export function createLabEnvironment(renderer: THREE.WebGLRenderer) {
  const scene = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(34, 10, 26), new THREE.MeshBasicMaterial({ color: 0x14161a, side: THREE.BackSide }));
  room.position.set(0, 4.5, 3);
  scene.add(room);
  const panel = (w: number, h: number, color: THREE.Color, position: [number, number, number], rotation: [number, number, number]) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    scene.add(mesh);
  };
  // Janela: faixa quente embaixo, azul em cima.
  panel(25, 2.4, new THREE.Color(3.2, 1.9, 1.0), [0, 2.4, -9.8], [0, 0, 0]);
  panel(25, 4.2, new THREE.Color(0.9, 1.1, 1.6), [0, 5.7, -9.8], [0, 0, 0]);
  for (const z of [-4.5, 1.5, 7.5]) panel(18, 0.5, new THREE.Color(2.4, 2.6, 2.9), [0, 9.3, z], [Math.PI / 2, 0, 0]);
  panel(6, 3, new THREE.Color(0.55, 0.6, 0.7), [0, 3.5, 15.8], [0, Math.PI, 0]);
  panel(9, 3.4, new THREE.Color(0.55, 0.55, 0.52), [16.8, 3.9, -2.2], [0, -Math.PI / 2, 0]);
  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromScene(scene, 0.035);
  generator.dispose();
  scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh) { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }
  });
  return target;
}
