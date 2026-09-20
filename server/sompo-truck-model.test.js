import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as THREE from 'three';

// Transpile the actual model so the test works on Node versions without TS loading.
// Canvas rendering is checked in the browser; geometry only needs a canvas object.
test('modelo preserva envelope, eixos de roda, janelas e origem física do sensor', async () => {
  const wheelSource = readFileSync(new URL('../src/components/sompo/sompoWheelGeometry.ts', import.meta.url), 'utf8').replace("'three'", JSON.stringify(import.meta.resolve('three')));
  const wheelUrl = `data:text/javascript;base64,${Buffer.from(ts.transpileModule(wheelSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`;
  const source = readFileSync(new URL('../src/components/sompo/createSompoTruckModel.ts', import.meta.url), 'utf8')
    .replace("'./sompoWheelGeometry'", JSON.stringify(wheelUrl))
    .replace("'three'", JSON.stringify(import.meta.resolve('three')))
    .replace("'three/addons/geometries/RoundedBoxGeometry.js'", JSON.stringify(import.meta.resolve('three/addons/geometries/RoundedBoxGeometry.js')));
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  const { createSompoTruckModel, SOMPO_TRUCK_FRONT_X, SOMPO_TRUCK_PIVOT_Y, SOMPO_TRUCK_HALF_SIZE } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => null }) };
  let model;
  try {
    model = createSompoTruckModel({ sensorLabel: 'TESTE' });
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
  assert.equal(SOMPO_TRUCK_FRONT_X, 4.62);
  assert.equal(SOMPO_TRUCK_PIVOT_Y, 1.92);
  assert.deepEqual(SOMPO_TRUCK_HALF_SIZE.toArray(), [4.48, 1.92, 1.38]);
  model.root.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  model.root.traverse((object) => {
    if (!object.isMesh) return;
    bounds.union(new THREE.Box3().setFromObject(object));
  });
  assert.ok(bounds.min.y >= -0.02 && bounds.max.y <= 3.85, JSON.stringify(bounds));
  assert.ok(bounds.min.x >= -4.50 && bounds.max.x <= SOMPO_TRUCK_FRONT_X + 0.001, JSON.stringify(bounds));
  assert.ok(Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)) <= SOMPO_TRUCK_HALF_SIZE.z, JSON.stringify(bounds));
  const rayOrigin = model.rayGroup.getWorldPosition(new THREE.Vector3());
  const apertures = [];
  const windows = [];
  model.root.traverse((object) => {
    if (object.name.startsWith('ultrasonic-aperture-')) apertures.push(object);
    if (object.name.startsWith('side-window-')) windows.push(object);
  });
  assert.equal(apertures.length, 2);
  for (const aperture of apertures) {
    const position = aperture.getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs(position.x - rayOrigin.x) < 1e-8);
    assert.equal(position.y, rayOrigin.y);
  }
  const windowBounds = windows.map((window) => new THREE.Box3().setFromObject(window));
  assert.equal(windowBounds.length, 2);
  assert.equal(windowBounds[0].min.x, windowBounds[1].min.x);
  assert.ok(windowBounds[0].min.x > 1.5);
  assert.ok(model.wheels.length >= 6);
  for (const wheel of model.wheels) {
    assert.ok(wheel.isMesh);
    const before = wheel.localToWorld(new THREE.Vector3(0.4, 0, 0));
    wheel.rotation.y += 0.5;
    const after = wheel.localToWorld(new THREE.Vector3(0.4, 0, 0));
    assert.ok(before.distanceTo(after) > 0.1);
    assert.ok(Math.abs(before.z - after.z) < 1e-8, 'wheel rotates in the longitudinal/vertical plane');
    assert.ok(wheel.children.some((part) => part.name.startsWith('rim-')));
  }
});
