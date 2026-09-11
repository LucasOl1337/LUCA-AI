import * as THREE from 'three';
import { createSompoEnvironmentAssets } from './createSompoEnvironmentAssets';
import type { SompoRuralFrame } from '../../../shared/sompo-telemetry-simulator.js';

function texture(width: number, height: number, draw: (context: CanvasRenderingContext2D) => void, color = true) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  if (context) draw(context);
  const map = new THREE.CanvasTexture(canvas);
  if (color) map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}

function groundTexture(kind: 'road' | 'earth') {
  const map = texture(512, 512, (context) => {
    context.fillStyle = kind === 'road' ? '#303537' : '#70654e';
    context.fillRect(0, 0, 512, 512);
    let seed = 91357;
    const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
    for (let index = 0; index < 36000; index += 1) {
      const x = random() * 512;
      const y = random() * 512;
      const tone = index % 3;
      context.fillStyle = tone === 0 ? 'rgba(0,0,0,.12)' : 'rgba(240,230,206,.08)';
      context.fillRect(x, y, kind === 'road' ? 1.5 : 3, 1.5);
    }
    if (kind === 'road') {
      context.strokeStyle = 'rgba(15,20,22,.3)'; context.lineWidth = 1.5;
      context.beginPath(); context.moveTo(0, 105); context.lineTo(145, 120); context.lineTo(202, 98); context.lineTo(360, 133); context.lineTo(512, 111); context.stroke();
    }
  });
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(kind === 'road' ? 36 : 30, kind === 'road' ? 2 : 30);
  return map;
}

function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number], scale?: [number, number, number]) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(...position);
  if (scale) object.scale.set(...scale);
  object.castShadow = object.receiveShadow = true;
  parent.add(object);
  return object;
}

function makeCow() {
  const cow = new THREE.Group();
  const hide = new THREE.MeshStandardMaterial({ color: 0x695344, roughness: 0.94 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x262523, roughness: 0.8 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xc5b294, roughness: 0.9 });
  mesh(cow, new THREE.SphereGeometry(1, 16, 12), hide, [0, 1.1, 0], [0.38, 0.50, 0.86]);
  mesh(cow, new THREE.SphereGeometry(1, 12, 10), hide, [0, 1.40, 0.79], [0.25, 0.35, 0.4]);
  mesh(cow, new THREE.SphereGeometry(1, 12, 8), cream, [0, 1.25, 1.03], [0.24, 0.17, 0.22]);
  for (const x of [-0.25, 0.25]) {
    for (const z of [-0.55, 0.52]) {
      mesh(cow, new THREE.CylinderGeometry(0.07, 0.045, 0.83, 8), hide, [x, 0.48, z]);
      mesh(cow, new THREE.BoxGeometry(0.13, 0.14, 0.17), dark, [x, 0.10, z]);
    }
    mesh(cow, new THREE.SphereGeometry(0.035, 8, 6), dark, [x * 0.8, 1.50, 1.05]);
    const horn = mesh(cow, new THREE.ConeGeometry(0.06, 0.24, 8), cream, [x * 0.9, 1.79, 0.76]);
    horn.rotation.z = -Math.sign(x) * 0.6;
    mesh(cow, new THREE.SphereGeometry(1, 8, 6), hide, [x * 1.4, 1.57, 0.75], [0.16, 0.07, 0.09]);
  }
  return cow;
}

