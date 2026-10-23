import * as THREE from 'three';

export type VistaTrator = 'cabine' | 'externa';
let vistaSessao: VistaTrator = 'cabine';
export const lerVistaTrator = () => vistaSessao;
export function alternarVistaTrator() {
  vistaSessao = vistaSessao === 'cabine' ? 'externa' : 'cabine';
  return vistaSessao;
}
/** Frente do MAX = +X local; câmera fica atrás e acima, sem mudar a física. */
export function criarVistaExterna() {
  const olho = new THREE.Vector3(), alvo = new THREE.Vector3();
  return (camera: THREE.PerspectiveCamera, maquina: THREE.Object3D) => {
    olho.set(-10, 6, 0); alvo.set(2.5, 1.2, 0);
    maquina.localToWorld(olho); maquina.localToWorld(alvo);
    camera.position.copy(olho); camera.up.set(0, 1, 0); camera.lookAt(alvo);
  };
}
