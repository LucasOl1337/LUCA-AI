import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { restoreSompoTextures, useSompoExternalTextures } from './restoreSompoTextures';

// Locally reconstructed botanical references, 18k triangles/species with PBR atlases.
// Inputs, generation settings and hashes are in public/models/sompo/*.provenance.json.
export const SOMPO_TREE_SPECIES = [
  { asset: 'generated-jacaranda', height: 7, placements: [[-12, -13], [30, 12], [-42, 17], [62, -24], [-84, -38], [92, 38], [4, 26], [-58, -30], [76, 14]] },
  { asset: 'generated-eucalyptus', height: 10, placements: [[14, -16], [-30, -19], [46, 18], [-66, 26], [80, -36], [-96, 34], [-8, 33], [38, -32], [-100, -14]] },
  { asset: 'generated-cerrado', height: 5, placements: [[-22, 12], [26, -12], [-48, -23], [60, 28], [-78, 38], [94, -30], [10, -36], [-90, 20], [50, 36]] },
] as const;

/** Período da trilha infinita das árvores: cada LOD recicla à frente do caminhão. */
const TREE_WRAP_SPAN = 212;
const wrapTreeX = (baseX: number, truckX: number) => baseX + (TREE_WRAP_SPAN * Math.round((truckX - baseX) / TREE_WRAP_SPAN));

/** True geometry beside the road; image impostors only beyond 32 metres. */
export function createSompoVegetation(parent: THREE.Group, camera: THREE.Camera, heightAt?: (x: number, z: number) => number) {
  const root = new THREE.Group(); root.name = 'rural-3d-vegetation'; parent.add(root);
  const abort = new AbortController();
  const pending: Promise<void>[] = [];
  const localCamera = new THREE.Vector3();
  const localFocus = new THREE.Vector3(), sight = new THREE.Vector3(), center = new THREE.Vector3(), projected = new THREE.Vector3();
  const cards: { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; lod: THREE.LOD }[] = [];
  const lods: { lod: THREE.LOD; baseX: number; z: number }[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  function retain(model: THREE.Object3D) {
    model.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
    });
  }
  function release(model: THREE.Object3D) {
    model.traverse((node) => {
      const mesh = node as THREE.Mesh;
      mesh.geometry?.dispose();
      if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
        material.dispose();
      }
    });
  }
  for (const [speciesIndex, species] of SOMPO_TREE_SPECIES.entries()) {
    const url = `/models/sompo/${species.asset}.glb`;
    const map = new THREE.TextureLoader().load(`/models/sompo/${species.asset}-billboard.webp`, (loaded) => {
      if (abort.signal.aborted) loaded.dispose();
    });
    map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
    const material = new THREE.MeshBasicMaterial({ map, alphaTest: 0.4, side: THREE.DoubleSide });
    const nearGroups: THREE.Group[] = [];
    for (const [index, [x, z]] of species.placements.entries()) {
      const lod = new THREE.LOD(); lod.name = `${species.asset}-${index}`;
      lod.position.set(x, -0.03, z);
      lods.push({ lod, baseX: x, z });
      lod.rotation.y = speciesIndex * 1.7 + index * 2.4;
      lod.scale.setScalar(0.86 + ((index * 3 + speciesIndex) % 5) * 0.075);
      const near = new THREE.Group(); near.name = 'near-3d-tree'; nearGroups.push(near);
      const far = new THREE.Group(); far.name = 'distant-tree-impostor';
      const card = new THREE.Mesh(new THREE.PlaneGeometry(species.height, species.height), material);
      card.position.y = species.height / 2; card.visible = false; far.add(card);
      cards.push({ mesh: card, lod });
      lod.addLevel(near, 0); lod.addLevel(far, 32, 0.1);
      root.add(lod);
    }
    const loading = fetch(url, { signal: abort.signal }).then(async (response) => {
      if (!response.ok) throw new Error(`Tree HTTP ${response.status}`);
      const gltf = await useSompoExternalTextures(new GLTFLoader()).parseAsync(await response.arrayBuffer(), '/models/sompo/');
      try { await restoreSompoTextures(gltf, url, abort.signal); }
      catch (error) { release(gltf.scene); throw error; }
      return gltf;
    }).then((gltf) => {
      const model = gltf.scene;
      if (abort.signal.aborted) { release(model); return; }
      model.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      if (!(size.y > 0 && Number.isFinite(size.y))) { release(model); return; }
      const scale = species.height / size.y;
      model.scale.multiplyScalar(scale);
      model.position.set(-(bounds.min.x + bounds.max.x) * scale / 2, -bounds.min.y * scale, -(bounds.min.z + bounds.max.z) * scale / 2);
      model.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.userData.sompoTree = true;
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          if (material instanceof THREE.MeshStandardMaterial) { material.metalness = 0; material.roughness = 0.95; material.envMapIntensity = 0.65; }
        }
      });
      retain(model);
      for (const near of nearGroups) near.add(model.clone(true)); // Shared geometry/material/atlas, no per-tree copies.
      root.userData.loadedSpecies = (root.userData.loadedSpecies ?? 0) + 1;
    }).catch(() => { /* Offline: keep the road usable; never substitute opaque white cards. */ });
    pending.push(loading);
  }
  retain(root);
  return {
    ready: Promise.all(pending),
    update(wet: boolean, truckX = 0, focus = new THREE.Vector3(truckX, 1.5, 0)) {
      camera.getWorldPosition(localCamera); parent.worldToLocal(localCamera);
      localFocus.copy(focus); parent.worldToLocal(localFocus); sight.copy(localFocus).sub(localCamera);
      // Trilha infinita: cada árvore recicla à frente e assenta no relevo local.
      for (const { lod, baseX, z } of lods) {
        const x = wrapTreeX(baseX, truckX);
        const setback = z + Math.sign(z) * 9;
        lod.position.set(x, heightAt ? heightAt(x, setback) - 0.06 : -0.03, setback);
        // Remove only a foreground tree that crosses the operator's view of the vehicle.
        center.copy(lod.position); center.y += 4;
        const t = THREE.MathUtils.clamp(projected.copy(center).sub(localCamera).dot(sight) / Math.max(1, sight.lengthSq()), 0, 1);
        const distance = center.distanceTo(projected.copy(localCamera).addScaledVector(sight, t));
        lod.visible = !(t > 0 && t < 1 && distance < 4.5);
      }
      for (const { mesh, lod } of cards) {
        const image = mesh.material.map?.image as HTMLImageElement | undefined;
        mesh.visible = !!image?.naturalWidth;
        if (image?.naturalWidth) mesh.scale.x = image.naturalWidth / image.naturalHeight;
        mesh.rotation.y = Math.atan2(localCamera.x - lod.position.x, localCamera.z - lod.position.z) - lod.rotation.y;
        mesh.material.color.set(wet ? 0x637057 : 0x91a67e);
      }
    },
    dispose() {
      abort.abort(); root.removeFromParent();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
    },
  };
}
