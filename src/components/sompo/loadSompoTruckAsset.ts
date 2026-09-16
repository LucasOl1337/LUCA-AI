import * as THREE from 'three';
import { splitGeneratedTruckParts } from './splitGeneratedTruckParts';
import { restoreSompoTextures, useSompoExternalTextures } from './restoreSompoTextures';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SOMPO_TRUCK_FRONT_X, SOMPO_TRUCK_HALF_SIZE, type SompoTruckModel } from './createSompoTruckModel';

// Main model: local image → Hunyuan3D-2.1 reconstruction, with generated PBR textures.
// Exact inputs, parameters and limitations: public/models/sompo/generated-rural-truck.provenance.json.
export const SOMPO_TRUCK_ASSET_URL = '/models/sompo/generated-rural-truck.glb';

// Fallback: Tesla Semi © 2018 Oleksii Rozumnyi · CC BY 4.0 · adaptado com sensor.
// Original: https://sketchfab.com/3d-models/tesla-semi-39ffc7c746184e0c9ebd5bbcd0b405dd
// GLB: https://raw.githubusercontent.com/pakagronglb/tesla-3d-showcase/main/public/models/semi_scene.glb
// License: https://creativecommons.org/licenses/by/4.0/ (see public/models/sompo/LICENSE.txt).
// Adaptations: remove display props, align/shorten the trailer, calibrate wheel pivots,
// tune materials and attach the ESP32. The source GLB has no animation clips.
// Bust previously cached Draco bytes: this revision can load under the existing CSP.
export const SOMPO_TESLA_ASSET_URL = '/models/sompo/tesla-semi.glb?geometry=plain-v1';

function upgradeGeneratedSurface(material: THREE.MeshStandardMaterial): THREE.Material {
  const name = material.name.toLowerCase();
  const hex = material.color.getHex();
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  const looksGlass = /glass|wind|window|lens/.test(name) || (r < 90 && g < 130 && b > 90 && material.roughness < 0.35 && material.metalness < 0.4);
  const looksPaint = /paint|cab|body|car/.test(name) || (b > r + 20 && g > 60 && material.metalness < 0.55);
  const looksMetal = /chrome|alum|steel|metal/.test(name) || material.metalness > 0.7;
  if (looksGlass) {
    const glass = new THREE.MeshPhysicalMaterial();
    THREE.MeshStandardMaterial.prototype.copy.call(glass, material);
    glass.color.set(0x6a8aa0);
    glass.metalness = 0;
    glass.roughness = 0.05;
    glass.transmission = 0.62;
    glass.thickness = 0.04;
    glass.ior = 1.45;
    glass.transparent = true;
    glass.clearcoat = 1;
    glass.clearcoatRoughness = 0.04;
    glass.envMapIntensity = 1.6;
    glass.name = material.name;
    return glass;
  }
  if (looksPaint || looksMetal) {
    const coat = new THREE.MeshPhysicalMaterial();
    THREE.MeshStandardMaterial.prototype.copy.call(coat, material);
    coat.clearcoat = looksPaint ? 0.82 : 0.35;
    coat.clearcoatRoughness = looksPaint ? 0.12 : 0.22;
    coat.roughness = Math.min(material.roughness, looksPaint ? 0.28 : 0.32);
    coat.metalness = looksPaint ? Math.max(0.32, material.metalness) : Math.max(0.7, material.metalness);
    coat.envMapIntensity = 1.25;
    coat.name = material.name;
    return coat;
  }
  material.envMapIntensity = 1.05;
  material.roughness = Math.min(material.roughness, 0.86);
  return material;
}

function disposeAsset(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => materials.add(material));
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
    material.dispose();
  }
}

function tuneMaterials(mesh: THREE.Mesh) {
  mesh.castShadow = mesh.receiveShadow = true;
  for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
    if (!(material instanceof THREE.MeshStandardMaterial)) continue;
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.anisotropy = 8;
    if (material.name === 'Material.001') {
      material.color.set(0x8999a4);
      material.metalness = 0.62;
      material.roughness = 0.28;
      material.envMapIntensity = 1.1;
      if (material instanceof THREE.MeshPhysicalMaterial) {
        material.clearcoat = 0.72;
        material.clearcoatRoughness = 0.14;
      }
    } else if (material.name === 'Glass') {
      material.color.set(0x10202c);
      material.roughness = 0.095;
      material.metalness = 0.25;
      material.envMapIntensity = 1.4;
    } else if (material.name === 'Tire_Material' || material.name === 'Black.001') {
      material.color.set(0x16191c);
      material.metalness = 0;
      material.roughness = 0.94;
      material.normalScale.setScalar(1.2);
    } else if (material.name === 'Disk_material' || material.name === 'Black_material.001') {
      material.color.set(0x8a929b);
      material.metalness = 0.85;
      material.roughness = 0.25;
    } else if (material.name === 'White') {
      material.color.set(0xb9bbc0);
      material.metalness = 0.35;
      material.roughness = 0.62;
    }
  }
}

