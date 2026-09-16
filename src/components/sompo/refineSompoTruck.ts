import * as THREE from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { SompoTruckModel } from './createSompoTruckModel';
import type { SompoStudioConfig } from './sompoStudioConfig';

/** Bake static subparts per material, keeping assemblies and wheel pivots editable. */
function batchAssembly(parent: THREE.Object3D) {
  parent.updateMatrixWorld(true);
  const inverse = parent.matrixWorld.clone().invert();
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const removed: THREE.Mesh[] = [];
  const matrix = new THREE.Matrix4();
  parent.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (node === parent || !mesh.isMesh || Array.isArray(mesh.material)) return;
    let ancestor: THREE.Object3D | null = mesh;
    while (ancestor && ancestor !== parent) { if (ancestor.userData.articulated) return; ancestor = ancestor.parent; }
    const geometries = batches.get(mesh.material) || [];
    const instance = mesh as THREE.InstancedMesh;
    const count = instance.isInstancedMesh ? instance.count : 1;
    for (let i = 0; i < count; i++) {
      matrix.multiplyMatrices(inverse, mesh.matrixWorld);
      if (instance.isInstancedMesh) { const local = new THREE.Matrix4(); instance.getMatrixAt(i, local); matrix.multiply(local); }
      let geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      geometry.applyMatrix4(matrix);
      // All built-in vehicle surfaces use the same standard attribute layout.
      for (const name of Object.keys(geometry.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geometry.deleteAttribute(name);
      if (!geometry.attributes.uv) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
      geometries.push(geometry);
    }
    batches.set(mesh.material, geometries); removed.push(mesh);
  });
  for (const mesh of removed) { mesh.removeFromParent(); if ((mesh as THREE.InstancedMesh).isInstancedMesh) (mesh as THREE.InstancedMesh).dispose(); }
  for (const [material, geometries] of batches) {
    const combined = mergeGeometries(geometries);
    geometries.forEach(geometry => geometry.dispose());
    const mesh = new THREE.Mesh(combined, material); mesh.name = `${parent.name}-${material.name || 'surface'}`;
    mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh);
  }
  // Several source parts share a geometry. They have all been baked at this point.
  new Set(removed.map(mesh => mesh.geometry)).forEach(geometry => geometry.dispose());
}

function toCabinGlass(material: THREE.MeshStandardMaterial) {
  const glass = new THREE.MeshPhysicalMaterial();
  THREE.MeshStandardMaterial.prototype.copy.call(glass, material);
  glass.name = material.name;
  // Same greenhouse as the modular cab: a transparent physical pane keeps
  // the cabin readable while preserving the reflection from the rural IBL.
  glass.color.set(0x6a8aa0);
  glass.metalness = 0;
  glass.roughness = 0.045;
  glass.transmission = 0.72;
  glass.thickness = 0.045;
  glass.ior = 1.45;
  glass.transparent = true;
  glass.opacity = 1;
  glass.clearcoat = 1;
  glass.clearcoatRoughness = 0.03;
  glass.envMapIntensity = 1.7;
  glass.attenuationColor = new THREE.Color(0x1a3344);
  glass.attenuationDistance = 0.8;
  glass.side = THREE.DoubleSide;
  glass.depthWrite = true;
  return glass;
}

