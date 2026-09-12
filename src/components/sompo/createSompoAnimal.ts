import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { restoreSompoTextures, useSompoExternalTextures } from './restoreSompoTextures';
import { getSompoAnimalPose } from '../../../shared/sompo-scenario-effects.js';

/** Locally generated Nelore, image → Hunyuan3D-2.1. Exact source/settings ship beside the GLB. */
export function createSompoAnimal(parent: THREE.Group) {
  const root = new THREE.Group(); root.name = 'generated-nelore-crossing'; parent.add(root); root.visible = false;
  const abort = new AbortController(); let disposed = false;
  const fallbackMap = new THREE.TextureLoader().load('/models/sompo/generated-nelore-source.png');
  fallbackMap.colorSpace = THREE.SRGBColorSpace;
  const sizeLimit = getSompoAnimalPose(-6);
  const fallback = new THREE.Mesh(new THREE.PlaneGeometry(sizeLimit.length, sizeLimit.height), new THREE.MeshStandardMaterial({ map: fallbackMap, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 }));
  fallback.position.y = sizeLimit.height / 2; root.add(fallback); fallback.visible = false;
  let model: THREE.Group | null = null;
  let body: THREE.Mesh | undefined; let rest: Float32Array | undefined;
  const animated: number[] = [];
  const ready = fetch('/models/sompo/generated-nelore.glb', { signal: abort.signal }).then(async (response) => {
    if (!response.ok) throw new Error(`Nelore HTTP ${response.status}`);
    const gltf = await useSompoExternalTextures(new GLTFLoader()).parseAsync(await response.arrayBuffer(), '/models/sompo/');
    try { await restoreSompoTextures(gltf, '/models/sompo/generated-nelore.glb', abort.signal); }
    catch (error) { release(gltf.scene); throw error; }
    return gltf;
  }).then((gltf) => {
    if (disposed) { release(gltf.scene); return; }
    model = gltf.scene;
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model); const size = bounds.getSize(new THREE.Vector3());
    const scale = Math.min(sizeLimit.length / size.x, sizeLimit.height / size.y);
    // Single-view reconstruction exaggerated the animal's depth; bound its width too.
    const widthScale = Math.min(scale, sizeLimit.width / size.z);
    model.scale.set(scale, scale, widthScale); model.position.set(-(bounds.min.x + bounds.max.x) / 2 * scale, -bounds.min.y * scale, -(bounds.min.z + bounds.max.z) / 2 * widthScale);
    root.add(model);
    root.updateWorldMatrix(true, true);
    // Bake the reconstruction's node axes to animal-local +X forward, +Y up before gait.
    const meshes: THREE.Mesh[] = [];
    model.traverse((node) => { if ((node as THREE.Mesh).isMesh) meshes.push(node as THREE.Mesh); });
    for (const mesh of meshes) {
      mesh.castShadow = mesh.receiveShadow = true;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if (material instanceof THREE.MeshStandardMaterial) { material.metalness = 0; material.roughness = 0.9; material.envMapIntensity = 0.7; }
    }
    if (meshes.length === 1) {
      body = meshes[0];
      const intoRoot = root.matrixWorld.clone().invert().multiply(body.matrixWorld);
      body.geometry.applyMatrix4(intoRoot); body.removeFromParent(); root.add(body); body.position.set(0, 0, 0); body.rotation.set(0, 0, 0); body.scale.setScalar(1);
      const p = body.geometry.attributes.position;
      rest = new Float32Array(p.array);
      for (let i = 0; i < p.count; i += 1) if (p.getY(i) < 0.68 || p.getX(i) < -0.9) animated.push(i);
      body.geometry.computeBoundingSphere();
    }
    root.userData.asset = 'GeneratedNelore';
  }).catch(() => { /* An alpha-tested photograph keeps an animal visible if the GLB cannot load. */ });

  function release(group: THREE.Object3D) {
    const materials = new Set<THREE.Material>();
    group.traverse((object) => { const mesh = object as THREE.Mesh; mesh.geometry?.dispose(); if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => materials.add(m)); });
    for (const material of materials) { for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose(); material.dispose(); }
  }
  return {
    ready,
    update(visible: boolean, z: number, elapsedMs: number, reducedMotion: boolean, anchorX?: number, walking = true) {
      // A trilha "animal" da cena decide quando o bovino sai de quadro; o corte
      // fixo de 13 s vale só para quem chama sem âncora (compatibilidade).
      const pose = getSompoAnimalPose(z, elapsedMs, anchorX === undefined ? 13000 : null);
      root.visible = visible && pose.visible; if (!root.visible) return;
      const moving = walking && !reducedMotion;
      const t = moving ? elapsedMs / 1000 : 0;
      // Ancorado no mundo: o caminhão se aproxima do animal, não o contrário.
      const worldX = (anchorX ?? 0) + (pose.x - 7);
      root.position.set(anchorX === undefined ? pose.x : worldX, moving ? Math.sin(t * 6) * 0.022 : 0, pose.z);
      root.rotation.y = pose.yaw;
      fallback.visible = !model && !!fallbackMap.image;
      if (body && rest) {
        const p = body.geometry.attributes.position as THREE.BufferAttribute;
        for (const i of animated) {
          const x = rest[i * 3]; const y = rest[i * 3 + 1]; const side = rest[i * 3 + 2];
          const legWeight = clamp01((0.67 - y) / 0.55);
          const phase = t * 6 + (x > 0 ? 0 : Math.PI) + (side > 0 ? 0 : Math.PI);
          const tailWeight = clamp01((-x - 0.94) / 0.32) * clamp01((1.25 - y) / 0.8);
          p.setXYZ(i, x + (moving ? Math.sin(phase) * 0.11 * legWeight : 0), y + (moving ? Math.max(0, Math.cos(phase)) * 0.055 * legWeight : 0), side + (moving ? Math.sin(t * 3.5) * 0.09 * tailWeight : 0));
        }
        p.needsUpdate = true;
      }
    },
    get asset() { return root.userData.asset ?? 'photograph-fallback'; },
    dispose() { disposed = true; abort.abort(); release(root); root.removeFromParent(); },
  };
}
function clamp01(value: number) { return Math.max(0, Math.min(1, value)); }
