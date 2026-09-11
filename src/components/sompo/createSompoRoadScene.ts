import * as THREE from 'three';
import { createSompoAnimal } from './createSompoAnimal';
import { createSompoVegetation } from './createSompoVegetation';
import { createSompoRoadDetails, varySompoSurface, wornRoadPaint } from './createSompoRoadDetails';
import type { SompoEffectFrame } from '../../../shared/sompo-scenario-effects.js';
import { createSompoEnvironmentAssets } from './createSompoEnvironmentAssets';
import type { SompoRuralFrame } from '../../../shared/sompo-telemetry-simulator.js';

function texture(width: number, height: number, draw: (context: CanvasRenderingContext2D) => void, color = true) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
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
  varySompoSurface(earth, 0.32);
  const details = createSompoRoadDetails(root, assets.grassMap());
  const roadMap = groundTexture('road');
  const asphalt = new THREE.MeshStandardMaterial({ map: roadMap, roughness: 0.90, metalness: 0.03 });
  const road = mesh(root, new THREE.PlaneGeometry(240, 8.2), asphalt, [0, 0, -2.05]);
  road.rotation.x = -Math.PI / 2;
  assets.surface(asphalt, 'asphalt', 60, 2.05);
  varySompoSurface(asphalt, 0.24);
  const unpaved = new THREE.MeshStandardMaterial({ map: earthMap, roughness: 1, color: 0xb09b7e });
  assets.surface(unpaved, 'dirt', 60, 2.05);
  varySompoSurface(unpaved, 0.38);
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
  varySompoSurface(shoulderMaterial, 0.3);
  for (const z of [2.72, -6.82]) {
    const shoulder = mesh(root, new THREE.PlaneGeometry(240, 1.5), shoulderMaterial, [0, -0.015, z]);
    shoulder.rotation.x = -Math.PI / 2;
  }
  const markings = new THREE.Group(); root.add(markings);
  const wornPaint = wornRoadPaint(); const edgePaint = wornPaint.clone(); edgePaint.repeat.x = 64;
  const white = new THREE.MeshStandardMaterial({ map: edgePaint, alphaTest: 0.45, color: 0xe3e0ce, roughness: 0.82 });
  const yellow = new THREE.MeshStandardMaterial({ map: wornPaint, alphaTest: 0.45, color: 0xe5b744, roughness: 0.8 });
  for (const z of [1.85, -5.96]) mesh(markings, new THREE.BoxGeometry(240, 0.012, 0.12), white, [0, 0.012, z]);
  const dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(3.7, 0.015, 0.11), yellow, 48);
  const transform = new THREE.Object3D();
  for (let i = 0; i < 48; i += 1) { transform.position.set(i * 5 - 120, 0.017, -2.05); transform.updateMatrix(); dashes.setMatrixAt(i, transform.matrix); }
  markings.add(dashes);
  const fields = new THREE.MeshStandardMaterial({ color: 0x9caf80, roughness: 1 });
  assets.surface(fields, 'grass', 55, 14.5);
  varySompoSurface(fields, 0.45);
  for (const side of [-1, 1]) {
    const field = mesh(root, new THREE.PlaneGeometry(220, 58), fields, [0, -0.035, side * 39]); field.rotation.x = -Math.PI / 2;

  }
  const wood = new THREE.MeshStandardMaterial({ color: 0x70614b, roughness: 1 });
  assets.surface(wood, 'wood', 0.18, 1.2);
  wood.color.set(0xb9b2a0);
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.11, 1.2, 0.12), wood, 100);
  for (let i = 0; i < 100; i += 1) { transform.position.set((i % 50) * 4.5 - 112, 0.58, i < 50 ? 6 : -10); transform.updateMatrix(); posts.setMatrixAt(i, transform.matrix); }
  posts.castShadow = true; root.add(posts);
  const wire = new THREE.MeshStandardMaterial({ color: 0x5f6460, roughness: 0.7, metalness: 0.65 });
  for (const z of [6, -10]) for (const y of [0.45, 0.9]) mesh(root, new THREE.CylinderGeometry(0.004, 0.004, 225, 4), wire, [0, y, z]).rotation.z = Math.PI / 2;
  const vegetation = createSompoVegetation(root, camera);

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
  const animal = createSompoAnimal(root);

  const rainGeometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(240 * 6), 3));
  const rainMaterial = new THREE.LineBasicMaterial({ color: 0xc2d6e0, transparent: true, opacity: 0 });
  const rain = new THREE.LineSegments(rainGeometry, rainMaterial); scene.add(rain); rain.frustumCulled = false;
  let rainSeed = 83721;
  const rainRandom = () => { rainSeed ^= rainSeed << 13; rainSeed ^= rainSeed >>> 17; rainSeed ^= rainSeed << 5; return (rainSeed >>> 0) / 4294967296; };
  const rainOrigins = Array.from({ length: 240 }, () => [rainRandom() * 26 - 13, rainRandom() * 20 - 10, rainRandom() * 12]);
  let traveled = 0;
  return {
    update(effectFrame: SompoEffectFrame, frame: SompoRuralFrame | null, speed: number, elapsed: number, truck: THREE.Vector3, reduceMotion: boolean, delta: number, slope: number) {
      const t = elapsed / 1000;
      const effects = new Map(effectFrame.cues.map((cue) => [cue.effect, cue.intensity]));
      root.rotation.z = slope;
      vegetation.update((frame?.rain ?? 0) > 0);
      if (!reduceMotion) traveled += speed / 3.6 * delta * (frame?.direction ?? 1);
      dashes.position.x = -(traveled % 5);
      for (const map of new Set([asphalt.map, asphalt.normalMap, asphalt.roughnessMap, asphalt.aoMap])) {
        if (map) map.offset.x = (traveled / 240 * map.repeat.x) % 1;
      }
      const wet = (frame?.rain ?? 0) > 0;
      contact.position.set(truck.x, 0.008, truck.z);
      contact.rotation.z = -THREE.MathUtils.degToRad(frame?.yaw ?? 0);
      const mud = effectFrame.surface === 'mud';
      const gravel = effectFrame.surface === 'gravel';
      road.material = mud || gravel ? unpaved : asphalt;
      unpaved.color.set(mud ? 0x77604b : 0xb09b7e);
      unpaved.roughness = mud ? 0.82 : 1;
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
      shed.visible = effectFrame.setting === 'yard';
      animal.update(effects.has('animal'), frame?.animalZ ?? -8, elapsed, reduceMotion);
      details.update(elapsed, wet, reduceMotion);
      rainMaterial.opacity = (effects.get('rain') ?? 0) * 0.4;
      const clock = reduceMotion ? 0 : t;
      const rainPositions = rainGeometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < 240; i += 1) {
        const [x, z, startY] = rainOrigins[i];
        const y = 12 - (clock * 10 + startY) % 12;
        rainPositions.setXYZ(i * 2, x, y, z); rainPositions.setXYZ(i * 2 + 1, x - 0.12, y + 0.7, z);
      }
      rainPositions.needsUpdate = true;
    },
    get hasHdri() { return assets.hasHdri; },
    dispose() { vegetation.dispose(); animal.dispose(); details.dispose(); assets.dispose(); asphalt.dispose(); unpaved.dispose(); clearSky.dispose(); rainSky.dispose(); },
  };
}
