import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SOMPO_TRUCK_FRONT_X, SOMPO_TRUCK_HALF_SIZE, type SompoTruckModel } from './createSompoTruckModel';

// Cesium Milk Truck © 2017 Cesium, CC BY 4.0. Original textures/logo retained.
// Source: https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CesiumMilkTruck
// License: https://creativecommons.org/licenses/by/4.0/
// Adaptations: orientation/envelope, material response and attached ESP32 sensor.
export const SOMPO_TRUCK_ASSET_URL = '/models/sompo/cesium-milk-truck.glb';

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

/** Keeps the synchronous procedural model usable while fetching; failed/aborted loads never replace it. */
export async function loadSompoTruckAsset(model: SompoTruckModel, signal: AbortSignal): Promise<boolean> {
  const response = await fetch(SOMPO_TRUCK_ASSET_URL, { signal });
  if (!response.ok) throw new Error(`Truck asset: HTTP ${response.status}`);
  const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '/models/sompo/');
  if (signal.aborted) {
    disposeAsset(gltf.scene);
    return false;
  }
  const asset = new THREE.Group();
  asset.name = 'cesium-milk-truck';
  // Native glTF faces +Z; scene and ESP32 range use +X.
  gltf.scene.rotation.y = Math.PI / 2;
  asset.add(gltf.scene);
  asset.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(asset);
  const size = bounds.getSize(new THREE.Vector3());
  // Fit the existing calibrated envelope; never move the sensor/range reference.
  const target = new THREE.Vector3(8.65, 3.72, SOMPO_TRUCK_HALF_SIZE.z * 1.94);
  // Scale in world axes after the +Z -> +X rotation (parent, not mesh axes).
  asset.scale.copy(target.divide(size));
  asset.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(asset);
  asset.position.set(SOMPO_TRUCK_FRONT_X - 0.24 - fitted.max.x, -fitted.min.y, -(fitted.min.z + fitted.max.z) / 2);
  const wheels: THREE.Mesh[] = [];
  asset.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = mesh.receiveShadow = true;
    if (/^Wheels/.test(mesh.name)) {
      wheels.push(mesh);
      if (mesh.name === 'Wheels') {
        mesh.geometry = mesh.geometry.clone();
        mesh.userData.intactTirePositions = new Float32Array(mesh.geometry.attributes.position.array);
      }
    }
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      if (material.map) material.map.anisotropy = 8;
      if (material.name === 'truck') { material.roughness = 0.46; material.metalness = 0.15; }
      if (material.name === 'glass') { material.roughness = 0.12; material.metalness = 0.35; material.color.set(0x365968); }
    }
  });
  if (wheels.length !== 2) {
    disposeAsset(asset);
    throw new Error('Truck asset wheel nodes missing');
  }
  // The supplied Wheels clip rotates these exact two axle meshes around local Y.
  // Drive them directly instead of a looping mixer so stopping/reversing follows telemetry.
  for (const child of model.root.children) {
    if (child !== model.sensorGroup && child !== model.rayGroup) child.visible = false;
  }
  model.root.add(asset);
  // A chassis socket stays in calibrated truck coordinates despite imported glTF scaling.
  const chassisSocket = new THREE.Group();
  chassisSocket.name = 'gltf-esp32-chassis-mount';
  model.root.add(chassisSocket);
  chassisSocket.add(model.sensorGroup);
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.10, 0.9), new THREE.MeshStandardMaterial({ color: 0x202c32, metalness: 0.7, roughness: 0.4 }));
  bracket.position.set(4.32, 1.43, 0);
  bracket.castShadow = true;
  chassisSocket.add(bracket);
  // Parent the calibrated socket to the imported truck, compensating its envelope scale.
  asset.attach(chassisSocket);
  model.wheels.splice(0, model.wheels.length, ...wheels);
  model.root.userData.asset = 'CesiumMilkTruck';
  model.root.updateWorldMatrix(true, true);
  const inverseRoot = model.root.matrixWorld.clone().invert();
  const support: number[] = [];
  const point = new THREE.Vector3();
  gltf.scene.traverse((object) => {
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
