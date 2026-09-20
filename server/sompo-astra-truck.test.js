import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

function compiled(file) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    .replace(/from '(three(?:\/[^']+)?)'/g, (_, name) => `from '${import.meta.resolve(name)}'`)
    .replace("'./sompoWheelGeometry'", () => JSON.stringify(compiled('../src/components/sompo/sompoWheelGeometry.ts')));
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
  let aoMinimum = 1, aoMaximum = 0, bakedMeshes = 0;
  scene.traverse(node => {
    if (!node.isMesh || node.material.name === 'Astra cabin glass') return;
    const ao = node.geometry.getAttribute('color');
    assert.ok(ao, `${node.name}: missing Blender cavity bake`);
    bakedMeshes++;
    for (let i = 0; i < ao.count; i++) {
      aoMinimum = Math.min(aoMinimum, ao.getX(i)); aoMaximum = Math.max(aoMaximum, ao.getX(i));
    }
  });
  assert.ok(bakedMeshes > 10 && aoMinimum < .4 && aoMaximum > .9, `AO range ${aoMinimum}..${aoMaximum}`);
  scene.updateMatrixWorld(true);
  // Ray crosses each window opening without an opaque gasket sheet or photo card.
  // The Blender cab now compresses its greenhouse above 2.1 m by 0.70;
  // keep the probe inside the window, not at the lowered headliner height.
  for (const side of [-1,1]) {
    const windowY = 2.1 + (2.72 - 2.1) * .70;
    const raycast = new THREE.Raycaster(new THREE.Vector3(2.2,windowY,side*1.4),new THREE.Vector3(0,0,-side),0,2.8);
    const hits=raycast.intersectObject(scene,true);
    assert.ok(hits.length>0, 'ray must meet actual window panes');
    const opaque=hits.filter(hit=>![].concat(hit.object.material).every(m=>m.name==='Astra cabin glass'));
    assert.equal(opaque.length,0,`blocked window: ${opaque.map(h=>h.object.name).join(',')}`);
  }
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
  scene.traverse(node => {
    if (!node.isMesh || node.material.name === 'Astra cabin glass') return;
    assert.ok(node.geometry.hasAttribute('sompoCavity'), `${node.name}: shared materials still need per-mesh AO`);
    assert.equal(node.material.vertexColors, false, 'cavity must not darken diffuse albedo');
  });
  const glasses = [];
  model.root.traverse((node) => {
    const mesh = node;
    if (!mesh.isMesh) return;
    if ([].concat(mesh.material).some(item => item.name === 'Astra cabin glass') && mesh.visible) glasses.push(mesh);
    if (/window-seal|windscreen-.*-seal/.test(mesh.name)) {
      for (const material of [].concat(mesh.material)) {
        assert.equal(material.transparent, false, `${mesh.name}: rubber seal is not glass`);
        assert.equal(material.name, 'Astra rubber seals');
      }
    }
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

test('retired truck does not attach late generated textures after stage disposal', async () => {
  const { createSompoTruckModel } = await import(compiled('../src/components/sompo/createSompoTruckModel.ts'));
  const { refineSompoTruck } = await import(compiled('../src/components/sompo/refineSompoTruck.ts'));
  const savedDocument = globalThis.document;
  const savedLoad = THREE.TextureLoader.prototype.load;
  const callbacks = [];
  globalThis.document = { createElement: () => ({ getContext: () => null }), createElementNS: () => ({}) };
  THREE.TextureLoader.prototype.load = function (_url, onLoad) { callbacks.push(onLoad); return new THREE.Texture(); };
  try {
    const model = createSompoTruckModel({ sensorLabel: 'TEST' });
    const runtime = refineSompoTruck(model);
    const visual = new THREE.Group();
    for (const name of ['astra-cab', 'astra-cargo']) { const group = new THREE.Group(); group.name = name; visual.add(group); }
    runtime.replaceVisual(visual);
    assert.equal(callbacks.length, 2, 'both generated albedos requested');
    runtime.dispose();
    for (const callback of callbacks) {
      const map = new THREE.Texture();
      let disposed = 0;
      map.addEventListener('dispose', () => disposed++);
      callback(map);
      assert.equal(disposed, 1, 'late texture must be retired immediately');
      model.root.traverse(node => {
        if (node.isMesh) for (const material of [].concat(node.material)) assert.notEqual(material.map, map);
      });
    }
  } finally {
    THREE.TextureLoader.prototype.load = savedLoad;
    if (savedDocument === undefined) delete globalThis.document; else globalThis.document = savedDocument;
  }
});
