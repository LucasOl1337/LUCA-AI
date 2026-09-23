import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bondWireCurve, boxAt, merge, roundedBoxAt } from './geometry';
import { createMemsDie, DIE, MEMS_TOP, type MemsDie, type MemsMaterials, type MemsPalette } from './mems';
import { asicTextures, moldMarkingTexture } from './textures';

/**
 * Encapsulamento do IMU (tipo LGA/QFN) em corte: leadframe, ASIC, die MEMS
 * empilhado, tampa de silício, molde de epóxi e os fios de ouro. `explode`
 * vai de 0 (fechado) a 1 (aberto, camadas separadas como num desenho técnico).
 */

export const PACKAGE = Object.freeze({ size: 3.4, frame: 0.08 });
const ASIC = Object.freeze({ w: 2.9, d: 2.5, t: 0.12 });
const ATTACH = 0.014;
const ASIC_Y = PACKAGE.frame + ATTACH;
const ASIC_TOP = ASIC_Y + ASIC.t;
const MEMS_Y = ASIC_TOP + ATTACH;
const MEMS_Z = -0.18;
const CAP = Object.freeze({ w: 2.5, t: 0.16, d: 1.78, z: -0.16 });
const CAP_Y = MEMS_Y + MEMS_TOP + 0.012;
const MOLD_TOP_Y = CAP_Y + CAP.t + 0.1;
const MOLD_SLAB = 0.12;
export const PACKAGE_HEIGHT = MOLD_TOP_Y + MOLD_SLAB;

const EXPLODED = Object.freeze({
  asic: 0.16,
  mems: 0.62,
  // A tampa de silício sobe e some: na vista aberta ela só atrapalharia a massa.
  cap: { y: 0.7, z: -0.4, tilt: -0.2 },
  // O molde sobe um pouco e vira contorno translúcido, como raio-X de desenho técnico.
  mold: { y: 0.85 },
});

export interface PackageMaterials extends MemsMaterials {
  mold: THREE.MeshStandardMaterial;
  lead: THREE.MeshStandardMaterial;
  attach: THREE.MeshStandardMaterial;
  capSilicon: THREE.MeshPhysicalMaterial;
  frit: THREE.MeshStandardMaterial;
}

export interface ImuPackage {
  group: THREE.Group;
  mems: MemsDie;
  anchors: Record<string, THREE.Object3D>;
  /** Altura, no referencial do pacote, do topo do die MEMS no estado atual. */
  memsTopY(): number;
  memsGroup: THREE.Group;
  setExplode(value: number): void;
  dispose(): void;
}

function asicPads() {
  // Mesmas posições desenhadas na textura do ASIC (22 pads por lado, 62 px da borda em 2048 px).
  const size = 2048, margin = 150, inset = 62, count = 22;
  const toX = (px: number) => (px / size) * ASIC.w - ASIC.w / 2;
  const toZ = (py: number) => (py / size) * ASIC.d - ASIC.d / 2;
  const along = (i: number) => margin + ((size - margin * 2) * (i + 0.5)) / count;
  const pads: { side: 'back' | 'front' | 'left' | 'right'; x: number; z: number }[] = [];
  for (let i = 0; i < count; i++) {
    pads.push({ side: 'back', x: toX(along(i)), z: toZ(inset) });
    pads.push({ side: 'front', x: toX(along(i)), z: toZ(size - inset) });
    pads.push({ side: 'left', x: toX(inset), z: toZ(along(i)) });
    pads.push({ side: 'right', x: toX(size - inset), z: toZ(along(i)) });
  }
  return pads;
}

function tubeFor(curve: THREE.Curve<THREE.Vector3>) {
  return new THREE.TubeGeometry(curve, 30, 0.0085, 6, false);
}

