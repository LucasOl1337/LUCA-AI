import * as THREE from 'three';

const eMesh = (node: THREE.Object3D): node is THREE.Mesh => 'isMesh' in node && node.isMesh === true;
const eInstancia = (node: THREE.Object3D): node is THREE.InstancedMesh => eMesh(node) && 'isInstancedMesh' in node && node.isInstancedMesh === true;

/** Só cenário: não entra na lista de obstáculos nem altera o relevo da Direção. */
export const MARCOS_CAMPO = Object.freeze({
  fardos: [{ x: 26, z: 9, rumo: 0.2 }, { x: 43, z: 12, rumo: -0.35 }, { x: 64, z: 9, rumo: 0.55 }],
  arvores: [{ x: 12, z: 32, altura: 8 }, { x: 37, z: 30, altura: 10 }, { x: 62, z: 34, altura: 9 }, { x: 82, z: 31, altura: 11 }],
});

/** Compartilha malha/material já carregados. Só as matrizes instanciadas são nossas. */
export function criarCampoVisual(mundo: THREE.Object3D, fardo: THREE.Object3D) {
  const raiz = new THREE.Group();
  raiz.name = 'gameplay-campo-visual';
  const terreno = mundo.getObjectByName('sompo-agri-terrain');
  const arvore = mundo.getObjectByName('sompo-agri-treeline-generated-cerrado');
  if (!terreno || !eMesh(terreno)) return { raiz, descartar() {} };
  const solo = terreno;
  mundo.updateMatrixWorld(true);
  const raio = new THREE.Raycaster();
  const ponto = new THREE.Vector3();
  const baixo = new THREE.Vector3(0, -1, 0);
  const pose = new THREE.Object3D();
  const instancias: THREE.InstancedMesh[] = [];
  function altura(x: number, z: number) {
    ponto.set(x, 200, z);
    mundo.localToWorld(ponto);
    raio.set(ponto, baixo);
    const hit = raio.intersectObject(solo, false)[0];
    return hit ? mundo.worldToLocal(hit.point).y : null;
  }
  function adicionar(mesh: THREE.InstancedMesh) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    raiz.add(mesh);
    instancias.push(mesh);
  }
  const caixa = new THREE.Box3().setFromObject(fardo);
  const tamanho = caixa.getSize(new THREE.Vector3());
  if (Math.min(tamanho.x, tamanho.y, tamanho.z) > 0) {
    const escala = new THREE.Vector3(1.44 / tamanho.x, 1.44 / tamanho.y, 1.25 / tamanho.z);
    const origem = fardo.matrixWorld.clone().invert();
    fardo.traverse((node) => {
      if (!eMesh(node)) return;
      const mesh = new THREE.InstancedMesh(node.geometry, node.material, MARCOS_CAMPO.fardos.length);
      mesh.name = 'gameplay-fardos-decorativos';
      const local = new THREE.Matrix4().multiplyMatrices(origem, node.matrixWorld);
      let count = 0;
      for (const marco of MARCOS_CAMPO.fardos) {
        const y = altura(marco.x, marco.z);
        if (y === null) continue;
        pose.position.set(marco.x, y - caixa.min.y * escala.y, marco.z);
        pose.rotation.set(0, marco.rumo, 0);
        pose.scale.copy(escala);
        pose.updateMatrix();
        mesh.setMatrixAt(count++, new THREE.Matrix4().multiplyMatrices(pose.matrix, local));
      }
      mesh.count = count;
      adicionar(mesh);
    });
  }
  if (arvore && eInstancia(arvore)) {
    const mesh = new THREE.InstancedMesh(arvore.geometry, arvore.material, MARCOS_CAMPO.arvores.length);
    mesh.name = 'gameplay-arvores-decorativas';
    let count = 0;
    for (const [i, marco] of MARCOS_CAMPO.arvores.entries()) {
      const y = altura(marco.x, marco.z);
      if (y === null) continue;
      pose.position.set(marco.x, y - 0.15, marco.z);
      pose.rotation.set(0, i * 0.7, 0);
      pose.scale.set(marco.altura * 0.8, marco.altura, marco.altura * 0.8);
      pose.updateMatrix();
      mesh.setMatrixAt(count++, pose.matrix);
    }
    mesh.count = count;
    adicionar(mesh);
  }
  mundo.add(raiz);
  return {
    raiz,
    descartar() {
      raiz.removeFromParent();
      instancias.forEach((mesh) => mesh.dispose());
    },
  };
}
