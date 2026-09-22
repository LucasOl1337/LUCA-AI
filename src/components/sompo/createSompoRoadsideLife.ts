import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sompoTerrainHeight, sompoIsCornX, sompoLakeDistance, sompoPeriodX, SOMPO_WORLD_PERIOD, SOMPO_FARM } from './createSompoTerrain';
import { wrapSompoX } from './createSompoRoadDetails';

/**
 * O que faz uma rodovia rural parecer habitada: posteação com fiação caindo em
 * catenária, cerca de arame com mourão torto e trecho arrebentado, placas,
 * marco quilométrico, tachas, a porteira com mata-burro e a sede do sítio,
 * caixa d'água, curral, gado nelore no pasto, cupinzeiros, o talhão de
 * eucalipto e serras em camadas no fundo.
 *
 * Tudo mora no período da composição (480 m, o mesmo do relevo). Peças fixas
 * são geometria mesclada em três cópias do período, reposicionada em saltos
 * exatos do período (um draw call por material, zero custo por quadro). Só o
 * que precisa sair do caminho de um animal ou cair quando o caminhão invade
 * a cerca é instanciado com wrap por instância.
 */
const P = SOMPO_WORLD_PERIOD;
const COPIES = [-P, 0, P];
const rnd = (i: number) => { const n = Math.sin(i * 91.7 + 47.3) * 43758.5453; return n - Math.floor(n); };
const hasDom = () => typeof document !== 'undefined' && typeof document.createElement === 'function';

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  if (!hasDom()) return null;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  draw(ctx);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  return map;
}

/** Acumula peças por material e mescla em uma malha por material. */
class Batcher {
  parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(material: THREE.Material, geometry: THREE.BufferGeometry, matrix?: THREE.Matrix4) {
    const g = (geometry.index ? geometry.toNonIndexed() : geometry.clone());
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (matrix) g.applyMatrix4(matrix);
    const list = this.parts.get(material) ?? [];
    list.push(g); this.parts.set(material, list);
  }
  /** Mesma peça nas três cópias do período. */
  addPeriodic(material: THREE.Material, geometry: THREE.BufferGeometry, matrix: THREE.Matrix4) {
    for (const offset of COPIES) this.add(material, geometry, new THREE.Matrix4().makeTranslation(offset, 0, 0).multiply(matrix));
  }
  build(parent: THREE.Object3D, name: string, shadow = true) {
    const meshes: THREE.Mesh[] = [];
    for (const [material, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      list.forEach(g => g.dispose());
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = name; mesh.castShadow = shadow; mesh.receiveShadow = true;
      parent.add(mesh); meshes.push(mesh);
    }
    this.parts.clear();
    return meshes;
  }
}

const m4 = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

/** Tubo triangular ao longo de uma polilinha: fio fino que ainda resolve no MSAA. */
function wireGeometry(points: THREE.Vector3[], radius: number, sides = 3) {
  const positions: number[] = [], normals: number[] = [], index: number[] = [];
  const tangent = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < points.length; i += 1) {
    tangent.subVectors(points[Math.min(points.length - 1, i + 1)], points[Math.max(0, i - 1)]).normalize();
    a.set(0, 1, 0).cross(tangent); if (a.lengthSq() < 1e-6) a.set(1, 0, 0); a.normalize();
    b.crossVectors(tangent, a).normalize();
    for (let k = 0; k < sides; k += 1) {
      const angle = (k / sides) * Math.PI * 2;
      n.copy(a).multiplyScalar(Math.cos(angle)).addScaledVector(b, Math.sin(angle));
      positions.push(points[i].x + n.x * radius, points[i].y + n.y * radius, points[i].z + n.z * radius);
      normals.push(n.x, n.y, n.z);
    }
    if (i > 0) for (let k = 0; k < sides; k += 1) {
      const p0 = (i - 1) * sides + k, p1 = (i - 1) * sides + ((k + 1) % sides), q0 = i * sides + k, q1 = i * sides + ((k + 1) % sides);
      index.push(p0, q0, p1, p1, q0, q1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((positions.length / 3) * 2).fill(0), 2));
  g.setIndex(index);
  return g;
}

/** Fio pendurado entre dois apoios: catenária aproximada por parábola. */
function sagPoints(from: THREE.Vector3, to: THREE.Vector3, sag: number, segments: number) {
  const points: THREE.Vector3[] = [];
  for (let s = 0; s <= segments; s += 1) {
    const t = s / segments;
    points.push(new THREE.Vector3().lerpVectors(from, to, t).setY(THREE.MathUtils.lerp(from.y, to.y, t) - sag * 4 * t * (1 - t)));
  }
  return points;
}

// ───────────────────────────── Cerca ─────────────────────────────
interface PostSlot { x: number; z: number; height: number; lean: number; spin: number; thick: number; fallen?: number }
const FENCE_ROWS = [6, -10] as const;
const WIRE_HEIGHTS = [0.38, 0.68, 0.98];
/** Vão da porteira + mata-burro na cerca do lado de lá. */
const GATE_GAP: readonly [number, number] = [SOMPO_FARM.gateX - 3, SOMPO_FARM.gateX + 6.6];
/** Trechos com arame frouxo/arrebentado: [linha, xIni, xFim, fios afetados (de cima)]. */
const BROKEN = [[6, -58, -44, 2], [-10, 150, 168, 1], [6, 131, 139, 1]] as const;

function fencePosts(): PostSlot[] {
  const slots: PostSlot[] = [];
  for (const [row, z] of FENCE_ROWS.entries()) {
    let x = -P / 2 + rnd(row * 7 + 1) * 2;
    let i = 0;
    while (x < P / 2 - 3.2) {
      const seed = row * 1000 + i;
      const inGate = z < 0 && x > GATE_GAP[0] - 0.01 && x < GATE_GAP[1] + 0.01;
      // Falta um mourão no trecho arrebentado do lado de lá.
      const missing = z < 0 && x > 156 && x < 161;
      if (!inGate && !missing) {
        const thick = i % 11 === 5 ? 1.55 : 1;
        const broken = BROKEN.some(([r, a, b]) => r === z && x > a && x < b);
        slots.push({
          x, z: z + (rnd(seed + 3) - 0.5) * 0.12,
          height: (1.02 + rnd(seed + 13) * 0.38) * (thick > 1 ? 1.12 : 1),
          lean: (rnd(seed + 21) - 0.5) * (broken ? 0.62 : 0.16) + (broken ? 0.12 : 0),
          spin: rnd(seed + 34) * Math.PI, thick,
        });
      }
      x += 3.3 + rnd(seed + 5) * 2.3;
      // Mourões de canto nas bordas do vão da porteira.
      if (z < 0 && x > GATE_GAP[0] && x < GATE_GAP[1] + 3) x = Math.max(x, GATE_GAP[1] + 0.02);
      i += 1;
    }
  }
  return slots;
}

function createFence(root: THREE.Group, wood: THREE.Material) {
  const slots = fencePosts();
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.055, 0.068, 1.2, 7), wood, slots.length);
  posts.name = 'roadside-fence-posts'; posts.castShadow = posts.receiveShadow = true; root.add(posts);
  posts.boundingSphere = new THREE.Sphere(new THREE.Vector3(), P);
  const lastX = new Float64Array(slots.length).fill(NaN), lastFallen = new Float64Array(slots.length).fill(-1);
  const wire = new THREE.MeshStandardMaterial({ color: 0x8b908a, roughness: 0.5, metalness: 0.6 });
  const rows = FENCE_ROWS.map(z => {
    const rowSlots = slots.filter(s => Math.sign(s.z) === Math.sign(z)).sort((a, b) => a.x - b.x);
    const batch = new Batcher();
    for (const offset of COPIES) {
      for (let i = 0; i < rowSlots.length; i += 1) {
        const a = rowSlots[i], b = rowSlots[(i + 1) % rowSlots.length];
        const ax = a.x + offset, bx = b.x + offset + (i + 1 === rowSlots.length ? P : 0);
        const mid = sompoPeriodX((a.x + (b.x < a.x ? b.x + P : b.x)) / 2);
        if (z < 0 && mid > GATE_GAP[0] && mid < GATE_GAP[1]) continue;
        const broken = BROKEN.find(([r, lo, hi]) => r === z && mid > lo && mid < hi);
        WIRE_HEIGHTS.forEach((y, strand) => {
          const fromTop = WIRE_HEIGHTS.length - 1 - strand;
          const loose = broken && fromTop < broken[3];
          // Arame arrebentado do lado de lá: o fio de cima some no trecho.
          if (loose && z < 0) return;
          const sag = loose ? 0.28 + fromTop * 0.18 : 0.025 + rnd(i * 3 + strand) * 0.03;
          const from = new THREE.Vector3(ax, y, a.z), to = new THREE.Vector3(bx, y, b.z);
          batch.add(wire, wireGeometry(sagPoints(from, to, sag, loose ? 6 : 3), 0.009));
        });
      }
    }
    const [mesh] = batch.build(root, `roadside-fence-wire-${z > 0 ? 'near' : 'far'}`, false);
    return { z, mesh };
  });
  const transform = new THREE.Object3D();
  return {
    update(truckX: number, truck: THREE.Vector3, direction: number) {
      let changed = false;
      for (const row of rows) {
        row.mesh.position.x = Math.round(truckX / P) * P;
        // Cerca derrubada: quando o caminhão cruza a linha, os fios deitam.
        const crossed = row.z > 0 ? truck.z > 4.3 : truck.z < -8.6;
        row.mesh.scale.y = crossed ? 0.15 : 1;
      }
      for (const [index, slot] of slots.entries()) {
        const x = wrapSompoX(slot.x, truckX, P);
        const crossing = slot.z > 0 ? truck.z > 4.3 : truck.z < -8.6;
        if (crossing && Math.abs(x - truckX) < 5.6) slot.fallen = 1;
        const fallen = slot.fallen ?? 0;
        if (lastX[index] === x && lastFallen[index] === fallen) continue;
        lastX[index] = x; lastFallen[index] = fallen; changed = true;
        if (fallen) {
          transform.position.set(x, 0.08, slot.z + Math.sign(slot.z) * 0.35);
          transform.rotation.set(0, slot.spin, direction * -1.42 + slot.lean * 0.2);
        } else {
          transform.position.set(x, slot.height / 2 - 0.04, slot.z);
          transform.rotation.set(slot.lean, slot.spin, slot.lean * 0.7);
        }
        transform.scale.set(slot.thick, slot.height / 1.2, slot.thick);
        transform.updateMatrix();
        posts.setMatrixAt(index, transform.matrix);
      }
      if (changed) { posts.instanceMatrix.needsUpdate = true; posts.boundingSphere!.center.set(truckX, 0, 0); }
    },
    dispose() { posts.geometry.dispose(); wire.dispose(); rows.forEach(r => r.mesh.geometry.dispose()); },
  };
}