/** Light dirt/runoff on the container, with planar UVs because the source has no texture coordinates. */
function weatherContainer(mesh: THREE.Mesh) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 256;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return;
  let seed = 713;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  context.fillStyle = '#89958f';
  context.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 22000; i += 1) {
    context.fillStyle = random() > 0.5 ? 'rgba(239,234,222,0.05)' : 'rgba(27,34,30,0.06)';
    context.fillRect(random() * 512, random() * 256, 1 + random() * 2, 1);
  }
  for (let i = 0; i < 90; i += 1) {
    context.fillStyle = `rgba(60,48,30,${0.015 + random() * 0.055})`;
    context.fillRect(random() * 512, 0, 1 + random() * 2, 30 + random() * 180);
  }
  const dirt = context.createLinearGradient(0, 180, 0, 256);
  dirt.addColorStop(0, 'rgba(80,59,33,0)'); dirt.addColorStop(1, 'rgba(80,59,33,0.26)');
  context.fillStyle = dirt; context.fillRect(0, 180, 512, 76);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const material = (mesh.material as THREE.MeshStandardMaterial).clone();
  material.color.set(0xd5dad7);
  material.map = texture;
  material.metalness = 0.18;
  material.roughness = 0.72;
  material.envMapIntensity = 0.75;
  material.vertexColors = true;
  mesh.material = material;
  const positions = mesh.geometry.attributes.position;
  const normals = mesh.geometry.attributes.normal;
  const uv = new Float32Array(positions.count * 2);
  const colors = new Float32Array(positions.count * 3);
  const chassisColor = new THREE.Color(0x354045);
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i); const y = positions.getY(i); const z = positions.getZ(i);
    uv[i * 2] = Math.abs(normals.getX(i)) > 0.7 ? (z + 1.23) / 2.46 : (x + 4.27) / 5.4;
    uv[i * 2 + 1] = Math.abs(normals.getY(i)) > 0.7 ? (z + 1.23) / 2.46 : (y - 1.02) / 2.55;
    const color = y < 1.49 ? chassisColor : new THREE.Color(0xffffff);
    color.toArray(colors, i * 3);
  }
  mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/** Bake imported axes/scales once; every wheel then spins around local Y, just like the fallback. */
function mountWheel(mesh: THREE.Mesh, parent: THREE.Group) {
  const center = mesh.geometry.boundingBox!.getCenter(new THREE.Vector3());
  mesh.geometry.translate(-center.x, -center.y, -center.z);
  mesh.geometry.rotateX(-Math.PI / 2);
  mesh.position.copy(center);
  mesh.rotation.x = Math.PI / 2;
  mesh.geometry.computeBoundingBox();
  // Actual radius in calibrated metres keeps both tractor and trailer wheels in sync with the road.
  mesh.userData.radius = mesh.geometry.boundingBox!.getSize(new THREE.Vector3()).x / 2;
  parent.add(mesh);
}

let preloadedBufferPromise: Promise<ArrayBuffer> | null = null;

