import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { restoreSompoTextures, useSompoExternalTextures } from './restoreSompoTextures';
import { getSompoAnimalPose } from '../../../shared/sompo-scenario-effects.js';

/** Locally generated Nelore, image → Hunyuan3D-2.1. Exact source/settings ship beside the GLB. */
export function createSompoAnimal(parent: THREE.Group) {
  const root = new THREE.Group(); root.name = 'generated-nelore-crossing'; parent.add(root); root.visible = false;
  const abort = new AbortController(); let disposed = false;
  const fallbackMap = new THREE.TextureLoader().load('/models/sompo/generated-nelore-billboard.webp');
  fallbackMap.colorSpace = THREE.SRGBColorSpace;
  const sizeLimit = getSompoAnimalPose(-6);
  const fallback = new THREE.Mesh(new THREE.PlaneGeometry(sizeLimit.length, sizeLimit.height), new THREE.MeshStandardMaterial({ map: fallbackMap, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 }));
  fallback.position.y = sizeLimit.height / 2; root.add(fallback); fallback.visible = false;
  // Sombra de contato: o mapa de sombra do sol sozinho deixa o bovino
  // flutuando na pista. Fica fora do grupo que tomba, rente ao chão.
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: .8, color: 0x000000 }));
  contact.name = 'generated-nelore-contact'; contact.rotation.x = -Math.PI / 2; contact.renderOrder = 1; contact.visible = false;
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d');
    if (context) {
      const fade = context.createRadialGradient(32, 32, 2, 32, 32, 32);
      fade.addColorStop(0, 'rgba(255,255,255,.85)'); fade.addColorStop(.35, 'rgba(255,255,255,.5)'); fade.addColorStop(1, 'rgba(255,255,255,0)');
      context.fillStyle = fade; context.fillRect(0, 0, 64, 64);
      const map = new THREE.CanvasTexture(canvas);
      (contact.material as THREE.MeshBasicMaterial).alphaMap = map;
    }
  }
  parent.add(contact);
  let model: THREE.Group | null = null;
  let body: THREE.Mesh | undefined; let rest: Float32Array | undefined;
  const animated: number[] = [];
  let ready: Promise<void> | null = null;

  function ensureLoaded() {
    if (ready) return ready;
    ready = fetch('/models/sompo/generated-nelore.glb', { signal: abort.signal }).then(async (response) => {
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
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if (material instanceof THREE.MeshStandardMaterial) {
          // The reconstruction baked studio light into the albedo; pull it under
          // the scene exposure so the shaded flank does not glow.
          material.metalness = 0; material.roughness = 0.9; material.envMapIntensity = 0.5; material.color.setScalar(.8);
        }
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
    return ready;
  }

  function release(group: THREE.Object3D) {
    const materials = new Set<THREE.Material>();
    group.traverse((object) => { const mesh = object as THREE.Mesh; mesh.geometry?.dispose(); if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => materials.add(m)); });
    for (const material of materials) { for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose(); material.dispose(); }
  }
  return {
    get ready() { return ensureLoaded(); },
    update(visible: boolean, z: number, elapsedMs: number, reducedMotion: boolean, anchorX?: number, walkingSpeed = 1, impactAgeMs: number | null = null) {
      // A trilha "animal" da cena decide quando o bovino sai de quadro; o corte
      // fixo de 13 s vale só para quem chama sem âncora (compatibilidade).
      const pose = getSompoAnimalPose(z, elapsedMs, anchorX === undefined ? 13000 : null);
      root.visible = visible && pose.visible; contact.visible = root.visible; if (!root.visible) return;
      void ensureLoaded();
      const impact = impactAgeMs === null ? 0 : clamp01(impactAgeMs / 1400);
      const fall = impact * impact * (3 - 2 * impact);
      const activity = reducedMotion ? 0 : Math.min(1, Math.abs(walkingSpeed) / .6) * (1 - fall);
      const moving = activity > 0;
      // Phase is travelled distance: pausing/replaying never resets a raised hoof.
      const departure = Math.max(0, Math.min(4.2, z - 2.8)), k = 36 / (4.2 * 4.2);
      const arc = .5 * (departure * Math.sqrt(1 + (k * departure) ** 2) + Math.asinh(k * departure) / k);
      const gait = (Math.min(z, 2.8) + 8 + arc) / 1.05 * Math.PI * 2;
      const t = reducedMotion ? 0 : elapsedMs / 1000;
      // Ancorado no mundo: o caminhão se aproxima do animal, não o contrário.
      const worldX = (anchorX ?? 0) + (pose.x - 7);
      root.position.set(anchorX === undefined ? pose.x : worldX, moving ? Math.sin(gait * 2) * .015 * activity : 0, pose.z);
      root.rotation.set(fall * 1.45, pose.yaw, 0, 'YZX');
      root.position.x += fall * .4; root.position.z += fall * .35;
      if (fall > 0 && rest) {
        // Authored contact response, without gore or an invented physical sensor flag.
        // Support keeps the animal above the road while it settles onto its side.
        let bottom = Infinity;
        const c = Math.cos(root.rotation.x), s = Math.sin(root.rotation.x);
        for (let i = 0; i < rest.length; i += 3) bottom = Math.min(bottom, c * rest[i + 1] - s * rest[i + 2]);
        root.position.y = .015 - bottom;
      }
      // Deitado ocupa mais chão e cola mais; em pé é uma elipse sob o corpo.
      contact.position.set(root.position.x, .012, root.position.z);
      contact.rotation.z = pose.yaw;
      contact.scale.set(sizeLimit.length * (1.25 + fall * .2), sizeLimit.width * (1.5 + fall * 1.4), 1);
      (contact.material as THREE.MeshBasicMaterial).opacity = .62 + fall * .2;
      fallback.visible = !model && !!fallbackMap.image;
      if (body && rest) {
        const p = body.geometry.attributes.position as THREE.BufferAttribute;
        for (const i of animated) {
          const x = rest[i * 3]; const y = rest[i * 3 + 1]; const side = rest[i * 3 + 2];
          const legWeight = clamp01((0.67 - y) / 0.55);
          const phase = gait + (x > 0 ? 0 : Math.PI * .5) + (side > 0 ? 0 : Math.PI);
          const tailWeight = clamp01((-x - 0.94) / 0.32) * clamp01((1.25 - y) / 0.8);
          p.setXYZ(i, x + (moving ? Math.sin(phase) * 0.14 * legWeight * activity : 0), y + (moving ? Math.max(0, Math.cos(phase)) ** 2 * 0.09 * legWeight * activity : 0), side + (moving ? Math.sin(t * 3.5) * 0.09 * tailWeight : 0));
        }
        p.needsUpdate = true;
      }
    },
    get asset() { return root.userData.asset ?? 'photograph-fallback'; },
    dispose() { disposed = true; abort.abort(); release(root); root.removeFromParent(); release(contact); contact.removeFromParent(); },
  };
}
function clamp01(value: number) { return Math.max(0, Math.min(1, value)); }
