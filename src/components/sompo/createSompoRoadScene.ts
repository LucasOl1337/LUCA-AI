import * as THREE from 'three';
import { createSompoPastureSurface } from './createSompoPastureSurface';
import { createSompoAnimal } from './createSompoAnimal';
import { createSompoVegetation } from './createSompoVegetation';
import { createSompoRoadDetails, varySompoSurface, wornRoadPaint, wrapSompoX } from './createSompoRoadDetails';
import { createSompoTerrainMesh, sompoTerrainHeight, SOMPO_TERRAIN_PERIOD_X, SOMPO_LAKE } from './createSompoTerrain';
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
  map.repeat.set(kind === 'road' ? 39 : 45, kind === 'road' ? 2 : 30);
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

/**
 * Estrada rural em trilha infinita: o caminhão avança de verdade no mundo e cada
 * elemento recicla à frente em múltiplos exatos do seu período visual — chão por
 * repetição de textura, objetos discretos por wrap em torno do caminhão. Nada de
 * scroll de textura fingindo deslocamento: marcas, detritos e postes ficam para
 * trás quando o caminhão passa.
 */
export function createSompoRoadScene(scene: THREE.Scene, renderer: THREE.WebGLRenderer, camera: THREE.Camera, hooks?: { onHdri?: (kind: 'dry' | 'wet', texture: THREE.Texture) => void }) {
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
  const assets = createSompoEnvironmentAssets(scene, renderer, { background: false, onHdri: hooks?.onHdri });
  const earthMap = groundTexture('earth');
  const earth = new THREE.MeshStandardMaterial({ map: earthMap, roughness: 1, color: 0xffffff });
  const terrain = createSompoTerrainMesh(earth);
  terrain.position.y = -0.055;
  root.add(terrain);
  assets.surface(earth, 'dirt', 45, 30);
  varySompoSurface(earth, 0.24);
  const pasture = createSompoPastureSurface(earth);
  const details = createSompoRoadDetails(root);
  const roadMap = groundTexture('road');
  const asphalt = new THREE.MeshStandardMaterial({ map: roadMap, roughness: 0.90, metalness: 0.03 });
  // Asfalto fotográfico com agregado/trincas: a faixa de brita das bordas corre
  // no sentido longitudinal (u da textura atravessa a pista, v repete a cada 4m).
  if (typeof document !== 'undefined') {
    const detail = new THREE.TextureLoader().load('/sompo/gen/asfalto-detalhe.webp');
    detail.colorSpace = THREE.SRGBColorSpace;
    detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
    detail.center.set(0.5, 0.5);
    detail.rotation = Math.PI / 2;
    detail.repeat.set(65, 1);
    detail.anisotropy = renderer.capabilities.getMaxAnisotropy();
    asphalt.map = detail;
  }
  const road = mesh(root, new THREE.PlaneGeometry(260, 8.2), asphalt, [0, 0, -2.05]);
  road.rotation.x = -Math.PI / 2;
  assets.surface(asphalt, 'asphalt', 65, 2.05, { keepMap: true, normalScale: 1.0 });
  varySompoSurface(asphalt, 0.24);
  const unpaved = new THREE.MeshStandardMaterial({ map: earthMap, roughness: 1, color: 0xb09b7e });
  assets.surface(unpaved, 'dirt', 65, 2.05);
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
  assets.surface(shoulderMaterial, 'dirt', 65, 0.375);
  varySompoSurface(shoulderMaterial, 0.3);
  const shoulders: THREE.Mesh[] = [];
  for (const z of [2.72, -6.82]) {
    const shoulder = mesh(root, new THREE.PlaneGeometry(260, 1.5), shoulderMaterial, [0, -0.015, z]);
    shoulder.rotation.x = -Math.PI / 2;
    shoulders.push(shoulder);
  }
  const markings = new THREE.Group(); root.add(markings);
  const wornPaint = wornRoadPaint(); const edgePaint = wornPaint.clone(); edgePaint.repeat.x = 65;
  const white = new THREE.MeshStandardMaterial({ map: edgePaint, alphaTest: 0.45, color: 0xe3e0ce, roughness: 0.82 });
  const yellow = new THREE.MeshStandardMaterial({ map: wornPaint, alphaTest: 0.45, color: 0xe5b744, roughness: 0.8 });
  const edgeLines: THREE.Mesh[] = [];
  for (const z of [1.85, -5.96]) edgeLines.push(mesh(markings, new THREE.BoxGeometry(260, 0.012, 0.12), white, [0, 0.012, z]));
  const dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(3.7, 0.015, 0.11), yellow, 52);
  const transform = new THREE.Object3D();
  for (let i = 0; i < 52; i += 1) { transform.position.set(i * 5 - 127.5, 0.017, -2.05); transform.updateMatrix(); dashes.setMatrixAt(i, transform.matrix); }
  markings.add(dashes);
  const wood = new THREE.MeshStandardMaterial({ color: 0x70614b, roughness: 1 });
  assets.surface(wood, 'wood', 0.18, 1.2);
  wood.color.set(0xb9b2a0);
  // Cerca com mourões irregulares: altura, prumo e giro variam por instância.
  const postSlots: { x: number; z: number; height: number; lean: number; spin: number }[] = [];
  const postRand = (i: number) => { const n = Math.sin(i * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
  for (let i = 0; i < 108; i += 1) {
    postSlots.push({
      x: (i % 54) * 4.5 - 120 + (postRand(i + 7) - 0.5) * 0.7,
      z: i < 54 ? 6 : -10,
      height: 1.05 + postRand(i + 13) * 0.35,
      lean: (postRand(i + 21) - 0.5) * 0.16,
      spin: postRand(i + 34) * Math.PI,
    });
  }
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.11, 1.2, 0.12), wood, postSlots.length);
  const postPositions = new Float64Array(postSlots.length).fill(NaN);
  posts.castShadow = true; root.add(posts);
  const wires: THREE.Mesh[] = [];
  const wire = new THREE.MeshStandardMaterial({ color: 0x5f6460, roughness: 0.7, metalness: 0.65 });
  for (const z of [6, -10]) for (const y of [0.45, 0.9]) {
    const strand = mesh(root, new THREE.CylinderGeometry(0.004, 0.004, 245, 4), wire, [0, y, z]);
    strand.rotation.z = Math.PI / 2;
    wires.push(strand);
  }
  const vegetation = createSompoVegetation(root, camera, sompoTerrainHeight);

  const puddles = new THREE.Group(); root.add(puddles);
  const water = new THREE.MeshPhysicalMaterial({ color: 0x192426, roughness: 0.18, metalness: 0, transparent: true, opacity: 0.32, clearcoat: 0.55, clearcoatRoughness: 0.12, envMapIntensity: 0.35, depthWrite: false });
  const puddleSlots: { mesh: THREE.Mesh; x: number }[] = [];
  for (let i = 0; i < 12; i += 1) {
    const baseX = i * 16.5 - 92;
    const patch = mesh(puddles, new THREE.CircleGeometry(1, 24), water, [baseX, 0.025, (i % 3) * 2.5 - 4.5], [1.2 + i % 3, 0.4 + i % 2 * 0.5, 1]);
    const vertices = patch.geometry.attributes.position as THREE.BufferAttribute;
    for (let vertex = 1; vertex < vertices.count; vertex += 1) {
      const wobble = 1 + Math.sin(vertex * 1.7 + i * 2) * 0.15;
      vertices.setXY(vertex, vertices.getX(vertex) * wobble, vertices.getY(vertex) * wobble);
    }
    patch.rotation.x = -Math.PI / 2;
    puddleSlots.push({ mesh: patch, x: baseX });
  }
  // Lago do vale: lâmina d'água na bacia esculpida no relevo — a incidência
  // rasante devolve o reflexo do céu (Fresnel), como no lago da referência.
  const lakeWater = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    new THREE.MeshStandardMaterial({ color: 0x14425c, roughness: 0.12, metalness: 0, envMapIntensity: 0.9, fog: false }),
  );
  lakeWater.name = 'valley-lake-water';
  lakeWater.geometry.scale(SOMPO_LAKE.radius * 1.15, SOMPO_LAKE.radius * 0.6, 1);
  lakeWater.rotation.x = -Math.PI / 2;
  lakeWater.position.set(SOMPO_LAKE.x, SOMPO_LAKE.waterY, SOMPO_LAKE.z);
  lakeWater.receiveShadow = true;
  root.add(lakeWater);
  const shed = new THREE.Group(); root.add(shed); shed.position.set(-7, 0, 5.4);
  mesh(shed, new THREE.BoxGeometry(9, 3.8, 4), new THREE.MeshStandardMaterial({ color: 0xb8a586, roughness: 0.9 }), [0, 1.9, 0]);
  const shedRoofMaterial = new THREE.MeshStandardMaterial({ color: 0x745c4b, roughness: 0.8, metalness: 0.25 });
  for (const side of [-1, 1]) {
    const pane = mesh(shed, new THREE.BoxGeometry(9.5, 0.14, 2.55), shedRoofMaterial, [0, 4.28, side * 1.12]);
    pane.rotation.x = side * 0.32;
  }
  mesh(shed, new THREE.BoxGeometry(9, 0.85, 0.12), new THREE.MeshStandardMaterial({ color: 0xa8957a, roughness: 0.9 }), [0, 4.12, 0]);
  mesh(shed, new THREE.BoxGeometry(3.5, 3.1, 0.035), new THREE.MeshStandardMaterial({ color: 0x343d37, roughness: 0.9 }), [0, 1.55, -2.03]);
  const animal = createSompoAnimal(root);

  const rainGeometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(240 * 6), 3));
  const rainMaterial = new THREE.LineBasicMaterial({ color: 0xc2d6e0, transparent: true, opacity: 0 });
  const rain = new THREE.LineSegments(rainGeometry, rainMaterial); scene.add(rain); rain.frustumCulled = false;
  let rainSeed = 83721;
  const rainRandom = () => { rainSeed ^= rainSeed << 13; rainSeed ^= rainSeed >>> 17; rainSeed ^= rainSeed << 5; return (rainSeed >>> 0) / 4294967296; };
  const rainOrigins = Array.from({ length: 240 }, () => [rainRandom() * 26 - 13, rainRandom() * 20 - 10, rainRandom() * 12]);
  return {
    update(effectFrame: SompoEffectFrame, frame: SompoRuralFrame | null, elapsed: number, truck: THREE.Vector3, reduceMotion: boolean, slope: number, extras?: { animalAnchorX?: number; wind?: number }) {
      const t = elapsed / 1000;
      const truckX = truck.x;
      const effects = new Map(effectFrame.cues.map((cue) => [cue.effect, cue.intensity]));
      // Rampa gira o mundo em torno do próprio caminhão, não da origem da cena.
      root.rotation.z = slope;
      root.position.set(truckX * (1 - Math.cos(slope)), -truckX * Math.sin(slope), 0);
      vegetation.update((frame?.rain ?? 0) > 0, truckX, truck);
      // Chão recicla por período exato da textura; objetos discretos por wrap.
      terrain.position.x = Math.round(truckX / SOMPO_TERRAIN_PERIOD_X) * SOMPO_TERRAIN_PERIOD_X;
      road.position.x = Math.round(truckX / 20) * 20;
      for (const shoulder of shoulders) shoulder.position.x = Math.round(truckX / 20) * 20;
      for (const line of edgeLines) line.position.x = Math.round(truckX / 20) * 20;
      dashes.position.x = Math.round(truckX / 5) * 5;
      for (const strand of wires) strand.position.x = truckX;
      let postsChanged = false;
      for (const [index, slot] of postSlots.entries()) {
        const x = wrapSompoX(slot.x, truckX, 243);
        if (postPositions[index] === x) continue;
        postPositions[index] = x; postsChanged = true;
        transform.position.set(x, (slot.height / 2) - 0.04, slot.z);
        transform.rotation.set(slot.lean, slot.spin, slot.lean * 0.7);
        transform.scale.set(1, slot.height / 1.2, 1);
        transform.updateMatrix();
        posts.setMatrixAt(index, transform.matrix);
      }
      if (postsChanged) { posts.instanceMatrix.needsUpdate = true; posts.computeBoundingSphere(); }
      for (const slot of puddleSlots) slot.mesh.position.x = wrapSompoX(slot.x, truckX, 198);
      lakeWater.position.x = wrapSompoX(SOMPO_LAKE.x, truckX, SOMPO_TERRAIN_PERIOD_X);
      shed.position.x = wrapSompoX(-7, truckX, 240);
      rain.position.x = truckX;
      const wet = (frame?.rain ?? 0) > 0;
      contact.position.set(truckX, 0.008, truck.z);
      contact.rotation.z = -THREE.MathUtils.degToRad(frame?.yaw ?? 0);
      const mud = effectFrame.surface === 'mud';
      const gravel = effectFrame.surface === 'gravel';
      road.material = mud || gravel ? unpaved : asphalt;
      unpaved.color.set(mud ? 0x77604b : 0xb09b7e);
      unpaved.roughness = mud ? 0.82 : 1;
      assets.update(wet);
      const fog = scene.fog as THREE.Fog;
      fog.color.set(wet ? 0x919b9c : 0xbebca9); fog.near = wet ? 55 : 100; fog.far = wet ? 220 : 260;
      earth.color.setScalar(wet ? 0.58 : 1);
      shoulderMaterial.color.set(wet ? 0x96856c : 0xe1c9aa);
      asphalt.color.set(mud ? 0x604331 : gravel ? 0x998467 : wet ? 0x687882 : 0xffffff);
      asphalt.roughness = wet && !mud ? 0.2 : 0.95;
      asphalt.normalScale.setScalar(wet ? 0.20 : 1.0);
      markings.visible = !mud && !gravel;
      puddles.visible = wet;
      shed.visible = effectFrame.setting === 'yard';
      const animalZ = frame?.animalZ ?? -8;
      const walking = frame?.animalRate ?? 0;
      const animalImpact = effectFrame.cues.find(cue => cue.effect === 'debris');
      animal.update(effects.has('animal'), animalZ, elapsed, reduceMotion, extras?.animalAnchorX, walking, animalImpact?.ageMs ?? null);
      details.update(elapsed, wet, reduceMotion, truckX, extras?.wind ?? 0.65);
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
    dispose() {
      pasture.dispose(); vegetation.dispose(); animal.dispose(); details.dispose(); assets.dispose(); asphalt.dispose(); unpaved.dispose(); clearSky.dispose(); rainSky.dispose(); },
  };
}
