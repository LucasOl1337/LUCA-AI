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
const partsSource = readFileSync(new URL('../src/components/sompo/splitGeneratedTruckParts.ts', import.meta.url), 'utf8')
  .replace("'three'", JSON.stringify(import.meta.resolve('three')));
const partsUrl = moduleUrl(partsSource);
const assetSource = readFileSync(new URL('../src/components/sompo/loadSompoTruckAsset.ts', import.meta.url), 'utf8')
  .replace("'three'", JSON.stringify(import.meta.resolve('three')))
  .replace("'three/addons/loaders/GLTFLoader.js'", JSON.stringify(import.meta.resolve('three/addons/loaders/GLTFLoader.js')))
  .replace("'three/addons/loaders/DRACOLoader.js'", JSON.stringify(import.meta.resolve('three/addons/loaders/DRACOLoader.js')))
  .replace("import dracoWrapperUrl from 'three/addons/libs/draco/gltf/draco_wasm_wrapper.js?url';", `const dracoWrapperUrl = ${JSON.stringify(import.meta.resolve('three/addons/libs/draco/gltf/draco_wasm_wrapper.js'))};`)
  .replace("import dracoWasmUrl from 'three/addons/libs/draco/gltf/draco_decoder.wasm?url';", `const dracoWasmUrl = ${JSON.stringify(import.meta.resolve('three/addons/libs/draco/gltf/draco_decoder.wasm'))};`)
  .replace("'./createSompoTruckModel'", JSON.stringify(modelUrl))
  .replace("'./splitGeneratedTruckParts'", JSON.stringify(partsUrl));
const assetBytes = readFileSync(new URL('../public/models/sompo/tesla-semi.glb', import.meta.url));
const generatedBytes = readFileSync(new URL('../public/models/sompo/generated-rural-truck.glb', import.meta.url));

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
    if (url === '/models/sompo/generated-rural-truck.glb') return Promise.resolve(new Response('not available', { status: 503 }));
    if (url === '/models/sompo/tesla-semi.glb') return Promise.resolve(new Response(assetBytes));
    if (url.startsWith('file:')) return Promise.resolve(new Response(readFileSync(new URL(url))));
    return saved.fetch(input, options);
  };
  globalThis.fetch = fetchAsset;
  try {
    globalThis.fetch = (input, options) => input === '/models/sompo/generated-rural-truck.glb'
      ? Promise.resolve(new Response(generatedBytes)) : fetchAsset(input, options);
    const generated = createSompoTruckModel({ sensorLabel: 'GERADO' });
    const generatedSensor = generated.sensorGroup; const generatedRay = generated.rayGroup; const generatedWheels = generated.wheels;
    assert.equal(await loadSompoTruckAsset(generated, new AbortController().signal), true);
    assert.equal(generated.root.userData.asset, 'GeneratedRuralTruck');
    assert.equal(generated.sensorGroup, generatedSensor); assert.equal(generated.rayGroup, generatedRay);
    assert.equal(generated.wheels, generatedWheels); assert.equal(generatedWheels.length, 6, 'Reconstructed tyres are separated with their original texture');
    assert.equal(generatedWheels.filter((wheel) => wheel.userData.blowoutTarget).length, 1);
    assert.ok(generatedWheels.every((wheel) => wheel.geometry.attributes.uv.count > 100 && wheel.userData.radius > 0.4));
    assert.equal(generatedSensor.parent, generatedRay.parent);
    assert.match(generatedSensor.parent.name, /chassis/);
    const body = generated.root.getObjectByName('generated-rural-truck-body');
    generated.root.updateMatrixWorld(true);
    const generatedBounds = new THREE.Box3().setFromObject(body);
    assert.ok(generatedBounds.max.x <= 4.39 && generatedBounds.min.x >= -4.48);
    assert.ok(generatedBounds.max.y <= 3.84 && generatedBounds.min.y >= -1e-6);
    assert.ok(generatedBounds.min.z >= -1.38 && generatedBounds.max.z <= 1.38);
    assert.ok(Math.abs(generatedRay.getWorldPosition(new THREE.Vector3()).x - 4.62) < 1e-8);
    const hull = generated.root.userData.groundSupport;
    assert.ok(hull.length >= 12 && hull.length < 10000, 'Use the convex hull instead of scanning the render mesh each frame');
    const surfaces = []; body.traverse((node) => { if (node.isMesh) surfaces.push(node); });
    assert.ok(surfaces.every((node) => node.material.map && node.material.metalnessMap && node.material.roughnessMap));
    for (const rotation of [new THREE.Euler(), new THREE.Euler(82 * Math.PI / 180, 0.15, 0.03), new THREE.Euler(0.1, 0.3, -0.4)]) {
      const transform = new THREE.Matrix4().makeRotationFromEuler(rotation);
      const vertex = new THREE.Vector3(); let renderMinimum = Infinity; let hullMinimum = Infinity;
      for (const surface of surfaces) {
        const matrix = new THREE.Matrix4().multiplyMatrices(transform, surface.matrixWorld);
        const positions = surface.geometry.attributes.position;
        for (let i = 0; i < positions.count; i += 1) renderMinimum = Math.min(renderMinimum, vertex.fromBufferAttribute(positions, i).applyMatrix4(matrix).y);
      }
      for (let i = 0; i < hull.length; i += 3) hullMinimum = Math.min(hullMinimum, vertex.fromArray(hull, i).applyMatrix4(transform).y);
      assert.ok(Math.abs(renderMinimum - hullMinimum) < 1e-5, 'Tipping support must match the rendered geometry');
    }

    const triangleCount = surfaces.reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0);
    assert.equal(triangleCount, 160000, 'Spatial separation neither duplicates nor drops source triangles');
    for (const wheel of generatedWheels) {
      const center = wheel.getWorldPosition(new THREE.Vector3());
      wheel.rotation.y += 0.8;
      assert.ok(center.distanceTo(wheel.getWorldPosition(new THREE.Vector3())) < 1e-8);
      const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(wheel.getWorldQuaternion(new THREE.Quaternion()));
      assert.ok(Math.abs(axis.z) > 0.999, 'Wheel axis remains across the truck');
      wheel.rotation.y = 0;
    }

    // A missing generated asset must transparently use the real Tesla asset.
    globalThis.fetch = fetchAsset;
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

    // A corrupt generated GLB must also fall back to Tesla, not just an HTTP failure.
    globalThis.fetch = (input, options) => input === '/models/sompo/generated-rural-truck.glb'
      ? Promise.resolve(new Response('invalid generated model')) : fetchAsset(input, options);
    const recovered = createSompoTruckModel({ sensorLabel: 'RECUPERADO' });
    assert.equal(await loadSompoTruckAsset(recovered, new AbortController().signal), true);
    assert.equal(recovered.root.userData.asset, 'TeslaSemi');

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
  assert.match(simulator, /modelAsset === 'GeneratedRuralTruck'/);
  assert.match(license, /generated-rural-truck\.glb/);
});
