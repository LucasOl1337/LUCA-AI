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
const partsSource = readFileSync(new URL('../src/components/sompo/splitGeneratedTruckParts.ts', import.meta.url), 'utf8')
  .replace("'three'", JSON.stringify(import.meta.resolve('three')));
const partsUrl = moduleUrl(partsSource);
const texturesUrl = moduleUrl(readFileSync(new URL('../src/components/sompo/restoreSompoTextures.ts', import.meta.url), 'utf8')
  .replace("'three'", JSON.stringify(import.meta.resolve('three'))));
const assetSource = readFileSync(new URL('../src/components/sompo/loadSompoTruckAsset.ts', import.meta.url), 'utf8')
  .replace("'three'", JSON.stringify(import.meta.resolve('three')))
  .replace("'three/addons/loaders/GLTFLoader.js'", JSON.stringify(import.meta.resolve('three/addons/loaders/GLTFLoader.js')))
  .replace("'./createSompoTruckModel'", JSON.stringify(modelUrl))
  .replace("'./splitGeneratedTruckParts'", JSON.stringify(partsUrl))
  .replace("'./restoreSompoTextures'", JSON.stringify(texturesUrl));
const assetBytes = readFileSync(new URL('../public/models/sompo/tesla-semi.glb', import.meta.url));
const generatedBytes = readFileSync(new URL('../public/models/sompo/generated-rural-truck.glb', import.meta.url));

