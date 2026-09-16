import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { sompoTerrainHeight } from './createSompoTerrain';

function seeded(index: number) {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function wrapMountainX(x: number, center: number, span: number) {
  return x + Math.round((center - x) / span) * span;
}

function crossedCardGeometry() {
  const parts: THREE.PlaneGeometry[] = [];
  for (const yaw of [0, Math.PI / 2]) {
    const card = new THREE.PlaneGeometry(1, 1);
    card.translate(0, 0.5, 0);
    card.rotateY(yaw);
    parts.push(card);
  }
  const merged = new THREE.BufferGeometry();
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let offset = 0;
  for (const part of parts) {
    const position = part.getAttribute('position');
    const uv = part.getAttribute('uv');
    for (let i = 0; i < position.count; i += 1) {
      vertices.push(position.getX(i), position.getY(i), position.getZ(i));
      uvs.push(uv.getX(i), uv.getY(i));
    }
    const source = part.getIndex();
    if (source) for (let i = 0; i < source.count; i += 1) indices.push(offset + source.getX(i));
    offset += position.count;
    part.dispose();
  }
  merged.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  merged.setIndex(indices);
  merged.computeVertexNormals();
  return merged;
}

function mountainCutGeometry(centerX: number, seed: number) {
  const length = 82;
  const heightSegments = 9;
  const lengthSegments = 24;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let xIndex = 0; xIndex <= lengthSegments; xIndex += 1) {
    const along = xIndex / lengthSegments;
    const x = centerX - length / 2 + along * length;
    const base = sompoTerrainHeight(x, -9.4) - 0.6;
    const crown = 7.8
      + Math.sin(along * Math.PI * 2.4 + seed) * 0.82
      + Math.sin(along * Math.PI * 5.1 + seed * 0.37) * 0.34;
    for (let yIndex = 0; yIndex <= heightSegments; yIndex += 1) {
      const up = yIndex / heightSegments;
      const fracture = (seeded(seed + xIndex * 97 + yIndex * 31) - 0.5) * 0.72
        + Math.sin(x * 0.19 + up * 8.3) * 0.23;
      // Lean the crown back into the mountain. The broken silhouette, varied
      // depth and dense texture stop the cut from reading as a flat billboard.
      const z = -10.1 - up * 1.85 + fracture * (0.22 + Math.sin(up * Math.PI) * 0.58);
      const y = base + up * crown + (seeded(seed + xIndex * 11 + yIndex * 43) - 0.5) * 0.28;
      positions.push(x, y, z);
      uvs.push(along, up);
      if (xIndex < lengthSegments && yIndex < heightSegments) {
        const row = heightSegments + 1;
        const a = xIndex * row + yIndex;
        indices.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

interface PlantSlot {
  x: number;
  z: number;
  scale: THREE.Vector3;
  yaw: number;
}

interface RockSlot {
  x: number;
  z: number;
  scale: number;
  yaw: number;
  group?: THREE.Object3D;
}

interface PineSlot {
  x: number;
  z: number;
  scale: number;
  yaw: number;
  group?: THREE.Object3D;
}

/**
 * A authored mountain corridor: dense undergrowth, repeated Blender boulder
 * clusters and deliberate cliff/valley placement. This replaces the old
 * uniform pasture scatter in the hero camera without touching telemetry.
 */
export function createSompoMountainSetpiece(parent: THREE.Group) {
  let disposed = false;
  const root = new THREE.Group();
  root.name = 'r13-mountain-corridor';
  parent.add(root);

  const foliageTexture = new THREE.TextureLoader().load('/sompo/gen/r13-undergrowth.webp');
  foliageTexture.colorSpace = THREE.SRGBColorSpace;
  foliageTexture.anisotropy = 8;
  const foliageMaterial = new THREE.MeshStandardMaterial({
    map: foliageTexture,
    color: 0xe5ead7,
    roughness: 0.98,
    metalness: 0,
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.34,
    depthWrite: true,
  });
  const plantGeometry = crossedCardGeometry();
  const rockTexture = new THREE.TextureLoader().load('/sompo/gen/r13-mountain-ground.webp');
  rockTexture.colorSpace = THREE.SRGBColorSpace;
  rockTexture.wrapS = rockTexture.wrapT = THREE.MirroredRepeatWrapping;
  rockTexture.repeat.set(1.35, 1.35);
  rockTexture.anisotropy = 8;
  const rockMaterial = new THREE.MeshStandardMaterial({
    map: rockTexture,
    color: 0xd6d2c5,
    roughness: 0.96,
    metalness: 0,
    envMapIntensity: 0.45,
  });
  const cliffTexture = new THREE.TextureLoader().load('/sompo/gen/r14-granite-cliff.webp');
  cliffTexture.colorSpace = THREE.SRGBColorSpace;
  cliffTexture.wrapS = cliffTexture.wrapT = THREE.MirroredRepeatWrapping;
  cliffTexture.repeat.set(4.2, 2.15);
  cliffTexture.anisotropy = 8;
  const cliffMaterial = new THREE.MeshStandardMaterial({
    map: cliffTexture,
    color: 0xd7d8d1,
    roughness: 0.93,
    metalness: 0,
    envMapIntensity: 0.5,
    side: THREE.DoubleSide,
  });
  const cliffCenters = [28, 108];
  const cliffWalls = cliffCenters.map((center, index) => {
    const wall = new THREE.Mesh(mountainCutGeometry(center, 141 + index * 509), cliffMaterial);
    wall.name = `r14-granite-road-cut-${index}`;
    wall.castShadow = true;
    wall.receiveShadow = true;
    root.add(wall);
    return wall;
  });
  const plantSlots: PlantSlot[] = [];
  for (let i = 0; i < 580; i += 1) {
    const left = i % 7 < 4;
    const edge = seeded(i + 12) < 0.58;
    const z = left
      ? (edge ? -6.35 - seeded(i + 31) * 5.4 : -10 - seeded(i + 31) * 17)
      : (edge ? 2.2 + seeded(i + 31) * 4.8 : 8 + seeded(i + 31) * 22);
    const scale = (edge ? 0.55 : 0.78) + seeded(i + 51) * (edge ? 0.9 : 1.35);
    plantSlots.push({
      x: seeded(i + 71) * 220 - 110,
      z,
      yaw: seeded(i + 91) * Math.PI,
      scale: new THREE.Vector3(scale * (1.0 + seeded(i + 92) * 0.5), scale * (0.72 + seeded(i + 93) * 0.62), scale),
    });
  }
  const plants = new THREE.InstancedMesh(plantGeometry, foliageMaterial, plantSlots.length);
  plants.name = 'r13-ferns-shrubs-and-grass';
  plants.castShadow = plants.receiveShadow = true;
  plants.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 150);
  root.add(plants);
  const plantTransform = new THREE.Object3D();
  const plantLastX = new Float64Array(plantSlots.length).fill(Number.NaN);

  const rockSlots: RockSlot[] = Array.from({ length: 28 }, (_, index) => {
    const leftCliff = index % 3 !== 2;
    return {
      x: seeded(index + 401) * 238 - 119,
      z: leftCliff ? -10.8 - seeded(index + 402) * 8.5 : 7.5 + seeded(index + 402) * 14,
      scale: leftCliff ? 0.78 + seeded(index + 403) * 0.72 : 0.82 + seeded(index + 403) * 0.68,
      yaw: seeded(index + 404) * Math.PI * 2,
    };
  });
  const rockLastX = new Float64Array(rockSlots.length).fill(Number.NaN);
  const shadowLastX = new Float64Array(rockSlots.length).fill(Number.NaN);
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const shadowContext = shadowCanvas.getContext('2d')!;
  const shadowGradient = shadowContext.createRadialGradient(64, 64, 5, 64, 64, 62);
  shadowGradient.addColorStop(0, 'rgba(0,0,0,.72)');
  shadowGradient.addColorStop(0.55, 'rgba(0,0,0,.28)');
  shadowGradient.addColorStop(1, 'rgba(0,0,0,0)');
  shadowContext.fillStyle = shadowGradient;
  shadowContext.fillRect(0, 0, 128, 128);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  const shadowMaterial = new THREE.MeshBasicMaterial({
    map: shadowTexture, color: 0x121914, transparent: true, opacity: 0.42, depthWrite: false,
  });
  const shadowGeometry = new THREE.PlaneGeometry(1, 1);
  const rockShadows = new THREE.InstancedMesh(shadowGeometry, shadowMaterial, rockSlots.length);
  rockShadows.name = 'r13-boulder-contact-shadows';
  rockShadows.renderOrder = 2;
  root.add(rockShadows);
  const shadowTransform = new THREE.Object3D();
  const loader = new GLTFLoader();
  void loader.loadAsync('/models/sompo/r13-mountain-rock-cluster.glb').then((gltf) => {
    if (disposed) return;
    for (const [index, slot] of rockSlots.entries()) {
      const group = gltf.scene.clone(true);
      group.name = `r13-boulder-cluster-${index}`;
      group.scale.setScalar(slot.scale);
      group.rotation.y = slot.yaw;
      group.children.forEach((child, childIndex) => {
        child.visible = seeded(index * 17 + childIndex + 901) > 0.16;
        const variation = 0.78 + seeded(index * 31 + childIndex + 911) * 0.42;
        child.scale.multiplyScalar(variation);
      });
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          child.material = rockMaterial;
        }
      });
      slot.group = group;
      root.add(group);
    }
  }).catch(() => { /* Existing procedural stones remain as a graceful fallback. */ });

  // R15 replaces the generic tropical skyline with target-aligned alpine pine
  // layers. Mid/far trees use crossed cards; only the near silhouettes carry
  // the Blender-authored branch/trunk geometry so parallax stays convincing
  // without sacrificing the simulator's 60 FPS budget.
  const pineBillboardTexture = new THREE.TextureLoader().load('/sompo/gen/r15-mountain-pine-billboard.webp');
  pineBillboardTexture.colorSpace = THREE.SRGBColorSpace;
  pineBillboardTexture.anisotropy = 8;
  const pineBillboardMaterial = new THREE.MeshBasicMaterial({
    map: pineBillboardTexture,
    color: 0xffffff,
    fog: true,
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.14,
    depthWrite: true,
  });
  const pineCardGeometry = crossedCardGeometry();
  const pineCardSlots: PlantSlot[] = Array.from({ length: 132 }, (_, index) => {
    const left = index % 5 < 2;
    const height = 6.8 + seeded(index + 1211) * 8.4;
    return {
      x: 18 + seeded(index + 1201) * 128,
      z: left
        ? -13.5 - seeded(index + 1207) * 48
        : 9.5 + seeded(index + 1207) * 65,
      yaw: seeded(index + 1213) * Math.PI,
      scale: new THREE.Vector3(height * (0.47 + seeded(index + 1217) * 0.13), height, height * 0.56),
    };
  });
  const pineCards = new THREE.InstancedMesh(pineCardGeometry, pineBillboardMaterial, pineCardSlots.length);
  pineCards.name = 'r15-alpine-pine-midground';
  pineCards.castShadow = false;
  pineCards.receiveShadow = true;
  pineCards.boundingSphere = new THREE.Sphere(new THREE.Vector3(60, 5, 0), 180);
  root.add(pineCards);
  const pineCardTransform = new THREE.Object3D();
  const pineCardLastX = new Float64Array(pineCardSlots.length).fill(Number.NaN);

  const pineBarkTexture = new THREE.TextureLoader().load('/sompo/gen/r15-pine-bark.webp');
  pineBarkTexture.colorSpace = THREE.SRGBColorSpace;
  pineBarkTexture.wrapS = pineBarkTexture.wrapT = THREE.RepeatWrapping;
  pineBarkTexture.repeat.set(1.4, 3.2);
  pineBarkTexture.anisotropy = 8;
  const pineBarkHeight = new THREE.TextureLoader().load('/sompo/gen/r15-pine-bark-height.webp');
  pineBarkHeight.colorSpace = THREE.NoColorSpace;
  pineBarkHeight.wrapS = pineBarkHeight.wrapT = THREE.RepeatWrapping;
  pineBarkHeight.repeat.copy(pineBarkTexture.repeat);
  pineBarkHeight.anisotropy = 8;
  const pineNeedleTexture = new THREE.TextureLoader().load('/sompo/gen/r15-pine-branch-spray.webp');
  pineNeedleTexture.colorSpace = THREE.SRGBColorSpace;
  pineNeedleTexture.wrapS = pineNeedleTexture.wrapT = THREE.ClampToEdgeWrapping;
  pineNeedleTexture.anisotropy = 8;
  const pineBarkMaterial = new THREE.MeshStandardMaterial({
    map: pineBarkTexture, bumpMap: pineBarkHeight, bumpScale: 0.17,
    color: 0xa49b8b, roughness: 0.96, metalness: 0,
  });
  const pineNeedleDarkMaterial = new THREE.MeshStandardMaterial({
    map: pineNeedleTexture, color: 0xe3e8d8, roughness: 0.94, metalness: 0,
    emissive: 0x172015, emissiveIntensity: 0.32,
    transparent: true, alphaTest: 0.14, depthWrite: true, side: THREE.DoubleSide,
  });
  const pineNeedleLightMaterial = new THREE.MeshStandardMaterial({
    map: pineNeedleTexture, color: 0xffffff, roughness: 0.92, metalness: 0,
    emissive: 0x1d2618, emissiveIntensity: 0.38,
    transparent: true, alphaTest: 0.14, depthWrite: true, side: THREE.DoubleSide,
  });
  const pineSlots: PineSlot[] = Array.from({ length: 28 }, (_, index) => {
    const left = index % 4 < 2;
    return {
      x: 8 + seeded(index + 1401) * 94,
      z: left
        ? -12.5 - seeded(index + 1407) * 23
        : 9.5 + seeded(index + 1407) * 34,
      scale: 0.72 + seeded(index + 1411) * 0.72,
      yaw: seeded(index + 1417) * Math.PI * 2,
    };
  });
  const pineLastX = new Float64Array(pineSlots.length).fill(Number.NaN);
  const pineGeometries = new Set<THREE.BufferGeometry>();
  void loader.loadAsync('/models/sompo/r15-mountain-pine.glb').then((gltf) => {
    if (disposed) return;
    gltf.scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      pineGeometries.add(child.geometry);
      child.castShadow = true;
      child.receiveShadow = true;
      child.material = child.name.includes('trunk')
        ? pineBarkMaterial
        : child.name.includes('sunlit') ? pineNeedleLightMaterial : pineNeedleDarkMaterial;
    });
    for (const [index, slot] of pineSlots.entries()) {
      const group = gltf.scene.clone(true);
      group.name = `r15-physical-lodgepole-pine-${index}`;
      group.rotation.y = slot.yaw;
      group.scale.set(slot.scale * (0.88 + seeded(index + 1421) * 0.18), slot.scale, slot.scale * (0.88 + seeded(index + 1427) * 0.18));
      slot.group = group;
      root.add(group);
    }
  }).catch(() => { /* Crossed-card forest remains complete if the GLB cannot load. */ });

  const mistCanvas = document.createElement('canvas');
  mistCanvas.width = 256; mistCanvas.height = 128;
  const mistContext = mistCanvas.getContext('2d')!;
  const mistHorizontal = mistContext.createLinearGradient(0, 0, 256, 0);
  mistHorizontal.addColorStop(0, 'rgba(220,229,225,0)');
  mistHorizontal.addColorStop(0.25, 'rgba(220,229,225,.38)');
  mistHorizontal.addColorStop(0.68, 'rgba(220,229,225,.46)');
  mistHorizontal.addColorStop(1, 'rgba(220,229,225,0)');
  mistContext.fillStyle = mistHorizontal;
  mistContext.fillRect(0, 0, 256, 128);
  const mistVertical = mistContext.createLinearGradient(0, 0, 0, 128);
  mistVertical.addColorStop(0, 'rgba(0,0,0,0)');
  mistVertical.addColorStop(0.30, 'rgba(255,255,255,.36)');
  mistVertical.addColorStop(0.72, 'rgba(255,255,255,.74)');
  mistVertical.addColorStop(1, 'rgba(0,0,0,0)');
  mistContext.globalCompositeOperation = 'destination-in';
  mistContext.fillStyle = mistVertical;
  mistContext.fillRect(0, 0, 256, 128);
  const mistTexture = new THREE.CanvasTexture(mistCanvas);
  const mistGeometry = new THREE.PlaneGeometry(1, 1);
  const mistLayers = [
    { baseX: 42, mesh: null as THREE.Mesh | null, width: 44, height: 10, z: 11, opacity: 0.17 },
    { baseX: 67, mesh: null as THREE.Mesh | null, width: 62, height: 15, z: 16, opacity: 0.22 },
    { baseX: 94, mesh: null as THREE.Mesh | null, width: 82, height: 20, z: 18, opacity: 0.28 },
  ];
  for (const layer of mistLayers) {
    const material = new THREE.MeshBasicMaterial({
      map: mistTexture, color: 0xdce5e1, transparent: true, opacity: layer.opacity,
      depthWrite: false, depthTest: true, fog: false, side: THREE.DoubleSide,
    });
    const plane = new THREE.Mesh(mistGeometry, material);
    plane.name = `r15-valley-mist-${layer.baseX}`;
    plane.rotation.y = Math.PI / 2;
    plane.scale.set(layer.width, layer.height, 1);
    plane.position.set(layer.baseX, 5.2, layer.z);
    plane.renderOrder = 3;
    layer.mesh = plane;
    root.add(plane);
  }

  return {
    update(truckX: number, wet: boolean) {
      plants.boundingSphere!.center.x = truckX;
      for (const [index, slot] of plantSlots.entries()) {
        const x = wrapMountainX(slot.x, truckX, 220);
        if (plantLastX[index] === x) continue;
        plantLastX[index] = x;
        plantTransform.position.set(x, sompoTerrainHeight(x, slot.z) - 0.05, slot.z);
        plantTransform.rotation.set(0, slot.yaw, 0);
        plantTransform.scale.copy(slot.scale);
        plantTransform.updateMatrix();
        plants.setMatrixAt(index, plantTransform.matrix);
      }
      plants.instanceMatrix.needsUpdate = true;
      foliageMaterial.color.set(wet ? 0xa4ad98 : 0xe5ead7);
      pineCards.boundingSphere!.center.x = truckX + 52;
      for (const [index, slot] of pineCardSlots.entries()) {
        const x = wrapMountainX(slot.x, truckX + 54, 220);
        if (pineCardLastX[index] === x) continue;
        pineCardLastX[index] = x;
        pineCardTransform.position.set(x, sompoTerrainHeight(x, slot.z) - 0.1, slot.z);
        pineCardTransform.rotation.set(
          (seeded(index + 1511) - 0.5) * 0.07,
          slot.yaw,
          (seeded(index + 1517) - 0.5) * 0.085,
        );
        pineCardTransform.scale.copy(slot.scale);
        pineCardTransform.updateMatrix();
        pineCards.setMatrixAt(index, pineCardTransform.matrix);
      }
      pineCards.instanceMatrix.needsUpdate = true;
      pineBillboardMaterial.color.set(wet ? 0x748074 : 0xc2c9bd);
      cliffWalls.forEach((wall, index) => {
        const center = cliffCenters[index];
        wall.position.x = wrapMountainX(center, truckX, 160) - center;
      });
      for (const [index, slot] of rockSlots.entries()) {
        const x = wrapMountainX(slot.x, truckX, 259.2);
        const groundY = sompoTerrainHeight(x, slot.z);
        if (shadowLastX[index] !== x) {
          shadowLastX[index] = x;
          shadowTransform.position.set(x, groundY + 0.018, slot.z);
          shadowTransform.rotation.set(-Math.PI / 2, 0, slot.yaw);
          shadowTransform.scale.set(7.4 * slot.scale, 5.0 * slot.scale, 1);
          shadowTransform.updateMatrix();
          rockShadows.setMatrixAt(index, shadowTransform.matrix);
        }
        if (slot.group && rockLastX[index] !== x) {
          rockLastX[index] = x;
          slot.group.position.set(x, groundY - 0.42 * slot.scale, slot.z);
        }
      }
      rockShadows.instanceMatrix.needsUpdate = true;
      for (const [index, slot] of pineSlots.entries()) {
        const x = wrapMountainX(slot.x, truckX + 38, 160);
        if (!slot.group || pineLastX[index] === x) continue;
        pineLastX[index] = x;
        slot.group.position.set(x, sompoTerrainHeight(x, slot.z) - 0.08, slot.z);
      }
      pineNeedleDarkMaterial.color.set(wet ? 0x748074 : 0xc7cfc1);
      pineNeedleLightMaterial.color.set(wet ? 0x87927f : 0xdce3d4);
      for (const layer of mistLayers) {
        if (!layer.mesh) continue;
        layer.mesh.position.x = wrapMountainX(layer.baseX, truckX + 54, 160);
        const material = layer.mesh.material as THREE.MeshBasicMaterial;
        material.opacity = layer.opacity * (wet ? 1.35 : 1);
      }
    },
    dispose() {
      disposed = true;
      foliageTexture.dispose();
      foliageMaterial.dispose();
      plantGeometry.dispose();
      rockTexture.dispose();
      rockMaterial.dispose();
      cliffTexture.dispose();
      cliffMaterial.dispose();
      cliffWalls.forEach((wall) => wall.geometry.dispose());
      pineBillboardTexture.dispose();
      pineBillboardMaterial.dispose();
      pineCardGeometry.dispose();
      pineBarkTexture.dispose();
      pineBarkHeight.dispose();
      pineNeedleTexture.dispose();
      pineBarkMaterial.dispose();
      pineNeedleDarkMaterial.dispose();
      pineNeedleLightMaterial.dispose();
      for (const geometry of pineGeometries) geometry.dispose();
      mistTexture.dispose();
      mistGeometry.dispose();
      for (const layer of mistLayers) (layer.mesh?.material as THREE.Material | undefined)?.dispose();
      shadowTexture.dispose();
      shadowMaterial.dispose();
      shadowGeometry.dispose();
      for (const slot of rockSlots) {
        slot.group?.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          child.geometry.dispose();
        });
      }
      root.removeFromParent();
    },
  };
}
