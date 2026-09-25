import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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
function createSilos(ground: (x: number, z: number) => number, shiftZ = 0) {
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
  const concrete = new THREE.MeshStandardMaterial({ color: 0x9d988c, roughness: .95 });
  const rail = new THREE.MeshStandardMaterial({ color: 0x5c615d, metalness: .6, roughness: .45, side: THREE.DoubleSide });
  // Anéis de chapa: um cilindro fino por anel lê como a costura parafusada
  // entre as chapas curvas, que é o que dá escala de 12 m ao silo.
  const cluster = (bx: number, bz: number, scale: number) => {
    const group = new THREE.Group();
    const specs: [number, number, number, number][] = [[0, 0, 2.9, 12.5], [6.4, .8, 2.9, 12.5], [3.2, 5.6, 2.5, 10.2]];
    const ring = new THREE.CylinderGeometry(1, 1, .09, 24, 1, true);
    for (const [x, z, r, h] of specs) {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.12, r * 1.16, .7, 24), concrete);
      base.position.set(x, .2, z); base.receiveShadow = true; group.add(base);
      const silo = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24), metal);
      silo.position.set(x, .55 + h / 2, z); silo.castShadow = silo.receiveShadow = true; group.add(silo);
      for (let y = 1.6; y < h; y += 1.12) {
        const seam = new THREE.Mesh(ring, dark);
        seam.scale.set(r * 1.006, 1, r * 1.006); seam.position.set(x, .55 + y, z); group.add(seam);
      }
      // Telhado baixo de silo de grão (~30°), com respiro no topo.
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r * 1.07, r * .6, 24), roof);
      cone.position.set(x, .55 + h + r * .3, z); cone.castShadow = true; group.add(cone);
      const vent = new THREE.Mesh(new THREE.CylinderGeometry(.32, .42, .5, 10), dark);
      vent.position.set(x, .55 + h + r * .6 + .2, z); group.add(vent);
      // Escada marinheiro com guarda-corpo na face voltada para a câmera.
      const ladder = new THREE.Mesh(new THREE.BoxGeometry(.5, h, .08), rail);
      ladder.position.set(x - r * .7, .55 + h / 2, z + r * .72); ladder.rotation.y = -Math.PI / 4; group.add(ladder);
      const cage = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, h * .8, 8, 1, true), rail);
      cage.position.set(x - r * .78, .55 + h * .58, z + r * .8); group.add(cage);
    }
    // Passarela no topo ligando os silos ao elevador.
    const walk = new THREE.Mesh(new THREE.BoxGeometry(11.5, .18, .9), rail);
    walk.position.set(4.8, 14.2, 1.6); walk.rotation.y = .08; walk.castShadow = true; group.add(walk);
    // Elevador de canecas: torre em treliça (quatro montantes + travamentos) com
    // a cabeça do elevador e a bica descendo para cada silo.
    const tower = new THREE.Group();
    for (const [ox, oz] of [[-.55, -.55], [.55, -.55], [-.55, .55], [.55, .55]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(.14, 16, .14), dark);
      post.position.set(ox, 8, oz); post.castShadow = true; tower.add(post);
    }
    for (let y = 1; y < 16; y += 1.6) for (const [w, d, ox, oz] of [[1.2, .08, 0, -.55], [1.2, .08, 0, .55], [.08, 1.2, -.55, 0], [.08, 1.2, .55, 0]]) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(w, .08, d), dark);
      brace.position.set(ox, y, oz); tower.add(brace);
    }
    const leg = new THREE.Mesh(new THREE.BoxGeometry(.6, 17, .6), metal);
    leg.position.y = 8.5; leg.castShadow = true; tower.add(leg);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.6, 1.6), roof);
    head.position.y = 17.4; head.castShadow = true; tower.add(head);
    tower.position.set(9.8, 0, 2.6); group.add(tower);
    for (const [x, z, r, h] of specs) {
      const from = new THREE.Vector3(9.8, 17, 2.6), to = new THREE.Vector3(x, .55 + h + r * .55, z);
      const spout = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, from.distanceTo(to), 8), metal);
      spout.position.copy(from).add(to).multiplyScalar(.5);
      spout.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
      group.add(spout);
    }
    // Moega e secador baixo ao pé do elevador: o complexo de armazenagem.
    const dryer = new THREE.Mesh(new THREE.BoxGeometry(2.4, 6.5, 2.4), roof);
    dryer.position.set(12.6, 3.25, 5.2); dryer.castShadow = dryer.receiveShadow = true; group.add(dryer);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(18, .25, 12), concrete);
    pad.position.set(5.5, 0, 2.6); pad.receiveShadow = true; group.add(pad);
    ring.dispose();
    group.scale.setScalar(scale);
    group.position.set(bx, ground(bx, bz + shiftZ) - .15, bz + shiftZ);
    group.rotation.y = Math.sin(bx * .37) * .4;
    return group;
  };
  root.add(cluster(-46, -64, 1), cluster(58, -58, .82));
  // ~150 peças viram uma malha por material: o detalhe não custa draw call.
  mergeByMaterial(root);
  return root;
}

