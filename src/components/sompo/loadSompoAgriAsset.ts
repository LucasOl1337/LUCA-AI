import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  SOMPO_AGRI_EQUIPMENT,
  type SompoAgriEquipmentId,
} from '../../../shared/sompo-agri-scenarios.js';
import { restoreSompoTextures, useSompoExternalTextures } from './restoreSompoTextures';

function disposeObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (!mesh.material) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
}

/**
 * Loads a generated agricultural machine under the production CSP. The GLB
 * keeps its byte-identical embedded atlas for provenance, while rendering uses
 * the external image manifest through restoreSompoTextures.
 */
export async function loadSompoAgriAsset(equipmentId: SompoAgriEquipmentId, signal: AbortSignal) {
  const equipment = SOMPO_AGRI_EQUIPMENT[equipmentId];
  const response = await fetch(equipment.assetUrl, { signal });
  if (!response.ok) throw new Error(`Sompo ${equipmentId} asset: HTTP ${response.status}`);
  const gltf = await useSompoExternalTextures(new GLTFLoader()).parseAsync(
    await response.arrayBuffer(),
    '/models/sompo/',
  );
  if (signal.aborted) {
    disposeObject(gltf.scene);
    return null;
  }
  try {
    await restoreSompoTextures(gltf, equipment.assetUrl, signal);
  } catch (error) {
    disposeObject(gltf.scene);
    throw error;
  }

  const model = gltf.scene;
  model.name = `sompo-agri-${equipmentId}-asset`;
  // Hunyuan reference faces +Z; Sompo forward is +X. A colheitadeira foi reconstruída com a plataforma
  // de corte voltada para -X do modelo (andava de lado): meia-volta a mais deixa a plataforma na frente.
  model.rotation.y = equipmentId === 'harvester' ? Math.PI : Math.PI / 2;
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  if (![size.x, size.y, size.z].every((value) => Number.isFinite(value) && value > 0.01)) {
    disposeObject(model);
    throw new Error(`Sompo ${equipmentId} asset has invalid bounds`);
  }
  const nominal = equipment.nominalSizeM;
  const scale = Math.min(nominal.length / size.x, nominal.height / size.y, nominal.width / size.z);
  model.scale.setScalar(scale);
  model.position.set(
    -((bounds.min.x + bounds.max.x) * scale) / 2,
    -bounds.min.y * scale,
    -((bounds.min.z + bounds.max.z) * scale) / 2,
  );
  model.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      material.envMapIntensity = 0.7;
      // Painted machinery keeps the generated atlas/UVs, with a satin floor to
      // prevent reconstructed highlights from turning every painted panel into chrome.
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\nroughnessFactor = max(roughnessFactor, 0.46);');
      };
      material.customProgramCacheKey = () => 'sompo-agri-satin-v1';
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.anisotropy = 8;
      }
    }
  });
  model.userData.equipmentId = equipmentId;
  model.userData.assetUrl = equipment.assetUrl;
  return model;
}

export function disposeSompoAgriAsset(root: THREE.Object3D) {
  disposeObject(root);
}

