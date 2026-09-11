import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import dracoWrapperUrl from 'three/addons/libs/draco/gltf/draco_wasm_wrapper.js?url';
import dracoWasmUrl from 'three/addons/libs/draco/gltf/draco_decoder.wasm?url';
import { SOMPO_TRUCK_FRONT_X, SOMPO_TRUCK_HALF_SIZE, type SompoTruckModel } from './createSompoTruckModel';

// Tesla Semi © 2018 Oleksii Rozumnyi · CC BY 4.0 · adaptado com sensor.
// Original: https://sketchfab.com/3d-models/tesla-semi-39ffc7c746184e0c9ebd5bbcd0b405dd
// GLB: https://raw.githubusercontent.com/pakagronglb/tesla-3d-showcase/main/public/models/semi_scene.glb
// License: https://creativecommons.org/licenses/by/4.0/ (see public/models/sompo/LICENSE.txt).
// Adaptations: remove display props, align/shorten the trailer, calibrate wheel pivots,
// tune materials and attach the ESP32. The source GLB has no animation clips.
export const SOMPO_TRUCK_ASSET_URL = '/models/sompo/tesla-semi.glb';

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
  const context = canvas.getContext('2d');
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

/** Keeps the synchronous procedural model usable while fetching; failed/aborted loads never replace it. */
export async function loadSompoTruckAsset(model: SompoTruckModel, signal: AbortSignal): Promise<boolean> {
  const response = await fetch(SOMPO_TRUCK_ASSET_URL, { signal });
  if (!response.ok) throw new Error(`Truck asset: HTTP ${response.status}`);
  // Bundle both decoder files with Vite: no external CDN/network dependency after installation.
  const decoder = new DRACOLoader().setDecoderPath({ js: dracoWrapperUrl, wasm: dracoWasmUrl }).setWorkerLimit(2);
  let gltf;
  try {
    gltf = await new GLTFLoader().setDRACOLoader(decoder).parseAsync(await response.arrayBuffer(), '/models/sompo/');
  } finally {
    decoder.dispose();
  }
  if (signal.aborted) {
    disposeAsset(gltf.scene);
    return false;
  }
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