// ─────────────────────────── Posteação ───────────────────────────
const POLE_Z = -12.7;
function polePositions() {
  const xs: number[] = [];
  let x = -P / 2 + 6;
  let i = 0;
  while (x < P / 2 - 30) { xs.push(x); x += 35 + rnd(i + 501) * 11; i += 1; }
  return xs;
}

function createPowerLine(batch: Batcher, materials: { concrete: THREE.Material; darkWood: THREE.Material; porcelain: THREE.Material; cable: THREE.Material; steel: THREE.Material }, houseDrop: THREE.Vector3) {
  const xs = polePositions();
  const poleGeo = new THREE.CylinderGeometry(0.1, 0.17, 9.2, 8); poleGeo.translate(0, 4.6, 0);
  const arm = new THREE.BoxGeometry(0.1, 0.1, 2.1);
  const insulator = new THREE.CylinderGeometry(0.045, 0.06, 0.2, 6);
  const tops: { x: number; lean: number }[] = [];
  xs.forEach((x, i) => {
    const lean = (rnd(i + 11) - 0.5) * 0.05;
    const wooden = i % 4 === 2;
    batch.addPeriodic(wooden ? materials.darkWood : materials.concrete, poleGeo, m4(x, -0.4, POLE_Z, lean, 0, (rnd(i + 17) - 0.5) * 0.03));
    batch.addPeriodic(wooden ? materials.darkWood : materials.steel, arm, m4(x + lean * 0, 8.35, POLE_Z));
    for (const dz of [-0.9, 0.9]) batch.addPeriodic(materials.porcelain, insulator, m4(x, 8.5, POLE_Z + dz));
    batch.addPeriodic(materials.porcelain, insulator, m4(x, 9.0, POLE_Z));
    // Suporte do cabo de telecom, do lado da pista.
    batch.addPeriodic(materials.steel, new THREE.BoxGeometry(0.06, 0.06, 0.35), m4(x, 5.6, POLE_Z + 0.2));
    tops.push({ x, lean });
  });
  // Transformador no poste mais próximo da entrada do sítio.
  const nearest = xs.reduce((best, x) => Math.abs(x - SOMPO_FARM.gateX) < Math.abs(best - SOMPO_FARM.gateX) ? x : best, xs[0]);
  batch.addPeriodic(materials.steel, new THREE.CylinderGeometry(0.32, 0.32, 0.85, 12), m4(nearest, 6.9, POLE_Z - 0.42));
  for (const dz of [-0.12, 0.12]) batch.addPeriodic(materials.porcelain, new THREE.CylinderGeometry(0.03, 0.03, 0.22, 6), m4(nearest + dz, 7.44, POLE_Z - 0.42));
  // Fios: três fases na cruzeta/topo e o cabo de telecom mais baixo e mais frouxo.
  const conductors = [[8.62, -0.9, 0.012], [8.62, 0.9, 0.012], [9.12, 0, 0.012], [5.62, 0.36, 0.02]] as const;
  for (const offset of COPIES) {
    for (let i = 0; i < xs.length; i += 1) {
      const a = xs[i] + offset, b = (i + 1 < xs.length ? xs[i + 1] : xs[0] + P) + offset;
      const span = b - a;
      for (const [y, dz, radius] of conductors) {
        const sag = (y < 6 ? 0.03 : 0.02) * span;
        batch.add(materials.cable, wireGeometry(sagPoints(new THREE.Vector3(a, y, POLE_Z + dz), new THREE.Vector3(b, y, POLE_Z + dz), sag, 10), radius));
      }
    }
    // Ramal de entrada até a casa.
    batch.add(materials.cable, wireGeometry(sagPoints(new THREE.Vector3(nearest + offset, 7.2, POLE_Z - 0.3), houseDrop.clone().add(new THREE.Vector3(offset, 0, 0)), 0.9, 14), 0.01));
  }
  return nearest;
}

