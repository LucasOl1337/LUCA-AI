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

  const rockSlots: RockSlot[] = Array.from({ length: 16 }, (_, index) => {
    const leftCliff = index % 3 !== 2;
    return {
      x: index * 16.2 - 126 + (seeded(index + 401) - 0.5) * 5,
      z: leftCliff ? -10.8 - seeded(index + 402) * 8.5 : 7.5 + seeded(index + 402) * 14,
      scale: leftCliff ? 0.72 + seeded(index + 403) * 0.62 : 0.58 + seeded(index + 403) * 0.5,
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
