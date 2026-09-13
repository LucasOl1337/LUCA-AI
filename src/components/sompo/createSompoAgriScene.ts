import * as THREE from 'three';
import { createSompoCropRows } from './createSompoCropRows';
import { geofenceFieldRelief, geofenceOperacaoRelief } from '../../../shared/geofencing/index.js'; // geofencing: relevo dos talhões sintéticos
import { grassTuftGeometry, varySompoSurface } from './createSompoRoadDetails';
import { disposeSompoObject } from './sompoStage';
import type { SompoAgriVisualFrame } from '../../../shared/sompo-agri-scenarios.js';

export const SOMPO_AGRI_ENVIRONMENTS = Object.freeze({
  'geofence-operacao': Object.freeze({ sky: 0xb8d6dd, ground: 0x6f542d, crop: 0xb99438, slope: 0, mud: 0, night: false, barn: false, relief: geofenceOperacaoRelief as (x: number, z: number) => number }),
  'row-crop-field': Object.freeze({ sky: 0xb8d6dd, ground: 0x6f542d, crop: 0xb99438, slope: 0.025, mud: 0, night: false, barn: false }),
  'sloped-field': Object.freeze({ sky: 0xb8d6dd, ground: 0x79613a, crop: 0x769247, slope: 0.17, mud: 0, night: false, barn: false }),
  'muddy-field': Object.freeze({ sky: 0x92a6a5, ground: 0x4a3829, crop: 0x6d8449, slope: 0.035, mud: 1, night: false, barn: false }),
  'farm-barn': Object.freeze({ sky: 0xb7c8c8, ground: 0x735d3f, crop: 0x789347, slope: 0, mud: 0, night: false, barn: true }),
  'row-crop-field-night': Object.freeze({ sky: 0x07111d, ground: 0x29291e, crop: 0x544e28, slope: 0.025, mud: 0, night: true, barn: false }),
  'geofence-field': Object.freeze({ sky: 0xb8d6dd, ground: 0x6f542d, crop: 0xb99438, slope: 0.02, mud: 0, night: false, barn: false, relief: geofenceFieldRelief as (x: number, z: number) => number }),
});

export type SompoAgriEnvironmentId = keyof typeof SOMPO_AGRI_ENVIRONMENTS;

function terrainHeight(x: number, z: number, slope: number, relief?: (x: number, z: number) => number) {
  const base = (z * slope) + (relief ? relief(x, z) : 0) + (Math.sin(x * 0.075) * 0.18) + (Math.cos(z * 0.11) * 0.1);
  // Anel de morros: o talhão termina num relevo de borda, não num corte reto.
  // A crista varia por azimute (cristas altas e trechos baixos) pra ler como
  // serra de verdade no horizonte em vez de um anel uniforme.
  const rim = Math.max(Math.abs(x) / 150, Math.abs(z) / 110);
  const crest = Math.sin(x * 0.013 + 2.1) * Math.cos(z * 0.017 - 0.8);
  const crest2 = Math.sin(x * 0.029 - 0.7) * Math.sin(z * 0.023 + 1.9);
  const rise = Math.max(0, rim - 0.5) ** 2 * 68 * (0.68 + crest * 0.22 + crest2 * 0.1);
  const roll = Math.sin(x * 0.031 + 1.7) * Math.cos(z * 0.043 + 0.6);
  return base + rise * (0.72 + roll * 0.28);
}

function createTerrain(environment: (typeof SOMPO_AGRI_ENVIRONMENTS)[SompoAgriEnvironmentId]) {
  const geometry = new THREE.PlaneGeometry(300, 220, 150, 110);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    positions.setY(index, terrainHeight(positions.getX(index), positions.getZ(index), environment.slope, (environment as { relief?: (x: number, z: number) => number }).relief));
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color: environment.ground,
    roughness: environment.mud ? 0.72 : 0.96,
    metalness: 0,
  });
  varySompoSurface(material, 0.26);
  const terrain = new THREE.Mesh(geometry, material);
  terrain.name = 'sompo-agri-terrain';
  terrain.receiveShadow = true;
  return terrain;
}