// ──────────────────────────── Placas ─────────────────────────────
/** Atlas das placas: 4×2 células de 256 px. */
function signAtlas() {
  return canvasTexture(1024, 512, (ctx) => {
    ctx.fillStyle = '#6f7472'; ctx.fillRect(0, 0, 1024, 512);
    const roundLimit = (cx: number, value: string) => {
      ctx.fillStyle = '#f4f2ea'; ctx.beginPath(); ctx.arc(cx, 128, 124, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#c42420'; ctx.lineWidth = 26; ctx.beginPath(); ctx.arc(cx, 128, 106, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#141414'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 96px Arial, Helvetica, sans-serif'; ctx.fillText(value, cx, 120);
      ctx.font = 'bold 30px Arial, Helvetica, sans-serif'; ctx.fillText('km/h', cx, 184);
    };
    roundLimit(128, '80');
    roundLimit(896, '60');
    const diamond = (cx: number, draw: () => void) => {
      ctx.save(); ctx.translate(cx, 128); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#1b1b1b'; ctx.fillRect(-88, -88, 176, 176);
      ctx.fillStyle = '#f1c21b'; ctx.fillRect(-80, -80, 160, 160);
      ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 5; ctx.strokeRect(-72, -72, 144, 144);
      ctx.restore(); ctx.save(); ctx.translate(cx, 128); ctx.fillStyle = '#161616'; ctx.strokeStyle = '#161616'; draw(); ctx.restore();
    };
    // A-35: animais na pista (silhueta de boi).
    diamond(384, () => {
      ctx.beginPath();
      ctx.moveTo(-52, -18); ctx.bezierCurveTo(-40, -30, 20, -30, 34, -22); ctx.lineTo(46, -36); ctx.lineTo(50, -30);
      ctx.lineTo(56, -38); ctx.lineTo(60, -24); ctx.bezierCurveTo(66, -18, 64, -6, 54, -4); ctx.lineTo(40, 2);
      ctx.lineTo(38, 30); ctx.lineTo(30, 30); ctx.lineTo(28, 8); ctx.lineTo(-30, 8); ctx.lineTo(-34, 30); ctx.lineTo(-42, 30);
      ctx.lineTo(-44, 4); ctx.bezierCurveTo(-56, 0, -58, -10, -52, -18); ctx.fill();
      ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-52, -16); ctx.quadraticCurveTo(-62, 0, -58, 18); ctx.stroke();
    });
    // A-2b: curva à direita.
    diamond(640, () => {
      ctx.lineWidth = 16; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(-16, 50); ctx.lineTo(-16, 0); ctx.quadraticCurveTo(-16, -26, 12, -26); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(8, -48); ctx.lineTo(40, -26); ctx.lineTo(8, -4); ctx.closePath(); ctx.fill();
    });
    // Tábua pintada à mão do sítio e a plaquinha de ovos caipira.
    const plank = (x: number, lines: string[], sizes: number[], ink: string, base: string) => {
      ctx.fillStyle = base; ctx.fillRect(x + 6, 262, 500, 244);
      for (let i = 0; i < 90; i += 1) {
        ctx.fillStyle = `rgba(${i % 2 ? '40,24,12' : '255,240,210'},${0.05 + rnd(i + x) * 0.08})`;
        ctx.fillRect(x + 6, 262 + rnd(i * 3 + x) * 244, 500, 1 + rnd(i * 5) * 3);
      }
      ctx.fillStyle = 'rgba(30,18,8,.55)'; for (const y of [262 + 80, 262 + 162]) ctx.fillRect(x + 6, y, 500, 3);
      ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      lines.forEach((line, i) => { ctx.font = `bold ${sizes[i]}px Georgia, 'Times New Roman', serif`; ctx.fillText(line, x + 256 + (i - 1) * 4, 262 + 60 + i * 78); });
    };
    plank(0, ['SÍTIO', 'BOA VISTA', '→ 1 km'], [64, 70, 40], '#f3ead2', '#6b4a2e');
    plank(512, ['VENDE-SE', 'OVOS CAIPIRA', 'E QUEIJO'], [56, 58, 48], '#b3261e', '#e8e2cf');
  });
}

interface SignSpec { design: 0 | 1 | 2 | 3 | 4 | 5; x: number; z: number; face: 1 | -1; height?: number; yaw?: number }
/** design: 0=80, 1=animais, 2=curva, 3=60, 4=sítio, 5=ovos. face +1 olha +x (tráfego que vem de +x). */
const SIGNS: SignSpec[] = [
  { design: 0, x: -58, z: -8.3, face: 1 }, { design: 1, x: -93, z: -8.3, face: 1 }, { design: 2, x: 204, z: -8.4, face: 1 },
  { design: 3, x: 128, z: -8.3, face: 1 },
  { design: 0, x: 122, z: 4.2, face: -1 }, { design: 1, x: -196, z: 4.2, face: -1 }, { design: 2, x: -126, z: 4.3, face: -1 },
  { design: 4, x: SOMPO_FARM.gateX + 10.5, z: -9.0, face: 1, height: 1.35, yaw: 0.3 },
  { design: 5, x: SOMPO_FARM.gateX - 7.5, z: -9.4, face: 1, height: 0.55, yaw: 0.45 },
];

function signPlate(design: number) {
  const cell = design <= 3 ? { u: [0, 1, 2, 3][design === 3 ? 3 : design] * 0.25, v: 0.5, w: 0.25, h: 0.5 } : { u: design === 4 ? 0 : 0.5, v: 0, w: 0.5, h: 0.5 };
  let geometry: THREE.BufferGeometry;
  if (design === 0 || design === 3) geometry = new THREE.CircleGeometry(0.4, 28);
  else if (design === 1 || design === 2) geometry = new THREE.PlaneGeometry(0.72, 0.72).rotateZ(Math.PI / 4);
  else geometry = design === 4 ? new THREE.PlaneGeometry(1.4, 0.7) : new THREE.PlaneGeometry(0.9, 0.45);
  // UV locais (0..1 no bounding box) → célula do atlas.
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!, pos = geometry.attributes.position, uv = geometry.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i += 1) {
    const s = (pos.getX(i) - box.min.x) / (box.max.x - box.min.x), t = (pos.getY(i) - box.min.y) / (box.max.y - box.min.y);
    uv.setXY(i, cell.u + s * cell.w, cell.v + t * cell.h);
  }
  const back = geometry.clone().rotateY(Math.PI).translate(0, 0, -0.012);
  const merged = mergeGeometries([geometry, back], true)!;
  geometry.dispose(); back.dispose();
  return merged;
}