export function preloadSompoTruckAsset(): Promise<ArrayBuffer> | null {
  if (typeof fetch === 'undefined') return null;
  if (!preloadedBufferPromise) {
    preloadedBufferPromise = fetch(SOMPO_TRUCK_ASSET_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Truck asset preload: HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .catch((err) => {
        preloadedBufferPromise = null;
        throw err;
      });
  }
  return preloadedBufferPromise;
}

async function readTruckAsset(url: string, signal: AbortSignal) {
  let arrayBuffer: ArrayBuffer;
  if (url === SOMPO_TRUCK_ASSET_URL && preloadedBufferPromise) {
    try {
      const preloaded = await preloadedBufferPromise;
      arrayBuffer = preloaded.slice(0);
    } catch {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error(`Truck asset: HTTP ${response.status}`);
      arrayBuffer = await response.arrayBuffer();
    }
  } else {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Truck asset: HTTP ${response.status}`);
    arrayBuffer = await response.arrayBuffer();
  }
  if (signal.aborted) return null;
  // Tesla geometry is expanded offline: production CSP disallows blob workers/WASM.
  const gltf = await useSompoExternalTextures(new GLTFLoader()).parseAsync(arrayBuffer, '/models/sompo/');
  if (signal.aborted) {
    disposeAsset(gltf.scene);
    return null;
  }
  try {
    await restoreSompoTextures(gltf, url, signal);
  } catch (error) {
    disposeAsset(gltf.scene);
    if (signal.aborted) return null;
    throw error;
  }
  return gltf;
}

/** Generated image → Hunyuan3D mesh with baked PBR. Provenance: public/models/sompo/LICENSE.txt. */
async function loadGeneratedTruck(model: SompoTruckModel, signal: AbortSignal): Promise<boolean> {
  const gltf = await readTruckAsset(SOMPO_TRUCK_ASSET_URL, signal);
  if (!gltf) return false;
  const body = gltf.scene;
  body.name = 'generated-rural-truck-body';
  body.rotation.y = Math.PI / 2; // Generated vehicle faces +Z; telemetry faces +X.
  body.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(body);
  const size = bounds.getSize(new THREE.Vector3());
  if (![size.x, size.y, size.z].every((value) => Number.isFinite(value) && value > 0.01)) {
    disposeAsset(body);
    throw new Error('Generated truck has invalid bounds');
  }
  const scale = Math.min((SOMPO_TRUCK_HALF_SIZE.x * 2 - 0.20) / size.x,
    (SOMPO_TRUCK_HALF_SIZE.y * 2 - 0.10) / size.y, (SOMPO_TRUCK_HALF_SIZE.z * 2 - 0.10) / size.z);
  const asset = new THREE.Group();
  asset.name = 'generated-rural-truck';
  asset.add(body);
  body.scale.setScalar(scale);
  body.position.set(SOMPO_TRUCK_FRONT_X - 0.24 - bounds.max.x * scale, -bounds.min.y * scale, -(bounds.min.z + bounds.max.z) * scale / 2);
  body.updateMatrixWorld(true);
  const support: number[] = [];
  const point = new THREE.Vector3();
  const patched = new Set<THREE.Material>();
  const wearGenerated = (material: THREE.Material) => {
    if (!(material instanceof THREE.MeshStandardMaterial) || patched.has(material)) return;
    if (material.emissive.getHex() !== 0) return;
    if (material.transparent || (material instanceof THREE.MeshPhysicalMaterial && material.transmission > 0)) return;
    patched.add(material);
    const compile = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      compile?.call(material, shader, renderer);
      shader.vertexShader = 'varying vec3 truckW;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 truckP = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          truckP = instanceMatrix * truckP;
        #endif
        truckW = (modelMatrix * truckP).xyz;`);
      shader.fragmentShader = `varying vec3 truckW;
        float truckHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float truckNoise(vec2 p){vec2 i=floor(p),f=fract(p);f*=f*(3.-2.*f);
          return mix(mix(truckHash(i),truckHash(i+vec2(1,0)),f.x),mix(truckHash(i+vec2(0,1)),truckHash(i+vec2(1,1)),f.x),f.y);}\n` + shader.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
          float truckDust = smoothstep(1.7, .3, truckW.y) * (.35 + .65 * truckNoise(truckW.xz * 2.1));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.44, .37, .25), clamp(truckDust, 0., 1.) * .34);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, .93, clamp(truckDust, 0., 1.) * .42);`);
    };
    material.customProgramCacheKey = () => 'sompo-gen-truck-wear-v1';
  };
  body.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = mesh.receiveShadow = true;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      const upgraded = upgradeGeneratedSurface(material);
      if (upgraded !== material) {
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((item) => item === material ? upgraded : item);
        } else {
          mesh.material = upgraded;
        }
      }
      for (const value of Object.values(upgraded)) if (value instanceof THREE.Texture) value.anisotropy = 8;
      wearGenerated(upgraded instanceof THREE.MeshStandardMaterial ? upgraded : material);
    }
    // The offline export includes convex-hull vertices: exact support under any pitch/roll,
    // without scanning the 160k-triangle render mesh on every animation frame.
    const hull = mesh.userData.groundSupport as number[] | undefined;
    if (Array.isArray(hull) && hull.length >= 12 && hull.length % 3 === 0 && hull.every(Number.isFinite)) {
      for (let i = 0; i < hull.length; i += 3) {
        point.fromArray(hull, i).applyMatrix4(mesh.matrixWorld);
        support.push(point.x, point.y, point.z);
      }
    } else {
      const positions = mesh.geometry.attributes.position;
      for (let i = 0; i < positions.count; i += 1) {
        point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
        support.push(point.x, point.y, point.z);
      }
    }
  });
  if (!support.length) { disposeAsset(asset); throw new Error('Generated truck has no geometry'); }
  for (const child of model.root.children) {
    if (child !== model.sensorGroup && child !== model.rayGroup) child.visible = false;
  }
  model.root.add(asset);
  const socket = new THREE.Group();
  socket.name = 'generated-esp32-chassis-mount';
  asset.add(socket);
  socket.add(model.sensorGroup, model.rayGroup);
  // A compact bracket on the front chassis keeps the sensor visible without dwarfing the cab.
  model.sensorGroup.scale.setScalar(0.45);
  model.sensorGroup.position.set(SOMPO_TRUCK_FRONT_X - 0.22 * 0.45, 0.78, 0);
  model.rayGroup.position.set(SOMPO_TRUCK_FRONT_X, 0.78, 0);
  model.rayGroup.scale.z = 0.45;
  const label = model.sensorGroup.getObjectByName('sensor-label');
  if (label) { label.position.set(-0.95, 6.3, 0); label.scale.set(3.2, 0.8, 1); }
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, 0.52), new THREE.MeshStandardMaterial({ color: 0x20272a, metalness: 0.65, roughness: 0.5 }));
  bracket.position.set(4.42, 0.62, 0); bracket.castShadow = true; socket.add(bracket);
  const parts = splitGeneratedTruckParts(body);
  model.wheels.splice(0, model.wheels.length, ...parts.wheels);
  model.root.userData.cargoBody = parts.cargo;
  model.root.userData.asset = 'GeneratedRuralTruck';
  model.root.userData.groundSupport = new Float32Array(support);
  return true;
}

async function loadTeslaTruck(model: SompoTruckModel, signal: AbortSignal): Promise<boolean> {
  const gltf = await readTruckAsset(SOMPO_TESLA_ASSET_URL, signal);
  if (!gltf) return false;
  const cab = gltf.scene.getObjectByName('Sketchfab_model');
  const container = gltf.scene.getObjectByName('Wagon_Container');
  const trailerWheels = ['Wheels3', 'Wheels4'].map((name) => gltf.scene.getObjectByName(name));
  if (!cab || !container || trailerWheels.some((wheel) => !wheel)) {
    disposeAsset(gltf.scene);
    throw new Error('Tesla Semi cab/trailer nodes missing');
  }
  // Keep only vehicle geometry. The original showcase includes barriers, cones and display planes.
  const displayPlanes: THREE.Object3D[] = [];
  cab.traverse((object) => { if (/^Plane/.test(object.name)) displayPlanes.push(object); });
  displayPlanes.forEach((plane) => plane.removeFromParent());

  const tractor = new THREE.Group();
  tractor.name = 'tesla-tractor';
  tractor.rotation.y = Math.PI / 2; // Native tractor +Z -> simulator +X.
  tractor.add(cab);
  tractor.updateMatrixWorld(true);
  const cabBounds = new THREE.Box3().setFromObject(tractor);
  const cabScale = 2.30 / cabBounds.getSize(new THREE.Vector3()).z;
  const fittedCab = new THREE.Group();
  fittedCab.add(tractor);
  fittedCab.scale.setScalar(cabScale); // Preserve the cab, glass and tyre proportions.
  fittedCab.position.set(SOMPO_TRUCK_FRONT_X - 0.24 - cabBounds.max.x * cabScale, -cabBounds.min.y * cabScale, 0);
  fittedCab.updateMatrixWorld(true);

  const asset = new THREE.Group();
  asset.name = 'tesla-semi';
  const body = new THREE.Group();
  body.name = 'tesla-body';
  asset.add(body);
  const wheels: THREE.Mesh[] = [];
  const meshes: THREE.Mesh[] = [];
  fittedCab.traverse((object) => { if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh); });
  for (const imported of meshes) {
    const mesh = new THREE.Mesh(imported.geometry.clone().applyMatrix4(imported.matrixWorld), imported.material);
    mesh.name = imported.name;
    mesh.geometry.computeBoundingBox();
    tuneMaterials(mesh);
    if (/^(Tires|Disks)/.test(mesh.name)) {
      mountWheel(mesh, body);
      wheels.push(mesh);
      if (mesh.name === 'Tires_0') mesh.userData.intactTirePositions = new Float32Array(mesh.geometry.attributes.position.array);
    } else body.add(mesh);
  }

  // Discs and tyres on the tractor share the tyre radius, never the smaller rim radius.
  const tractorRadius = wheels.find((wheel) => wheel.name === 'Tires_0')?.userData.radius;
  for (const wheel of wheels) wheel.userData.radius = tractorRadius;

  // The source's container is a separate train wagon at an angle. Rebuild it as a short
  // tandem-axle semi-trailer: align behind the cab and discard its redundant front bogie.
  const trailer = new THREE.Group();
  trailer.name = 'tesla-trailer';
  body.add(trailer);
  container.removeFromParent();
  container.updateMatrixWorld(true);
  const importedContainer = container as THREE.Mesh;
  const boxGeometry = importedContainer.geometry.clone().applyMatrix4(container.matrixWorld);
  boxGeometry.computeBoundingBox();
  const boxBounds = boxGeometry.boundingBox!;
  const boxSize = boxBounds.getSize(new THREE.Vector3());
  const boxCenter = boxBounds.getCenter(new THREE.Vector3());
  boxGeometry.translate(-boxCenter.x, -boxBounds.min.y, -boxCenter.z);
  boxGeometry.scale(5.40 / boxSize.x, 2.55 / boxSize.y, (SOMPO_TRUCK_HALF_SIZE.z * 1.78) / boxSize.z);
  boxGeometry.translate(-1.57, 1.02, 0); // Rear -4.27, front +1.13, roof 3.57.
  const box = new THREE.Mesh(boxGeometry, importedContainer.material);
  box.name = 'Wagon_Container';
  tuneMaterials(box);
  weatherContainer(box);
  trailer.add(box);
  trailerWheels.forEach((object, index) => {
    // Replace the source wagon's plain train wheels with the tractor's detailed dual tyres/rims.
    for (const [sourceName, suffix] of [['Tires002_0', ''], ['Tires004_0', '-inner'], ['Disks001_0', '-rim']]) {
      const source = wheels.find((wheel) => wheel.name === sourceName)!;
      const mesh = new THREE.Mesh(source.geometry.clone(), source.material);
      mesh.name = `${object!.name}${suffix}`;
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(-2.55 - index * 0.96, source.userData.radius, 0);
      mesh.userData.radius = source.userData.radius;
      mesh.castShadow = mesh.receiveShadow = true;
      trailer.add(mesh);
      wheels.push(mesh);
    }
  });
  const suspensionMaterial = new THREE.MeshStandardMaterial({ color: 0x253036, metalness: 0.65, roughness: 0.65 });
  for (const x of [-2.55, -3.51]) {
    const suspension = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.58, 1.55), suspensionMaterial);
    suspension.position.set(x, 0.88, 0);
    suspension.castShadow = true;
    trailer.add(suspension);
  }
  if (wheels.length !== 14) {
    disposeAsset(asset);
    throw new Error('Tesla Semi wheel nodes missing');
  }

  // Only replace the fallback after the complete assembly is validated.
  for (const child of model.root.children) {
    if (child !== model.sensorGroup && child !== model.rayGroup) child.visible = false;
  }
  model.root.add(asset);
  const chassisSocket = new THREE.Group();
  chassisSocket.name = 'gltf-esp32-chassis-mount';
  asset.add(chassisSocket);
  chassisSocket.add(model.sensorGroup);
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.10, 0.9), new THREE.MeshStandardMaterial({ color: 0x202c32, metalness: 0.7, roughness: 0.4 }));
  bracket.position.set(4.07, 1.43, 0);
  bracket.castShadow = true;
  chassisSocket.add(bracket);
  model.wheels.splice(0, model.wheels.length, ...wheels);
  model.root.userData.asset = 'TeslaSemi';
  model.root.updateWorldMatrix(true, true);
  const inverseRoot = model.root.matrixWorld.clone().invert();
  const support: number[] = [];
  const point = new THREE.Vector3();
  body.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const positions = mesh.geometry.attributes.position;
    const localMatrix = new THREE.Matrix4().multiplyMatrices(inverseRoot, mesh.matrixWorld);
    for (let i = 0; i < positions.count; i += 1) {
      point.fromBufferAttribute(positions, i).applyMatrix4(localMatrix);
      support.push(point.x, point.y, point.z);
    }
  });
  model.root.userData.groundSupport = new Float32Array(support);
  return true;
}

/** Generated → Tesla → existing synchronous procedural model. Never replace a valid fallback on error. */
export async function loadSompoTruckAsset(model: SompoTruckModel, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return false;
  try {
    return await loadGeneratedTruck(model, signal);
  } catch (generatedError) {
    if (signal.aborted) return false;
    try { return await loadTeslaTruck(model, signal); }
    catch (teslaError) {
      if (signal.aborted) return false;
      throw Object.assign(new Error('Detailed truck assets unavailable'), { causes: [generatedError, teslaError] });
    }
  }
}