/** Silos galvanizados no fundo do talhão. A assinatura do bg-agro. */
function createSilos(slope: number) {
  const root = new THREE.Group(); root.name = 'sompo-agri-silos';
  const metal = new THREE.MeshStandardMaterial({ color: 0xdadcda, metalness: .55, roughness: .5 });
  const roof = new THREE.MeshStandardMaterial({ color: 0xb4b8b2, metalness: .6, roughness: .46 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3f4440, metalness: .45, roughness: .6 });
  if (typeof document !== 'undefined' && typeof document.createElementNS === 'function') new THREE.TextureLoader().load('/sompo/gen/metal-silo.webp', map => {
    map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(3, 1.6); map.anisotropy = 8;
    metal.map = map; metal.color.set(0xffffff); metal.needsUpdate = true;
    const roofMap = map.clone(); roofMap.repeat.set(2, .8);
    roof.map = roofMap; roof.color.set(0xd8dcda); roof.needsUpdate = true;
  });
  const cluster = (bx: number, bz: number, scale: number) => {
    const group = new THREE.Group();
    const specs: [number, number, number, number][] = [[0, 0, 2.9, 12.5], [6.4, .8, 2.9, 12.5], [3.2, 5.6, 2.5, 10.2]];
    for (const [x, z, r, h] of specs) {
      const silo = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), metal);
      silo.position.set(x, h / 2, z); silo.castShadow = silo.receiveShadow = true; group.add(silo);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r * 1.08, r * .78, 20), roof);
      cone.position.set(x, h + r * .36, z); cone.castShadow = true; group.add(cone);
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.04, r * 1.1, .6, 20), dark);
      collar.position.set(x, .3, z); group.add(collar);
    }
    const leg = new THREE.Mesh(new THREE.BoxGeometry(1.15, 13.5, 1.15), dark);
    leg.position.set(9.6, 6.75, 2.4); leg.castShadow = true; group.add(leg);
    const head = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.6, 2.2), roof);
    head.position.set(9.6, 14.1, 2.4); head.castShadow = true; group.add(head);
    group.scale.setScalar(scale);
    group.position.set(bx, terrainHeight(bx, bz, slope) - .15, bz);
    group.rotation.y = Math.sin(bx * .37) * .4;
    return group;
  };
  root.add(cluster(-46, -64, 1), cluster(58, -58, .82));
  return root;
}

/** Erva-daninha nas bordas do talhão: o mesmo tufo de lâmina fina do rural,
 * com a rampa sylva (pé escuro → ponta quente) e vento de duas frequências.
 * Tufos baixos dentro do campo leem como invasora entre as fileiras. */