function createSigns(root: THREE.Group, materials: { atlas: THREE.Material; back: THREE.Material; steel: THREE.Material; wood: THREE.Material }) {
  const transform = new THREE.Object3D();
  const groups = [0, 1, 2, 3, 4, 5].map(design => {
    const specs = SIGNS.filter(s => s.design === design);
    const plate = new THREE.InstancedMesh(signPlate(design), [materials.atlas, materials.back], specs.length);
    plate.name = `roadside-sign-${design}`; plate.castShadow = true; root.add(plate);
    return { specs, plate };
  });
  const poleSpecs = SIGNS.flatMap(s => s.design >= 4 ? [{ ...s, dz: -0.55 }, { ...s, dz: 0.55 }] : [{ ...s, dz: 0 }]);
  const pipe = new THREE.CylinderGeometry(0.035, 0.035, 1, 8); pipe.translate(0, 0.5, 0);
  const poles = new THREE.InstancedMesh(pipe, materials.steel, poleSpecs.length);
  poles.name = 'roadside-sign-posts'; poles.castShadow = true; root.add(poles);
  const woodPosts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 1, 0.09).translate(0, 0.5, 0), materials.wood, poleSpecs.length);
  woodPosts.name = 'roadside-sign-wood-posts'; woodPosts.castShadow = true; root.add(woodPosts);
  // Marco quilométrico: plaquinha própria com o número do km corrente.
  const kmCanvas = hasDom() ? document.createElement('canvas') : null;
  if (kmCanvas) { kmCanvas.width = 128; kmCanvas.height = 192; }
  const kmMap = kmCanvas ? new THREE.CanvasTexture(kmCanvas) : null;
  if (kmMap) kmMap.colorSpace = THREE.SRGBColorSpace;
  const kmMaterial = new THREE.MeshStandardMaterial({ map: kmMap, roughness: 0.55, color: kmMap ? 0xffffff : 0xdddddd });
  const kmPlate = new THREE.Group(); kmPlate.name = 'roadside-km-marker'; root.add(kmPlate);
  const kmFront = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.5), kmMaterial); kmFront.position.y = 1.25; kmFront.castShadow = true;
  const kmBack = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.5).rotateY(Math.PI).translate(0, 0, -0.01), materials.back); kmBack.position.y = 1.25;
  const kmPost = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.05, 8).translate(0, 0.52, 0), materials.steel); kmPost.castShadow = true;
  kmPlate.add(kmFront, kmBack, kmPost);
  const KM_X = 6, KM_Z = -8.0;
  let kmShown = NaN;
  const drawKm = (km: number) => {
    const ctx = kmCanvas?.getContext('2d'); if (!ctx || !kmMap) return;
    ctx.fillStyle = '#0f5aa6'; ctx.fillRect(0, 0, 128, 192);
    ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 6; ctx.strokeRect(8, 8, 112, 176);
    ctx.fillStyle = '#f5f5f5'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 40px Arial, Helvetica, sans-serif'; ctx.fillText('km', 64, 52);
    ctx.font = 'bold 54px Arial, Helvetica, sans-serif'; ctx.fillText(String(km), 64, 124);
    kmMap.needsUpdate = true;
  };
  return {
    update(truckX: number, clear: [number, number] | null) {
      const hidden = (x: number) => !!clear && x > clear[0] && x < clear[1];
      for (const { specs, plate } of groups) {
        let count = 0;
        for (const spec of specs) {
          const x = wrapSompoX(spec.x, truckX, P);
          if (hidden(x)) continue;
          const h = spec.height ?? 2.15;
          transform.position.set(x, h, spec.z);
          // Placa de trânsito olha para o tráfego (±x) com leve giro para a pista.
          transform.rotation.set(0, spec.yaw ?? (spec.face > 0 ? Math.PI / 2 - 0.12 : -Math.PI / 2 - 0.12), 0);
          transform.scale.setScalar(1); transform.updateMatrix();
          plate.setMatrixAt(count++, transform.matrix);
        }
        plate.count = count; plate.instanceMatrix.needsUpdate = true; plate.computeBoundingSphere();
      }
      let steel = 0, wooden = 0;
      for (const spec of poleSpecs) {
        const x = wrapSompoX(spec.x, truckX, P);
        if (hidden(x)) continue;
        const h = spec.height ?? 2.15;
        const yaw = spec.yaw ?? 0;
        const along = new THREE.Vector3(spec.dz, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        transform.position.set(x + along.x, -0.05, spec.z + along.z);
        transform.rotation.set(0, yaw, 0);
        if (spec.design >= 4) {
          transform.scale.set(1, h + 0.3, 1); transform.updateMatrix(); woodPosts.setMatrixAt(wooden++, transform.matrix);
        } else {
          transform.scale.set(1, h + 0.05, 1); transform.updateMatrix(); poles.setMatrixAt(steel++, transform.matrix);
        }
      }
      poles.count = steel; woodPosts.count = wooden;
      poles.instanceMatrix.needsUpdate = woodPosts.instanceMatrix.needsUpdate = true;
      poles.computeBoundingSphere(); woodPosts.computeBoundingSphere();
      const kmX = wrapSompoX(KM_X, truckX, P);
      kmPlate.visible = !hidden(kmX);
      kmPlate.position.set(kmX, 0, KM_Z); kmPlate.rotation.y = Math.PI / 2 - 0.2;
      // Cada volta do período passa por um marco novo: o número acompanha.
      const km = 187 + Math.round((kmX - KM_X) / P);
      if (km !== kmShown) { kmShown = km; drawKm(km); }
    },
    dispose() {
      groups.forEach(g => g.plate.geometry.dispose()); pipe.dispose(); woodPosts.geometry.dispose();
      kmMap?.dispose(); kmMaterial.dispose(); kmFront.geometry.dispose(); kmBack.geometry.dispose(); kmPost.geometry.dispose();
    },
  };
}

// ───────────────────── Balizadores e tachas ──────────────────────
function createRoadStuds(root: THREE.Group) {
  const studMaterial = new THREE.MeshStandardMaterial({ color: 0xe0b23a, roughness: 0.35, metalness: 0.1, emissive: 0x3a2a05 });
  const studs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.022, 0.12), studMaterial, 48);
  studs.name = 'road-center-studs'; root.add(studs);
  const slots: number[] = [];
  for (let i = 0; i < 48; i += 1) slots.push(-P / 2 + i * 10);
  const deliPost = new THREE.MeshStandardMaterial({ color: 0xe9e7df, roughness: 0.6 });
  const deliEye = new THREE.MeshStandardMaterial({ color: 0xd93a22, roughness: 0.3, emissive: 0x2a0500 });
  const delSlots: { x: number; z: number }[] = [];
  for (let i = 0; i < 16; i += 1) delSlots.push({ x: -P / 2 + i * 30 + rnd(i + 900) * 9, z: i % 2 ? 3.72 : -7.9 });
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 1, 0.06).translate(0, 0.5, 0), deliPost, delSlots.length);
  const eyes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.105, 0.16, 0.065), deliEye, delSlots.length);
  posts.name = 'roadside-delineators'; eyes.name = 'roadside-delineator-reflectors';
  posts.castShadow = true; root.add(posts, eyes);
  const transform = new THREE.Object3D();
  return {
    update(truckX: number, clear: [number, number] | null) {
      slots.forEach((x, i) => {
        transform.position.set(wrapSompoX(x, truckX, P), 0.011, -2.05); transform.rotation.set(0, 0, 0); transform.scale.setScalar(1);
        transform.updateMatrix(); studs.setMatrixAt(i, transform.matrix);
      });
      studs.instanceMatrix.needsUpdate = true; studs.computeBoundingSphere();
      let count = 0;
      for (const [i, slot] of delSlots.entries()) {
        const x = wrapSompoX(slot.x, truckX, P);
        if (clear && x > clear[0] && x < clear[1]) continue;
        transform.position.set(x, -0.03, slot.z); transform.rotation.set((rnd(i + 3) - 0.5) * 0.08, 0, (rnd(i + 5) - 0.5) * 0.1);
        transform.updateMatrix(); posts.setMatrixAt(count, transform.matrix);
        transform.position.y = 0.82; transform.updateMatrix(); eyes.setMatrixAt(count, transform.matrix);
        count++;
      }
      posts.count = eyes.count = count;
      posts.instanceMatrix.needsUpdate = eyes.instanceMatrix.needsUpdate = true;
      posts.computeBoundingSphere(); eyes.computeBoundingSphere();
    },
    dispose() { studs.geometry.dispose(); studMaterial.dispose(); posts.geometry.dispose(); eyes.geometry.dispose(); deliPost.dispose(); deliEye.dispose(); },
  };
}

// ──────────────────────────── Sítio ──────────────────────────────
function plasterTexture() {
  return canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = '#ece6d6'; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1400; i += 1) { ctx.fillStyle = `rgba(${rnd(i) > .5 ? '120,100,70' : '255,255,245'},${0.03 + rnd(i + 1) * 0.06})`; ctx.fillRect(rnd(i + 2) * 256, rnd(i + 3) * 256, 2 + rnd(i + 4) * 6, 2 + rnd(i + 5) * 4); }
    // Barra pintada de verde e respingo de barro no pé da parede.
    ctx.fillStyle = '#4f7a5a'; ctx.fillRect(0, 196, 256, 60);
    const mud = ctx.createLinearGradient(0, 256, 0, 170);
    mud.addColorStop(0, 'rgba(120,70,40,.75)'); mud.addColorStop(0.4, 'rgba(130,80,50,.35)'); mud.addColorStop(1, 'rgba(130,80,50,0)');
    ctx.fillStyle = mud; ctx.fillRect(0, 150, 256, 106);
    for (let i = 0; i < 40; i += 1) { ctx.fillStyle = 'rgba(70,60,45,.12)'; ctx.fillRect(rnd(i + 70) * 256, 0, 1 + rnd(i + 71) * 2, 60 + rnd(i + 72) * 120); }
  });
}
function tileTexture() {
  return canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = '#9a4d2c'; ctx.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 16; row += 1) for (let col = 0; col < 16; col += 1) {
      const i = row * 16 + col, x = col * 16 + (row % 2) * 8, y = row * 16;
      const tone = 0.75 + rnd(i) * 0.4 - (rnd(i + 99) > 0.93 ? 0.3 : 0);
      ctx.fillStyle = `rgb(${Math.round(165 * tone)},${Math.round(84 * tone)},${Math.round(50 * tone)})`;
      ctx.fillRect(x + 1, y, 14, 15);
      ctx.fillStyle = 'rgba(40,20,10,.45)'; ctx.fillRect(x, y + 12, 16, 4);
      ctx.fillStyle = 'rgba(255,220,180,.12)'; ctx.fillRect(x + 4, y + 1, 5, 10);
    }
    // Limo e poeira escurecendo as telhas.
    for (let i = 0; i < 60; i += 1) { ctx.fillStyle = `rgba(${rnd(i + 5) > .5 ? '50,55,35' : '30,25,20'},${0.08 + rnd(i + 6) * 0.1})`; ctx.beginPath(); ctx.arc(rnd(i + 7) * 256, rnd(i + 8) * 256, 6 + rnd(i + 9) * 22, 0, Math.PI * 2); ctx.fill(); }
  });
}

