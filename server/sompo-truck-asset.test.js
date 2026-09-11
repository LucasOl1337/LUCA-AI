import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { Worker as NodeWorker } from 'node:worker_threads';
import { resolveObjectURL } from 'node:buffer';

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
  .replace("'three/addons/loaders/DRACOLoader.js'", JSON.stringify(import.meta.resolve('three/addons/loaders/DRACOLoader.js')))
  .replace("import dracoWrapperUrl from 'three/addons/libs/draco/gltf/draco_wasm_wrapper.js?url';", `const dracoWrapperUrl = ${JSON.stringify(import.meta.resolve('three/addons/libs/draco/gltf/draco_wasm_wrapper.js'))};`)
  .replace("import dracoWasmUrl from 'three/addons/libs/draco/gltf/draco_decoder.wasm?url';", `const dracoWasmUrl = ${JSON.stringify(import.meta.resolve('three/addons/libs/draco/gltf/draco_decoder.wasm'))};`)
  .replace("'./createSompoTruckModel'", JSON.stringify(modelUrl));
const assetBytes = readFileSync(new URL('../public/models/sompo/tesla-semi.glb', import.meta.url));

test('GLB real substitui a carroceria, preserva sensor/feixe e gira nos nós das rodas', async () => {
  const THREE = await import('three');
  const { createSompoTruckModel } = await import(modelUrl);
  const { loadSompoTruckAsset } = await import(moduleUrl(assetSource));
  const saved = { document: globalThis.document, self: globalThis.self, createImageBitmap: globalThis.createImageBitmap, fetch: globalThis.fetch, Worker: globalThis.Worker, ProgressEvent: globalThis.ProgressEvent };
  globalThis.document = { createElement: () => ({ getContext: () => null }) };
  globalThis.self = globalThis;
  globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });
  // Exercise the actual bundled Draco decoder in Node, including its worker protocol.
  globalThis.ProgressEvent = class { constructor(type, init) { this.type = type; Object.assign(this, init); } };
  globalThis.Worker = class {
    constructor(url) {
      this.ready = resolveObjectURL(url).text().then((source) => {
        this.worker = new NodeWorker(`const {parentPort}=require('node:worker_threads');
          globalThis.self=globalThis;
          self.postMessage=(message,transfer)=>parentPort.postMessage(message,transfer);
          parentPort.on('message',data=>self.onmessage({data}));
${source}`, { eval: true });
        this.worker.on('message', (data) => this.onmessage?.({ data }));
        this.worker.on('error', (error) => this.onerror?.(error));
      });
    }
    postMessage(message, transfer) { this.ready.then(() => this.worker.postMessage(message, transfer)); }
    terminate() { return this.ready.then(() => this.worker.terminate()); }
  };
  const fetchAsset = (input, options) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url === '/models/sompo/tesla-semi.glb') return Promise.resolve(new Response(assetBytes));
    if (url.startsWith('file:')) return Promise.resolve(new Response(readFileSync(new URL(url))));
    return saved.fetch(input, options);
  };
  globalThis.fetch = fetchAsset;
  try {
    const model = createSompoTruckModel({ sensorLabel: 'TESTE' });
    const sensor = model.sensorGroup; const ray = model.rayGroup; const wheels = model.wheels;
    assert.equal(await loadSompoTruckAsset(model, new AbortController().signal), true);
    assert.equal(model.sensorGroup, sensor); assert.equal(model.rayGroup, ray); assert.equal(model.wheels, wheels);
    assert.equal(wheels.length, 14);
    assert.ok(wheels.every((wheel) => /^(Tires|Disks|Wheels)/.test(wheel.name)));
    assert.ok(wheels.every((wheel) => wheel.userData.radius > 0.39 && wheel.userData.radius < 0.43));
    const frontTire = wheels.find((wheel) => wheel.name === 'Tires_0');
    const frontDisk = wheels.find((wheel) => wheel.name === 'Disks_0');
    assert.equal(frontTire.userData.radius, frontDisk.userData.radius);
    assert.ok(frontTire.userData.intactTirePositions.length > 1000);
    assert.ok(frontTire.material.normalMap && frontTire.material.aoMap);
    const centerBefore = frontTire.getWorldPosition(new THREE.Vector3());
    frontTire.rotation.y += 0.8;
    assert.ok(centerBefore.distanceTo(frontTire.getWorldPosition(new THREE.Vector3())) < 1e-8);
    const axleDirection = new THREE.Vector3(0, 1, 0).applyQuaternion(frontTire.getWorldQuaternion(new THREE.Quaternion()));
    assert.ok(Math.abs(axleDirection.z) > 0.999);
    frontTire.rotation.y = 0;
    const asset = model.root.getObjectByName('tesla-semi');
    const bounds = new THREE.Box3().setFromObject(asset.children.find((child) => child.name !== 'gltf-esp32-chassis-mount'));
    assert.equal(sensor.parent.parent, asset);
    assert.equal(model.root.userData.asset, 'TeslaSemi');
    assert.ok(asset.getObjectByName('Truck_0'));
    assert.ok(asset.getObjectByName('Wagon_Container'));
    asset.traverse((node) => assert.ok(!/^(Plane|Cone|Concrete_Barrier)/.test(node.name)));
    const cabBounds = new THREE.Box3().setFromObject(asset.getObjectByName('Truck_0'));
    const trailerBounds = new THREE.Box3().setFromObject(asset.getObjectByName('Wagon_Container'));
    assert.ok(trailerBounds.max.x < cabBounds.min.x, 'Trailer must sit behind the cab');
    assert.ok(trailerBounds.getSize(new THREE.Vector3()).x > trailerBounds.getSize(new THREE.Vector3()).z * 2);
    assert.ok(Math.abs(ray.getWorldPosition(new THREE.Vector3()).x - 4.62) < 1e-8);
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

    globalThis.fetch = async () => new Response('invalid glb');
    await assert.rejects(loadSompoTruckAsset(failed, new AbortController().signal));
    assert.equal(failed.root.getObjectByName('cab-assembly').visible, true);
    assert.equal(failed.wheels.length, 10);

    globalThis.fetch = (input, options) => String(typeof input === 'string' ? input : input.url).endsWith('.wasm')
      ? Promise.resolve(new Response('decoder unavailable', { status: 503 })) : fetchAsset(input, options);
    await assert.rejects(loadSompoTruckAsset(failed, new AbortController().signal));
    assert.equal(failed.root.getObjectByName('cab-assembly').visible, true);
    assert.equal(failed.wheels.length, 10);

    globalThis.fetch = fetchAsset;
    const abort = new AbortController(); abort.abort();
    assert.equal(await loadSompoTruckAsset(failed, abort.signal), false);
    assert.equal(failed.root.getObjectByName('cab-assembly').visible, true);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});


test('Tesla Semi tem fonte e licença atribuídas no canvas e no asset', () => {
  const license = readFileSync(new URL('../public/models/sompo/LICENSE.txt', import.meta.url), 'utf8');
  const simulator = readFileSync(new URL('../src/components/SompoTruckSimulator.tsx', import.meta.url), 'utf8');
  for (const text of [license, simulator]) {
    assert.match(text, /Tesla Semi © 2018 Oleksii Rozumnyi/);
    assert.match(text, /CC BY 4.0/);
    assert.match(text, /sketchfab.com\/3d-models\/tesla-semi-39ffc7c746184e0c9ebd5bbcd0b405dd/);
    assert.match(text, /adaptado com sensor/);
    assert.doesNotMatch(text, /Cesium|cesium-milk-truck/);
  }
});
