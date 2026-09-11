import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// Poly Haven CC0 assets, downloaded locally. Exact sources/credits: public/environments/sompo/LICENSE.txt.
const ASSET_ROOT = '/environments/sompo/';
type Surface = 'asphalt' | 'dirt' | 'grass';

/** Async upgrades keep the scene usable if an HDRI or texture is unavailable. */
export function createSompoEnvironmentAssets(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  let disposed = false;
  let wet = false;
  const owned = new Set<THREE.Texture>();
  const hdris: { dry?: THREE.DataTexture; wet?: THREE.DataTexture } = {};
  const surfaces = new Map<Surface, Promise<THREE.Texture[]>>();
  const anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
  const loader = new THREE.TextureLoader();
  const initialEnvironment = scene.environment;
  const initialBackground = scene.background;

  function retain<T extends THREE.Texture>(texture: T): T {
    if (disposed) texture.dispose(); else owned.add(texture);
    return texture;
  }
  function updateLighting() {
    if (disposed) return;
    const hdr = (wet ? hdris.wet : hdris.dry) ?? hdris.dry;
    if (!hdr) return;
    scene.background = hdr;
    scene.environment = hdr;
    scene.backgroundIntensity = wet ? 0.70 : 0.95;
    scene.environmentIntensity = wet ? 0.70 : 0.90;
    scene.backgroundBlurriness = 0;
    scene.backgroundRotation.y = scene.environmentRotation.y = 1.25;
  }
  for (const [kind, filename] of [['dry', 'kloppenheim_06_2k.hdr'], ['wet', 'farmland_overcast_2k.hdr']] as const) {
    void new RGBELoader().loadAsync(ASSET_ROOT + filename).then((texture) => {
      retain(texture);
      if (disposed) return;
      texture.mapping = THREE.EquirectangularReflectionMapping;
      hdris[kind] = texture;
      updateLighting();
    }).catch(() => { /* The existing environment remains available. */ });
  }

  return {
    get hasHdri() { return !!hdris.dry; },
    surface(material: THREE.MeshStandardMaterial, surface: Surface, repeatX: number, repeatY: number) {
      let pending = surfaces.get(surface);
      if (!pending) {
        pending = Promise.all(['color', 'normal', 'arm'].map((channel) => loader.loadAsync(`${ASSET_ROOT}${surface}-${channel}.jpg`).then(retain)));
        surfaces.set(surface, pending);
      }
      void pending.then((textures) => {
        if (disposed) return;
        const maps = textures.map((texture, i) => {
          const map = retain(texture.clone());
          map.colorSpace = i === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          map.wrapS = map.wrapT = THREE.RepeatWrapping;
          map.repeat.set(repeatX, repeatY);
          map.anisotropy = anisotropy;
          map.needsUpdate = true;
          return map;
        });
        material.map?.dispose();
        material.map = maps[0];
        material.normalMap = maps[1];
        // One packed texture: R = ambient occlusion, G = roughness, B = metalness.
        material.aoMap = material.roughnessMap = maps[2];
        material.aoMapIntensity = surface === 'grass' ? 0.65 : 0.8;
        material.normalScale.setScalar(surface === 'asphalt' ? 0.65 : 0.75);
        material.needsUpdate = true;
      }).catch(() => { /* Retain procedural fallback maps until all PBR channels are ready. */ });
    },
    treeMap(index: number) {
      const map = retain(loader.load(`${ASSET_ROOT}tree-${index}.png`));
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = anisotropy;
      return map;
    },
    update(isWet: boolean) { wet = isWet; updateLighting(); },
    dispose() {
      disposed = true;
      if (scene.background === hdris.dry || scene.background === hdris.wet) scene.background = initialBackground;
      if (scene.environment === hdris.dry || scene.environment === hdris.wet) scene.environment = initialEnvironment;
      for (const texture of owned) texture.dispose();
      owned.clear();
    },
  };
}