function boxUV(w: number, h: number, d: number, tile: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  // UV em metros (ladrilho do tamanho `tile`) para a textura não esticar.
  const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i += 1) {
    const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
    const u = nx > 0.5 ? pos.getZ(i) : pos.getX(i), v = ny > 0.5 ? pos.getZ(i) : pos.getY(i) + h / 2;
    uv.setXY(i, u / tile, v / tile);
  }
  return g;
}

function createFarm(batch: Batcher, mats: Record<'plaster' | 'tile' | 'trim' | 'dark' | 'wood' | 'weathered' | 'tank' | 'steel' | 'concrete' | 'fibro' | 'pit', THREE.Material>) {
  const ground = (x: number, z: number) => sompoTerrainHeight(x, z);
  // Casa: 9 × 7 m, telhado de duas águas de barro, varanda na frente.
  const hx = SOMPO_FARM.x + 2, hz = SOMPO_FARM.z - 3, hy = ground(hx, hz) - 0.1, wallH = 2.9;
  batch.addPeriodic(mats.plaster, boxUV(9, wallH + 0.2, 7, 3), m4(hx, hy + (wallH + 0.2) / 2, hz));
  // Empena triangular nas laterais (fecha o oitão sob o telhado).
  const gable = new THREE.BufferGeometry();
  gable.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -3.5, 0, 0, 3.5, 0, 1.6, 0], 3));
  gable.setAttribute('uv', new THREE.Float32BufferAttribute([0, .78, 2.3, .78, 1.15, 1.3], 2)); gable.computeVertexNormals();
  for (const side of [-1, 1]) {
    const g = gable.clone(); if (side > 0) g.rotateY(Math.PI);
    batch.addPeriodic(mats.plaster, g, m4(hx + side * 4.5, hy + wallH + 0.2, hz));
  }
  // Duas águas com beiral de 0,6 m.
  const pitch = Math.atan2(1.6, 3.5), slab = Math.hypot(3.5, 1.6) + 0.7;
  for (const side of [-1, 1]) {
    const roof = boxUV(10.3, 0.1, slab, 2.2);
    batch.addPeriodic(mats.tile, roof, m4(hx, hy + wallH + 0.2 + 0.8 - 0.05, hz + side * (slab / 2 - 0.35) * Math.cos(pitch), side * pitch));
  }
  batch.addPeriodic(mats.tile, new THREE.CylinderGeometry(0.13, 0.13, 10.3, 8, 1, false, 0, Math.PI), m4(hx, hy + wallH + 1.82, hz, 0, 0, Math.PI / 2));
  // Varanda: meia-água mais baixa na frente, sobre esteios de madeira.
  batch.addPeriodic(mats.tile, boxUV(9.4, 0.08, 2.8, 2.2), m4(hx, hy + 2.72, hz + 4.8, 0.16, 0, 0));
  for (const dx of [-4.3, -1.4, 1.4, 4.3]) batch.addPeriodic(mats.wood, new THREE.CylinderGeometry(0.07, 0.08, 2.6, 7), m4(hx + dx, hy + 1.3, hz + 6.0));
  batch.addPeriodic(mats.concrete, new THREE.BoxGeometry(9.4, 0.2, 2.8), m4(hx, hy + 0.1, hz + 4.8));
  // Porta e janelas de madeira pintada (azul), com o vão escuro dentro.
  batch.addPeriodic(mats.trim, new THREE.BoxGeometry(1.0, 2.1, 0.08), m4(hx - 0.8, hy + 1.2, hz + 3.52));
  for (const dx of [-3.2, 1.6, 3.4]) {
    batch.addPeriodic(mats.dark, new THREE.BoxGeometry(1.1, 1.0, 0.04), m4(hx + dx, hy + 1.65, hz + 3.51));
    for (const side of [-1, 1]) batch.addPeriodic(mats.trim, new THREE.BoxGeometry(0.55, 1.05, 0.05), m4(hx + dx + side * 0.84, hy + 1.65, hz + 3.54, 0, side * 0.5, 0));
  }
  for (const dz of [-1.5, 1.8]) batch.addPeriodic(mats.dark, new THREE.BoxGeometry(0.04, 1.0, 1.0), m4(hx + 4.52, hy + 1.65, hz + dz));
  // Chaminé do fogão a lenha.
  batch.addPeriodic(mats.plaster, boxUV(0.6, 2.2, 0.6, 3), m4(hx - 3.2, hy + wallH + 1.3, hz - 1.4));
  batch.addPeriodic(mats.dark, new THREE.BoxGeometry(0.7, 0.08, 0.7), m4(hx - 3.2, hy + wallH + 2.43, hz - 1.4));

  // Caixa d'água azul na torre de madeira.
  const tx = SOMPO_FARM.x - 9, tz = SOMPO_FARM.z - 7, ty = ground(tx, tz);
  for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) batch.addPeriodic(mats.weathered, new THREE.CylinderGeometry(0.08, 0.1, 4.6, 6), m4(tx + dx * 1.05, ty + 2.2, tz + dz * 1.05, dz * 0.04, 0, -dx * 0.04));
  for (const y of [1.4, 3.0]) for (const [dx, dz, ry] of [[0, -0.95, 0], [0, 0.95, 0], [-0.95, 0, Math.PI / 2], [0.95, 0, Math.PI / 2]]) batch.addPeriodic(mats.weathered, new THREE.BoxGeometry(2.0, 0.08, 0.05), m4(tx + dx, ty + y, tz + dz, 0, ry, 0));
  batch.addPeriodic(mats.weathered, new THREE.BoxGeometry(2.4, 0.12, 2.4), m4(tx, ty + 4.5, tz));
  batch.addPeriodic(mats.tank, new THREE.CylinderGeometry(0.95, 0.82, 1.25, 20), m4(tx, ty + 5.18, tz));
  batch.addPeriodic(mats.tank, new THREE.CylinderGeometry(0.2, 0.98, 0.3, 20), m4(tx, ty + 5.95, tz));

  // Curral de tábua com coberta de fibrocimento.
  const cx0 = SOMPO_FARM.x + 18, cz0 = -20, cw = 16, cd = 11;
  const rail = new THREE.BoxGeometry(1, 0.14, 0.045);
  const corner = [[0, 0], [cw, 0], [cw, -cd], [0, -cd]];
  for (let side = 0; side < 4; side += 1) {
    const [ax, az] = corner[side], [bx, bz] = corner[(side + 1) % 4];
    const len = Math.hypot(bx - ax, bz - az), steps = Math.round(len / 2.2);
    for (let k = 0; k <= steps; k += 1) {
      const x = cx0 + ax + (bx - ax) * k / steps, z = cz0 + az + (bz - az) * k / steps;
      batch.addPeriodic(mats.weathered, new THREE.CylinderGeometry(0.08, 0.1, 1.85, 6), m4(x, ground(x, z) + 0.82, z, (rnd(x) - .5) * .06, 0, (rnd(z) - .5) * .06));
    }
    const yaw = -Math.atan2(bz - az, bx - ax);
    const mx = cx0 + (ax + bx) / 2, mz = cz0 + (az + bz) / 2, my = ground(mx, mz);
    // Uma tábua faltando no lado da frente, como em curral de verdade.
    for (const [r, y] of [0.45, 0.9, 1.35].entries()) if (!(side === 0 && r === 1)) batch.addPeriodic(mats.weathered, rail, m4(mx, my + y, mz, 0, yaw, 0, len, 1, 1));
  }
  const cvx = cx0 + cw - 3, cvz = cz0 - cd + 2.5, cvy = ground(cvx, cvz);
  for (const [dx, dz] of [[-2.6, -2], [2.6, -2], [-2.6, 2], [2.6, 2]]) batch.addPeriodic(mats.weathered, new THREE.CylinderGeometry(0.08, 0.09, 2.7, 6), m4(cvx + dx, cvy + 1.3, cvz + dz));
  batch.addPeriodic(mats.fibro, boxUV(6, 0.05, 4.8, 1), m4(cvx, cvy + 2.62, cvz, 0.1, 0, 0));
  batch.addPeriodic(mats.weathered, new THREE.BoxGeometry(3.2, 0.45, 0.6), m4(cvx - 0.3, cvy + 0.25, cvz + 1.2));

  // Mata-burro: vala escura com trilhos de ferro, muretas de concreto.
  const gx = SOMPO_FARM.gateX;
  batch.addPeriodic(mats.pit, new THREE.BoxGeometry(3.4, 0.02, 2.6), m4(gx, 0.012, -10));
  for (let k = 0; k < 10; k += 1) batch.addPeriodic(mats.steel, new THREE.CylinderGeometry(0.035, 0.035, 3.5, 6), m4(gx, 0.07, -8.85 - k * 0.255, 0, 0, Math.PI / 2));
  for (const side of [-1, 1]) batch.addPeriodic(mats.concrete, new THREE.BoxGeometry(0.28, 0.42, 2.9), m4(gx + side * 1.88, 0.2, -10));
  // Mourões grossos do vão e a porteira fechada ao lado do mata-burro.
  for (const x of [GATE_GAP[0] + 0.9, gx + 2.2, GATE_GAP[1]]) batch.addPeriodic(mats.weathered, new THREE.CylinderGeometry(0.12, 0.15, 2.0, 8), m4(x, 0.9, -10));
  const gateA = gx + 2.35, gateB = GATE_GAP[1] - 0.12, gateL = gateB - gateA;
  for (const y of [0.35, 0.65, 0.95, 1.25, 1.52]) batch.addPeriodic(mats.weathered, new THREE.BoxGeometry(gateL, 0.12, 0.04), m4((gateA + gateB) / 2, y, -10.02));
  for (const x of [gateA + 0.06, gateB - 0.06, (gateA + gateB) / 2]) batch.addPeriodic(mats.weathered, new THREE.BoxGeometry(0.1, 1.35, 0.05), m4(x, 0.95, -10.05));
  batch.addPeriodic(mats.weathered, new THREE.BoxGeometry(Math.hypot(gateL, 1.1), 0.11, 0.04), m4((gateA + gateB) / 2, 0.95, -10.07, 0, 0, Math.atan2(1.1, gateL)));

  // Estrada de terra do mata-burro até o terreiro, drapeada no relevo.
  const track = [[gx, -7.5], [gx, -12.5], [gx + 2.5, -19], [gx + 8, -26], [gx + 15, -31.5], [SOMPO_FARM.x - 1, SOMPO_FARM.z + 5]];
  const curve = new THREE.CatmullRomCurve3(track.map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const samples = curve.getSpacedPoints(40);
  const positions: number[] = [], uvs: number[] = [], index: number[] = [];
  let run = 0;
  samples.forEach((point, i) => {
    const next = samples[Math.min(samples.length - 1, i + 1)], prev = samples[Math.max(0, i - 1)];
    const dir = new THREE.Vector3().subVectors(next, prev).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    if (i > 0) run += point.distanceTo(samples[i - 1]);
    for (const s of [-1, 1]) {
      const x = point.x + side.x * 1.7 * s, z = point.z + side.z * 1.7 * s;
      positions.push(x, ground(x, z) + 0.08, z); uvs.push((s + 1) / 2, run / 3);
    }
    if (i > 0) { const b = (i - 1) * 2; index.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  });
  const trackGeometry = new THREE.BufferGeometry();
  trackGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  trackGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  trackGeometry.setIndex(index); trackGeometry.computeVertexNormals();
  // A normal pode sair para baixo conforme a ordem; força para cima.
  const normals = trackGeometry.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < normals.count; i += 1) if (normals.getY(i) < 0) normals.setXYZ(i, -normals.getX(i), -normals.getY(i), -normals.getZ(i));
  return { houseDrop: new THREE.Vector3(hx - 4.5, hy + 2.7, hz + 2.5), track: trackGeometry };
}