function createEdgeWeeds(ground: (x: number, z: number) => number) {
  const time = { value: 0 }, wind = { value: .65 };
  const geometry = grassTuftGeometry(8, 91);
  const material = new THREE.MeshStandardMaterial({ roughness: 1, side: THREE.DoubleSide });
  material.onBeforeCompile = shader => {
    shader.uniforms.weedTime = time;
    shader.uniforms.weedWind = wind;
    shader.vertexShader = 'uniform float weedTime; uniform float weedWind; attribute float bladeT; varying float vBladeT; varying float vGTone;\n' + shader.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vBladeT = bladeT;
        vGTone = fract(sin(instanceMatrix[3].x * 12.9 + instanceMatrix[3].z * 7.7) * 43758.5453);
        transformed.x += (sin(weedTime * 1.35 + instanceMatrix[3].x * .6) + sin(weedTime * .81 + instanceMatrix[3].z * 1.1) * .6) * position.y * position.y * weedWind * .06;`);
    shader.fragmentShader = 'varying float vBladeT; varying float vGTone;\n' + shader.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 gRamp = mix(vec3(.030,.048,.008), vec3(.11,.17,.028), smoothstep(0., .6, vBladeT));
        gRamp = mix(gRamp, vec3(.26,.40,.068), smoothstep(.4, 1., vBladeT) * (.4 + .6 * vGTone));
        gRamp = mix(gRamp, vec3(.55,.8,.16), smoothstep(.78, 1., vBladeT) * vGTone * .5);
        diffuseColor.rgb = gRamp * (diffuseColor.rgb * 2.3 + .3);`);
  };
  material.customProgramCacheKey = () => 'sompo-agri-weeds-v1';
  const COUNT = 1100;
  const mesh = new THREE.InstancedMesh(geometry, material, COUNT);
  mesh.name = 'sompo-agri-edge-weeds';
  mesh.receiveShadow = true;
  let seed = 713;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const transform = new THREE.Object3D();
  for (let i = 0; i < COUNT; i++) {
    const pick = random();
    // 65% nas duas bordas do talhão (|z| 11.6→15.5); o resto invade entre as
    // fileiras, mais baixo: capim de entressafra, não capim de pasto.
    const edge = pick < .65;
    const side = random() < .5 ? -1 : 1;
    const x = random() * 148 - 74;
    const z = edge ? side * (11.6 + random() * 3.9) : side * (2.5 + random() * 9.2);
    const size = (edge ? .5 + random() * .75 : .3 + random() * .45);
    transform.position.set(x, ground(x, z) - .02, z);
    transform.rotation.set(0, random() * Math.PI, 0);
    transform.scale.set(size, size * (edge ? .6 + random() * .5 : .42 + random() * .35), size);
    transform.updateMatrix();
    mesh.setMatrixAt(i, transform.matrix);
    const dry = random() < .24;
    mesh.setColorAt(i, dry
      ? new THREE.Color().setHSL(.115 + random() * .02, .3 + random() * .14, .3 + random() * .1)
      : new THREE.Color().setHSL(.185 + random() * .06, .24 + random() * .12, .28 + random() * .13));
  }
  return {
    root: mesh,
    update(elapsedMs: number, windStrength: number) { time.value = elapsedMs / 1000; wind.value = windStrength; },
  };
}

/** Camada de névoa baixa sobre o talhão: planos horizontais com fade macio. */
function createGroundFog() {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(0, 0, 256, 64);
    ctx.globalCompositeOperation = 'destination-in';
    const across = ctx.createLinearGradient(0, 0, 256, 0);
    across.addColorStop(0, 'rgba(255,255,255,0)'); across.addColorStop(.18, 'rgba(255,255,255,1)');
    across.addColorStop(.82, 'rgba(255,255,255,1)'); across.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = across; ctx.fillRect(0, 0, 256, 64);
    const along = ctx.createLinearGradient(0, 0, 0, 64);
    along.addColorStop(0, 'rgba(255,255,255,0)'); along.addColorStop(.5, 'rgba(255,255,255,1)');
    along.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = along; ctx.fillRect(0, 0, 256, 64);
  }
  const map = new THREE.CanvasTexture(canvas);
  const root = new THREE.Group(); root.name = 'sompo-agri-groundfog';
  const layers: THREE.Mesh[] = [];
  const spots: [number, number, number, number][] = [[-30, -10, 120, 46], [34, -4, 110, 40], [-8, 12, 96, 36]];
  spots.forEach(([x, z, w, d], i) => {
    const material = new THREE.MeshBasicMaterial({
      map, transparent: true, depthWrite: false, opacity: .075 - i * .02,
      color: 0xf3e9d4, fog: false, side: THREE.DoubleSide,
    });
    const layer = new THREE.Mesh(new THREE.PlaneGeometry(w, d), material);
    layer.geometry.rotateX(-Math.PI / 2);
    layer.position.set(x, 1.1 + i * 1.1, z);
    layer.userData.drift = { x, speed: .5 + i * .31 };
    root.add(layer); layers.push(layer);
  });
  return { root, layers };
}

