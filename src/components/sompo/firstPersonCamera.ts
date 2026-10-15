import * as THREE from 'three';
import type { SompoCameraRig } from './sompoStage';
import type { LookState } from './firstPersonLook';

/**
 * Olho do operador do Trator MAX no referencial da máquina (+X frente, +Y cima).
 * Assento em x≈-0,68 m com almofada a 1,64 m e volante a (-0,12; 2,07) no GLB
 * (scripts/sompo/build-max-tractor.py, já com o fator 0,975 da normalização).
 * O olho fica ~0,8 m acima da almofada, um palmo à frente do encosto: alto o
 * bastante para o fardo do obstáculo frontal aparecer acima do capô.
 */
export const MAX_CABIN_EYE = Object.freeze({ x: -0.65, y: 2.5, z: 0 });
export const FIRST_PERSON_FOV = 70;

const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
// A câmera olha para -Z; girar -90° em Y a deixa olhando para +X, a frente da máquina.
const FACE_FORWARD = new THREE.Quaternion().setFromAxisAngle(UP, -Math.PI / 2);

/**
 * Câmera de cabine: segue posição e atitude da máquina (inclinação e trepidação
 * do roteiro chegam ao olho) e soma o olhar livre. `lookRef` é escrito pelo
 * controle, mouse e setas; `activeRef` liga e desliga sem remontar o palco.
 */
export function createFirstPersonRig(activeRef: { current: boolean }, lookRef: { current: LookState }): SompoCameraRig {
  const eye = new THREE.Vector3();
  const yaw = new THREE.Quaternion();
  const pitch = new THREE.Quaternion();
  const machineQuat = new THREE.Quaternion();
  return {
    active: () => activeRef.current,
    update(camera, machine) {
      machine.updateWorldMatrix(true, false);
      camera.position.copy(machine.localToWorld(eye.set(MAX_CABIN_EYE.x, MAX_CABIN_EYE.y, MAX_CABIN_EYE.z)));
      machine.getWorldQuaternion(machineQuat);
      yaw.setFromAxisAngle(UP, THREE.MathUtils.degToRad(lookRef.current.yaw));
      pitch.setFromAxisAngle(RIGHT, THREE.MathUtils.degToRad(lookRef.current.pitch));
      camera.quaternion.copy(machineQuat).multiply(yaw).multiply(FACE_FORWARD).multiply(pitch);
      if (camera.fov !== FIRST_PERSON_FOV) {
        camera.fov = FIRST_PERSON_FOV;
        camera.updateProjectionMatrix();
      }
    },
  };
}
