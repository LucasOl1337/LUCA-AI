import * as THREE from 'three';
import type { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

type TextureInfo = { index: number; texCoord?: number };
type MaterialDefinition = {
  pbrMetallicRoughness?: { baseColorTexture?: TextureInfo; metallicRoughnessTexture?: TextureInfo };
  normalTexture?: TextureInfo; occlusionTexture?: TextureInfo; emissiveTexture?: TextureInfo;
};
type Slot = 'map' | 'metalnessMap' | 'roughnessMap' | 'normalMap' | 'aoMap' | 'emissiveMap' | 'alphaMap';

/** Production CSP allows images but excludes fetch(blob:) from connect-src.
 * Preserve glTF material construction with temporary texture slots; the external
 * images below replace them before any model is mounted or rendered. This avoids
 * both ImageBitmap decoding and the blocked blob fetch, without weakening CSP. */
export function useSompoExternalTextures(loader: GLTFLoader) {
  return loader.register(() => ({
    name: 'SOMPO_external_images',
    loadTexture: async () => new THREE.Texture(),
  }));
}

/**
 * Embedded glTF images can silently become null when blob fetch/decode is blocked.
 * Rebind the original material definitions AFTER parsing,
 * using external, byte-identical images and TextureLoader's HTMLImageElement path.
 * Never infer bindings from material.map: it can already be missing after the failure.
 */
export async function restoreSompoTextures(gltf: GLTF, assetUrl: string, signal: AbortSignal) {
  const response = await fetch(assetUrl.replace(/\.glb(?:\?.*)?$/, '.textures.json'), { signal });
  if (!response.ok) throw new Error(`Sompo texture manifest: HTTP ${response.status}`);
  const manifest: { images: string[]; alphaMaps?: Record<string, string> } = await response.json();
  const base = assetUrl.slice(0, assetUrl.lastIndexOf('/') + 1);
  const loader = new THREE.TextureLoader();
  const pending = new Map<string, Promise<THREE.Texture>>();
  const owned = new Set<THREE.Texture>();
  const replaced = new Set<THREE.Texture>();
  const bindings: { material: THREE.MeshStandardMaterial; slot: Slot; texture: THREE.Texture }[] = [];
  const jobs: Promise<void>[] = [];
  const materials = new Set<THREE.MeshStandardMaterial>();
  gltf.scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (material instanceof THREE.MeshStandardMaterial) materials.add(material);
    }
  });
  function load(info: TextureInfo, color: boolean) {
    const definition = gltf.parser.json.textures[info.index];
    const filename = manifest.images?.[definition.source];
    if (!filename || !/^[\w.-]+\.(png|jpe?g)$/.test(filename)) throw new Error(`Missing external Sompo image ${info.index}`);
    const key = `${info.index}:${info.texCoord ?? 0}:${color}`;
    if (!pending.has(key)) pending.set(key, loader.loadAsync(base + filename).then((texture) => {
      owned.add(texture);
      const image = texture.image as HTMLImageElement;
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      if (!image?.complete || !(image.naturalWidth > 0 && image.naturalHeight > 0)) throw new Error(`Invalid Sompo image: ${filename}`);
      texture.flipY = false; // glTF UVs, unlike ordinary Three.js image textures.
      texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.channel = info.texCoord ?? 0;
      texture.anisotropy = 8;
      // Preserve glTF sampler behavior, including independently wrapped atlases.
      const sampler = gltf.parser.json.samplers?.[definition.sampler] ?? {};
      texture.wrapS = sampler.wrapS === 33071 ? THREE.ClampToEdgeWrapping : sampler.wrapS === 33648 ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
      texture.wrapT = sampler.wrapT === 33071 ? THREE.ClampToEdgeWrapping : sampler.wrapT === 33648 ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
      texture.magFilter = sampler.magFilter === 9728 ? THREE.NearestFilter : THREE.LinearFilter;
      const filters: Record<number, THREE.MinificationTextureFilter> = { 9728: THREE.NearestFilter, 9729: THREE.LinearFilter,
        9984: THREE.NearestMipmapNearestFilter, 9985: THREE.LinearMipmapNearestFilter,
        9986: THREE.NearestMipmapLinearFilter, 9987: THREE.LinearMipmapLinearFilter };
      texture.minFilter = filters[sampler.minFilter] ?? THREE.LinearMipmapLinearFilter;
      texture.name = filename;
      texture.needsUpdate = true;
      return texture;
    }));
    return pending.get(key)!;
  }
  try {
    for (const material of materials) {
      const index = gltf.parser.associations.get(material)?.materials;
      if (index === undefined) continue;
      const definition = gltf.parser.json.materials[index] as MaterialDefinition;
      const pbr = definition.pbrMetallicRoughness;
      const slots: [Slot, TextureInfo | undefined, boolean][] = [
        ['map', pbr?.baseColorTexture, true], ['metalnessMap', pbr?.metallicRoughnessTexture, false],
        ['roughnessMap', pbr?.metallicRoughnessTexture, false], ['normalMap', definition.normalTexture, false],
        ['aoMap', definition.occlusionTexture, false], ['emissiveMap', definition.emissiveTexture, true],
      ];
      for (const [slot, info, color] of slots) if (info) jobs.push(load(info, color).then((texture) => {
        bindings.push({ material, slot, texture });
      }));
      const alphaFile = manifest.alphaMaps?.[String(index)];
      if (alphaFile) {
        if (!/^[\w.-]+\.(png|jpe?g)$/.test(alphaFile)) throw new Error('Invalid Sompo alpha image');
        jobs.push(loader.loadAsync(base + alphaFile).then(texture => {
          owned.add(texture);
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
          const image = texture.image as HTMLImageElement;
          if (!image?.complete || !(image.naturalWidth > 0 && image.naturalHeight > 0)) throw new Error(`Invalid Sompo alpha image: ${alphaFile}`);
          texture.flipY = false; texture.colorSpace = THREE.NoColorSpace;
          texture.anisotropy = 8; texture.name = alphaFile;
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          bindings.push({ material, slot: 'alphaMap', texture });
        }));
      }
    }
    // Settle every image before cleanup: late downloads must not leak on abort/failure.
    const results = await Promise.allSettled(jobs);
    const failed = results.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    for (const { material, slot, texture } of bindings) {
      if (material[slot]) replaced.add(material[slot]!);
      material[slot] = texture;
      material.needsUpdate = true;
    }
    for (const texture of replaced) texture.dispose();
  } catch (error) {
    await Promise.allSettled([...jobs, ...pending.values()]);
    for (const texture of owned) texture.dispose();
    throw error; // Let the asset chain recover; never publish an untextured clay model.
  }
}