/** Funde todas as malhas estáticas de `root` numa malha por material+sombra. */
function mergeByMaterial(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const buckets = new Map<string, { material: THREE.Material; shadow: boolean; parts: THREE.BufferGeometry[] }>();
  const meshes: THREE.Mesh[] = [];
  root.traverse(node => { if (node instanceof THREE.Mesh && !(node instanceof THREE.InstancedMesh)) meshes.push(node); });
  const sources = new Set<THREE.BufferGeometry>();
  for (const mesh of meshes) {
    const material = mesh.material as THREE.Material;
    const key = `${material.uuid}:${mesh.castShadow}`;
    const bucket = buckets.get(key) ?? { material, shadow: mesh.castShadow, parts: [] };
    const part = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    part.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
    for (const name of Object.keys(part.attributes)) if (!['position', 'normal', 'uv'].includes(name)) part.deleteAttribute(name);
    bucket.parts.push(part); buckets.set(key, bucket);
    sources.add(mesh.geometry);
  }
  for (const mesh of meshes) mesh.removeFromParent();
  for (const child of [...root.children]) if (child.children.length === 0 && !(child instanceof THREE.Mesh)) child.removeFromParent();
  sources.forEach(geometry => geometry.dispose());
  for (const { material, shadow, parts } of buckets.values()) {
    const merged = mergeGeometries(parts);
    parts.forEach(part => part.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = shadow; mesh.receiveShadow = true;
    root.add(mesh);
  }
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

/**
 * Borda da fazenda: capões de cerrado nas grotas e no alto do anel de morro e
 * um quebra-vento de eucalipto em fileira na divisa do talhão vizinho. Sem
 * isso o horizonte era um morro verde liso sem escala. Cartões cruzados com o
 * billboard gerado de cada espécie, um InstancedMesh por espécie (2 draw
 * calls), pé escurecido no shader (contato com o chão sem sombra extra) e tom
 * por árvore para o capão não ler como carimbo.
 */
function createTreeLine(ground: (x: number, z: number) => number, night: boolean, compact: boolean) {
  const root = new THREE.Group(); root.name = 'sompo-agri-treeline';
  if (typeof document === 'undefined' || typeof document.createElementNS !== 'function') return { root, dispose() {} };
  let seed = 4099;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const card = new THREE.PlaneGeometry(1, 1); card.translate(0, .5, 0);
  const cross = mergeGeometries([card.clone(), card.clone().rotateY(Math.PI / 2), card.clone().rotateY(Math.PI / 4)], false)!;
  card.dispose();
  const textures: THREE.Texture[] = [];
  const materials: THREE.Material[] = [];
  const species = (asset: string, slots: { x: number; z: number; h: number; w: number }[], tint: number) => {
    const map = new THREE.TextureLoader().load(`/models/sompo/${asset}-billboard.webp`);
    map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; textures.push(map);
    const material = new THREE.MeshLambertMaterial({ map, alphaTest: .42, alphaToCoverage: true, side: THREE.DoubleSide, color: tint });
    material.onBeforeCompile = shader => {
      shader.vertexShader = 'varying float treeFoot; varying float treeTone;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        treeFoot = position.y;
        treeTone = fract(sin(instanceMatrix[3].x * 12.9898 + instanceMatrix[3].z * 78.233) * 43758.5453);`);
      shader.fragmentShader = 'varying float treeFoot; varying float treeTone;\n' + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        // Copa pega luz por cima, pé fica na sombra da própria mata.
        diffuseColor.rgb *= mix(.42, 1.0, smoothstep(.02, .45, treeFoot));
        diffuseColor.rgb *= mix(vec3(.86, .92, .8), vec3(1.1, 1.04, .9), treeTone);`);
    };
    material.customProgramCacheKey = () => 'sompo-agri-treeline-v1';
    materials.push(material);
    const mesh = new THREE.InstancedMesh(cross, material, slots.length);
    mesh.name = `sompo-agri-treeline-${asset}`;
    const transform = new THREE.Object3D();
    slots.forEach((slot, i) => {
      transform.position.set(slot.x, ground(slot.x, slot.z) - .25, slot.z);
      transform.rotation.set(0, random() * Math.PI, 0);
      transform.scale.set(slot.w, slot.h, slot.w);
      transform.updateMatrix(); mesh.setMatrixAt(i, transform.matrix);
    });
    mesh.computeBoundingSphere();
    root.add(mesh);
  };
  // Capões: aglomerados irregulares no anel do relevo (onde o terreno sobe),
  // nunca dentro do talhão da cena (|z|<24, |x|<90).
  const cerrado: { x: number; z: number; h: number; w: number }[] = [];
  const groves: [number, number, number, number][] = [
    [-120, -78, 16, 14], [-38, -92, 22, 18], [70, -86, 18, 15], [132, -60, 12, 9], [-140, 40, 14, 10],
    [118, 66, 16, 11], [-60, 88, 18, 12], [24, 96, 12, 8], [-128, -20, 10, 6], [138, 8, 10, 6],
  ];
  for (const [cx, cz, radius, count] of groves) {
    const n = compact ? Math.ceil(count * .6) : count;
    for (let i = 0; i < n; i++) {
      const a = random() * Math.PI * 2, r = radius * Math.sqrt(random());
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r * .7;
      if (Math.abs(z) < 24 && Math.abs(x) < 90) continue;
      const h = 7.5 + random() * 6.5;
      cerrado.push({ x, z, h, w: h * (.72 + random() * .22) });
    }
  }
  species('generated-cerrado', cerrado, night ? 0x5d6a6e : 0xb9b9a0);
  // Quebra-vento: fileira reta de eucalipto na crista atrás dos silos, com
  // falhas; fica atrás deles (z −64) para não esconder a assinatura do fundo.
  const eucalyptus: { x: number; z: number; h: number; w: number }[] = [];
  for (let x = -118; x < 124; x += compact ? 4.4 : 3.1) {
    if (random() < .08) continue;
    const h = 15 + random() * 6;
    eucalyptus.push({ x: x + (random() - .5) * 1.2, z: -99 + Math.sin(x * .021) * 3 + (random() - .5) * 1.4, h, w: h * .42 });
  }
  species('generated-eucalyptus', eucalyptus, night ? 0x57625f : 0xaab0a0);
  return {
    root,
    dispose() { cross.dispose(); textures.forEach(t => t.dispose()); materials.forEach(m => m.dispose()); },
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

/** UV em metros para BoxGeometry: uma textura com repeat 1 cobre `tile` metros
 * em qualquer face, e as nervuras ficam na mesma escala em todas as chapas. */
function tileBoxUv(geometry: THREE.BoxGeometry, tile: number) {
  const { width: w, height: h, depth: d } = geometry.parameters;
  const spans: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  const uv = geometry.attributes.uv;
  for (let face = 0; face < 6; face++) for (let i = face * 4; i < face * 4 + 4; i++) {
    uv.setXY(i, uv.getX(i) * spans[face][0] / tile, uv.getY(i) * spans[face][1] / tile);
  }
  uv.needsUpdate = true;
  return geometry;
}

/** Galpão de máquinas com o lado da câmera aberto: pilares, tesouras e
 * telhado de duas águas em zinco, sem parede, para a manobra continuar
 * visível quando o trator entra de ré. Tapume de chapa nervurada pintada,
 * acabamento branco e porta de correr aberta ao lado do vão.
 * Eixo local: -x é a fachada da porta (virada para +x mundo após o giro do
 * palco), +z é a parede do fundo (longe da câmera). A planta (paredes,
 * vão de 5 m e pilar de balanço) é a mesma usada pela física da manobra. */
function createBarn() {
  const root = new THREE.Group();
  root.name = 'sompo-agri-barn';
  root.position.set(4, 0, 0);
  const steel = new THREE.MeshStandardMaterial({ color: 0x4d5556, metalness: 0.62, roughness: 0.52 });
  // Vermelho de galpão velho: desbotado pelo sol, não vermelho de brinquedo.
  const siding = new THREE.MeshStandardMaterial({ color: 0x7c4538, metalness: 0.12, roughness: 0.74, side: THREE.DoubleSide });
  const roof = new THREE.MeshStandardMaterial({ color: 0xa3aba8, metalness: 0.7, roughness: 0.4 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xe6e1d3, metalness: 0.08, roughness: 0.62 });
  const timber = new THREE.MeshStandardMaterial({ color: 0x6b5138, metalness: 0.05, roughness: 0.85 });
  const straw = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  const strawMap = baleTexture();
  if (strawMap) { straw.map = strawMap; straw.bumpMap = strawMap; straw.bumpScale = 3; } else straw.color.set(0x9a8454);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x5c4a33, roughness: 1 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0x9a968c, roughness: 0.92 });
  if (typeof document !== 'undefined' && typeof document.createElementNS === 'function') {
    const loader = new THREE.TextureLoader();
    // Chapa branca nervurada do baú girada 90°: nervura vertical tingida pelo vermelho do tapume.
    loader.load('/sompo/gen/r10-corrugation.webp', map => {
      map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.center.set(0.5, 0.5); map.rotation = Math.PI / 2; map.anisotropy = 8;
      siding.map = map; siding.bumpMap = map; siding.bumpScale = 2.2; siding.needsUpdate = true;
    });
    // Zinco galvanizado do silo: nervuras descendo a água do telhado.
    loader.load('/sompo/gen/metal-silo.webp', map => {
      map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 8;
      roof.map = map; roof.bumpMap = map; roof.bumpScale = 1.6; roof.color.set(0xe2e6e4); roof.needsUpdate = true;
    });
  }
  const TILE = 3;
  const box = (w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number, shadow = true) => {
    const mesh = new THREE.Mesh(tileBoxUv(new THREE.BoxGeometry(w, h, d), TILE), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow; mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const D = 6, W = 5.5, H = 5.1, RISE = 1.7, EAVE = 0.55;
  // Lado -z (câmera): vão livre com pilares a cada 3 m e longarina no topo.
  for (const x of [-6, -3, 0, 3, 6]) box(0.26, H, 0.26, steel, x, H / 2, -W);
  box(12.4, 0.22, 0.22, steel, 0, H - 0.25, -W, false);
  // Lado +z: parede inteiriça, fundo da cena para a silhueta da máquina.
  box(12.4, H, 0.18, siding, 0, H / 2, W);
  // Fundo +x: parede inteiriça.
  box(0.18, H, 11.2, siding, D, H / 2, 0);
  // Fachada -x: vão de 5 m entre as ombreiras; folga lateral mínima na entrada.
  box(0.18, H, 4.0, siding, -D, H / 2, -3.5);
  box(0.18, H, 2.0, siding, -D, H / 2, 4.5);
  // Verga do vão: 4,3 m livres, acima da cabine com giroflex.
  const DOOR_TOP = 4.3;
  box(0.18, H - DOOR_TOP, 5.0, siding, -D, (H + DOOR_TOP) / 2, 1.0);
  for (const z of [-1.5, 3.5]) box(0.3, DOOR_TOP, 0.3, timber, -D, DOOR_TOP / 2, z);
  // Oitões: triângulo de tapume sob as duas águas nas fachadas ±x.
  const gableShape = new THREE.Shape([new THREE.Vector2(-W, 0), new THREE.Vector2(W, 0), new THREE.Vector2(0, RISE)]);
  const gableGeometry = new THREE.ShapeGeometry(gableShape);
  const gableUv = gableGeometry.attributes.uv;
  for (let i = 0; i < gableUv.count; i++) gableUv.setXY(i, gableUv.getX(i) / TILE, gableUv.getY(i) / TILE);
  for (const x of [-D, D]) {
    const gable = new THREE.Mesh(gableGeometry, siding);
    gable.position.set(x, H, 0); gable.rotation.y = Math.PI / 2;
    gable.castShadow = gable.receiveShadow = true;
    root.add(gable);
  }
  // Duas águas com beiral: cumeeira em x, a água -z desce até a longarina do vão.
  const pitch = Math.atan2(RISE, W);
  const run = W + EAVE, slope = run / Math.cos(pitch);
  for (const side of [-1, 1]) {
    const panel = box(13.4, 0.07, slope, roof, 0, H + RISE - (run / 2) * Math.tan(pitch) + 0.06, side * run / 2);
    panel.rotation.x = side * pitch;
    // Rufo do beiral e calha no lado da câmera.
    const fascia = box(13.4, 0.2, 0.06, trim, 0, H - EAVE * Math.tan(pitch) - 0.02, side * (run + 0.02), false);
    if (side < 0) {
      const gutter = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 13.4, 10, 1, true, 0, Math.PI), steel);
      gutter.rotation.set(0, 0, Math.PI / 2); gutter.rotation.order = 'ZXY';
      gutter.position.set(0, fascia.position.y - 0.1, fascia.position.z - 0.08);
      root.add(gutter);
      box(0.1, H - 0.2, 0.1, steel, D + 0.3, (H - 0.2) / 2, -run, false);
    }
  }
  box(13.5, 0.14, 0.34, roof, 0, H + RISE + 0.1, 0);
  // Tesouras sobre cada pilar: pernas na água e tirante na altura do beiral.
  for (const x of [-4.5, -1.5, 1.5, 4.5]) {
    for (const side of [-1, 1]) {
      const leg = box(0.12, 0.2, W / Math.cos(pitch), steel, x, H + RISE / 2 - 0.08, side * W / 2, false);
      leg.rotation.x = side * pitch;
    }
    box(0.1, 0.12, W * 2, steel, x, H - 0.06, 0, false);
    box(0.09, RISE - 0.1, 0.09, steel, x, H + (RISE - 0.1) / 2, 0, false);
  }
  // Acabamento branco: cantoneiras, testeiras dos oitões e moldura do vão.
  for (const [x, z] of [[-D, W], [D, W], [D, -W + 0.2], [-D, -W + 0.2]]) box(0.24, H, 0.24, trim, x, H / 2, z, false);
  for (const x of [-D - 0.1, D + 0.1]) for (const side of [-1, 1]) {
    const rake = box(0.1, 0.22, run / Math.cos(pitch), trim, x, H + RISE - (run / 2) * Math.tan(pitch) - 0.02, side * run / 2, false);
    rake.rotation.x = side * pitch;
  }
  box(0.08, 0.22, 5.6, trim, -D - 0.12, DOOR_TOP + 0.11, 1.0, false);
  // Porta de correr aberta sobre a ombreira -z, no trilho acima do vão.
  box(0.08, 0.14, 9.4, steel, -D - 0.2, DOOR_TOP + 0.34, -0.8, false);
  const door = new THREE.Group();
  door.position.set(-D - 0.26, 0, -3.35);
  root.add(door);
  const doorPanel = new THREE.Mesh(tileBoxUv(new THREE.BoxGeometry(0.08, DOOR_TOP - 0.1, 3.3), TILE), siding);
  doorPanel.position.y = (DOOR_TOP - 0.1) / 2 + 0.06;
  doorPanel.castShadow = doorPanel.receiveShadow = true;
  door.add(doorPanel);
  const doorSpan = Math.hypot(DOOR_TOP - 0.5, 3.0);
  for (const [y, z, w, h, angle] of [
    [0.2, 0, 0.16, 3.3, 0], [DOOR_TOP - 0.24, 0, 0.16, 3.3, 0], [DOOR_TOP / 2, 1.57, DOOR_TOP - 0.2, 0.16, 0], [DOOR_TOP / 2, -1.57, DOOR_TOP - 0.2, 0.16, 0],
    [DOOR_TOP / 2, 0, 0.14, doorSpan, Math.atan2(DOOR_TOP - 0.5, 3.0)], [DOOR_TOP / 2, 0, 0.14, doorSpan, -Math.atan2(DOOR_TOP - 0.5, 3.0)],
  ] as [number, number, number, number, number][]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, w, h), trim);
    bar.position.set(-0.06, y, z); bar.rotation.x = angle;
    door.add(bar);
  }
  // Calçada de concreto na boca do vão e piso socado do galpão.
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 6.2), concrete);
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(-D - 1.6, 0.05, 1.0);
  apron.receiveShadow = true;
  root.add(apron);
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
    // Fardo prensado não é cubo: arestas estufadas pela palha.
    const bp = bale.geometry.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
      bp.setXYZ(i, x * (0.96 + 0.04 * Math.abs(y) / 0.525), y * 0.97, z * (0.96 + 0.04 * Math.abs(y) / 0.525));
    }
    root.add(bale);
  }
  for (const [bx, bz] of [[4.9, -3.9], [5.35, -3.35]]) {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.92, 14), steel);
    drum.position.set(bx, 0.46, bz);
    drum.castShadow = true;
    root.add(drum);
  }
  // Chapas, perfis e acabamento estáticos viram uma malha por material e
  // sombra; a porta e o pilar de balanço continuam objetos próprios.
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const buckets = new Map<string, { material: THREE.Material; shadow: boolean; parts: THREE.BufferGeometry[] }>();
  const sources = new Set<THREE.BufferGeometry>();
  for (const mesh of root.children.filter((node): node is THREE.Mesh => node instanceof THREE.Mesh && node.geometry.attributes.uv !== undefined)) {
    const key = `${mesh.material instanceof THREE.Material ? mesh.material.uuid : ''}:${mesh.castShadow}`;
    const bucket = buckets.get(key) ?? { material: mesh.material as THREE.Material, shadow: mesh.castShadow, parts: [] };
    const part = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    part.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
    for (const name of Object.keys(part.attributes)) if (!['position', 'normal', 'uv'].includes(name)) part.deleteAttribute(name);
    bucket.parts.push(part); buckets.set(key, bucket);
    sources.add(mesh.geometry);
    mesh.removeFromParent();
  }
  for (const geometry of sources) geometry.dispose();
  for (const { material, shadow, parts } of buckets.values()) {
    const merged = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = shadow; mesh.receiveShadow = true;
    root.add(mesh);
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

/** Palha prensada: talos curtos em tons de feno seco e dois fios de barbante. */
function baleTexture() {
  if (typeof document === 'undefined' || typeof document.createElementNS !== 'function') return null;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#8e7a4c'; ctx.fillRect(0, 0, 128, 128);
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) {
    const x = rnd() * 128, y = rnd() * 128, a = (rnd() - 0.5) * 0.9, l = 3 + rnd() * 7;
    const v = 0.72 + rnd() * 0.5;
    ctx.strokeStyle = `rgba(${Math.round(176 * v)},${Math.round(152 * v)},${Math.round(98 * v)},.8)`;
    ctx.lineWidth = 0.6 + rnd() * 0.7;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(58,48,32,.85)'; ctx.lineWidth = 2;
  for (const x of [40, 88]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 1, 128); ctx.stroke(); }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  return map;
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

/**
 * Borda orgânica para manchas planas (lama, lâmina d'água): o alfa cai numa
 * faixa ruidosa perto da borda do disco em vez de cortar num polígono. O
 * ruído é em espaço de objeto, então a mancha não "escorre" quando a câmera
 * gira. `radius` é o raio do disco; `band` a fração que vira transição.
 */
function softEdgedPatch(material: THREE.MeshStandardMaterial, radius: number, band: number) {
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec2 patchXZ;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\npatchXZ = position.xz;');
    shader.fragmentShader = `varying vec2 patchXZ;
      float patchHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float patchNoise(vec2 p){vec2 a=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(patchHash(a),patchHash(a+vec2(1,0)),f.x),mix(patchHash(a+vec2(0,1)),patchHash(a+vec2(1,1)),f.x),f.y);}
    ` + shader.fragmentShader.replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
      float patchR = length(patchXZ / vec2(1.0, .65)) / ${radius.toFixed(2)};
      float ragged = patchNoise(patchXZ * 1.3) * .6 + patchNoise(patchXZ * 3.7 + 9.1) * .4;
      diffuseColor.a *= 1.0 - smoothstep(1.0 - ${band.toFixed(2)}, 1.0, patchR + (ragged - .5) * ${band.toFixed(2)});`);
  };
  material.customProgramCacheKey = () => `sompo-agri-soft-patch-${radius}-${band}`;
  return material;
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
  const crops = definition.barn ? null : createSompoCropRows((x,z)=>terrainHeight(x,z,definition.slope,(definition as { relief?: (x: number, z: number) => number }).relief), compact, equipmentId === 'tractor' ? .32 : 1, operation, equipmentId === 'harvester');
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
  // Na operação o complexo recua 25 m e libera o footprint do galpão mapeado.
  const silos = createSilos(operation ? (x, z) => terrainHeight(x, z, 0, geofenceOperacaoRelief) : (x, z) => terrainHeight(x, z, definition.slope), operation ? -25 : 0);
  root.add(silos);
  const treeLine = createTreeLine((x, z) => terrainHeight(x, z, definition.slope, (definition as { relief?: (x: number, z: number) => number }).relief), definition.night, compact);
  if (treeLine) root.add(treeLine.root);
  // Névoa baixa é do talhão aberto: dentro do galpão as faixas horizontais
  // atravessavam as paredes (bug reportado pela frente agri-máquina).
  const groundFog = definition.barn ? null : createGroundFog();
  if (groundFog) { root.add(groundFog.root); groundFog.root.visible = !definition.night; }

  const mud = new THREE.Mesh(
    new THREE.CircleGeometry(8, 64),
    softEdgedPatch(new THREE.MeshStandardMaterial({ color: 0x38291c, roughness: 0.55, metalness: 0, transparent: true, depthWrite: false }), 8, .38),
  );
  mud.name = 'sompo-agri-mud';
  mud.geometry.rotateX(-Math.PI / 2);
  const mudPositions = mud.geometry.attributes.position;
  for (let i=1;i<mudPositions.count;i++) { const f=1+Math.sin(i*2.3)*.09; mudPositions.setX(i,mudPositions.getX(i)*f);mudPositions.setZ(i,mudPositions.getZ(i)*f*.65); }
  // Lâmina d'água parada no centro do trecho saturado. O branco baixo é o que
  // diferencia solo úmido de solo encharcado.
  const puddle = new THREE.Mesh(
    new THREE.CircleGeometry(3.4, 48),
    softEdgedPatch(new THREE.MeshStandardMaterial({ color: 0x1f1913, roughness: 0.12, metalness: 0, envMapIntensity: 0.6, transparent: true, opacity: 0.88, depthWrite: false }), 3.4, .55),
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
  const ambient = new THREE.HemisphereLight(definition.sky, 0x30291d, definition.night ? 0.16 : 0.7);
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
      treeLine?.dispose();
      disposeSompoObject(root);
    },
  };
}