/** Cercas de divisa subindo o morro, perpendiculares à rodovia: dividem os pastos. */
function addDivisionFences(batch: Batcher, post: THREE.Material, wire: THREE.Material) {
  const postGeo = new THREE.CylinderGeometry(0.05, 0.065, 1.3, 6);
  const lines = [[-171, -104], [-109, -96], [21, -88], [109, -112], [216, -60]] as const;
  lines.forEach(([x0, zEnd], line) => {
    const points: THREE.Vector3[] = [];
    for (let z = -10.4, k = 0; z > zEnd; z -= 4.2 + rnd(line * 50 + k) * 1.6, k += 1) {
      const x = x0 + Math.sin(z * 0.05 + line) * 2.5;
      if (sompoLakeDistance(x, z) < 26) break;
      const y = sompoTerrainHeight(x, z);
      points.push(new THREE.Vector3(x, y, z));
      batch.addPeriodic(post, postGeo, m4(x, y + 0.6, z, (rnd(k + line) - 0.5) * 0.15, rnd(k) * 3, (rnd(k + 9) - 0.5) * 0.15));
    }
    for (const offset of COPIES) for (const h of [0.45, 0.8, 1.12]) for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1].clone().add(new THREE.Vector3(offset, h, 0)), b = points[i].clone().add(new THREE.Vector3(offset, h, 0));
      batch.add(wire, wireGeometry(sagPoints(a, b, 0.04, 2), 0.01));
    }
  });
}

// ─────────────────── Gado, cupinzeiros, eucalipto ────────────────
/** Nelore no pasto, longe da pista: [x, z, escala, espelhado]. */
const HERD: readonly (readonly [number, number, number, number])[] = [
  [-150, -18, 1, 0], [-146, -26, 0.95, 1], [-139, -22, 1.05, 0], [-133, -30, 0.62, 1], [-158, -31, 1, 1], [-121, -17, 0.98, 0], [-127, -39, 1.02, 1],
  [92, -24, 1, 0], [97, -27, 0.97, 1], [101, -23, 1.04, 1],
  [-48, -47, 1, 1], [-40, -52, 0.94, 0], [-30, -46, 1.03, 0], [-56, -55, 0.6, 1], [-22, -56, 0.98, 1],
  [150, -40, 1, 0], [158, -45, 0.96, 1],
  [-70, 24, 1, 1], [-58, 30, 0.97, 0], [-44, 22, 1.03, 1], [212, 28, 1, 0],
  [140, 32, 1, 1], [163, 26, 0.95, 0], [171, 30, 0.62, 0], [98, 40, 1.02, 1], [-150, 30, 1, 0], [-8, 36, 0.97, 1], [24, 44, 1, 0],
  [-205, -44, 1, 1], [-196, -50, 0.96, 0], [118, -72, 1, 0], [4, -66, 1.02, 1],
];

/** Cupinzeiro de montículo: domo de barro irregular, mais largo que alto. */
function termiteMound(seed: number) {
  const g = new THREE.SphereGeometry(1, 11, 7, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), angle = Math.atan2(z, x);
    const k = 1 + Math.sin(angle * 3 + seed) * 0.14 + Math.sin(angle * 5 + y * 6 + seed) * 0.08;
    // Ombro assimétrico e topo meio achatado, como o barro que o cupim sobe.
    const lift = y * (1 + Math.max(0, Math.cos(angle - seed)) * 0.35);
    pos.setXYZ(i, x * k, Math.pow(Math.max(0, lift), 0.8), z * k);
  }
  g.computeVertexNormals();
  return g;
}