/** Galpão de máquinas com o lado da câmera aberto: pilares e telhado sem
 * parede, para a manobra continuar visível quando o trator entra de ré.
 * Eixo local: -x é a fachada da porta (virada para +x mundo após o giro do
 * palco), +z é a parede do fundo (longe da câmera). */
function createBarn() {
  const root = new THREE.Group();
  root.name = 'sompo-agri-barn';
  root.position.set(4, 0, 0);
  const steel = new THREE.MeshStandardMaterial({ color: 0x4d5556, metalness: 0.62, roughness: 0.52 });
  const siding = new THREE.MeshStandardMaterial({ color: 0x8c3d2d, metalness: 0.28, roughness: 0.72 });
  const roof = new THREE.MeshStandardMaterial({ color: 0x8d9895, metalness: 0.72, roughness: 0.42 });
  const timber = new THREE.MeshStandardMaterial({ color: 0x6b5138, metalness: 0.05, roughness: 0.85 });
  const straw = new THREE.MeshStandardMaterial({ color: 0xa98f4e, roughness: 0.95 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x5c4a33, roughness: 1 });
  const D = 6, W = 5.5, H = 5.1;
  // Lado -z (câmera): vão livre com pilares a cada 3 m e longarina no topo.
  for (const x of [-6, -3, 0, 3, 6]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.26, H, 0.26), steel);
    post.position.set(x, H / 2, -W);
    post.castShadow = true;
    root.add(post);
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(12.4, 0.22, 0.22), steel);
  rail.position.set(0, H - 0.25, -W);
  root.add(rail);
  // Lado +z: parede inteiriça, fundo da cena para a silhueta da máquina.
  const farWall = new THREE.Mesh(new THREE.BoxGeometry(12.4, H, 0.18), siding);
  farWall.position.set(0, H / 2, W);
  farWall.castShadow = farWall.receiveShadow = true;
  root.add(farWall);
  // Fundo +x: parede inteiriça.
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.18, H, 11.2), siding);
  back.position.set(D, H / 2, 0);
  back.castShadow = back.receiveShadow = true;
  root.add(back);
  // Fachada -x: vão de 5 m entre as ombreiras; folga lateral mínima na entrada.
  const entryA = new THREE.Mesh(new THREE.BoxGeometry(0.18, H, 4.0), siding);
  entryA.position.set(-D, H / 2, -3.5);
  entryA.castShadow = entryA.receiveShadow = true;
  root.add(entryA);
  const entryB = new THREE.Mesh(new THREE.BoxGeometry(0.18, H, 2.0), siding);
  entryB.position.set(-D, H / 2, 4.5);
  entryB.castShadow = entryB.receiveShadow = true;
  root.add(entryB);
  for (const z of [-1.5, 3.5]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.3, H, 0.3), timber);
    jamb.position.set(-D, H / 2, z);
    jamb.castShadow = true;
    root.add(jamb);
  }
  const roofMesh = new THREE.Mesh(new THREE.BoxGeometry(12.9, 0.18, 11.9), roof);
  roofMesh.position.set(0, H + 0.02, 0);
  roofMesh.rotation.z = -0.05;
  roofMesh.castShadow = true;
  root.add(roofMesh);
  // Piso socado do galpão: mais escuro que o talhão ao redor.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12.2, 11.2), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.04;
  floor.receiveShadow = true;
  root.add(floor);
  // Fardos junto à parede do fundo e tambores no canto: leitura de galpão apertado.
  for (const [bx, bz, by] of [[-1.5, 4.35, 0.55], [-0.2, 4.45, 0.55], [-0.85, 4.4, 1.55], [4.3, 4.4, 0.55]]) {
    const bale = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.05, 1.15), straw);
    bale.position.set(bx, by, bz);
    bale.rotation.y = bx * 0.4;
    bale.castShadow = bale.receiveShadow = true;
    root.add(bale);
  }
  for (const [bx, bz] of [[4.9, -3.9], [5.35, -3.35]]) {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.92, 14), steel);
    drum.position.set(bx, 0.46, bz);
    drum.castShadow = true;
    root.add(drum);
  }
  // Pilar de balanço interno: o palco posiciona no ponto onde a ponta do
  // implemento varre; no desfecho de contato é nele que a máquina engancha.
  const barnPost = new THREE.Group();
  barnPost.name = 'sompo-agri-barn-post';
  const postMesh = new THREE.Mesh(new THREE.BoxGeometry(0.32, 5.0, 0.32), timber);
  postMesh.position.y = 2.5;
  postMesh.castShadow = true;
  const postShoe = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.18, 0.56), steel);
  postShoe.position.y = 0.09;
  barnPost.add(postMesh, postShoe);
  return { root, barnPost };
}