export function createSompoRoadScene(scene: THREE.Scene, renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
  const root = new THREE.Group();
  root.name = 'rural-road-environment';
  scene.add(root);
  const sky = (wet: boolean) => texture(8, 512, (context) => {
    const gradient = context.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, wet ? '#435c70' : '#508fbd');
    gradient.addColorStop(0.65, wet ? '#9aa9af' : '#afd1db');
    gradient.addColorStop(1, wet ? '#b9c0bb' : '#e8e5ca');
    context.fillStyle = gradient; context.fillRect(0, 0, 8, 512);
  });
  const clearSky = sky(false); const rainSky = sky(true);
  scene.background = clearSky;
  scene.fog = new THREE.Fog(0xbebca9, 75, 220);
  const assets = createSompoEnvironmentAssets(scene, renderer);
  const earthMap = groundTexture('earth');
  const earth = new THREE.MeshStandardMaterial({ map: earthMap, roughness: 1, color: 0xffffff });
  const terrain = mesh(root, new THREE.PlaneGeometry(240, 240), earth, [0, -0.055, 0]);
  terrain.rotation.x = -Math.PI / 2;
  assets.surface(earth, 'dirt', 30, 30);
  const roadMap = groundTexture('road');
  const asphalt = new THREE.MeshStandardMaterial({ map: roadMap, roughness: 0.90, metalness: 0.03 });
  const road = mesh(root, new THREE.PlaneGeometry(240, 8.2), asphalt, [0, 0, -2.05]);
  road.rotation.x = -Math.PI / 2;
  assets.surface(asphalt, 'asphalt', 60, 2.05);
  // Broad, soft ambient contact below the chassis complements the tyre-level GTAO.
  const contactMap = texture(256, 64, (context) => {
    context.scale(4, 1);
    const fade = context.createRadialGradient(32, 32, 4, 32, 32, 32);
    fade.addColorStop(0, 'rgba(0,0,0,.55)'); fade.addColorStop(0.55, 'rgba(0,0,0,.28)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = fade; context.fillRect(0, 0, 64, 64);
  });
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(9.2, 2.8), new THREE.MeshBasicMaterial({ map: contactMap, transparent: true, depthWrite: false, opacity: 0.6 }));
  contact.name = 'truck-ambient-contact'; contact.rotation.x = -Math.PI / 2; root.add(contact);
  const shoulderMaterial = new THREE.MeshStandardMaterial({ map: earthMap, color: 0xe1c9aa, roughness: 1 });
  assets.surface(shoulderMaterial, 'dirt', 60, 0.375);
  for (const z of [2.72, -6.82]) {
    const shoulder = mesh(root, new THREE.PlaneGeometry(240, 1.5), shoulderMaterial, [0, -0.015, z]);
    shoulder.rotation.x = -Math.PI / 2;
  }
  const markings = new THREE.Group(); root.add(markings);
  const white = new THREE.MeshStandardMaterial({ color: 0xe3e0ce, roughness: 0.82 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xe5b744, roughness: 0.8 });
  for (const z of [1.85, -5.96]) mesh(markings, new THREE.BoxGeometry(240, 0.012, 0.12), white, [0, 0.012, z]);
  const dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(3.7, 0.015, 0.11), yellow, 48);
  const transform = new THREE.Object3D();
  for (let i = 0; i < 48; i += 1) { transform.position.set(i * 5 - 120, 0.017, -2.05); transform.updateMatrix(); dashes.setMatrixAt(i, transform.matrix); }
  markings.add(dashes);
  const fields = new THREE.MeshStandardMaterial({ color: 0x9caf80, roughness: 1 });
  assets.surface(fields, 'grass', 70, 20);
  for (const side of [-1, 1]) {
    const field = mesh(root, new THREE.PlaneGeometry(220, 58), fields, [0, -0.035, side * 39]); field.rotation.x = -Math.PI / 2;

  }
  const wood = new THREE.MeshStandardMaterial({ color: 0x70614b, roughness: 1 });
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.11, 1.2, 0.12), wood, 100);
  for (let i = 0; i < 100; i += 1) { transform.position.set((i % 50) * 4.5 - 112, 0.58, i < 50 ? 6 : -10); transform.updateMatrix(); posts.setMatrixAt(i, transform.matrix); }
  posts.castShadow = true; root.add(posts);
  for (const z of [6, -10]) for (const y of [0.45, 0.9]) mesh(root, new THREE.BoxGeometry(225, 0.028, 0.028), wood, [0, y, z]);
  const treeBatches: { mesh: THREE.InstancedMesh; placements: { x: number; z: number; scale: number }[] }[] = [];
  const localCamera = new THREE.Vector3();
  // Three transparent views rendered locally from Poly Haven's CC0 Tree Small 02.
  // Sparse instancing avoids loading millions of source triangles on each client.
  for (let variant = 0; variant < 3; variant += 1) {
    const foliage = new THREE.MeshBasicMaterial({ map: assets.treeMap(variant), alphaTest: 0.28, side: THREE.DoubleSide });
    const trees = new THREE.InstancedMesh(new THREE.PlaneGeometry(6, 6), foliage, 12);
    trees.visible = false;
    trees.name = `rural-tree-billboards-${variant}`;
    const placements: { x: number; z: number; scale: number }[] = [];
    for (let i = 0; i < 12; i += 1) {
      const index = i * 3 + variant;
      const nearRoad = [[-12, -12], [12, -14], [25, 9]][variant];
      const x = i === 0 ? nearRoad[0] : ((index * 31) % 180) - 90;
      const z = i === 0 ? nearRoad[1] : (index % 2 ? -1 : 1) * (22 + (index * 17) % 42);
      const scale = i === 0 ? 1.6 : 0.95 + (index % 5) * 0.16;
      placements.push({ x, z, scale });
      transform.position.set(x, 3 * scale - 0.025, z);
      transform.rotation.y = 0.65 + (index % 3 - 1) * 0.28;
      transform.scale.set(scale, scale, scale); transform.updateMatrix(); trees.setMatrixAt(i, transform.matrix);
    }
    trees.castShadow = true;
    root.add(trees);
    treeBatches.push({ mesh: trees, placements });
  }

  const puddles = new THREE.Group(); root.add(puddles);
  const water = new THREE.MeshPhysicalMaterial({ color: 0x192426, roughness: 0.18, metalness: 0, transparent: true, opacity: 0.32, clearcoat: 0.55, clearcoatRoughness: 0.12, envMapIntensity: 0.35, depthWrite: false });
  for (let i = 0; i < 12; i += 1) {
    const patch = mesh(puddles, new THREE.CircleGeometry(1, 24), water, [i * 4 - 20, 0.025, (i % 3) * 2.5 - 4.5], [1.2 + i % 3, 0.4 + i % 2 * 0.5, 1]);
    const vertices = patch.geometry.attributes.position as THREE.BufferAttribute;
    for (let vertex = 1; vertex < vertices.count; vertex += 1) {
      const wobble = 1 + Math.sin(vertex * 1.7 + i * 2) * 0.15;
      vertices.setXY(vertex, vertices.getX(vertex) * wobble, vertices.getY(vertex) * wobble);
    }
    patch.rotation.x = -Math.PI / 2;
  }
  const shed = new THREE.Group(); root.add(shed); shed.position.set(-7, 0, 5.4);
  mesh(shed, new THREE.BoxGeometry(9, 3.8, 4), new THREE.MeshStandardMaterial({ color: 0xb8a586, roughness: 0.9 }), [0, 1.9, 0]);
  mesh(shed, new THREE.BoxGeometry(9.4, 0.18, 4.5), new THREE.MeshStandardMaterial({ color: 0x745c4b, roughness: 0.8 }), [0, 3.93, 0]);
  mesh(shed, new THREE.BoxGeometry(3.5, 3.1, 0.035), new THREE.MeshStandardMaterial({ color: 0x343d37, roughness: 0.9 }), [0, 1.55, -2.03]);
  const cow = makeCow(); root.add(cow);

  const puff = texture(64, 64, (context) => {
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,.65)'); gradient.addColorStop(0.45, 'rgba(255,255,255,.25)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient; context.fillRect(0, 0, 64, 64);
  });
  const dustGeometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 3), 3));
  const dustMaterial = new THREE.PointsMaterial({ map: puff, color: 0xbba780, size: 1.1, transparent: true, depthWrite: false, opacity: 0 });
  const dust = new THREE.Points(dustGeometry, dustMaterial); scene.add(dust); dust.frustumCulled = false;
  const smokeGeometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(32 * 3), 3));
  const smokeMaterial = new THREE.PointsMaterial({ map: puff, color: 0x48504f, size: 2.2, transparent: true, depthWrite: false, opacity: 0 });
  const smoke = new THREE.Points(smokeGeometry, smokeMaterial); scene.add(smoke); smoke.frustumCulled = false;
  const rainGeometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(240 * 6), 3));
  const rainMaterial = new THREE.LineBasicMaterial({ color: 0xc2d6e0, transparent: true, opacity: 0 });
  const rain = new THREE.LineSegments(rainGeometry, rainMaterial); scene.add(rain); rain.frustumCulled = false;
  const flame = mesh(scene, new THREE.ConeGeometry(0.22, 0.85, 7), new THREE.MeshStandardMaterial({ color: 0xffba38, emissive: 0xff610c, emissiveIntensity: 3, transparent: true, opacity: 0.85 }), [3.15, 1.6, 0.4]);

  let rainSeed = 83721;
  const rainRandom = () => { rainSeed ^= rainSeed << 13; rainSeed ^= rainSeed >>> 17; rainSeed ^= rainSeed << 5; return (rainSeed >>> 0) / 4294967296; };
  const rainOrigins = Array.from({ length: 240 }, () => [rainRandom() * 26 - 13, rainRandom() * 20 - 10, rainRandom() * 12]);
  let traveled = 0;
  return {
    update(scenarioId: string, frame: SompoRuralFrame | null, speed: number, elapsed: number, truck: THREE.Vector3, reduceMotion: boolean, delta: number, slope: number) {
      const t = elapsed / 1000;
      root.rotation.z = slope;
      camera.getWorldPosition(localCamera); root.worldToLocal(localCamera);
      for (const batch of treeBatches) {
        // A missing/offline billboard must never become an opaque white card.
        batch.mesh.visible = !!(batch.mesh.material as THREE.MeshBasicMaterial).map?.image;
        batch.placements.forEach(({ x, z, scale }, index) => {
          transform.position.set(x, 3 * scale - 0.025, z);
          transform.rotation.set(0, Math.atan2(localCamera.x - x, localCamera.z - z), 0);
          transform.scale.setScalar(scale); transform.updateMatrix(); batch.mesh.setMatrixAt(index, transform.matrix);
        });
        batch.mesh.instanceMatrix.needsUpdate = true;
        (batch.mesh.material as THREE.MeshBasicMaterial).color.setScalar((frame?.rain ?? 0) > 0 ? 0.65 : 1);
      }
      if (!reduceMotion) traveled += speed / 3.6 * delta * (frame?.direction ?? 1);
      dashes.position.x = -(traveled % 5);
      for (const map of new Set([asphalt.map, asphalt.normalMap, asphalt.roughnessMap, asphalt.aoMap])) {
        if (map) map.offset.x = (traveled / 240 * map.repeat.x) % 1;
      }
      const wet = (frame?.rain ?? 0) > 0;
      contact.position.set(truck.x, 0.008, truck.z);
      contact.rotation.z = -THREE.MathUtils.degToRad(frame?.yaw ?? 0);
      const mud = scenarioId === 'bogged-down';
      const gravel = scenarioId === 'rough-road';
      if (!assets.hasHdri) scene.background = wet ? rainSky : clearSky;
      assets.update(wet);
      const fog = scene.fog as THREE.Fog;
      fog.color.set(wet ? 0x919b9c : 0xbebca9); fog.near = wet ? 55 : 100; fog.far = wet ? 220 : 260;
      earth.color.setScalar(wet ? 0.58 : 1);
      shoulderMaterial.color.set(wet ? 0x96856c : 0xe1c9aa);
      fields.color.set(wet ? 0x758765 : 0x9caf80);
      asphalt.color.set(mud ? 0x604331 : gravel ? 0x998467 : wet ? 0x687882 : 0xffffff);
      asphalt.roughness = wet && !mud ? 0.2 : 0.95;
      asphalt.normalScale.setScalar(wet ? 0.20 : 0.65);
      markings.visible = !mud && !gravel;
      puddles.visible = wet;
      shed.visible = scenarioId === 'tight-reverse' || scenarioId === 'yard-maneuver';
      cow.visible = scenarioId === 'animal-crossing';
      cow.position.set(7.0, 0.05, frame?.animalZ ?? -8);
      flame.visible = (frame?.smoke ?? 0) > 0.75;
      flame.position.set(truck.x + 3.9, 1.6, truck.z + 1.15);
      flame.scale.y = reduceMotion ? 1 : 1 + Math.sin(t * 15) * 0.15;
      dustMaterial.opacity = reduceMotion || wet ? 0 : Math.min(0.28, Math.abs(speed) * 0.006) * (gravel ? 2 : 1);
      smokeMaterial.opacity = (frame?.smoke ?? 0) * 0.65;
      rainMaterial.opacity = (frame?.rain ?? 0) * 0.4;
      const clock = reduceMotion ? 0 : t;
      const dustPositions = dustGeometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < 64; i += 1) {
        const age = (clock * 0.6 + i / 64) % 1;
        dustPositions.setXYZ(i, truck.x - 2.8 - age * 7, 0.3 + age * 1.4, truck.z + (i % 2 ? 1 : -1) * (1 + age * 0.8) + Math.sin(i * 3) * 0.4);
      }
      dustPositions.needsUpdate = true;
      const smokePositions = smokeGeometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < 32; i += 1) {
        const age = (clock * 0.25 + i / 32) % 1;
        smokePositions.setXYZ(i, truck.x + 3.1 - age * 2 + Math.sin(i * 13) * age * 0.8, 1.4 + age * 6, truck.z + 0.4 + Math.cos(i * 3) * age * 0.6);
      }
      smokePositions.needsUpdate = true;
      const rainPositions = rainGeometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < 240; i += 1) {
        const [x, z, startY] = rainOrigins[i];
        const y = 12 - (clock * 10 + startY) % 12;
        rainPositions.setXYZ(i * 2, x, y, z); rainPositions.setXYZ(i * 2 + 1, x - 0.12, y + 0.7, z);
      }
      rainPositions.needsUpdate = true;
    },
    get hasHdri() { return assets.hasHdri; },
    dispose() { assets.dispose(); clearSky.dispose(); rainSky.dispose(); },
  };
}