export function createImuPackage(materials: PackageMaterials, palette: MemsPalette): ImuPackage {
  const group = new THREE.Group();
  group.name = 'imu-package';
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(item: T) => { disposables.push(item); return item; };
  const anchors: Record<string, THREE.Object3D> = {};
  const anchor = (parent: THREE.Object3D, name: string, x: number, y: number, z: number) => {
    const object = new THREE.Object3D();
    object.position.set(x, y, z);
    parent.add(object);
    anchors[name] = object;
  };

  // ------------------------------------------------------------ leadframe
  const half = PACKAGE.size / 2;
  const leadCount = 10, leadPitch = 0.28, leadLength = 0.34, leadWidth = 0.13;
  const leadParts: THREE.BufferGeometry[] = [boxAt(3.0, PACKAGE.frame, 2.66, 0, 0, 0)];
  const leadTips: { side: 'back' | 'front' | 'left' | 'right'; point: THREE.Vector3 }[] = [];
  for (let i = 0; i < leadCount; i++) {
    const along = (i - (leadCount - 1) / 2) * leadPitch;
    const inner = half - leadLength / 2;
    leadParts.push(boxAt(leadWidth, PACKAGE.frame, leadLength, along, 0, inner));
    leadParts.push(boxAt(leadWidth, PACKAGE.frame, leadLength, along, 0, -inner));
    leadParts.push(boxAt(leadLength, PACKAGE.frame, leadWidth, inner, 0, along));
    leadParts.push(boxAt(leadLength, PACKAGE.frame, leadWidth, -inner, 0, along));
    const bond = half - leadLength + 0.07;
    leadTips.push({ side: 'front', point: new THREE.Vector3(along, PACKAGE.frame, bond) });
    leadTips.push({ side: 'back', point: new THREE.Vector3(along, PACKAGE.frame, -bond) });
    leadTips.push({ side: 'right', point: new THREE.Vector3(bond, PACKAGE.frame, along) });
    leadTips.push({ side: 'left', point: new THREE.Vector3(-bond, PACKAGE.frame, along) });
  }
  const leadframe = new THREE.Mesh(track(merge(leadParts)), materials.lead);
  leadframe.castShadow = leadframe.receiveShadow = true;
  group.add(leadframe);
  anchor(group, 'leadframe', half - 0.2, PACKAGE.frame, half - 0.17);

  // ------------------------------------------------------------------ ASIC
  const asicGroup = new THREE.Group();
  group.add(asicGroup);
  const asicTex = asicTextures();
  track(asicTex.map); track(asicTex.roughness);
  const asicTop = materials.device.clone();
  asicTop.map = asicTex.map;
  asicTop.roughnessMap = asicTex.roughness;
  asicTop.color.set(0xffffff);
  asicTop.roughness = 1;
  asicTop.metalness = 0.55;
  asicTop.iridescence = 0.55;
  track(asicTop);
  const asicMesh = new THREE.Mesh(track(boxAt(ASIC.w, ASIC.t, ASIC.d, 0, ASIC_Y, 0)), [
    materials.dieSide, materials.dieSide, asicTop, materials.dieSide, materials.dieSide, materials.dieSide,
  ]);
  asicMesh.castShadow = asicMesh.receiveShadow = true;
  asicGroup.add(asicMesh);
  const asicAttach = new THREE.Mesh(track(boxAt(ASIC.w + 0.03, ATTACH, ASIC.d + 0.03, 0, PACKAGE.frame, 0)), materials.attach);
  asicAttach.receiveShadow = true;
  asicGroup.add(asicAttach);
  anchor(asicGroup, 'asic', ASIC.w / 2 - 0.35, ASIC_TOP, ASIC.d / 2 - 0.08);

  // ------------------------------------------------------------ die MEMS
  const memsGroup = new THREE.Group();
  memsGroup.position.set(0, MEMS_Y, MEMS_Z);
  group.add(memsGroup);
  const mems = createMemsDie(materials, palette);
  memsGroup.add(mems.group);
  const memsAttach = new THREE.Mesh(track(boxAt(DIE.w + 0.02, ATTACH, DIE.d + 0.02, 0, -ATTACH, 0)), materials.attach);
  memsGroup.add(memsAttach);
  anchor(memsGroup, 'mems', -DIE.w / 2 + 0.1, MEMS_TOP, DIE.d / 2 - 0.3);

  // ------------------------------------------------------------ tampa
  const capGroup = new THREE.Group();
  capGroup.position.set(0, CAP_Y, MEMS_Z + CAP.z);
  group.add(capGroup);
  const capMaterial = track(materials.capSilicon.clone());
  const cap = new THREE.Mesh(track(roundedBoxAt(CAP.w, CAP.t, CAP.d, 0, CAP.t / 2, 0, 0.012, 2)), capMaterial);
  cap.castShadow = false;
  cap.receiveShadow = true;
  capGroup.add(cap);
  const frit = new THREE.Mesh(track(merge([
    boxAt(CAP.w, 0.012, 0.06, 0, -0.012, CAP.d / 2 - 0.03),
    boxAt(CAP.w, 0.012, 0.06, 0, -0.012, -CAP.d / 2 + 0.03),
    boxAt(0.06, 0.012, CAP.d, CAP.w / 2 - 0.03, -0.012, 0),
    boxAt(0.06, 0.012, CAP.d, -CAP.w / 2 + 0.03, -0.012, 0),
  ])), materials.frit);
  capGroup.add(frit);
  // Cavidade gravada por baixo da tampa: é ali que a massa de prova tem espaço para andar.
  const recess = new THREE.Mesh(track(new THREE.PlaneGeometry(CAP.w - 0.2, CAP.d - 0.2)), materials.cavity);
  recess.rotation.x = Math.PI / 2;
  recess.position.y = -0.0005;
  capGroup.add(recess);
  anchor(capGroup, 'cap', CAP.w / 2 - 0.2, 0, CAP.d / 2 - 0.1);

  // ------------------------------------------------------------ molde
  const ringHeight = MOLD_TOP_Y - PACKAGE.frame;
  const opening = { w: 3.08, d: 3.08 };
  const wall = (PACKAGE.size - opening.w) / 2;
  // Epóxi próprio do pacote: some para um fantasma quando o chip abre.
  const ghost = track(materials.mold.clone());
  const ring = new THREE.Mesh(track(merge([
    boxAt(PACKAGE.size, ringHeight, wall, 0, 0, half - wall / 2),
    boxAt(PACKAGE.size, ringHeight, wall, 0, 0, -half + wall / 2),
    boxAt(wall, ringHeight, opening.d, half - wall / 2, 0, 0),
    boxAt(wall, ringHeight, opening.d, -half + wall / 2, 0, 0),
  ])), ghost);
  ring.position.y = PACKAGE.frame;
  ring.castShadow = ring.receiveShadow = true;
  group.add(ring);
  const moldGroup = new THREE.Group();
  moldGroup.position.set(0, MOLD_TOP_Y, 0);
  group.add(moldGroup);
  const marking = track(moldMarkingTexture());
  const moldTop = ghost.clone();
  moldTop.map = marking;
  moldTop.color.set(0xffffff);
  track(moldTop);
  const slabGeometry = track(boxAt(PACKAGE.size, MOLD_SLAB, PACKAGE.size, 0, 0, 0));
  const slab = new THREE.Mesh(slabGeometry, [ghost, ghost, moldTop, ghost, ghost, ghost]);
  slab.receiveShadow = true;
  moldGroup.add(slab);
  const edgeMaterial = track(new THREE.LineBasicMaterial({ color: palette.plus.clone().multiplyScalar(0.9), transparent: true, opacity: 0, depthWrite: false }));
  const slabEdges = new THREE.LineSegments(track(new THREE.EdgesGeometry(slabGeometry)), edgeMaterial);
  moldGroup.add(slabEdges);
  const ringEdges = new THREE.LineSegments(track(new THREE.EdgesGeometry(ring.geometry)), edgeMaterial);
  ringEdges.position.copy(ring.position);
  group.add(ringEdges);
  anchor(moldGroup, 'mold', half - 0.3, MOLD_SLAB, half - 0.25);

  // ------------------------------------------------------------ fios de ouro
  const pads = asicPads();
  const frontPads = pads.filter((pad) => pad.side === 'front');
  const used = new Set<number>();
  const nearestFront = (x: number) => {
    let best = -1;
    for (const [index, pad] of frontPads.entries()) {
      if (used.has(index)) continue;
      if (best < 0 || Math.abs(pad.x - x) < Math.abs(frontPads[best].x - x)) best = index;
    }
    used.add(best);
    return frontPads[best];
  };
  type Wire = { from: (explode: number) => THREE.Vector3; to: (explode: number) => THREE.Vector3; loop: number };
  const wires: Wire[] = [];
  const asicLift = (e: number) => e * EXPLODED.asic;
  const memsLift = (e: number) => e * EXPLODED.mems;
  const asicPadY = ASIC_TOP + 0.004;
  // Die MEMS → ASIC (fileira da frente).
  for (const pad of mems.pads) {
    const target = nearestFront(pad.x);
    wires.push({
      from: (e) => new THREE.Vector3(pad.x, MEMS_Y + pad.y + memsLift(e), MEMS_Z + pad.z),
      to: (e) => new THREE.Vector3(target.x, asicPadY + asicLift(e), target.z),
      loop: 0.15,
    });
  }
  // ASIC → terminais. Os pads de trás ficam sob o die MEMS: sem fio (pinos NC).
  const bySide = (side: string) => pads.filter((pad) => pad.side === side);
  for (const side of ['front', 'left', 'right'] as const) {
    const sidePads = side === 'front' ? frontPads.filter((_, index) => !used.has(index)) : bySide(side);
    for (const tip of leadTips.filter((item) => item.side === side)) {
      const along = side === 'front' ? tip.point.x : tip.point.z;
      let best = sidePads[0];
      for (const pad of sidePads) {
        const value = side === 'front' ? pad.x : pad.z;
        const current = side === 'front' ? best.x : best.z;
        if (Math.abs(value - along) < Math.abs(current - along)) best = pad;
      }
      const pad = best;
      wires.push({
        from: (e) => new THREE.Vector3(pad.x, asicPadY + asicLift(e), pad.z),
        to: () => tip.point.clone().setY(PACKAGE.frame + 0.004),
        loop: 0.2,
      });
    }
  }
  const closedParts: THREE.BufferGeometry[] = [];
  const openParts: THREE.BufferGeometry[] = [];
  for (const wire of wires) {
    closedParts.push(tubeFor(bondWireCurve(wire.from(0), wire.to(0), wire.loop)));
    openParts.push(tubeFor(bondWireCurve(wire.from(1), wire.to(1), wire.loop + 0.08)));
  }
  const closed = mergeGeometries(closedParts);
  const open = mergeGeometries(openParts);
  closedParts.forEach((part) => part.dispose());
  openParts.forEach((part) => part.dispose());
  closed.morphAttributes.position = [open.attributes.position as THREE.BufferAttribute];
  closed.morphAttributes.normal = [open.attributes.normal as THREE.BufferAttribute];
  open.dispose();
  track(closed);
  const wireMesh = new THREE.Mesh(closed, materials.gold);
  wireMesh.morphTargetInfluences = [0];
  wireMesh.castShadow = true;
  wireMesh.frustumCulled = false;
  group.add(wireMesh);

  // Bolas de solda: acompanham a peça em que estão presas.
  const ball = track(new THREE.SphereGeometry(0.02, 12, 8));
  ball.scale(1, 0.55, 1);
  const memsBalls = new THREE.InstancedMesh(ball, materials.gold, mems.pads.length);
  mems.pads.forEach((pad, index) => memsBalls.setMatrixAt(index, new THREE.Matrix4().makeTranslation(pad.x, pad.y + 0.004, pad.z)));
  memsGroup.add(memsBalls);
  // Cada fio toca o ASIC numa ponta: a de chegada (vindo do MEMS) ou a de saída (indo ao terminal).
  const onLead = (wire: Wire) => wire.to(0).y <= PACKAGE.frame + 0.01;
  const asicBalls = new THREE.InstancedMesh(ball, materials.gold, wires.length);
  wires.forEach((wire, index) => {
    const point = onLead(wire) ? wire.from(0) : wire.to(0);
    asicBalls.setMatrixAt(index, new THREE.Matrix4().makeTranslation(point.x, point.y + 0.003, point.z));
  });
  asicGroup.add(asicBalls);
  const leadWires = wires.filter(onLead);
  const leadBalls = new THREE.InstancedMesh(ball, materials.gold, leadWires.length);
  leadWires.forEach((wire, index) => leadBalls.setMatrixAt(index, new THREE.Matrix4().makeTranslation(wire.to(0).x, PACKAGE.frame + 0.006, wire.to(0).z)));
  group.add(leadBalls);
  anchor(group, 'wires', mems.pads[7].x + 0.05, MEMS_Y + MEMS_TOP + 0.08, MEMS_Z + mems.pads[7].z + 0.14);

  let explode = -1;
  function setExplode(value: number) {
    const e = THREE.MathUtils.clamp(value, 0, 1);
    if (e === explode) return;
    explode = e;
    asicGroup.position.y = asicLift(e);
    memsGroup.position.y = MEMS_Y + memsLift(e);
    capGroup.position.set(0, CAP_Y + memsLift(e) + e * EXPLODED.cap.y, MEMS_Z + CAP.z + e * EXPLODED.cap.z);
    capGroup.rotation.x = e * EXPLODED.cap.tilt;
    const capFade = THREE.MathUtils.clamp(1 - (e - 0.25) / 0.45, 0, 1);
    capMaterial.transparent = capFade < 1;
    capMaterial.opacity = capFade;
    capGroup.visible = capFade > 0.01;
    moldGroup.position.set(0, MOLD_TOP_Y + e * EXPLODED.mold.y, 0);
    const solid = 1 - e * 0.92;
    for (const material of [ghost, moldTop]) {
      material.transparent = e > 0.001;
      material.opacity = solid;
      material.depthWrite = e < 0.4;
    }
    edgeMaterial.opacity = e * 0.55;
    slab.castShadow = ring.castShadow = e < 0.4;
    wireMesh.morphTargetInfluences![0] = e;
  }
  setExplode(0);

  return {
    group,
    mems,
    anchors,
    memsGroup,
    memsTopY: () => memsGroup.position.y + MEMS_TOP,
    setExplode,
    dispose() {
      mems.dispose();
      disposables.forEach((item) => item.dispose());
      memsBalls.dispose(); asicBalls.dispose(); leadBalls.dispose();
    },
  };
}