function assignVisualMaps(root: THREE.Object3D) {
  if (typeof document === 'undefined' || typeof document.createElementNS !== 'function') return;
  const loader = new THREE.TextureLoader();
  const paint = (url: string, names: string[], kind: 'cargo' | 'cabin' | 'grille') => {
    loader.load(url, map => {
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 8;
      if (kind === 'cargo') {
        map.wrapS = map.wrapT = THREE.RepeatWrapping;
        // Blender UVs put length on U and height on V so r10's horizontal
        // cold-white ribs stay horizontal. Do not rotate.
        map.repeat.set(1, 1);
        map.offset.set(0, 0);
      } else {
        map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
      }
      root.traverse(node => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const material of (Array.isArray(mesh.material) ? mesh.material : [mesh.material])) {
          if (!(material instanceof THREE.MeshStandardMaterial) || !names.includes(material.name)) continue;
          if (kind === 'cargo') {
            material.map = map;
            material.bumpMap = null;
            material.roughnessMap = null;
            material.color.set('#f2f0ea');
            material.roughness = 0.42;
            material.metalness = 0.16;
          }
          if (kind === 'cabin') {
            material.map = map;
            material.emissiveMap = map;
            material.emissive.set(0xd4ccc4);
            material.emissiveIntensity = 1.0;
            material.color.set('#d4ccc4');
          }
          if (kind === 'grille') {
            material.map = map;
            material.color.set('#ffffff');
            material.metalness = 0.78;
            material.roughness = 0.16;
            material.envMapIntensity = 2.15;
            material.emissive.set(0xcdd6dc);
            material.emissiveIntensity = 0.28;
          }
          material.needsUpdate = true;
        }
      });
    });
  };
  paint('/sompo/gen/r10-corrugation.webp', ['Painéis do baú'], 'cargo');
  paint('/sompo/gen/r9-cabin-through-glass.webp', ['Astra cabin interior'], 'cabin');
  paint('/sompo/gen/r6-grille-front.webp', ['Astra grille face'], 'grille');
}

/**
 * Generated Astra meshes arrive mostly as MeshStandardMaterial. Promote the
 * visible shell surfaces to the physical material path so the same local HDRI
 * produces a clean broad reflection instead of a flat diffuse response.
 * Textures are intentionally shared by the promoted material; disposal remains
 * owned by the scene graph.
 */
function promoteTruckShellMaterial(material: THREE.MeshStandardMaterial, label: string) {
  if (material instanceof THREE.MeshPhysicalMaterial || !/cab|cargo|box|shell/i.test(label)) return material;
  // MeshPhysicalMaterial.copy expects physical-only fields such as
  // clearcoatNormalScale to exist on the source. GLTFLoader gives us a plain
  // MeshStandardMaterial, so copy the shared base fields explicitly first.
  const physical = new THREE.MeshPhysicalMaterial();
  THREE.MeshStandardMaterial.prototype.copy.call(physical, material);
  physical.clearcoat = /cab|shell/i.test(label) ? 0.78 : 0.34;
  physical.clearcoatRoughness = /cab|shell/i.test(label) ? 0.13 : 0.2;
  physical.envMapIntensity = Math.max(material.envMapIntensity, /cab|shell/i.test(label) ? 1.2 : 0.9);
  material.dispose();
  return physical;
}

