import * as THREE from 'three';
/** Estacas baixas e marcas de chegada no mundo, não painel sobre o para-brisa. */
export function criarSinalizacaoCircuito(root: THREE.Group, rota: readonly { x: number; z: number }[], ground: (x: number, z: number) => number) {
  const poste = new THREE.CylinderGeometry(0.07, 0.07, 1.15, 6);
  const placa = new THREE.BoxGeometry(0.12, 0.32, 0.65);
  const madeira = new THREE.MeshStandardMaterial({ color: 0x745c34, roughness: 1 });
  const marca = new THREE.MeshStandardMaterial({ color: 0xede4ab, roughness: 0.9 });
  rota.forEach((p, i) => {
    for (const lado of [-1, 1]) {
      const z = p.z + lado * 5;
      const m = new THREE.Mesh(poste, madeira); m.position.set(p.x, ground(p.x, z) + 0.575, z);
      const t = new THREE.Mesh(placa, marca); t.position.set(p.x, ground(p.x, z) + 1, z);
      m.name = `circuito-estaca-${i}`; root.add(m, t);
    }
  });
  const fim = rota[rota.length - 1];
  const chegada = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 12), marca);
  chegada.name = 'circuito-chegada'; chegada.position.set(fim.x, ground(fim.x, fim.z) + 0.06, fim.z); root.add(chegada);
}