function dustMap() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const fade = ctx.createRadialGradient(32,32,0,32,32,32);
    fade.addColorStop(0,'rgba(255,255,255,.6)');fade.addColorStop(.45,'rgba(255,255,255,.24)');fade.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=fade;ctx.fillRect(0,0,64,64);
  }
  return new THREE.CanvasTexture(canvas);
}

/** Pontos com alfa por partícula: base da poeira, da lama e da fumaça. */
function createParticleCloud(count: number, size: number, color: number, twoTone = false) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const alpha = new THREE.BufferAttribute(new Float32Array(count), 1);
  geometry.setAttribute('particleAlpha', alpha);
  if (twoTone) {
    const colors = new Float32Array(count * 3);
    const dark = new THREE.Color(color).multiplyScalar(.72), light = new THREE.Color(color).multiplyScalar(1.24);
    for (let i = 0; i < count; i += 1) {
      const tone = dark.clone().lerp(light, (i % 6) / 5);
      colors.set([tone.r, tone.g, tone.b], i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  const material = new THREE.PointsMaterial({ color: twoTone ? 0xffffff : color, size, map: dustMap(), transparent: true, opacity: 0, depthWrite: false, vertexColors: twoTone });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute float particleAlpha; varying float dustAlpha;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ndustAlpha=particleAlpha;');
    shader.fragmentShader = 'varying float dustAlpha;\n' + shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= dustAlpha;');
  };
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

function createDust() {
  const dust = createParticleCloud(260, 2.0, 0xcbb287, true);
  dust.name = 'sompo-agri-dust';
  return dust;
}

/** Torrões de lama ejetados pelas rodas que patinam: balísticos e curtos. */
function createMudSpray() {
  const spray = createParticleCloud(130, 0.85, 0x55432c);
  spray.name = 'sompo-agri-mudspray';
  return spray;
}

/** Fumaça do escapamento sob carga: escura, sobe rápido e dispersa. */
function createExhaust() {
  const exhaust = createParticleCloud(70, 1.0, 0x39332b);
  exhaust.name = 'sompo-agri-exhaust';
  return exhaust;
}

/** Sulcos encharcados deixados pelas rodas no trecho atolado. */
function createRuts() {
  const material = new THREE.MeshStandardMaterial({ color: 0x2e241a, roughness: .38, metalness: 0, transparent: true, opacity: 0 });
  const root = new THREE.Group(); root.name = 'sompo-agri-ruts';
  for (const side of [-1, 1]) {
    const rut = new THREE.Mesh(new THREE.PlaneGeometry(15, 0.62, 30, 1), material);
    rut.geometry.rotateX(-Math.PI / 2);
    rut.position.z = side * 0.84;
    rut.receiveShadow = true;
    root.add(rut);
  }
  return { root, material };
}

export function createSompoAgriScene(parent: THREE.Group, environmentId: SompoAgriEnvironmentId, compact = false, equipmentId: 'tractor' | 'harvester' = 'harvester') {
  const definition = SOMPO_AGRI_ENVIRONMENTS[environmentId] || SOMPO_AGRI_ENVIRONMENTS['row-crop-field'];
  const root = new THREE.Group();
  root.name = `sompo-agri-environment-${environmentId}`;
  const terrain = createTerrain(definition);
  root.add(terrain);
  const operation = environmentId === 'geofence-operacao';
  const crops = definition.barn ? null : createSompoCropRows((x,z)=>terrainHeight(x,z,definition.slope,(definition as { relief?: (x: number, z: number) => number }).relief), compact, equipmentId === 'tractor' ? .32 : 1, operation);
  if (crops) root.add(crops.root);
  const weeds = definition.barn ? null : createEdgeWeeds((x, z) => terrainHeight(x, z, definition.slope, (definition as { relief?: (x: number, z: number) => number }).relief));
  if (weeds) root.add(weeds.root);
  const barn = definition.barn || operation ? createBarn() : null;
  if (barn) root.add(barn.root, barn.barnPost);
  if (operation && barn) {
    barn.root.scale.set(14 / 12.9, 1, 8 / 11.9);
    barn.root.position.set(60, terrainHeight(60, -55, 0, geofenceOperacaoRelief), -55);
    barn.barnPost.position.copy(barn.root.position);
  }
  const silos = createSilos(definition.slope); root.add(silos);
  if (operation) for (const cluster of silos.children) {
    cluster.position.z -= 25; // libera o footprint do galpão mapeado
    cluster.position.y = terrainHeight(cluster.position.x, cluster.position.z, 0, geofenceOperacaoRelief) - 0.15;
  }
  // Névoa baixa é do talhão aberto: dentro do galpão as faixas horizontais
  // atravessavam as paredes (bug reportado pela frente agri-máquina).
  const groundFog = definition.barn ? null : createGroundFog();
  if (groundFog) { root.add(groundFog.root); groundFog.root.visible = !definition.night; }

  const mud = new THREE.Mesh(
    new THREE.CircleGeometry(8, 40),
    new THREE.MeshStandardMaterial({ color: 0x38291c, roughness: 0.55, metalness: 0 }),
  );
  mud.name = 'sompo-agri-mud';
  mud.geometry.rotateX(-Math.PI / 2);
  const mudPositions = mud.geometry.attributes.position;
  for (let i=1;i<mudPositions.count;i++) { const f=1+Math.sin(i*2.3)*.09; mudPositions.setX(i,mudPositions.getX(i)*f);mudPositions.setZ(i,mudPositions.getZ(i)*f*.65); }
  // Lâmina d'água parada no centro do trecho saturado. O branco baixo é o que
  // diferencia solo úmido de solo encharcado.
  const puddle = new THREE.Mesh(
    new THREE.CircleGeometry(3.4, 32),
    new THREE.MeshStandardMaterial({ color: 0x1f1913, roughness: 0.18, metalness: 0, envMapIntensity: 0.45, transparent: true, opacity: 0.85 }),
  );
  puddle.name = 'sompo-agri-puddle';
  puddle.geometry.rotateX(-Math.PI / 2);
  const ruts = createRuts();
  root.add(ruts.root);
  function placeMud(x: number) {
    mud.position.x=x;
    for(let i=0;i<mudPositions.count;i++) mudPositions.setY(i,terrainHeight(x+mudPositions.getX(i),mudPositions.getZ(i),definition.slope,(definition as { relief?: (x: number, z: number) => number }).relief)+.025);
    mudPositions.needsUpdate=true;mud.geometry.computeVertexNormals();
    puddle.position.set(x - 1.5, 0, 0);
    const pp = puddle.geometry.attributes.position;
    for (let i = 0; i < pp.count; i += 1) pp.setY(i, terrainHeight(puddle.position.x + pp.getX(i), pp.getZ(i), definition.slope, (definition as { relief?: (x: number, z: number) => number }).relief) + .045);
    pp.needsUpdate = true; puddle.geometry.computeVertexNormals();
    // Os sulcos terminam onde o avanço parou e voltam pela trilha de entrada.
    ruts.root.position.set(x - 7.6, 0, 0);
    ruts.root.traverse(node => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      const rp = mesh.geometry.attributes.position;
      for (let i = 0; i < rp.count; i += 1) rp.setY(i, terrainHeight(ruts.root.position.x + rp.getX(i), mesh.position.z + rp.getZ(i), definition.slope, (definition as { relief?: (x: number, z: number) => number }).relief) + .02);
      rp.needsUpdate = true; mesh.geometry.computeVertexNormals();
    });
  }
  placeMud(2);
  mud.visible = definition.mud > 0;
  puddle.visible = definition.mud > 0;
  ruts.root.visible = definition.mud > 0;
  mud.receiveShadow = true;
  root.add(mud, puddle);

  const dust = createDust();
  const mudSpray = createMudSpray();
  const exhaust = createExhaust();
  root.add(dust, mudSpray, exhaust);
  if (definition.night) {
    // À noite a poeira só aparece onde a luz bate: vertexColors assado mais escuro.
    const dc = dust.geometry.attributes.color;
    for (let i = 0; i < dc.count; i += 1) dc.setXYZ(i, dc.getX(i) * .3, dc.getY(i) * .28, dc.getZ(i) * .24);
  }
  const ambient = new THREE.HemisphereLight(definition.sky, 0x30291d, definition.night ? 0.32 : 0.7);
  const sun = new THREE.DirectionalLight(definition.night ? 0x91b4dd : 0xfff1cf, definition.night ? 0.6 : 2.1);
  sun.position.set(-24, 34, 18);
  sun.castShadow = true;
  root.add(ambient, sun, sun.target);
  parent.add(root);

  return {
    root, terrain, mud, sun, placeMud,
    barnPost: barn?.barnPost,
    setHarvestPath(points: readonly { x: number; z: number; atMs?: number; yaw?: number; harvesting?: boolean }[]) { crops?.setHarvestPath(points); },
    groundHeight(x: number, z: number) {
      return terrainHeight(x, z, definition.slope, (definition as { relief?: (x: number, z: number) => number }).relief);
    },
    update(frame: SompoAgriVisualFrame, machinePosition = new THREE.Vector3(), cameraPosition = new THREE.Vector3(), reducedMotion = false, wind = 0.65, elapsedMs = frame.atMs) {
      crops?.update(elapsedMs, cameraPosition, reducedMotion, wind, machinePosition, frame.equipmentId === 'harvester' ? frame.cropCut : 0);
      weeds?.update(reducedMotion ? 0 : elapsedMs, wind);
      const yaw = THREE.MathUtils.degToRad(frame.yaw);
      const seconds = elapsedMs / 1000;
      const wheelKph = frame.wheelSpeedKph ?? frame.speedKph;
      // Patinagem real: perímetro da roda corre mais que o chão. É o que ejeta
      // lama e queima embreagem, e o que faz a fumaça sair preta.
      const slip = Math.max(0, Math.abs(wheelKph) - Math.abs(frame.speedKph));
      const eject = Math.min(1, frame.mud * slip / 9);
      const load = Math.min(1, frame.roughness * .18 + slip * .06 + frame.headerSpeed * .28);
      for (const cloud of [dust, mudSpray, exhaust]) {
        cloud.position.copy(machinePosition);
        cloud.rotation.y = yaw;
      }
      const material = dust.material as THREE.PointsMaterial;
      material.opacity = Math.min(0.6, Math.max(0, frame.dust) * 0.5);
      dust.visible = material.opacity > 0.01;
      const sprayMaterial = mudSpray.material as THREE.PointsMaterial;
      sprayMaterial.opacity = eject;
      mudSpray.visible = eject > 0.02 && !reducedMotion;
      const exhaustMaterial = exhaust.material as THREE.PointsMaterial;
      exhaustMaterial.opacity = Math.min(0.6, load * .55);
      exhaust.visible = load > 0.04 && !reducedMotion;
      ruts.material.opacity = Math.min(0.85, frame.sink * 1.7 + frame.mud * 0.12);

      // Deriva lenta da névoa baixa: cada camada flutua no próprio compasso.
      if (!reducedMotion && groundFog) for (const layer of groundFog.layers) {
        const d = layer.userData.drift;
        layer.position.x = d.x + Math.sin(elapsedMs * 0.000045 * d.speed + d.x) * 5;
      }

      if (reducedMotion) dust.visible = false;
      if (dust.visible && !reducedMotion) {
        const p = dust.geometry.attributes.position, alpha = dust.geometry.attributes.particleAlpha;
        // A nuvem nasce na traseira (picador) e na plataforma: a máquina sai da
        // própria poeira, que fica para trás subindo e alastrando com o vento.
        const tail = frame.equipmentId === 'harvester' ? 3.7 : 2.1;
        const groundSpeed = Math.abs(frame.speedKph) / 3.6;
        for (let i = 0; i < p.count; i++) {
          if (i < 30 && frame.equipmentId === 'harvester') {
            // Pufes do mecanismo de corte: baixos, curtos, engolidos pela nuvem.
            const life = 1.1 + (i % 4) * .2;
            const age = (seconds + i * .137) % life;
            const progress = age / life;
            p.setXYZ(i, frame.direction * (4.1 - age * (groundSpeed + .8)),
              .28 + age * .55,
              Math.sin(i * 2.399963) * (.7 + age * .4) + age * wind * .2);
            alpha.setX(i, Math.sin(Math.PI * progress) * .35);
            continue;
          }
          const life = 2.4 + (i % 7) * .4;
          const age = (seconds + i * .137) % life;
          const progress = age / life;
          p.setXYZ(i,
            -frame.direction * (tail * (.55 + (i % 5) * .11) + age * (1.6 + groundSpeed * .55)),
            .22 + age * (1.0 + (i % 6) * .2),
            Math.sin(i * 2.399963) * (.7 + age * 1.4) + age * wind * .5);
          alpha.setX(i, Math.pow(Math.sin(Math.PI * progress), .7) * (.45 + (i % 3) * .2));
        }
        p.needsUpdate = alpha.needsUpdate = true;
      }

      if (mudSpray.visible) {
        const p = mudSpray.geometry.attributes.position, alpha = mudSpray.geometry.attributes.particleAlpha;
        for (let i = 0; i < p.count; i++) {
          const life = .5 + (i % 4) * .14;
          const age = (seconds + i * .083) % life;
          const progress = age / life;
          const side = (i % 2) * 2 - 1;
          const vx = -frame.direction * (2.6 + (i % 5) * 1.1);
          const vy = 2.4 + (i % 4) * .8;
          const y = .12 + vy * age - 4.9 * age * age;
          p.setXYZ(i, -.16 + (i % 3) * .1 + vx * age, Math.max(.015, y), side * (.84 + (i % 7) * .03) + side * (.3 + (i % 3) * .35) * age);
          alpha.setX(i, y <= .015 ? 0 : (1 - progress) * .95);
        }
        p.needsUpdate = alpha.needsUpdate = true;
      }

      if (exhaust.visible) {
        const p = exhaust.geometry.attributes.position, alpha = exhaust.geometry.attributes.particleAlpha;
        const ox = frame.equipmentId === 'harvester' ? -1.2 : 0.02;
        const oy = frame.equipmentId === 'harvester' ? 3.35 : 3.34;
        const oz = frame.equipmentId === 'harvester' ? -0.5 : 0.08;
        for (let i = 0; i < p.count; i++) {
          const life = .55 + (i % 5) * .22;
          const age = (seconds + i * .11) % life;
          const progress = age / life;
          p.setXYZ(i,
            ox - frame.direction * age * (Math.abs(frame.speedKph) / 3.6 * .4 + .35) + Math.sin(i * 3.1 + age * 4) * .14,
            oy + age * (1.05 + (i % 4) * .25),
            oz + age * wind * .3 + Math.cos(i * 2.7 + age * 3) * .16);
          alpha.setX(i, Math.sin(Math.PI * progress) * .4);
        }
        p.needsUpdate = alpha.needsUpdate = true;
      }

    },
    dispose() {
      root.removeFromParent();
      crops?.dispose();
      disposeSompoObject(root);
    },
  };
}
