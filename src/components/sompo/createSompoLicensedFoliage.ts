import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { restoreSompoTextures, useSompoExternalTextures } from './restoreSompoTextures';
import { sompoTerrainHeight, sompoLakeDistance } from './createSompoTerrain';

const random = (i: number) => { const n = Math.sin(i * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
export interface FoliageSlot { x: number; z: number; scale: number; yaw: number }
export function highwayFoliageSlots(kind: 'trees' | 'grass' | 'shrubs' | 'pasture'): FoliageSlot[] {
  const slots = Array.from({ length: kind === 'trees' ? 62 : kind === 'grass' ? 32000 : kind === 'pasture' ? 20000 : 650 }, (_, i) => {
    const near = i % 3 !== 0;
    const z = kind === 'trees' ? (i % 4 ? -1 : 1) * (near ? 35 + random(i + 8) * 45 : 75 + random(i + 8) * 38)
      : kind === 'grass' ? (i % 2 ? -7.9 - random(i + 9) * 6 : 3.8 + random(i + 9) * 14)
      : kind === 'pasture' ? (i % 4 ? -1 : 1) * (36 + random(i + 9) * 78)
      : (i % 2 ? -1 : 1) * (14 + random(i + 9) * 70);
    return { x: random(i + 81) * 212 - 106, z, scale: kind === 'trees' ? .30 + random(i + 45) * .23 : kind === 'grass' ? 3.2 + random(i + 45) * 1.4 : kind === 'pasture' ? 2.8 + random(i + 45) * 2 : .6 + random(i + 45) * 1.1, yaw: random(i + 11) * Math.PI * 2 };
  });
  if (kind === 'trees') slots.push({x:-94,z:-23,scale:.5,yaw:.7},{x:-65,z:-50,scale:.53,yaw:2.1});
  return slots;
}

/** Authored CC0 mesh foliage, shared geometry and bounded instanced draw calls.
 * All LODs remain lit 3D geometry; distant trees are not unlit camera cards. */
export function createSompoLicensedFoliage(parent: THREE.Group, camera: THREE.Camera) {
  const root = new THREE.Group(); root.name = 'licensed-highway-foliage'; parent.add(root);
  const abort = new AbortController();
  const batches: { meshes: THREE.InstancedMesh[]; slots: FoliageSlot[]; min: number; max: number; thinFrom?: number; base: THREE.Matrix4[] }[] = [];
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  const trees = highwayFoliageSlots('trees');
  const specs = [
    { asset: 'ph-jacaranda-near', slots: trees, min: 0, max: 54, shadow: true },
    { asset: 'ph-jacaranda-far', slots: trees, min: 54, max: 210, shadow: true },
    { asset: 'ph-grass_bermuda_01-0', slots: highwayFoliageSlots('grass'), min: 0, max: 55, shadow: false },
    // Pasture clumps past 60 m cover 2-3 px each: density falls with distance
    // and the survivors grow to keep the same covered area.
    { asset: 'ph-grass_bermuda_01-0', slots: highwayFoliageSlots('pasture'), min: 0, max: 160, thinFrom: 60, shadow: false },
    { asset: 'ph-shrub_02-0', slots: highwayFoliageSlots('shrubs'), min: 0, max: 140, shadow: true },
  ];
  const pending = specs.map(async spec => {
    const url = `/models/sompo/${spec.asset}.glb`;
    let model: THREE.Group | undefined;
    try {
      const response = await fetch(url, { signal: abort.signal });
      if (!response.ok) throw new Error(`${spec.asset}: HTTP ${response.status}`);
      const gltf = await useSompoExternalTextures(new GLTFLoader()).parseAsync(await response.arrayBuffer(), '/models/sompo/');
      model = gltf.scene;
      await restoreSompoTextures(gltf, url, abort.signal);
      if (abort.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      model.updateMatrixWorld(true);
      const meshes: THREE.InstancedMesh[] = [], base: THREE.Matrix4[] = [];
      model.traverse(node => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        geometries.add(mesh.geometry);
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          materials.add(material);
          if (material instanceof THREE.MeshStandardMaterial) {
            material.metalness = 0; material.envMapIntensity = 1.25; material.vertexColors = false;
            material.side = THREE.DoubleSide;
            if (material.transparent || /leav|grass|shrub/i.test(material.name)) {
              material.transparent = false; material.alphaTest = /leaves/.test(material.name) ? .035 : .15; material.depthWrite = true;
              material.normalScale.multiplyScalar(.2);
              // Bent blade normals retain diffuse leaf volume at grazing views;
              // the original alpha and PBR maps still control every surface.
              material.onBeforeCompile = shader => {
                shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_pars_fragment>',
                  THREE.ShaderChunk.lights_physical_pars_fragment.replace(
                    'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );',
                    'reflectedLight.directDiffuse += saturate((dot(geometryNormal, directLight.direction) + .4) / 1.4) * directLight.color * BRDF_Lambert(material.diffuseContribution);'));
                shader.vertexShader = shader.vertexShader.replace('#include <defaultnormal_vertex>',
                  'objectNormal = normalize(mix(objectNormal, vec3(0., 1., 0.), .45));\n#include <defaultnormal_vertex>');
                // Recover leaf colour where mip filtering mixes opaque texels
                // with the atlas' black transparent border (coverage, not soot).
                shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>',
                  'diffuseColor.rgb /= max(.3, sqrt(diffuseColor.a));\n#include <alphatest_fragment>');
                shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>',
                  '#include <roughnessmap_fragment>\nroughnessFactor = max(roughnessFactor, .82);');
              };
              material.customProgramCacheKey = () => 'sompo-foliage-bent-normal-v2';
              material.forceSinglePass = true;
            }
            for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
            material.needsUpdate = true;
          }
        }
        const instances = new THREE.InstancedMesh(mesh.geometry, mesh.material, spec.slots.length);
        instances.count = 0; instances.name = `${spec.asset}-${mesh.name}`;
        instances.castShadow = spec.shadow; instances.receiveShadow = true;
        instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        root.add(instances); meshes.push(instances); base.push(mesh.matrixWorld.clone());
      });
      batches.push({ meshes, base, slots: spec.slots, min: spec.min, max: spec.max, thinFrom: spec.thinFrom });
      root.userData.loadedAssets = (root.userData.loadedAssets ?? 0) + 1;
    } catch (error) {
      if (model) model.traverse(node => {
        const mesh = node as THREE.Mesh;
        mesh.geometry?.dispose();
        if (mesh.material) for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          for (const value of Object.values(mat)) if (value instanceof THREE.Texture) value.dispose();
          mat.dispose();
        }
      });
      if (!abort.signal.aborted) console.warn('SOMPO foliage unavailable', spec.asset, error);
    }
  });
  const cameraPosition = new THREE.Vector3(), transform = new THREE.Object3D(), matrix = new THREE.Matrix4();
  const frustum = new THREE.Frustum(), clip = new THREE.Matrix4(), sphere = new THREE.Sphere();
  const groundCache = new WeakMap<FoliageSlot, { x: number; y: number; lake: boolean }>();
  return {
    ready: Promise.all(pending),
    update(_wet: boolean, truckX = 0, focus = new THREE.Vector3(truckX, 1.5, 0)) {
      camera.getWorldPosition(cameraPosition); parent.worldToLocal(cameraPosition);
      clip.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(parent.matrixWorld);
      frustum.setFromProjectionMatrix(clip);
      const sight = parent.worldToLocal(focus.clone()).sub(cameraPosition), projected = new THREE.Vector3();
      for (const batch of batches) {
        let count = 0;
        for (let index = 0; index < batch.slots.length; index++) {
          const slot = batch.slots[index];
          const x = slot.x + 212 * Math.round((truckX - slot.x) / 212);
          let ground = groundCache.get(slot);
          if (!ground || ground.x !== x) {
            ground = { x, y: sompoTerrainHeight(x, slot.z) - .025, lake: sompoLakeDistance(x, slot.z) < 27 };
            groundCache.set(slot, ground);
          }
          transform.position.set(x, ground.y, slot.z);
          const distance = transform.position.distanceTo(cameraPosition);
          if (distance < batch.min || distance >= batch.max || ground.lake) continue;
          let scale = slot.scale;
          if (batch.thinFrom && distance > batch.thinFrom) {
            const keep = (batch.thinFrom / distance) ** 2;
            if (random(index + 523) > keep) continue;
            scale *= Math.min(1.5, Math.sqrt(1 / keep));
          }
          sphere.center.copy(transform.position); sphere.radius = batch.slots === trees ? 15 * slot.scale : 2 * slot.scale;
          sphere.center.y += batch.slots === trees ? 9 * slot.scale : .5 * slot.scale;
          if (!frustum.intersectsSphere(sphere)) continue;
          if (batch.slots === trees) {
            const center = transform.position.clone().add(new THREE.Vector3(0, 4, 0));
            const t = projected.copy(center).sub(cameraPosition).dot(sight) / Math.max(1, sight.lengthSq());
            if (t > 0 && t < 1 && center.distanceTo(projected.copy(cameraPosition).addScaledVector(sight, t)) < 5) continue;
          }
          transform.rotation.set(0, slot.yaw, 0); transform.scale.setScalar(scale); transform.updateMatrix();
          batch.meshes.forEach((mesh, i) => { matrix.multiplyMatrices(transform.matrix, batch.base[i]); mesh.setMatrixAt(count, matrix); });
          count++;
        }
        for (const mesh of batch.meshes) {
          mesh.count = count; mesh.instanceMatrix.needsUpdate = true;
          mesh.boundingSphere ??= new THREE.Sphere();
          mesh.boundingSphere.center.copy(cameraPosition); mesh.boundingSphere.radius = batch.max + 20;
        }
      }
    },
    dispose() {
      abort.abort(); root.removeFromParent();
      for (const batch of batches) for (const mesh of batch.meshes) mesh.dispose();
      for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); for (const t of textures) t.dispose();
    },
  };
}
