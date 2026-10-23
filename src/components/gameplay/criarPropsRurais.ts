import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MODELOS_RURAIS, PROPS_RURAIS, type ModeloRural } from './propsRurais';
import { restoreSompoTextures, useSompoExternalTextures } from '../sompo/restoreSompoTextures';
import { disposeSompoObject } from '../sompo/sompoStage';
import { urlPublica } from '../sompo/urlsPublicas';

/** Local à montagem: uma carga por modelo, clones compartilham GPU; sem cache global descartado. */
export function criarPropsRurais(parent: THREE.Object3D, ground: (x: number, z: number) => number,
  carregar?: (modelo: ModeloRural, signal: AbortSignal) => Promise<THREE.Group>) {
  const root = new THREE.Group(); root.name = 'scenario-props-rurais'; parent.add(root);
  const abort = new AbortController();
  const cache = new Map<ModeloRural, Promise<THREE.Group>>();
  const owned = new Set<THREE.Group>();
  const fallbacks = new Set<THREE.Mesh>();
  let disposed = false;
  async function load(modelo: ModeloRural) {
    if (carregar) return carregar(modelo, abort.signal);
    const url = MODELOS_RURAIS[modelo].url;
    const response = await fetch(urlPublica(url), { signal: abort.signal });
    if (!response.ok) throw new Error(`Scenario ${modelo}: HTTP ${response.status}`);
    const gltf = await useSompoExternalTextures(new GLTFLoader()).parseAsync(await response.arrayBuffer(), '/models/scenario/');
    try { await restoreSompoTextures(gltf, url, abort.signal); }
    catch (error) { disposeSompoObject(gltf.scene); throw error; }
    if (disposed) { disposeSompoObject(gltf.scene); throw new Error('Scenario disposed'); }
    return gltf.scene;
  }
  function get(modelo: ModeloRural) {
    let pending = cache.get(modelo);
    if (!pending) {
      pending = load(modelo).then((asset) => {
        if (disposed) { disposeSompoObject(asset); throw new Error('Scenario disposed'); }
        const bounds = new THREE.Box3().setFromObject(asset);
        const size = bounds.getSize(new THREE.Vector3());
        if (![size.x, size.y, size.z].every((n) => Number.isFinite(n) && n > 0.001)) {
          disposeSompoObject(asset); throw new Error('Scenario invalid bounds');
        }
        const model = MODELOS_RURAIS[modelo];
        // Bounding circle is shared by physics, minimap and fallback.
        const scale = Math.min(model.alturaM / size.y, model.raioM * 2 / Math.hypot(size.x, size.z));
        asset.scale.multiplyScalar(scale);
        asset.position.set(-(bounds.min.x + bounds.max.x) * scale / 2, -bounds.min.y * scale,
          -(bounds.min.z + bounds.max.z) * scale / 2);
        asset.traverse((node) => { if (node instanceof THREE.Mesh) { node.castShadow = true; node.receiveShadow = true; } });
        owned.add(asset);
        return asset;
      });
      cache.set(modelo, pending);
    }
    return pending;
  }
  const ready = Promise.allSettled(PROPS_RURAIS.map(async (prop) => {
    const model = MODELOS_RURAIS[prop.modelo];
    const holder = new THREE.Group(); holder.name = `scenario-${prop.id}`;
    holder.position.set(prop.x, ground(prop.x, prop.z), prop.z); holder.rotation.y = prop.rumo;
    holder.userData = { modelo: prop.modelo, status: 'loading', colliderRadius: model.raioM };
    root.add(holder);
    const geometry = new THREE.CylinderGeometry(model.raioM * .85, model.raioM, model.alturaM, 8);
    const fallback = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: prop.modelo === 'rochas' ? '#726e61' : '#71513a', roughness: .9 }));
    fallback.position.y = model.alturaM / 2; fallback.castShadow = true; fallback.receiveShadow = true;
    holder.add(fallback); fallbacks.add(fallback);
    try {
      const asset = await get(prop.modelo);
      if (disposed) return;
      holder.add(asset.clone(true)); holder.userData.status = 'loaded';
      fallback.removeFromParent(); disposeSompoObject(fallback); fallbacks.delete(fallback);
    } catch (error) {
      if (!disposed) { holder.userData.status = 'fallback'; console.warn(`Scenario ${prop.modelo}: fallback mantido`, error); }
    }
  }));
  return { root, ready, dispose() {
    if (disposed) return;
    disposed = true; abort.abort(); root.removeFromParent();
    // Clones partilham recursos: descartar só o template de cada modelo.
    for (const template of owned) disposeSompoObject(template);
    for (const fallback of fallbacks) disposeSompoObject(fallback);
    owned.clear(); fallbacks.clear(); root.clear(); cache.clear();
  } };
}
