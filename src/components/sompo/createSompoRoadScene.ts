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
 * elemento recicla à frente em múltiplos exatos do seu período visual: chão por
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
    const detail = new THREE.TextureLoader().load('/sompo/gen/astra-asphalt.webp');
    detail.colorSpace = THREE.SRGBColorSpace;
    detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
    detail.center.set(0.5, 0.5);
    detail.rotation = 0;
    detail.repeat.set(32.5, 2.05);
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
    fade.addColorStop(0, 'rgba(0,0,0,.72)'); fade.addColorStop(0.45, 'rgba(0,0,0,.38)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = fade; context.fillRect(0, 0, 64, 64);
  });
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 3.4), new THREE.MeshBasicMaterial({ map: contactMap, transparent: true, depthWrite: false, opacity: 0.82 }));
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
  const postSlots: { x: number; z: number; height: number; lean: number; spin: number; fallen?: number }[] = [];
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
  const postFallen = new Float64Array(postSlots.length).fill(-1);
  posts.castShadow = true; root.add(posts);
  const wires: THREE.Mesh[] = [];
  const wire = new THREE.MeshStandardMaterial({ color: 0x5f6460, roughness: 0.7, metalness: 0.65 });
  for (const z of [6, -10]) for (const y of [0.45, 0.9]) {
    const strand = mesh(root, new THREE.CylinderGeometry(0.004, 0.004, 245, 4), wire, [0, y, z]);
    strand.rotation.z = Math.PI / 2;
    strand.userData.rowZ = z; strand.userData.wireY = y;
    wires.push(strand);
  }
  const vegetation = createSompoVegetation(root, camera, sompoTerrainHeight);

  const puddles = new THREE.Group(); root.add(puddles);
  const water = new THREE.MeshPhysicalMaterial({ color: 0x192426, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.44, clearcoat: 0.55, clearcoatRoughness: 0.12, envMapIntensity: 0.35, depthWrite: false });
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
  // Spray das rodas: a névoa de água que o pneu levanta em pista molhada.
  // Pontos nascem nas caixas de roda e o movimento do caminhão joga pra trás.
  const SPRAY_COUNT = 150;
  const sprayGeometry = new THREE.BufferGeometry();
  const sprayPositions = new Float32Array(SPRAY_COUNT * 3);
  sprayGeometry.setAttribute('position', new THREE.BufferAttribute(sprayPositions, 3));
  const sprayCanvas = document.createElement('canvas'); sprayCanvas.width = sprayCanvas.height = 64;
  const sprayCtx = sprayCanvas.getContext('2d')!;
  const sprayGrad = sprayCtx.createRadialGradient(32, 32, 2, 32, 32, 30);
  sprayGrad.addColorStop(0, 'rgba(255,255,255,.85)'); sprayGrad.addColorStop(.55, 'rgba(255,255,255,.28)'); sprayGrad.addColorStop(1, 'rgba(255,255,255,0)');
  sprayCtx.fillStyle = sprayGrad; sprayCtx.fillRect(0, 0, 64, 64);
  const sprayTexture = new THREE.CanvasTexture(sprayCanvas);
  const sprayMaterial = new THREE.PointsMaterial({ map: sprayTexture, size: 0.85, transparent: true, opacity: 0, depthWrite: false, color: 0xcfd9de });
  const spray = new THREE.Points(sprayGeometry, sprayMaterial);
  spray.frustumCulled = false; spray.name = 'sompo-road-wheel-spray'; spray.visible = false; root.add(spray);
  let spraySeed = 4242;
  const sprayRandom = () => { spraySeed ^= spraySeed << 13; spraySeed ^= spraySeed >>> 17; spraySeed ^= spraySeed << 5; return (spraySeed >>> 0) / 4294967296; };
  const sprayOrigins = Array.from({ length: SPRAY_COUNT }, () => {
    const axle = [2.45, -1.35, -2.7][Math.floor(sprayRandom() * 3)];
    return { axle, side: sprayRandom() < 0.5 ? -1 : 1, seed: sprayRandom(), jitter: sprayRandom() };
  });
  // Lago do vale: lâmina d'água na bacia esculpida no relevo. A incidência
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
  // Face física da doca/portão, ancorada pelo roteiro no ponto de contato.
  // O galpão acima continua ambientando o terreiro sem fingir essa colisão.
  const yardContact = new THREE.Group();
  yardContact.name = 'sompo-yard-contact-surface';
  root.add(yardContact);
  const dockWall = new THREE.Group(); yardContact.add(dockWall);
  const dockConcrete = new THREE.MeshStandardMaterial({ color: 0x9b8f7d, roughness: 0.96 });
  const dockDark = new THREE.MeshStandardMaterial({ color: 0x263036, roughness: 0.85, metalness: 0.2 });
  mesh(dockWall, new THREE.BoxGeometry(0.34, 4.4, 7.2), dockConcrete, [0.17, 2.2, 0]);
  // Todas as peças começam no plano local x=0 e crescem para dentro da
  // estrutura. Assim a âncora representa a face que o para-choque enxerga,
  // sem esconder centímetros de penetração dentro da espessura da malha.
  mesh(dockWall, new THREE.BoxGeometry(0.08, 3.15, 3.8), dockDark, [0.04, 1.58, 0]);
  for (const side of [-1, 1]) {
    mesh(dockWall, new THREE.BoxGeometry(0.34, 0.55, 0.38), dockDark, [0.17, 0.38, side * 2.25]);
  }
  const yardGate = new THREE.Group(); yardContact.add(yardGate);
  const gateMetal = new THREE.MeshStandardMaterial({ color: 0x4f5c57, roughness: 0.68, metalness: 0.55 });
  for (const side of [-1, 1]) {
    mesh(yardGate, new THREE.BoxGeometry(0.34, 3.7, 0.34), dockConcrete, [0.17, 1.85, side * 3.25]);
  }
  for (let index = -3; index <= 3; index += 1) {
    mesh(yardGate, new THREE.BoxGeometry(0.12, 3.1, 0.09), gateMetal, [0.06, 1.58, index * 0.9]);
  }
  for (const y of [0.15, 1.55, 3.05]) {
    mesh(yardGate, new THREE.BoxGeometry(0.12, 0.1, 6.4), gateMetal, [0.06, y, 0]);
  }
  yardContact.visible = false;
  const animal = createSompoAnimal(root);

  const rainGeometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(240 * 6), 3));
  const rainMaterial = new THREE.LineBasicMaterial({ color: 0xc2d6e0, transparent: true, opacity: 0 });
  const rain = new THREE.LineSegments(rainGeometry, rainMaterial); scene.add(rain); rain.frustumCulled = false;
  let rainSeed = 83721;
  const rainRandom = () => { rainSeed ^= rainSeed << 13; rainSeed ^= rainSeed >>> 17; rainSeed ^= rainSeed << 5; return (rainSeed >>> 0) / 4294967296; };
  const rainOrigins = Array.from({ length: 240 }, () => [rainRandom() * 26 - 13, rainRandom() * 20 - 10, rainRandom() * 12]);
  return {
    update(effectFrame: SompoEffectFrame, frame: SompoRuralFrame | null, elapsed: number, truck: THREE.Vector3, reduceMotion: boolean, slope: number, extras?: {
      animalAnchorX?: number;
      yardContactAnchor?: { x: number; z: number; yaw: number; kind: 'dock' | 'gate'; facing: 'front' | 'rear' } | null;
      wind?: number;
    }) {
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
      for (const strand of wires) {
        strand.position.x = truckX;
        // Cerca derrubada: quando o caminhão cruza a linha da cerca, os arames
        // daquela fileira caem pro chão junto com os mourões da janela dele.
        const rowCrossed = strand.userData.rowZ > 0 ? truck.z > 4.3 : truck.z < -8.6;
        strand.position.y = rowCrossed ? 0.12 : strand.userData.wireY;
      }
      let postsChanged = false;
      for (const [index, slot] of postSlots.entries()) {
        const x = wrapSompoX(slot.x, truckX, 243);
        const crossing = slot.z > 0 ? truck.z > 4.3 : truck.z < -8.6;
        if (crossing && Math.abs(x - truckX) < 5.6) slot.fallen = 1;
        const fallen = slot.fallen ?? 0;
        if (postPositions[index] === x && postFallen[index] === fallen) continue;
        postPositions[index] = x; postFallen[index] = fallen; postsChanged = true;
        if (fallen) {
          // Mourão derrubado: deita no sentido do deslocamento e é empurrado
          // um pouco pra fora da linha da cerca.
          const dir = frame?.direction ?? 1;
          transform.position.set(x, 0.08, slot.z + Math.sign(slot.z) * 0.35);
          transform.rotation.set(0, slot.spin, dir * -1.42 + slot.lean * 0.2);
          transform.scale.set(1, slot.height / 1.2, 1);
        } else {
          transform.position.set(x, (slot.height / 2) - 0.04, slot.z);
          transform.rotation.set(slot.lean, slot.spin, slot.lean * 0.7);
          transform.scale.set(1, slot.height / 1.2, 1);
        }
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
      asphalt.color.set(mud ? 0x604331 : gravel ? 0x998467 : wet ? 0x45545f : 0xffffff);
      asphalt.roughness = wet && !mud ? 0.2 : 0.95;
      asphalt.normalScale.setScalar(wet ? 0.20 : 1.0);
      markings.visible = !mud && !gravel;
      puddles.visible = wet;
      shed.visible = effectFrame.setting === 'yard' && !extras?.yardContactAnchor;
      yardContact.visible = effectFrame.setting === 'yard' && Boolean(extras?.yardContactAnchor);
      if (extras?.yardContactAnchor) {
        yardContact.position.set(extras.yardContactAnchor.x, 0, extras.yardContactAnchor.z);
        yardContact.rotation.y = extras.yardContactAnchor.yaw
          + (extras.yardContactAnchor.facing === 'rear' ? Math.PI : 0);
        dockWall.visible = extras.yardContactAnchor.kind === 'dock';
        yardGate.visible = extras.yardContactAnchor.kind === 'gate';
      }
      const animalZ = frame?.animalZ ?? -8;
      const walking = frame?.animalRate ?? 0;
      const animalImpact = effectFrame.cues.find(cue => cue.effect === 'debris');
      animal.update(effects.has('animal'), animalZ, elapsed, reduceMotion, extras?.animalAnchorX, walking, animalImpact?.ageMs ?? null);
      details.update(elapsed, wet, reduceMotion, truckX, extras?.wind ?? 0.65);
      rainMaterial.opacity = (effects.get('rain') ?? 0) * 0.4;
      const sprayAmt = wet ? THREE.MathUtils.clamp(((frame?.speedKph ?? 0) - 18) / 45, 0, 1) : 0;
      spray.visible = sprayAmt > 0.02;
      sprayMaterial.opacity = sprayAmt * 0.36;
      if (spray.visible) {
        const drift = 1 + (frame?.speedKph ?? 0) / 60;
        const sprayT = reduceMotion ? 0 : t;
        for (let i = 0; i < SPRAY_COUNT; i += 1) {
          const origin = sprayOrigins[i];
          const age = (sprayT * 1.6 + origin.seed) % 1;
          sprayPositions[i * 3] = truckX + origin.axle - age * 2.6 * drift;
          sprayPositions[i * 3 + 1] = 0.18 + age * 0.85 - age * age * 0.55;
          sprayPositions[i * 3 + 2] = truck.z + origin.side * (0.72 + origin.jitter * 0.35 + age * 0.5);
        }
        sprayGeometry.attributes.position.needsUpdate = true;
      }
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