export function refineSompoTruck(model: SompoTruckModel) {
  const root = model.root;
  const cab = root.getObjectByName('cab-assembly')!;
  const cargo = root.getObjectByName('cargo-assembly')!;
  const chassis = root.getObjectByName('chassis-assembly')!;
  const shell = root.getObjectByName('cab-shell') as THREE.Mesh;
  (shell.material as THREE.Material).name = 'Pintura da cabine';
  const body = root.getObjectByName('cargo-body') as THREE.Mesh;
  (body.material as THREE.Material).name = 'Painéis do baú';
  const cap = root.getObjectByName('cargo-front-cap') as THREE.Mesh;
  (cap.material as THREE.Material).name = 'Acabamentos da cabine';
  const rib = root.getObjectByName('cargo-horizontal-corrugation') as THREE.Mesh;
  (rib.material as THREE.Material).name = 'Alumínio do baú';
  const wipers: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const blade = root.getObjectByName(`wiper-${side}`)!;
    const pivot = new THREE.Group(); pivot.name = `wiper-pivot-${side}`; pivot.userData.articulated = true;
    pivot.position.set(4.28, 2.46, side * 0.43); cab.add(pivot); root.updateMatrixWorld(true); pivot.attach(blade); wipers.push(pivot);
  }
  const sensorLabel = model.sensorGroup.getObjectByName('sensor-label');
  if (sensorLabel) {
    sensorLabel.visible = true;
    sensorLabel.position.set(-1.9, 4.9, 0);
    sensorLabel.scale.set(3.0, 0.75, 1);
  }
  // Keep the measurement aperture at FRONT_X, with a compact real-world enclosure.
  model.sensorGroup.scale.setScalar(0.5);
  model.sensorGroup.position.set(4.51, 0.78, 0); model.rayGroup.position.y = 0.78; model.rayGroup.scale.z = 0.5;
  root.userData.cargoBody = cargo; root.userData.asset = 'SompoModularTruck';
  const wheels = model.wheels.map(wheel => ({ wheel, position: wheel.position.clone(), spin: 0 }));
  for (const { wheel } of wheels) batchAssembly(wheel);
  for (const assembly of [cab, cargo, chassis]) batchAssembly(assembly);
  root.updateMatrixWorld(true);
  const inverseRoot = root.matrixWorld.clone().invert();
  const supportPoints: THREE.Vector3[] = [];
  for (const part of [cab, cargo, chassis, ...model.wheels]) part.traverse(node => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const matrix = new THREE.Matrix4().multiplyMatrices(inverseRoot, mesh.matrixWorld);
    const positions = mesh.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) supportPoints.push(new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(matrix));
  });
  const hullPoints = new Set<THREE.Vector3>();
  for (const face of new ConvexHull().setFromPoints(supportPoints).faces) {
    let edge = face.edge;
    do { hullPoints.add(edge.head().point); edge = edge.next; } while (edge !== face.edge);
  }
  root.userData.groundSupport = Float32Array.from([...hullPoints].flatMap(point => point.toArray()));
  // Remove editor references to parts that have been baked and retired.
  delete root.userData.sculptRuntime;
  const materials = new Set<THREE.MeshStandardMaterial>();
  root.traverse(node => { const mesh = node as THREE.Mesh; if (mesh.isMesh && mesh.material instanceof THREE.MeshStandardMaterial) materials.add(mesh.material); });
  // Película de estrada: poeira acumulada nas partes baixas e filetes finos de
  // água/sujeira escorrendo no baú. É o que separa pintura real de plástico.
  const wearTruck = (material: THREE.MeshStandardMaterial) => {
    const box = material.name === 'Painéis do baú' || material.name === 'Alumínio do baú' || material.name === 'Astra box shell';
    const paint = material.name === 'Pintura da cabine' || material.name === 'Acabamentos da cabine';
    if (!box && !paint) return;
    const compile = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      compile?.call(material, shader, renderer);
      shader.vertexShader = 'varying vec3 truckW;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        truckW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
      shader.fragmentShader = `varying vec3 truckW;
        float truckHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float truckNoise(vec2 p){vec2 i=floor(p),f=fract(p);f*=f*(3.-2.*f);
          return mix(mix(truckHash(i),truckHash(i+vec2(1,0)),f.x),mix(truckHash(i+vec2(0,1)),truckHash(i+vec2(1,1)),f.x),f.y);}\n` + shader.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
          float truckDust = smoothstep(1.9, .35, truckW.y) * (.4 + .6 * truckNoise(truckW.xz * 1.9));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.42, .35, .24), clamp(truckDust, 0., 1.) * ${paint ? '.22' : '.16'});
          ${box ? `float streak = truckNoise(vec2(truckW.z * 14.0 + truckW.x * 9.0, truckW.y * .6));
          diffuseColor.rgb *= 1.0 - smoothstep(.55, .95, streak) * .09 * smoothstep(3.7, 2.4, truckW.y);` : ''}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, .92, clamp(truckDust, 0., 1.) * .5);`);
    };
    material.customProgramCacheKey = () => `sompo-truck-wear-v1-${box}`;
  };
  materials.forEach(wearTruck);
  const axisY = new THREE.Vector3(0, 1, 0), axle = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const steering = new THREE.Quaternion(), spin = new THREE.Quaternion();
  let finishKey = '';
  return {
    /** Replace only the skin; wheel pivots, ground support and sensor stay on the rig. */
    replaceVisual(visual: THREE.Group) {
      const replacements = [['astra-cab', cab], ['astra-cargo', cargo]] as const;
      if (replacements.some(([name]) => !visual.getObjectByName(name))) throw new Error('Incomplete Astra truck');
      for (const [name, assembly] of replacements) {
        for (const child of assembly.children) child.visible = false;
        const skin = visual.getObjectByName(name)!;
        assembly.add(skin);
        skin.traverse(node => {
          const mesh = node as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = mesh.receiveShadow = true;
          const apply = (item: THREE.Material) => {
            if (!(item instanceof THREE.MeshStandardMaterial)) return item;
            const label = `${mesh.name} ${item.name}`;
            const converted = /glass|windscreen|window/i.test(label) && !/mirror/i.test(label)
              ? toCabinGlass(item)
              : promoteTruckShellMaterial(item, label);
            if (converted !== item) mesh.renderOrder = 3;
            if (!materials.has(converted)) { materials.add(converted); wearTruck(converted); }
            return converted;
          };
          mesh.material = Array.isArray(mesh.material) ? mesh.material.map(apply) : apply(mesh.material);
        });
      }
      finishKey = '';
      assignVisualMaps(root);
      root.userData.visualAsset = 'AstraSompoTruck';
    },
    update(config: SompoStudioConfig, elapsed: number, wheelTravel: number, steerAngle: number, roughness: number, rain: number, reduced: boolean, speedKph = 0) {
      const key = `${config.paint}:${config.cargo}:${config.roughness}:${config.wireframe}`;
      if (key !== finishKey) {
        finishKey = key;
        for (const material of materials) {
          material.wireframe = config.wireframe;
          if (material.name === 'Pintura da cabine') { material.color.set(config.paint); material.roughness = Math.min(0.28, config.roughness * 0.55); material.metalness = 0.38; }
          if (material.name === 'Acabamentos da cabine') { material.color.set(config.paint).multiplyScalar(0.62); material.roughness = Math.min(0.4, config.roughness * 0.7 + 0.08); }
          if (material.name === 'Painéis do baú' || material.name === 'Alumínio do baú' || material.name === 'Astra box shell') {
            material.color.set('#f2f0ea');
            material.roughness = material.map ? 0.42 : 0.58;
            material.metalness = 0.16;
          }
          if (material instanceof THREE.MeshPhysicalMaterial && material.name === 'Pintura da cabine') { material.clearcoat = 0.9; material.clearcoatRoughness = 0.12; }
        }
      }
      const explode = config.exploded;
      cab.position.set(explode * 1.8, explode * 0.7 + (reduced ? 0 : (Math.sin(wheelTravel * 2.7) + Math.sin(wheelTravel * 5.1) * .35) * roughness * .008 * Math.min(1, Math.abs(speedKph) / 3)), 0);
      cargo.position.x = -explode * 1.2; cargo.position.y = explode * 2;
      for (const { wheel, position } of wheels) {
        wheel.position.copy(position); wheel.position.z += Math.sign(position.z) * explode * 1.3;
        const steer = position.x > 2 ? steerAngle : 0;
        steering.setFromAxisAngle(axisY, steer); spin.setFromAxisAngle(axisY, reduced ? 0 : -wheelTravel / .58);
        wheel.quaternion.copy(steering).multiply(axle).multiply(spin);
      }
      for (const pivot of wipers) pivot.rotation.x = reduced || !rain ? 0 : (1 - Math.cos(elapsed * .0055)) * .42 * Math.min(1, rain * 2);
    },
  };
}

export async function exportSompoModel(root: THREE.Object3D): Promise<ArrayBuffer> {
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  // Runtime references (Object3Ds in sculptRuntime) must not enter glTF JSON extras.
  const metadata = new Map<THREE.Object3D, Record<string, unknown>>();
  root.traverse(node => { metadata.set(node, node.userData); node.userData = {}; });
  let clone: THREE.Object3D;
  try { clone = root.clone(true); }
  finally { metadata.forEach((data, node) => { node.userData = data; }); }
  clone.position.set(0, 0, 0); clone.rotation.set(0, 0, 0); clone.updateMatrixWorld(true);
  return new GLTFExporter().parseAsync(clone, { binary: true, onlyVisible: true }) as Promise<ArrayBuffer>;
}