function createDistantRidges(root: THREE.Group) {
  const RP = P * 2;
  // Cores já com a perspectiva aérea (a névoa da cena é curta para 2-5 km):
  // mata escura nas grotas, pasto claro nas encostas, a de trás azulada.
  const layers = [
    { front: -128, crest: -172, base: 8, amp: 6.5, detail: 0.9, forest: new THREE.Color(0x3a4c35), pasture: new THREE.Color(0x7d8a5a), haze: new THREE.Color(0x9fb0ae), hazeAmount: 0.28, seed: 1 },
    { front: -182, crest: -240, base: 17, amp: 10, detail: 0.45, forest: new THREE.Color(0x46596a), pasture: new THREE.Color(0x6f8190), haze: new THREE.Color(0x9fb1bd), hazeAmount: 0.42, seed: 7 },
  ];
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, fog: false });
  const fbm = (x: number, seed: number) => Math.sin(x * 0.031 + seed) * 0.5 + Math.sin(x * 0.083 + seed * 2.3) * 0.3 + Math.sin(x * 0.19 + seed * 5.1) * 0.2;
  const meshes = layers.map(layer => {
    const step = 4, count = Math.round((RP * 3) / step);
    const positions: number[] = [], colors: number[] = [], index: number[] = [];
    const height = (x: number) => {
      let h = layer.base;
      // Mar de morros: ondas longas e arredondadas, sem pico alpino.
      [[2, 0.5], [3, 0.4], [5, 0.32], [7, 0.24], [11, 0.14], [17, 0.06]].forEach(([k, a], i) => {
        h += layer.amp * a * Math.sin((x / RP) * Math.PI * 2 * k + layer.seed * (i + 1.7));
      });
      // Copa de mata nas cristas: rugosidade fina só no alto.
      h += layer.detail * (Math.sin(x * 0.61 + layer.seed) + Math.sin(x * 1.37 + layer.seed * 3) * 0.6);
      return Math.max(3, h);
    };
    const rows = [0, 0.3, 0.62, 1];
    const color = new THREE.Color();
    for (let c = 0; c <= count; c += 1) {
      const x = -RP * 1.5 + c * step;
      const top = height(x);
      rows.forEach((t, r) => {
        const z = THREE.MathUtils.lerp(layer.front, layer.crest, t);
        // Encosta côncava na base, convexa no alto; cada coluna ondula um pouco.
        const y = THREE.MathUtils.lerp(-3, top, Math.pow(t, 0.8) * (1 + (t > 0 && t < 1 ? fbm(x + r * 40, layer.seed) * 0.08 : 0)));
        positions.push(x, y, z);
        const forest = THREE.MathUtils.smoothstep(fbm(x * 1.7 + r * 23, layer.seed + r) + (t === 1 ? 0.35 : 0) - (r === 1 ? 0.2 : 0), 0.05, 0.3);
        color.copy(layer.pasture).lerp(layer.forest, forest).lerp(layer.haze, layer.hazeAmount + (1 - t) * 0.12);
        colors.push(color.r, color.g, color.b);
      });
      if (c > 0) for (let r = 0; r < rows.length - 1; r += 1) {
        const a = (c - 1) * rows.length + r, b = c * rows.length + r;
        index.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setIndex(index); g.computeVertexNormals();
    const normals = g.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < normals.count; i += 1) if (normals.getZ(i) < 0) normals.setXYZ(i, -normals.getX(i), -normals.getY(i), -normals.getZ(i));
    const mesh = new THREE.Mesh(g, material);
    mesh.name = 'distant-ridge-layer'; mesh.frustumCulled = false; mesh.renderOrder = -10;
    root.add(mesh);
    return mesh;
  });
  const wetHaze = new THREE.Color(0x8f9a9c);
  return {
    update(truckX: number, wet: boolean) {
      for (const mesh of meshes) mesh.position.x = Math.round(truckX / RP) * RP;
      // Na chuva a serra quase some na cortina d'água: cor puxada para a névoa.
      material.color.setScalar(wet ? 0.35 : 1);
      material.emissive.copy(wetHaze).multiplyScalar(wet ? 0.6 : 0);
      meshes[1].visible = !wet;
    },
    dispose() { meshes.forEach(m => m.geometry.dispose()); material.dispose(); },
  };
}

