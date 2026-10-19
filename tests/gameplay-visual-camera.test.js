import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { loadFrontendModule } from './support/load-frontend-module.js';
const { criarCameraCabineMax } = await loadFrontendModule('../../src/components/gameplay/visual/cameraCabineMax.ts');
const { createFirstPersonRig } = await loadFrontendModule('../../src/components/sompo/firstPersonCamera.ts');

function cameras(olhar, maquina = new THREE.Group()) {
  const ref = { current: olhar };
  const ativo = { current: true };
  const original = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 200);
  const visual = original.clone();
  createFirstPersonRig(ativo, ref).update(original, maquina);
  criarCameraCabineMax(ativo, ref).update(visual, maquina);
  visual.updateMatrixWorld(true);
  return { original, visual };
}

test('câmera visual mantém olho, FOV e orientação originais na frente e ao olhar apenas para o lado', () => {
  for (const olhar of [{ yaw: 0, pitch: 0 }, { yaw: 0, pitch: -35 }, { yaw: 100, pitch: 0 }, { yaw: -100, pitch: 0 }]) {
    const { original, visual } = cameras(olhar);
    assert.ok(original.position.distanceTo(visual.position) < 1e-10);
    assert.ok(original.quaternion.angleTo(visual.quaternion) < 1e-7);
    assert.equal(original.fov, visual.fov);
  }
});

test('olhar lateral para baixo enquadra os oito cantos do banco real, inclusive em trator inclinado', () => {
  const banco = new THREE.Box3(new THREE.Vector3(-1.18, 1.38, -0.31), new THREE.Vector3(-0.56, 2.213, 0.31));
  for (const yaw of [-100, 100]) {
    const maquina = new THREE.Group();
    maquina.position.set(15, 0.3, -7);
    maquina.rotation.set(0.2, 0.7, -0.1);
    maquina.updateMatrixWorld(true);
    const { visual } = cameras({ yaw, pitch: -35 }, maquina);
    for (const x of [banco.min.x, banco.max.x]) for (const y of [banco.min.y, banco.max.y]) for (const z of [banco.min.z, banco.max.z]) {
      const ponto = maquina.localToWorld(new THREE.Vector3(x, y, z)).project(visual);
      assert.ok(Math.abs(ponto.x) < 0.98 && Math.abs(ponto.y) < 0.98 && ponto.z > -1 && ponto.z < 1, `canto no quadro: ${ponto.toArray()}`);
    }
  }
});