test('GLBs reais recuperam texturas sem ImageBitmap, preservam sensores/rodas e fallback', async () => {
  const THREE = await import('three');
  const { createSompoTruckModel } = await import(modelUrl);
  const { loadSompoTruckAsset } = await import(moduleUrl(assetSource));
  const saved = { document: globalThis.document, self: globalThis.self, createImageBitmap: globalThis.createImageBitmap, fetch: globalThis.fetch, Worker: globalThis.Worker, ProgressEvent: globalThis.ProgressEvent };
  const imageRequests = [];
  let rejectExternal = false;
  let bitmapDecodes = 0;
  globalThis.document = {
    createElement: () => ({ getContext: () => null }),
    // Exercise the actual Three TextureLoader/ImageLoader, not a stubbed texture.
    createElementNS: (_namespace, tag) => {
      assert.equal(tag, 'img');
      const events = new Map();
      return {
        complete: true, naturalWidth: 2048, naturalHeight: 2048, width: 2048, height: 2048,
        addEventListener(type, callback) { events.set(type, callback); },
        removeEventListener(type) { events.delete(type); },
        set src(url) {
          this.currentSrc = url; imageRequests.push(url);
          queueMicrotask(() => {
            if (rejectExternal) events.get('error')?.call(this, new Error('Image decode failed'));
            else { assert.ok(readFileSync(new URL('../public' + url, import.meta.url)).length > 100); events.get('load')?.call(this); }
          });
        },
      };
    },
  };
  globalThis.self = globalThis;
  globalThis.createImageBitmap = async () => { bitmapDecodes += 1; throw new Error('Reproduced ImageBitmap decode failure'); };
  globalThis.Worker = class { constructor() { throw new Error('CSP blocks blob workers'); } };
  const fetchAsset = (input, options) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url === '/models/sompo/generated-rural-truck.glb') return Promise.resolve(new Response('not available', { status: 503 }));
    if (url === '/models/sompo/tesla-semi.glb?geometry=plain-v1') return Promise.resolve(new Response(assetBytes));
    if (/^\/models\/sompo\/generated-(nelore|jacaranda|eucalyptus|cerrado)\.glb$/.test(url)) return Promise.resolve(new Response(readFileSync(new URL('../public' + url, import.meta.url))));
    if (url.endsWith('.textures.json')) return Promise.resolve(new Response(readFileSync(new URL('../public' + url, import.meta.url))));
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
    assert.equal(bitmapDecodes, 0, 'Runtime never enters the CSP-blocked embedded bitmap path');
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
    for (const surface of surfaces) {
      const material = surface.material;
      assert.ok(material.map.image.complete && material.map.image.naturalWidth === 2048);
      assert.equal(material.map.flipY, false); assert.equal(material.map.colorSpace, THREE.SRGBColorSpace);
      assert.equal(material.roughnessMap.colorSpace, THREE.NoColorSpace);
      assert.equal(material.roughnessMap, material.metalnessMap);
      assert.match(material.map.image.currentSrc, /generated-rural-truck-basecolor.jpg$/);
    }
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

    // The same failing ImageBitmap path recovers the real Nelore's hide and PBR maps.
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const { restoreSompoTextures } = await import(texturesUrl);
    const animalBytes = readFileSync(new URL('../public/models/sompo/generated-nelore.glb', import.meta.url));
    const animal = await new GLTFLoader().parseAsync(animalBytes.buffer.slice(animalBytes.byteOffset, animalBytes.byteOffset + animalBytes.byteLength), '/models/sompo/');
    await restoreSompoTextures(animal, '/models/sompo/generated-nelore.glb', new AbortController().signal);
    animal.scene.traverse((node) => {
      if (!node.isMesh) return;
      assert.match(node.material.map.image.currentSrc, /generated-nelore-basecolor.jpg$/);
      assert.equal(node.material.map.colorSpace, THREE.SRGBColorSpace);
      assert.equal(node.material.map.flipY, false);
      assert.equal(node.material.roughnessMap, node.material.metalnessMap);
    });

    const rawBitmapAttempts = bitmapDecodes;
    assert.equal(rawBitmapAttempts, 2, 'The raw loader failure was actually exercised before restoring the Nelore');
    const animalUrl = moduleUrl(readFileSync(new URL('../src/components/sompo/createSompoAnimal.ts', import.meta.url), 'utf8')
      .replace("'three'", JSON.stringify(import.meta.resolve('three')))
      .replace("'three/addons/loaders/GLTFLoader.js'", JSON.stringify(import.meta.resolve('three/addons/loaders/GLTFLoader.js')))
      .replace("'./restoreSompoTextures'", JSON.stringify(texturesUrl))
      .replace("'../../../shared/sompo-scenario-effects.js'", JSON.stringify(new URL('../shared/sompo-scenario-effects.js', import.meta.url).href)));
    const { createSompoAnimal } = await import(animalUrl);
    const pasture = new THREE.Group(); const cattle = createSompoAnimal(pasture);
    await cattle.ready; assert.equal(cattle.asset, 'GeneratedNelore');
    cattle.update(true, 0, 5000, false);
    const cattleRoot = pasture.getObjectByName('generated-nelore-crossing');
    const cattleBody = pasture.getObjectByName('nelore-generated-textured');
    cattleBody.geometry.computeBoundingBox();
    const cattleSize = cattleBody.geometry.boundingBox.getSize(new THREE.Vector3());
    assert.ok(cattleSize.x <= 2.4 && cattleSize.y <= 1.7 && cattleSize.z <= 1.05, 'Real GLB fits adult cattle dimensions, including width');
    assert.equal(cattleRoot.visible, true);
    cattle.update(true, 7, 13000, false); assert.equal(cattleRoot.visible, false);
    cattle.dispose(); assert.equal(pasture.children.length, 0);

    const vegetationUrl = moduleUrl(readFileSync(new URL('../src/components/sompo/createSompoVegetation.ts', import.meta.url), 'utf8')
      .replace("'three'", JSON.stringify(import.meta.resolve('three')))
      .replace("'three/addons/loaders/GLTFLoader.js'", JSON.stringify(import.meta.resolve('three/addons/loaders/GLTFLoader.js')))
      .replace("'./restoreSompoTextures'", JSON.stringify(texturesUrl)));
    const { createSompoVegetation } = await import(vegetationUrl);
    const landscape = new THREE.Group(); const camera = new THREE.PerspectiveCamera();
    const vegetation = createSompoVegetation(landscape, camera);
    const trees = landscape.getObjectByName('rural-3d-vegetation');
    await vegetation.ready;
    assert.equal(trees.userData.loadedSpecies, 3, 'All three real tree assets recover through the Image element loader');
    assert.equal(trees.children.length, 27, 'Finite LOD population');
    const geometries = new Set();
    trees.traverse((node) => { if (node.isMesh && node.geometry.type !== 'PlaneGeometry') geometries.add(node.geometry); });
    assert.equal(geometries.size, 3, 'Instances share each species geometry');
    const nearest = trees.children[0]; landscape.updateMatrixWorld(true);
    camera.position.copy(nearest.position).add(new THREE.Vector3(0, 1, 10)); camera.updateMatrixWorld(true);
    nearest.update(camera); vegetation.update(false);
    assert.equal(nearest.levels[0].object.visible, true);
    assert.equal(nearest.levels[1].object.visible, false, 'No billboard beside the camera');
    camera.position.copy(nearest.position).add(new THREE.Vector3(0, 1, 80)); camera.updateMatrixWorld(true);
    nearest.update(camera); vegetation.update(false);
    assert.equal(nearest.levels[0].object.visible, false);
    assert.equal(nearest.levels[1].object.visible, true, 'Distant background uses the cheaper LOD');
    vegetation.dispose(); assert.equal(landscape.children.length, 0);
    const late = createSompoVegetation(landscape, camera); late.dispose();
    await late.ready;
    assert.equal(landscape.children.length, 0, 'Late GLB callbacks cannot resurrect disposed vegetation');

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
    assert.match(frontTire.material.normalMap.image.currentSrc, /tesla-semi-tire-normal.png$/);
    assert.equal(frontTire.material.normalMap.flipY, false);
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
    const withoutDecoder = createSompoTruckModel({ sensorLabel: 'SEM WORKER/WASM' });
    assert.equal(await loadSompoTruckAsset(withoutDecoder, new AbortController().signal), true);
    assert.equal(withoutDecoder.root.userData.asset, 'TeslaSemi');
    assert.equal(withoutDecoder.wheels.length, 14);
    assert.equal(bitmapDecodes, rawBitmapAttempts, 'Trees and Tesla also bypass embedded bitmap fetches');

    // External images fail too: retain the intact procedural vehicle rather than clay.
    globalThis.fetch = fetchAsset; rejectExternal = true;
    const clay = createSompoTruckModel({ sensorLabel: 'TEXTURAS INDISPONÍVEIS' });
    await assert.rejects(loadSompoTruckAsset(clay, new AbortController().signal));
    assert.equal(clay.root.getObjectByName('cab-assembly').visible, true);
    assert.equal(clay.wheels.length, 10); rejectExternal = false;
    assert.ok(imageRequests.includes('/models/sompo/tesla-semi-lights.png'));

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