export function createSompoRoadsideLife(parent: THREE.Group, postWood: THREE.Material, options: { compact?: boolean } = {}) {
  const root = new THREE.Group(); root.name = 'roadside-life'; parent.add(root);
  const textures: THREE.Texture[] = [];
  const keep = <T extends THREE.Texture | null>(t: T) => { if (t) textures.push(t); return t; };
  const std = (params: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(params);
  const plaster = keep(plasterTexture()), tiles = keep(tileTexture());
  if (plaster) plaster.wrapS = plaster.wrapT = THREE.RepeatWrapping;
  if (tiles) tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping;
  const atlas = keep(signAtlas());
  const mats = {
    plaster: std({ map: plaster, color: plaster ? 0xffffff : 0xe8e1cf, roughness: 0.95 }),
    tile: std({ map: tiles, color: tiles ? 0xffffff : 0x9a4d2c, roughness: 0.85 }),
    trim: std({ color: 0x3d6f9a, roughness: 0.7 }),
    dark: std({ color: 0x1d1a17, roughness: 0.9 }),
    wood: std({ color: 0x7a6248, roughness: 0.95 }),
    weathered: std({ color: 0x8c8272, roughness: 1 }),
    darkWood: std({ color: 0x4f4032, roughness: 0.95 }),
    tank: std({ color: 0x2f79b8, roughness: 0.45 }),
    steel: std({ color: 0x8d9394, roughness: 0.45, metalness: 0.7 }),
    concrete: std({ color: 0x8e8c85, roughness: 0.92 }),
    fibro: std({ color: 0x9fa19b, roughness: 0.85 }),
    pit: std({ color: 0x1a1612, roughness: 1 }),
    porcelain: std({ color: 0x7c5a3c, roughness: 0.35 }),
    cable: std({ color: 0x2a2c2c, roughness: 0.6, metalness: 0.3 }),
    atlas: std({ map: atlas, roughness: 0.5, color: atlas ? 0xffffff : 0xcccccc }),
    back: std({ color: 0x7d8383, roughness: 0.5, metalness: 0.6 }),
    track: std({ color: 0xb49a82, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  };
  if (hasDom()) {
    const laterite = new THREE.TextureLoader().load('/sompo/gen/r31-laterite-strip.webp');
    laterite.colorSpace = THREE.SRGBColorSpace; laterite.wrapS = THREE.ClampToEdgeWrapping; laterite.wrapT = THREE.RepeatWrapping;
    // A faixa gerada corre em u; a estrada do sítio corre em v: gira 90°.
    laterite.center.set(0.5, 0.5); laterite.rotation = Math.PI / 2; laterite.anisotropy = 8;
    mats.track.map = laterite; mats.track.color.set(0xc9b8a6); textures.push(laterite);
  }

  const fence = createFence(root, postWood);
  const statics = new Batcher();
  const farm = createFarm(statics, mats);
  createPowerLine(statics, mats, farm.houseDrop);
  addDivisionFences(statics, mats.weathered, mats.steel);
  const trackMatrix = new THREE.Matrix4();
  for (const offset of COPIES) statics.add(mats.track, farm.track, trackMatrix.makeTranslation(offset, 0, 0));
  farm.track.dispose();
  const staticGroup = new THREE.Group(); staticGroup.name = 'roadside-static-period'; root.add(staticGroup);
  const staticMeshes = statics.build(staticGroup, 'roadside-static');
  for (const mesh of staticMeshes) if (mesh.material === mats.track) mesh.castShadow = false;

  const signs = createSigns(root, mats);
  const studs = createRoadStuds(root);
  const ridges = createDistantRidges(root);

  // Gado ao longe: recorte fotográfico do nelore (o mesmo do cenário do animal)
  // em cartões iluminados, com sombra de contato. Longe da pista, lê como gado.
  const herdMap = hasDom() ? new THREE.TextureLoader().load('/models/sompo/generated-nelore-billboard.webp') : null;
  if (herdMap) { herdMap.colorSpace = THREE.SRGBColorSpace; herdMap.anisotropy = 8; textures.push(herdMap); }
  const herdMaterial = std({ map: herdMap, alphaTest: 0.45, roughness: 1, color: 0xcfcac0 });
  // Frente e verso como quads próprios (o verso espelhado é o boi virado para o
  // outro lado); normal para cima: o cartão pega luz como o dorso do animal.
  const cowFront = new THREE.PlaneGeometry(2.35, 1.57); cowFront.translate(0, 0.78, 0);
  const cowBack = cowFront.clone().rotateY(Math.PI);
  const cow = mergeGeometries([cowFront, cowBack], false)!; cowFront.dispose(); cowBack.dispose();
  const cowNormals = cow.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < cowNormals.count; i += 1) cowNormals.setXYZ(i, 0, 0.8, 0.6 * Math.sign(cowNormals.getZ(i) || 1));
  const herd = new THREE.InstancedMesh(cow, herdMaterial, HERD.length);
  herd.name = 'distant-nelore-herd'; herd.castShadow = true; root.add(herd);
  const shadowMap = canvasTexture(64, 64, (ctx) => {
    const fade = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
    fade.addColorStop(0, 'rgba(255,255,255,.8)'); fade.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = fade; ctx.fillRect(0, 0, 64, 64);
  });
  keep(shadowMap);
  const herdShadowMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: shadowMap, transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const herdShadows = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.6, 1.1).rotateX(-Math.PI / 2), herdShadowMaterial, HERD.length);
  herdShadows.name = 'distant-nelore-contact'; root.add(herdShadows);

  // Cupinzeiros de barro vermelho no pasto (fora da lavoura, da pista e do lago).
  const moundSlots: { x: number; z: number; s: number; h: number; yaw: number }[] = [];
  for (let i = 0; moundSlots.length < (options.compact ? 34 : 56) && i < 900; i += 1) {
    const x = -P / 2 + rnd(i + 3000) * P, side = rnd(i + 3001) < 0.35 ? 1 : -1;
    const z = side > 0 ? 9 + rnd(i + 3002) * 50 : -11.5 - rnd(i + 3002) * 70;
    if (side < 0 && z > -38 && sompoIsCornX(x, -3)) continue;
    if (sompoLakeDistance(x, z) < 30) continue;
    if (Math.hypot(sompoPeriodX(x - SOMPO_FARM.x), z - SOMPO_FARM.z) < 22) continue;
    if (z < -58 && sompoPeriodX(x) > 118 && sompoPeriodX(x) < 222) continue;
    moundSlots.push({ x, z, s: 0.45 + rnd(i + 3003) * 0.4, h: 0.35 + rnd(i + 3004) * 0.55, yaw: rnd(i + 3005) * 6.28 });
  }
  const mounds = new THREE.InstancedMesh(termiteMound(3), std({ color: 0x7e5a44, roughness: 1 }), moundSlots.length);
  mounds.name = 'pasture-termite-mounds'; mounds.castShadow = mounds.receiveShadow = true; root.add(mounds);

  // Talhão de eucalipto em fileiras na encosta do morro grande, ao fundo.
  const eucaMap = hasDom() ? new THREE.TextureLoader().load('/models/sompo/generated-eucalyptus-billboard.webp') : null;
  if (eucaMap) { eucaMap.colorSpace = THREE.SRGBColorSpace; eucaMap.anisotropy = 4; textures.push(eucaMap); }
  const eucaMaterial = std({ map: eucaMap, alphaTest: 0.4, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 1, color: 0xa6ad98 });
  const card = new THREE.PlaneGeometry(1, 1); card.translate(0, 0.5, 0);
  const cross = mergeGeometries([card.clone(), card.clone().rotateY(Math.PI / 2)], false)!;
  const euca = new Batcher();
  let seed = 0;
  const rowStep = options.compact ? 4.2 : 3.2, treeStep = options.compact ? 3.2 : 2.5;
  for (let z = -60; z > -104; z -= rowStep) {
    for (let x = 126; x < 214; x += treeStep, seed += 1) {
      const jx = x + (rnd(seed + 7000) - 0.5) * 0.8;
      // Borda do talhão acompanha o contorno do morro, não uma régua.
      if (z > -63 - Math.sin(jx * 0.09) * 3) continue;
      if (rnd(seed + 7001) < 0.06) continue;
      const h = 17 + rnd(seed + 7002) * 6;
      euca.add(eucaMaterial, cross, m4(jx, sompoTerrainHeight(jx, z) - 0.2, z + (rnd(seed + 7003) - 0.5) * 0.6, 0, rnd(seed + 7004) * 3, 0, h * 0.36, h, h * 0.36));
    }
  }
  const eucaGroup = new THREE.Group(); eucaGroup.name = 'eucalyptus-stand'; root.add(eucaGroup);
  const eucaMeshes: THREE.Mesh[] = [];
  for (const offset of COPIES) {
    const copy = new Batcher();
    for (const [material, list] of euca.parts) for (const g of list) copy.add(material, g, new THREE.Matrix4().makeTranslation(offset, 0, 0));
    eucaMeshes.push(...copy.build(eucaGroup, 'eucalyptus-stand-rows', false));
  }
  for (const list of euca.parts.values()) list.forEach(g => g.dispose());
  card.dispose(); cross.dispose();

  const transform = new THREE.Object3D();
  let lastSnap = NaN;
  return {
    root,
    update(truckX: number, truck: THREE.Vector3, direction: number, clear: [number, number] | null, wet = false) {
      const snap = Math.round(truckX / P) * P;
      staticGroup.position.x = snap; eucaGroup.position.x = snap;
      fence.update(truckX, truck, direction);
      signs.update(truckX, clear);
      studs.update(truckX, clear);
      ridges.update(truckX, wet);
      // Instâncias do pasto recalculam só quando algum item muda de período.
      const key = Math.round(truckX / 16);
      if (key === lastSnap) return;
      lastSnap = key;
      HERD.forEach(([hx, hz, scale, mirror], i) => {
        const x = wrapSompoX(hx, truckX, P), y = sompoTerrainHeight(x, hz);
        transform.position.set(x, y - 0.05, hz);
        transform.rotation.set(0, (rnd(i + 40) - 0.5) * 0.7 + (mirror ? Math.PI : 0), 0);
        transform.scale.setScalar(scale);
        transform.updateMatrix(); herd.setMatrixAt(i, transform.matrix);
        transform.position.y = y + 0.03; transform.scale.setScalar(scale); transform.updateMatrix();
        herdShadows.setMatrixAt(i, transform.matrix);
      });
      herd.instanceMatrix.needsUpdate = herdShadows.instanceMatrix.needsUpdate = true;
      herd.computeBoundingSphere(); herdShadows.computeBoundingSphere();
      moundSlots.forEach((slot, i) => {
        const x = wrapSompoX(slot.x, truckX, P);
        transform.position.set(x, sompoTerrainHeight(x, slot.z) - 0.08, slot.z);
        transform.rotation.set(0, slot.yaw, 0); transform.scale.set(slot.s, slot.h, slot.s * (0.8 + rnd(i) * 0.4));
        transform.updateMatrix(); mounds.setMatrixAt(i, transform.matrix);
      });
      mounds.instanceMatrix.needsUpdate = true; mounds.computeBoundingSphere();
    },
    dispose() {
      fence.dispose(); signs.dispose(); studs.dispose(); ridges.dispose();
      staticMeshes.forEach(m => m.geometry.dispose()); eucaMeshes.forEach(m => m.geometry.dispose());
      herd.geometry.dispose(); herdShadows.geometry.dispose(); mounds.geometry.dispose(); (mounds.material as THREE.Material).dispose();
      herdMaterial.dispose(); herdShadowMaterial.dispose(); eucaMaterial.dispose();
      Object.values(mats).forEach(m => m.dispose()); textures.forEach(t => t.dispose());
      root.removeFromParent();
    },
  };
}
