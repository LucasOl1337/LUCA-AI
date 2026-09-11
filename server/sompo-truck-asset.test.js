import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function moduleUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')}`;
}
const modelSource = readFileSync(new URL('../src/components/sompo/createSompoTruckModel.ts', import.meta.url), 'utf8')
  .replace("'three'", JSON.stringify(import.meta.resolve('three')))
  .replace("'three/addons/geometries/RoundedBoxGeometry.js'", JSON.stringify(import.meta.resolve('three/addons/geometries/RoundedBoxGeometry.js')));
const modelUrl = moduleUrl(modelSource);
const assetSource = readFileSync(new URL('../src/components/sompo/loadSompoTruckAsset.ts', import.meta.url), 'utf8')
  .replace("'three'", JSON.stringify(import.meta.resolve('three')))
  .replace("'three/addons/loaders/GLTFLoader.js'", JSON.stringify(import.meta.resolve('three/addons/loaders/GLTFLoader.js')))
  .replace("'./createSompoTruckModel'", JSON.stringify(modelUrl));
const assetBytes = readFileSync(new URL('../public/models/sompo/cesium-milk-truck.glb', import.meta.url));

test('GLB real substitui a carroceria, preserva sensor/feixe e gira nos nós das rodas', async () => {
  const THREE = await import('three');
  const { createSompoTruckModel } = await import(modelUrl);
  const { loadSompoTruckAsset } = await import(moduleUrl(assetSource));
  const saved = { document: globalThis.document, self: globalThis.self, createImageBitmap: globalThis.createImageBitmap, fetch: globalThis.fetch };
  globalThis.document = { createElement: () => ({ getContext: () => null }) };
  globalThis.self = globalThis;
  globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });
  globalThis.fetch = (url, options) => url === '/models/sompo/cesium-milk-truck.glb' ? Promise.resolve(new Response(assetBytes)) : saved.fetch(url, options);
  try {
    const model = createSompoTruckModel({ sensorLabel: 'TESTE' });
    const sensor = model.sensorGroup; const ray = model.rayGroup; const wheels = model.wheels;
    assert.equal(await loadSompoTruckAsset(model, new AbortController().signal), true);
    assert.equal(model.sensorGroup, sensor); assert.equal(model.rayGroup, ray); assert.equal(model.wheels, wheels);
    assert.equal(wheels.length, 2);
    assert.ok(wheels.every((wheel) => wheel.name.startsWith('Wheels')));
    const asset = model.root.getObjectByName('cesium-milk-truck');
    const bounds = new THREE.Box3().setFromObject(asset.children.find((child) => child.name !== 'gltf-esp32-chassis-mount'));
    assert.equal(sensor.parent.parent, asset);
    assert.ok(Math.abs(sensor.getWorldPosition(new THREE.Vector3()).x - 4.4) < 1e-8);
    assert.ok(model.root.userData.groundSupport.length > 1000);
    assert.ok(bounds.max.x <= 4.39 && bounds.min.x >= -4.48);
    assert.ok(bounds.max.y <= 3.73 && bounds.min.y > -0.001);
    assert.ok(bounds.min.z >= -1.38 && bounds.max.z <= 1.38);
    assert.ok(sensor.parent.name.includes('chassis'));
    assert.equal(model.root.getObjectByName('cab-assembly').visible, false);

    const failed = createSompoTruckModel({ sensorLabel: 'OFFLINE' });
    globalThis.fetch = async () => new Response('unavailable', { status: 503 });
    await assert.rejects(loadSompoTruckAsset(failed, new AbortController().signal));
    assert.equal(failed.root.getObjectByName('cab-assembly').visible, true);
    assert.equal(failed.wheels.length, 10);

    globalThis.fetch = (url, options) => url === '/models/sompo/cesium-milk-truck.glb' ? Promise.resolve(new Response(assetBytes)) : saved.fetch(url, options);
    const abort = new AbortController(); abort.abort();
    assert.equal(await loadSompoTruckAsset(failed, abort.signal), false);
    assert.equal(failed.root.getObjectByName('cab-assembly').visible, true);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});
