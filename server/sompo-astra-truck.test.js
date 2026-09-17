import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

function compiled(file) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    .replace(/from '(three(?:\/[^']+)?)'/g, (_, name) => `from '${import.meta.resolve(name)}'`);
  return `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText).toString('base64')}`;
}

test('Blender skin fits the existing rig and preserves spinning wheels and sensor aperture', async () => {
  const bytes = readFileSync(new URL('../public/models/sompo/astra-sompo-truck.glb', import.meta.url));
  const { scene } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const bounds = new THREE.Box3().setFromObject(scene);
  assert.ok(bounds.min.x >= -4.48 && bounds.max.x < 4.62, JSON.stringify(bounds));
  assert.ok(bounds.min.y > 0 && bounds.max.y <= 3.85, JSON.stringify(bounds));
  assert.ok(Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)) <= 1.38);
  assert.ok(scene.getObjectByName('astra-cab'));
  assert.ok(scene.getObjectByName('astra-cargo'));
  const { createSompoTruckModel } = await import(compiled('../src/components/sompo/createSompoTruckModel.ts'));
  const { refineSompoTruck } = await import(compiled('../src/components/sompo/refineSompoTruck.ts'));
  const previous = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => null }) };
  let model;
  try { model = createSompoTruckModel({ sensorLabel: 'ESP32 VIRTUAL' }); }
  finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
  const wheels = [...model.wheels], sensor = model.sensorGroup, ray = model.rayGroup;
  const runtime = refineSompoTruck(model);
  const aperture = sensor.getObjectByName('ultrasonic-aperture--1') ?? sensor.children.find(n => n.name.startsWith('ultrasonic-aperture-'));
  const sensorBefore = aperture.getWorldPosition(new THREE.Vector3());
  const wheelBefore = wheels[0].quaternion.clone();
  const oldCab = [...model.root.getObjectByName('cab-assembly').children];
  runtime.replaceVisual(scene);
  runtime.update({ paint: '#14213d', cargo: '#bbc0c0', roughness: .4, wireframe: false, exploded: 0 }, 6000, 3, .1, 0, 0, false, 80);
  assert.deepEqual(model.wheels, wheels);
  assert.equal(model.sensorGroup, sensor); assert.equal(model.rayGroup, ray);
  assert.ok(sensorBefore.distanceTo(aperture.getWorldPosition(new THREE.Vector3())) < 1e-9);
  assert.ok(Math.abs(sensorBefore.x - 4.62) < 1e-9);
  assert.ok(wheelBefore.angleTo(wheels[0].quaternion) > .01);
  assert.ok(oldCab.every(node => !node.visible));
  assert.equal(model.root.userData.visualAsset, 'AstraSompoTruck');
  const glasses = [];
  model.root.traverse((node) => {
    const mesh = node;
    if (!mesh.isMesh) return;
    const label = `${mesh.name} ${[].concat(mesh.material).map((item) => item?.name || '').join(' ')}`;
    if (/glass|windscreen|window/i.test(label) && !/mirror/i.test(label) && mesh.visible) glasses.push(mesh);
  });
  assert.ok(glasses.length >= 1, `missing cabin glass (${glasses.length})`);
  for (const mesh of glasses) {
    for (const material of [].concat(mesh.material)) {
      assert.ok(material.transparent, `${mesh.name} should stay a see-through pane`);
      assert.ok(material.opacity >= 0.35 && material.opacity <= 0.7, `${mesh.name} opacity ${material.opacity}`);
      assert.equal(material.transmission, 0, `${mesh.name} transmission ${material.transmission}`);
    }
  }
});
