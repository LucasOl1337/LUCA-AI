import * as THREE from 'three';
import { createFirstPersonRig, MAX_CABIN_EYE } from '../../sompo/firstPersonCamera';
import type { CriarCameraGameplay } from '../GameplayKiosk';

/** Inclinar o olhar para a lateral e para baixo permite inspecionar o assento.
 * O olho avança dentro da cabine, como o operador se inclinando para fora do banco.
 * A vista frontal, o FOV e a atitude do trator continuam sendo os do rig padrão. */
export const criarCameraCabineMax: CriarCameraGameplay = (ativo, olhar) => {
  const base = createFirstPersonRig(ativo, olhar);
  const olho = new THREE.Vector3();
  const alvo = new THREE.Vector3();
  const cima = new THREE.Vector3();
  const atitude = new THREE.Quaternion();
  const matriz = new THREE.Matrix4();
  const inspecao = new THREE.Quaternion();
  return {
    active: base.active,
    update(camera, maquina) {
      base.update(camera, maquina);
      const lateral = THREE.MathUtils.smoothstep(Math.abs(olhar.current.yaw), 55, 100);
      const baixo = THREE.MathUtils.smoothstep(-olhar.current.pitch, 10, 35);
      const peso = lateral * baixo;
      if (peso === 0) return;
      const lado = Math.sign(olhar.current.yaw);
      olho.set(0.08, MAX_CABIN_EYE.y, -lado * 0.38);
      alvo.set(-0.87, 1.8, 0);
      maquina.localToWorld(olho);
      maquina.localToWorld(alvo);
      maquina.getWorldQuaternion(atitude);
      cima.set(0, 1, 0).applyQuaternion(atitude);
      matriz.lookAt(olho, alvo, cima);
      inspecao.setFromRotationMatrix(matriz);
      camera.position.lerp(olho, peso);
      camera.quaternion.slerp(inspecao, peso);
    },
  };
};
