import * as THREE from 'three';
import { beamBetween, boxAt, followMaterial, holedPlate, merge, plateWithCutouts, serpentineSpring } from './geometry';
import { dieFieldTexture } from './textures';

/**
 * Die MEMS do IMU, desenhado para ser lido de perto. Geometria simplificada
 * (dedos mais grossos e em menor número que num chip real), mas com as peças
 * certas no lugar certo: massa de prova vazada, molas dobradas, âncoras, pentes
 * diferenciais nos dois eixos do plano, gangorra do eixo vertical e o
 * diapasão do giroscópio. Eixos locais: x do die = frente do caminhão,
 * z do die = direita do caminhão, y para cima.
 */

export const DIE = Object.freeze({ w: 2.5, d: 2.1, t: 0.14 });
const GAP = 0.012;
const THICK = 0.045;
const FLOOR = DIE.t;
const S_BOTTOM = FLOOR + GAP;
export const MEMS_TOP = S_BOTTOM + THICK;

export const ACC = Object.freeze({ cx: -0.58, cz: 0, half: 0.28, cavity: 0.58 });
const FINGER = Object.freeze({ w: 0.018, gap: 0.024, len: 0.19, count: 7, fixedInset: 0.035, barGap: 0.02, bar: 0.04 });
const PITCH = 2 * (FINGER.w + FINGER.gap);
/** Vão nominal desenhado entre dedo móvel e dedo fixo, em unidades de cena. */
export const DRAWN_GAP = FINGER.gap;

export const SEESAW = Object.freeze({ cx: 0.64, cz: -0.62, pivotOffset: -0.1, w: 0.84, d: 0.32, lift: 0.018 });
export const GYRO = Object.freeze({ cx: 0.64, cz: 0.38, massOffset: 0.2, w: 0.24, d: 0.3 });

export interface MemsPalette {
  plus: THREE.Color;
  minus: THREE.Color;
  force: THREE.Color;
  coriolis: THREE.Color;
}

export interface MemsMaterials {
  device: THREE.MeshPhysicalMaterial;
  moving: THREE.MeshPhysicalMaterial;
  cavity: THREE.MeshStandardMaterial;
  dieSide: THREE.MeshPhysicalMaterial;
  aluminum: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
}

export interface MemsFrame {
  /** Deslocamento da massa de prova no plano do die (unidades de cena). */
  disp: { x: number; z: number };
  /** Força no plano, em g, para a seta de carga. */
  forceInPlane: { x: number; z: number };
  seesaw: number;
  gyro: { phase: number; drive: number; sense: number; omegaDps: number };
  glow: { xPlus: number; xMinus: number; zPlus: number; zMinus: number; seesawHeavy: number; seesawLight: number; gyroPlus: number; gyroMinus: number };
  showGhost: number;
}

export interface MemsDie {
  group: THREE.Group;
  anchors: Record<string, THREE.Object3D>;
  /** Centros dos pads de solda no referencial do die. */
  pads: THREE.Vector3[];
  update(frame: MemsFrame): void;
  dispose(): void;
}

type Bank = { axis: 'x' | 'z'; side: 1 | -1 };
const BANKS: Bank[] = [
  { axis: 'x', side: 1 }, { axis: 'x', side: -1 },
  { axis: 'z', side: 1 }, { axis: 'z', side: -1 },
];

/** (a ao longo do vão, b para fora da massa) → (x, z) relativos ao centro do acelerômetro. */
function bankToDie(bank: Bank, a: number, b: number): [number, number] {
  return bank.axis === 'x' ? [a, bank.side * b] : [bank.side * b, a];
}

/**
 * Campo elétrico no vão: lâmina de luz no meio do vão, mais forte no meio da
 * espessura e apagando perto dos dedos. `axis` diz qual eixo local é o vão
 * (0 = x, 1 = y para a gangorra, 2 = z).
 */
function glowMaterial(color: THREE.Color, axis: 0 | 1 | 2 = 0) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color.clone() }, uLevel: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vLocal;
      void main(){
        vLocal = position;
        vec4 world = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          world = instanceMatrix * world;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * world;
      }`,
    fragmentShader: `uniform vec3 uColor; uniform float uLevel; varying vec3 vLocal;
      void main(){
        float across = ${['vLocal.x', 'vLocal.y', 'vLocal.z'][axis]} * 2.0;
        float depth = ${axis === 1 ? 'vLocal.x * 2.0' : 'vLocal.y * 2.0'};
        float sheet = exp(-across * across * 5.0);
        float body = 1.0 - smoothstep(0.35, 1.0, abs(depth));
        float edge = 0.35 + 0.65 * body;
        gl_FragColor = vec4(uColor * uLevel * sheet * edge, 1.0);
      }`,
  });
}

function setGlow(material: THREE.ShaderMaterial, base: THREE.Color, level: number) {
  material.uniforms.uColor.value.copy(base);
  material.uniforms.uLevel.value = level;
}

export function createMemsDie(materials: MemsMaterials, palette: MemsPalette): MemsDie {
  const group = new THREE.Group();
  group.name = 'mems-die';
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(item: T) => { disposables.push(item); return item; };
  const anchors: Record<string, THREE.Object3D> = {};
  const anchor = (name: string, x: number, y: number, z: number) => {
    const object = new THREE.Object3D();
    object.name = `anchor-${name}`;
    object.position.set(x, y, z);
    group.add(object);
    anchors[name] = object;
    return object;
  };

  // ---------------------------------------------------------- corpo do die
  const slab = new THREE.Mesh(track(boxAt(DIE.w, DIE.t, DIE.d, 0, 0, 0)), [
    materials.dieSide, materials.dieSide, materials.cavity, materials.dieSide, materials.dieSide, materials.dieSide,
  ]);
  slab.castShadow = slab.receiveShadow = true;
  group.add(slab);

  const cavities = [
    { x: ACC.cx, z: ACC.cz, w: ACC.cavity * 2, d: ACC.cavity * 2 },
    { x: GYRO.cx, z: GYRO.cz, w: 1.08, d: 0.72 },
    { x: SEESAW.cx, z: SEESAW.cz, w: 1.04, d: 0.5 },
  ];
  const fieldTexture = track(dieFieldTexture());
  const fieldMaterial = materials.device.clone();
  fieldMaterial.map = fieldTexture;
  fieldMaterial.color.set(0xffffff);
  // O campo é a maior área lisa: mais fosco, para não virar espelho da janela.
  fieldMaterial.roughness = 0.5;
  fieldMaterial.envMapIntensity = 0.5;
  track(fieldMaterial);
  const field = new THREE.Mesh(track(plateWithCutouts(DIE.w, DIE.d, MEMS_TOP - FLOOR, cavities)), fieldMaterial);
  field.position.y = FLOOR;
  field.castShadow = field.receiveShadow = true;
  group.add(field);

  // Anel de vedação na borda.
  const ringParts = [
    boxAt(DIE.w - 0.04, 0.004, 0.022, 0, MEMS_TOP, DIE.d / 2 - 0.03),
    boxAt(DIE.w - 0.04, 0.004, 0.022, 0, MEMS_TOP, -DIE.d / 2 + 0.03),
    boxAt(0.022, 0.004, DIE.d - 0.04, DIE.w / 2 - 0.03, MEMS_TOP, 0),
    boxAt(0.022, 0.004, DIE.d - 0.04, -DIE.w / 2 + 0.03, MEMS_TOP, 0),
  ];

  // Pads de solda na borda da frente.
  const pads: THREE.Vector3[] = [];
  const padParts: THREE.BufferGeometry[] = [];
  const padCount = 10;
  for (let i = 0; i < padCount; i++) {
    const x = -1.04 + (2.08 * i) / (padCount - 1);
    const z = DIE.d / 2 - 0.12;
    padParts.push(boxAt(0.085, 0.005, 0.085, x, MEMS_TOP, z));
    pads.push(new THREE.Vector3(x, MEMS_TOP + 0.005, z));
  }

  // --------------------------------------------------------- acelerômetro
  const accel = new THREE.Group();
  accel.position.set(ACC.cx, 0, ACC.cz);
  group.add(accel);
  const massGroup = new THREE.Group();
  massGroup.name = 'proof-mass';
  accel.add(massGroup);

  const plate = new THREE.Mesh(track(holedPlate(ACC.half * 2, ACC.half * 2, THICK, { nx: 8, nz: 8, size: 0.028, margin: 0.03 })), materials.moving);
  plate.position.y = S_BOTTOM;
  plate.castShadow = plate.receiveShadow = true;
  massGroup.add(plate);

  const movingFinger = track(new THREE.BoxGeometry(1, 1, 1));
  const movingCount = BANKS.length * FINGER.count;
  const moving = new THREE.InstancedMesh(movingFinger, materials.moving, movingCount);
  const fixed = new THREE.InstancedMesh(movingFinger, materials.device, BANKS.length * (FINGER.count + 1));
  moving.castShadow = moving.receiveShadow = fixed.castShadow = fixed.receiveShadow = true;
  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const statorParts: THREE.BufferGeometry[] = [];
  const barCenter = ACC.half + FINGER.len + FINGER.fixedInset + FINGER.barGap + FINGER.bar / 2;
  const barSpan = (FINGER.count + 1) * PITCH + FINGER.w;
  let mi = 0, fi = 0;
  for (const bank of BANKS) {
    const lengthVec = (along: number, across: number) => (bank.axis === 'x' ? scale.set(along, THICK, across) : scale.set(across, THICK, along));
    for (let k = 0; k < FINGER.count; k++) {
      const a = (k - (FINGER.count - 1) / 2) * PITCH;
      const b = ACC.half + FINGER.len / 2;
      const [x, z] = bankToDie(bank, a, b);
      lengthVec(FINGER.w, FINGER.len);
      moving.setMatrixAt(mi++, matrix.compose(position.set(x, S_BOTTOM + THICK / 2, z), quaternion, scale));
    }
    for (let k = 0; k <= FINGER.count; k++) {
      const a = (k - FINGER.count / 2) * PITCH;
      const start = ACC.half + FINGER.fixedInset;
      const end = barCenter - FINGER.bar / 2;
      const [x, z] = bankToDie(bank, a, (start + end) / 2);
      lengthVec(FINGER.w, end - start);
      fixed.setMatrixAt(fi++, matrix.compose(position.set(x, S_BOTTOM + THICK / 2, z), quaternion, scale));
    }
    const [bx, bz] = bankToDie(bank, 0, barCenter);
    // A barra do estator é âncora: vai do fundo da cavidade até o topo.
    statorParts.push(bank.axis === 'x'
      ? boxAt(barSpan, MEMS_TOP - FLOOR, FINGER.bar, bx, FLOOR, bz)
      : boxAt(FINGER.bar, MEMS_TOP - FLOOR, barSpan, bx, FLOOR, bz));
  }
  moving.instanceMatrix.needsUpdate = true;
  fixed.instanceMatrix.needsUpdate = true;
  massGroup.add(moving);
  accel.add(fixed);
  const stators = new THREE.Mesh(track(merge(statorParts)), materials.device);
  stators.castShadow = stators.receiveShadow = true;
  accel.add(stators);

  // Molas dobradas nos cantos, presas em âncoras.
  const springUniforms = { uDisp: { value: new THREE.Vector3() } };
  const springMaterial = track(followMaterial(materials.moving, springUniforms, 'accel'));
  const springParts: THREE.BufferGeometry[] = [];
  const anchorParts: THREE.BufferGeometry[] = [];
  const contactParts: THREE.BufferGeometry[] = [];
  const cornerAnchor = ACC.half + 0.19;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const anchorPoint = new THREE.Vector2(sx * cornerAnchor, sz * cornerAnchor);
      anchorParts.push(boxAt(0.075, MEMS_TOP - FLOOR, 0.075, anchorPoint.x, FLOOR, anchorPoint.y));
      contactParts.push(boxAt(0.042, 0.004, 0.042, anchorPoint.x, MEMS_TOP, anchorPoint.y));
      const from = anchorPoint.clone().add(new THREE.Vector2(-sx * 0.035, -sz * 0.035));
      const to = new THREE.Vector2(sx * (ACC.half - 0.004), sz * (ACC.half - 0.004));
      springParts.push(serpentineSpring(from, to, 6, 0.026, 0.011, THICK, S_BOTTOM));
    }
  }
  const springs = new THREE.Mesh(track(merge(springParts)), springMaterial);
  springs.castShadow = true;
  accel.add(springs);
  const accelAnchors = new THREE.Mesh(track(merge(anchorParts)), materials.device);
  accelAnchors.castShadow = accelAnchors.receiveShadow = true;
  accel.add(accelAnchors);

  // Brilho do campo elétrico nos vãos: cada lado do pente tem sua cor.
  const unit = track(new THREE.BoxGeometry(1, 1, 1));
  const glowMaterials = {
    xPlus: track(glowMaterial(palette.plus, 0)), xMinus: track(glowMaterial(palette.minus, 0)),
    zPlus: track(glowMaterial(palette.plus, 2)), zMinus: track(glowMaterial(palette.minus, 2)),
  };
  const glowMeshes = {
    xPlus: new THREE.InstancedMesh(unit, glowMaterials.xPlus, FINGER.count * 2),
    xMinus: new THREE.InstancedMesh(unit, glowMaterials.xMinus, FINGER.count * 2),
    zPlus: new THREE.InstancedMesh(unit, glowMaterials.zPlus, FINGER.count * 2),
    zMinus: new THREE.InstancedMesh(unit, glowMaterials.zMinus, FINGER.count * 2),
  };
  for (const mesh of Object.values(glowMeshes)) {
    mesh.frustumCulled = false;
    mesh.renderOrder = 5;
    accel.add(mesh);
  }

  // Contorno da posição de repouso, para enxergar os nanômetros ampliados.
  const ghostGeometry = track(new THREE.EdgesGeometry(new THREE.BoxGeometry(ACC.half * 2, 0.001, ACC.half * 2)));
  const ghostMaterial = track(new THREE.LineBasicMaterial({ color: palette.plus.clone().multiplyScalar(1.4), transparent: true, opacity: 0, depthWrite: false }));
  const ghost = new THREE.LineSegments(ghostGeometry, ghostMaterial);
  ghost.position.y = MEMS_TOP + 0.003;
  accel.add(ghost);

  // Seta de carga na massa: mesma cor da seta que empurra o caminhão.
  const forceMaterial = track(new THREE.MeshBasicMaterial({ color: palette.force.clone().multiplyScalar(1.35), toneMapped: true }));
  const forceArrow = new THREE.Group();
  const shaftGeometry = track(new THREE.CylinderGeometry(0.012, 0.012, 1, 12));
  shaftGeometry.rotateZ(-Math.PI / 2);
  shaftGeometry.translate(0.5, 0, 0);
  const headGeometry = track(new THREE.ConeGeometry(0.034, 0.08, 16));
  headGeometry.rotateZ(-Math.PI / 2);
  const shaft = new THREE.Mesh(shaftGeometry, forceMaterial);
  const head = new THREE.Mesh(headGeometry, forceMaterial);
  forceArrow.add(shaft, head);
  forceArrow.position.y = MEMS_TOP + 0.05;
  forceArrow.renderOrder = 6;
  massGroup.add(forceArrow);

  anchor('proof-mass', ACC.cx, MEMS_TOP, ACC.cz);
  anchor('spring', ACC.cx + cornerAnchor * 0.72, MEMS_TOP, ACC.cz - cornerAnchor * 0.72);
  anchor('fixed-fingers', ACC.cx - 0.12, MEMS_TOP, ACC.cz + barCenter - 0.02);
  anchor('lateral-comb', ACC.cx + barCenter - 0.08, MEMS_TOP, ACC.cz + 0.1);
  anchor('finger-gap', ACC.cx + PITCH * 0.25, MEMS_TOP, ACC.cz + ACC.half + FINGER.len * 0.55);
  anchor('anchor', ACC.cx - cornerAnchor, MEMS_TOP, ACC.cz + cornerAnchor);

  // ------------------------------------------------------------- gangorra Z
  const seesaw = new THREE.Group();
  const pivotX = SEESAW.cx + SEESAW.pivotOffset;
  seesaw.position.set(pivotX, S_BOTTOM + SEESAW.lift + THICK / 2, SEESAW.cz);
  group.add(seesaw);
  const paddleGeometry = track(holedPlate(SEESAW.w, SEESAW.d, THICK, { nx: 11, nz: 4, size: 0.026, margin: 0.03 }));
  paddleGeometry.translate(-SEESAW.pivotOffset, -THICK / 2, 0);
  const paddle = new THREE.Mesh(paddleGeometry, materials.moving);
  paddle.castShadow = paddle.receiveShadow = true;
  seesaw.add(paddle);
  const seesawStatic: THREE.BufferGeometry[] = [];
  const torsionReach = SEESAW.d / 2 + 0.1;
  for (const s of [-1, 1]) {
    seesawStatic.push(boxAt(0.06, MEMS_TOP + SEESAW.lift - FLOOR, 0.06, pivotX, FLOOR, SEESAW.cz + s * (torsionReach + 0.03)));
    seesawStatic.push(beamBetween(
      new THREE.Vector2(pivotX, SEESAW.cz + s * (SEESAW.d / 2 - 0.004)),
      new THREE.Vector2(pivotX, SEESAW.cz + s * torsionReach),
      0.016, THICK, S_BOTTOM + SEESAW.lift,
    ));
    contactParts.push(boxAt(0.034, 0.004, 0.034, pivotX, MEMS_TOP + SEESAW.lift, SEESAW.cz + s * (torsionReach + 0.03)));
  }
  const seesawFixed = new THREE.Mesh(track(merge(seesawStatic)), materials.device);
  seesawFixed.castShadow = seesawFixed.receiveShadow = true;
  group.add(seesawFixed);
  // Eletrodos no fundo da cavidade, um sob cada braço.
  const heavyArm = { from: pivotX + 0.06, to: pivotX + 0.06 + 0.3 };
  const lightArm = { from: pivotX - 0.06 - 0.3, to: pivotX - 0.06 };
  const electrodes = new THREE.Mesh(track(merge([
    boxAt(heavyArm.to - heavyArm.from, 0.004, SEESAW.d - 0.06, (heavyArm.from + heavyArm.to) / 2, FLOOR, SEESAW.cz),
    boxAt(lightArm.to - lightArm.from, 0.004, SEESAW.d - 0.06, (lightArm.from + lightArm.to) / 2, FLOOR, SEESAW.cz),
  ])), materials.gold);
  electrodes.receiveShadow = true;
  group.add(electrodes);
  const seesawGlow = {
    heavy: new THREE.Mesh(unit, track(glowMaterial(palette.plus, 1))),
    light: new THREE.Mesh(unit, track(glowMaterial(palette.minus, 1))),
  };
  for (const mesh of Object.values(seesawGlow)) { mesh.renderOrder = 5; group.add(mesh); }
  anchor('seesaw', pivotX + 0.24, MEMS_TOP + SEESAW.lift, SEESAW.cz);
  anchor('electrode', pivotX + 0.2, FLOOR, SEESAW.cz + SEESAW.d / 2 - 0.02);

  // ------------------------------------------------------------ giroscópio
  const gyro = new THREE.Group();
  gyro.position.set(GYRO.cx, 0, GYRO.cz);
  group.add(gyro);
  const gyroMasses: THREE.Group[] = [];
  const gyroSpringUniforms = [{ uDisp: { value: new THREE.Vector3() } }, { uDisp: { value: new THREE.Vector3() } }];
  const gyroStatic: THREE.BufferGeometry[] = [];
  const driveFixed: THREE.BufferGeometry[] = [];
  const gyroGlowPlus = new THREE.InstancedMesh(unit, track(glowMaterial(palette.plus, 2)), 10);
  const gyroGlowMinus = new THREE.InstancedMesh(unit, track(glowMaterial(palette.minus, 2)), 10);
  for (const mesh of [gyroGlowPlus, gyroGlowMinus]) { mesh.frustumCulled = false; mesh.renderOrder = 5; gyro.add(mesh); }
  const senseFinger = { len: 0.052, w: 0.014, pitch: 0.056, count: 5 };
  const coriolisArrows: THREE.Group[] = [];
  const coriolisMaterial = track(new THREE.MeshBasicMaterial({ color: palette.coriolis.clone().multiplyScalar(2.4) }));
  for (const [index, sx] of ([-1, 1] as const).entries()) {
    const massX = sx * GYRO.massOffset;
    const mass = new THREE.Group();
    mass.position.set(massX, 0, 0);
    gyro.add(mass);
    gyroMasses.push(mass);
    const body = new THREE.Mesh(track(holedPlate(GYRO.w, GYRO.d, THICK, { nx: 4, nz: 5, size: 0.024, margin: 0.03 })), materials.moving);
    body.position.y = S_BOTTOM;
    body.castShadow = body.receiveShadow = true;
    mass.add(body);
    // Pente de acionamento na borda de fora: dedos longos em x (comb drive).
    const driveParts: THREE.BufferGeometry[] = [];
    const outer = sx * (GYRO.w / 2);
    for (let k = 0; k < 5; k++) {
      const z = (k - 2) * 0.058;
      driveParts.push(boxAt(0.1, THICK, 0.014, outer + sx * 0.05, S_BOTTOM, z));
      driveFixed.push(boxAt(0.1, THICK, 0.014, massX + outer + sx * 0.105, S_BOTTOM, z + 0.029));
    }
    driveFixed.push(boxAt(0.036, MEMS_TOP - FLOOR, 0.34, massX + outer + sx * 0.172, FLOOR, 0));
    // Pente de detecção na borda de dentro: dedos em x, empilhados em z.
    const inner = -sx * (GYRO.w / 2);
    for (let k = 0; k < senseFinger.count; k++) {
      const z = (k - (senseFinger.count - 1) / 2) * senseFinger.pitch;
      driveParts.push(boxAt(senseFinger.len, THICK, senseFinger.w, inner - sx * senseFinger.len / 2, S_BOTTOM, z));
    }
    const fingers = new THREE.Mesh(track(merge(driveParts)), materials.moving);
    fingers.castShadow = fingers.receiveShadow = true;
    mass.add(fingers);
    // Molas nas bordas de cima e de baixo, âncoras fora da massa.
    const springs: THREE.BufferGeometry[] = [];
    for (const sz of [-1, 1]) {
      for (const ox of [-1, 1]) {
        const ax = massX + ox * 0.075, az = sz * (GYRO.d / 2 + 0.11);
        gyroStatic.push(boxAt(0.05, MEMS_TOP - FLOOR, 0.05, ax, FLOOR, az));
        contactParts.push(boxAt(0.028, 0.004, 0.028, GYRO.cx + ax, MEMS_TOP, GYRO.cz + az));
        springs.push(serpentineSpring(new THREE.Vector2(ax, az - sz * 0.025), new THREE.Vector2(ax, sz * (GYRO.d / 2 - 0.004)), 4, 0.02, 0.009, THICK, S_BOTTOM));
      }
    }
    const springMesh = new THREE.Mesh(track(merge(springs)), track(followMaterial(materials.moving, gyroSpringUniforms[index], `gyro-${index}`)));
    springMesh.castShadow = true;
    gyro.add(springMesh);
    // Seta de Coriolis sobre a massa.
    const arrow = new THREE.Group();
    const cShaft = new THREE.Mesh(shaftGeometry, coriolisMaterial);
    const cHead = new THREE.Mesh(headGeometry, coriolisMaterial);
    arrow.add(cShaft, cHead);
    arrow.rotation.y = -Math.PI / 2;
    arrow.position.y = MEMS_TOP + 0.05;
    arrow.renderOrder = 6;
    mass.add(arrow);
    coriolisArrows.push(arrow);
  }
  // Espinha central com os dedos fixos da detecção.
  gyroStatic.push(boxAt(0.034, MEMS_TOP - FLOOR, 0.3, 0, FLOOR, 0));
  for (const sx of [-1, 1]) {
    for (let k = 0; k < senseFinger.count + 1; k++) {
      const z = (k - senseFinger.count / 2) * senseFinger.pitch;
      gyroStatic.push(boxAt(senseFinger.len, THICK, senseFinger.w, sx * (0.017 + senseFinger.len / 2), S_BOTTOM, z));
    }
  }
  const gyroFixed = new THREE.Mesh(track(merge([...gyroStatic, ...driveFixed])), materials.device);
  gyroFixed.castShadow = gyroFixed.receiveShadow = true;
  gyro.add(gyroFixed);
  anchor('gyro', GYRO.cx - GYRO.massOffset, MEMS_TOP, GYRO.cz - 0.05);
  anchor('gyro-drive', GYRO.cx + GYRO.massOffset + GYRO.w / 2 + 0.1, MEMS_TOP, GYRO.cz + 0.14);

  // ------------------------------------------------ trilhas, contatos, pads
  const traceParts: THREE.BufferGeometry[] = [];
  const trace = (points: [number, number][], y: number) => {
    for (let i = 0; i < points.length - 1; i++) {
      traceParts.push(beamBetween(new THREE.Vector2(...points[i]), new THREE.Vector2(...points[i + 1]), 0.014, 0.003, y));
    }
  };
  const frontZ = DIE.d / 2 - 0.12;
  // Do estator e das âncoras do acelerômetro até os pads da esquerda.
  trace([[ACC.cx - 0.3, ACC.cz + barCenter], [ACC.cx - 0.3, ACC.cavity + 0.08], [pads[0].x, ACC.cavity + 0.08], [pads[0].x, frontZ]], MEMS_TOP);
  trace([[ACC.cx + 0.3, ACC.cz + barCenter], [ACC.cx + 0.3, ACC.cavity + 0.12], [pads[3].x, ACC.cavity + 0.12], [pads[3].x, frontZ]], MEMS_TOP);
  trace([[ACC.cx + barCenter, ACC.cz + 0.3], [ACC.cx + ACC.cavity + 0.03, ACC.cz + 0.3], [ACC.cx + ACC.cavity + 0.03, ACC.cavity + 0.16], [pads[4].x, ACC.cavity + 0.16], [pads[4].x, frontZ]], MEMS_TOP);
  trace([[ACC.cx - barCenter, ACC.cz + 0.3], [ACC.cx - ACC.cavity - 0.04, ACC.cz + 0.3], [ACC.cx - ACC.cavity - 0.04, frontZ - 0.1], [pads[1].x, frontZ - 0.1], [pads[1].x, frontZ]], MEMS_TOP);
  trace([[ACC.cx - cornerAnchor, ACC.cz + cornerAnchor], [ACC.cx - cornerAnchor, ACC.cavity + 0.04], [pads[2].x, ACC.cavity + 0.04], [pads[2].x, frontZ]], MEMS_TOP);
  // Giroscópio e gangorra para os pads da direita.
  trace([[GYRO.cx, GYRO.cz + 0.15], [GYRO.cx, GYRO.cz + 0.42], [pads[6].x, GYRO.cz + 0.42], [pads[6].x, frontZ]], MEMS_TOP);
  trace([[GYRO.cx + 0.45, GYRO.cz], [GYRO.cx + 0.58, GYRO.cz], [GYRO.cx + 0.58, frontZ - 0.08], [pads[9].x, frontZ - 0.08], [pads[9].x, frontZ]], MEMS_TOP);
  trace([[GYRO.cx - 0.45, GYRO.cz], [GYRO.cx - 0.52, GYRO.cz], [GYRO.cx - 0.52, GYRO.cz + 0.44], [pads[5].x, GYRO.cz + 0.44], [pads[5].x, frontZ]], MEMS_TOP);
  trace([[pivotX, SEESAW.cz + torsionReach + 0.03], [pivotX, SEESAW.cz + 0.32], [SEESAW.cx + 0.54, SEESAW.cz + 0.32], [SEESAW.cx + 0.54, frontZ - 0.16], [pads[8].x, frontZ - 0.16], [pads[8].x, frontZ]], MEMS_TOP);
  trace([[GYRO.cx + 0.3, GYRO.cz + 0.28], [GYRO.cx + 0.3, GYRO.cz + 0.48], [pads[7].x, GYRO.cz + 0.48], [pads[7].x, frontZ]], MEMS_TOP);
  const metal = new THREE.Mesh(track(merge([...traceParts, ...ringParts, ...padParts, ...contactParts])), materials.aluminum);
  metal.receiveShadow = true;
  group.add(metal);
  anchor('pads', pads[2].x, MEMS_TOP, pads[2].z);

  // ----------------------------------------------------------- animação
  const glowMatrix = new THREE.Matrix4();
  const glowPosition = new THREE.Vector3();
  const glowScale = new THREE.Vector3();
  const identity = new THREE.Quaternion();
  const forceDirection = new THREE.Vector3();

  function updateCombGlow(disp: { x: number; z: number }) {
    const counters = { xPlus: 0, xMinus: 0, zPlus: 0, zMinus: 0 };
    const fixedStart = ACC.half + FINGER.fixedInset;
    const fixedEnd = barCenter - FINGER.bar / 2;
    for (const bank of BANKS) {
      const da = bank.axis === 'x' ? disp.x : disp.z;
      const db = (bank.axis === 'x' ? disp.z : disp.x) * bank.side;
      const b0 = Math.max(ACC.half + db, fixedStart);
      const b1 = Math.min(ACC.half + FINGER.len + db, fixedEnd);
      const overlap = Math.max(0.001, b1 - b0);
      const bMid = (b0 + b1) / 2;
      for (let k = 0; k < FINGER.count; k++) {
        const a = (k - (FINGER.count - 1) / 2) * PITCH + da;
        const plusFrom = a + FINGER.w / 2, plusTo = (k - (FINGER.count - 1) / 2 + 0.5) * PITCH - FINGER.w / 2;
        const minusFrom = (k - (FINGER.count - 1) / 2 - 0.5) * PITCH + FINGER.w / 2, minusTo = a - FINGER.w / 2;
        for (const [key, from, to] of [[bank.axis === 'x' ? 'xPlus' : 'zPlus', plusFrom, plusTo], [bank.axis === 'x' ? 'xMinus' : 'zMinus', minusFrom, minusTo]] as const) {
          const width = Math.max(0.0008, to - from);
          const [x, z] = bankToDie(bank, (from + to) / 2, bMid);
          if (bank.axis === 'x') glowScale.set(width, THICK * 0.86, overlap);
          else glowScale.set(overlap, THICK * 0.86, width);
          glowMatrix.compose(glowPosition.set(x, S_BOTTOM + THICK / 2, z), identity, glowScale);
          glowMeshes[key].setMatrixAt(counters[key]++, glowMatrix);
        }
      }
    }
    for (const mesh of Object.values(glowMeshes)) mesh.instanceMatrix.needsUpdate = true;
  }

  function updateGyroGlow(senseA: number, senseB: number) {
    let plus = 0, minus = 0;
    for (const [index, sx] of ([-1, 1] as const).entries()) {
      const sense = index === 0 ? senseA : senseB;
      const massX = sx * GYRO.massOffset;
      const inner = massX - sx * (GYRO.w / 2);
      const movingMidX = inner - sx * senseFinger.len / 2;
      const fixedMidX = sx * (0.017 + senseFinger.len / 2);
      const overlapFrom = Math.max(Math.min(movingMidX, fixedMidX) - senseFinger.len / 2, Math.max(movingMidX, fixedMidX) - senseFinger.len / 2);
      const overlapTo = Math.min(Math.max(movingMidX, fixedMidX) + senseFinger.len / 2, Math.min(movingMidX, fixedMidX) + senseFinger.len / 2);
      const length = Math.max(0.004, overlapTo - overlapFrom);
      const midX = (overlapFrom + overlapTo) / 2;
      for (let k = 0; k < senseFinger.count; k++) {
        const z = (k - (senseFinger.count - 1) / 2) * senseFinger.pitch + sense;
        const fixedAbove = (k - senseFinger.count / 2 + 1) * senseFinger.pitch;
        const fixedBelow = (k - senseFinger.count / 2) * senseFinger.pitch;
        const upFrom = z + senseFinger.w / 2, upTo = fixedAbove - senseFinger.w / 2;
        const downFrom = fixedBelow + senseFinger.w / 2, downTo = z - senseFinger.w / 2;
        glowScale.set(length, THICK * 0.86, Math.max(0.0008, upTo - upFrom));
        gyroGlowPlus.setMatrixAt(plus++, glowMatrix.compose(glowPosition.set(midX, S_BOTTOM + THICK / 2, (upFrom + upTo) / 2), identity, glowScale));
        glowScale.set(length, THICK * 0.86, Math.max(0.0008, downTo - downFrom));
        gyroGlowMinus.setMatrixAt(minus++, glowMatrix.compose(glowPosition.set(midX, S_BOTTOM + THICK / 2, (downFrom + downTo) / 2), identity, glowScale));
      }
    }
    gyroGlowPlus.instanceMatrix.needsUpdate = true;
    gyroGlowMinus.instanceMatrix.needsUpdate = true;
  }

  function update(frame: MemsFrame) {
    const { disp } = frame;
    massGroup.position.set(disp.x, 0, disp.z);
    springUniforms.uDisp.value.set(disp.x, 0, disp.z);
    updateCombGlow(disp);
    setGlow(glowMaterials.xPlus, palette.plus, frame.glow.xPlus);
    setGlow(glowMaterials.xMinus, palette.minus, frame.glow.xMinus);
    setGlow(glowMaterials.zPlus, palette.plus, frame.glow.zPlus);
    setGlow(glowMaterials.zMinus, palette.minus, frame.glow.zMinus);
    ghostMaterial.opacity = frame.showGhost;

    const inPlane = Math.hypot(frame.forceInPlane.x, frame.forceInPlane.z);
    forceArrow.visible = inPlane > 0.015;
    if (forceArrow.visible) {
      forceDirection.set(frame.forceInPlane.x, 0, frame.forceInPlane.z).normalize();
      forceArrow.rotation.y = Math.atan2(-forceDirection.z, forceDirection.x);
      const length = Math.min(0.62, 0.08 + inPlane * 0.55);
      shaft.scale.set(length, 1, 1);
      head.position.x = length + 0.035;
    }

    seesaw.rotation.z = frame.seesaw;
    const armGap = (reach: number) => SEESAW.lift + GAP - Math.sin(frame.seesaw) * reach;
    const heavyReach = (heavyArm.from + heavyArm.to) / 2 - pivotX;
    const lightReach = (lightArm.from + lightArm.to) / 2 - pivotX;
    const heavyGap = Math.max(0.002, armGap(heavyReach));
    const lightGap = Math.max(0.002, armGap(lightReach));
    seesawGlow.heavy.scale.set(heavyArm.to - heavyArm.from, heavyGap - 0.004, SEESAW.d - 0.08);
    seesawGlow.heavy.position.set((heavyArm.from + heavyArm.to) / 2, FLOOR + 0.004 + (heavyGap - 0.004) / 2, SEESAW.cz);
    seesawGlow.light.scale.set(lightArm.to - lightArm.from, lightGap - 0.004, SEESAW.d - 0.08);
    seesawGlow.light.position.set((lightArm.from + lightArm.to) / 2, FLOOR + 0.004 + (lightGap - 0.004) / 2, SEESAW.cz);
    setGlow(seesawGlow.heavy.material as THREE.ShaderMaterial, palette.plus, frame.glow.seesawHeavy);
    setGlow(seesawGlow.light.material as THREE.ShaderMaterial, palette.minus, frame.glow.seesawLight);

    const drive = Math.sin(frame.gyro.phase) * frame.gyro.drive;
    const sense = Math.cos(frame.gyro.phase) * frame.gyro.sense;
    // Diapasão: as duas massas se movem em oposição, no acionamento e na detecção.
    gyroMasses[0].position.set(-GYRO.massOffset - drive, 0, -sense);
    gyroMasses[1].position.set(GYRO.massOffset + drive, 0, sense);
    gyroSpringUniforms[0].uDisp.value.set(-drive, 0, -sense);
    gyroSpringUniforms[1].uDisp.value.set(drive, 0, sense);
    updateGyroGlow(-sense, sense);
    setGlow(gyroGlowPlus.material as THREE.ShaderMaterial, palette.plus, frame.glow.gyroPlus);
    setGlow(gyroGlowMinus.material as THREE.ShaderMaterial, palette.minus, frame.glow.gyroMinus);
    const coriolis = Math.cos(frame.gyro.phase) * Math.min(1, Math.abs(frame.gyro.omegaDps) / 20) * Math.sign(frame.gyro.omegaDps);
    for (const [index, arrow] of coriolisArrows.entries()) {
      const signed = (index === 0 ? -1 : 1) * coriolis;
      arrow.visible = Math.abs(signed) > 0.08;
      arrow.rotation.y = signed > 0 ? -Math.PI / 2 : Math.PI / 2;
      const length = 0.05 + Math.abs(signed) * 0.16;
      (arrow.children[0] as THREE.Mesh).scale.set(length, 0.8, 0.8);
      arrow.children[1].position.x = length + 0.03;
    }
  }

  update({
    disp: { x: 0, z: 0 }, forceInPlane: { x: 0, z: 0 }, seesaw: 0,
    gyro: { phase: 0, drive: 0, sense: 0, omegaDps: 0 },
    glow: { xPlus: 1, xMinus: 1, zPlus: 1, zMinus: 1, seesawHeavy: 1, seesawLight: 1, gyroPlus: 1, gyroMinus: 1 },
    showGhost: 0,
  });

  return {
    group,
    anchors,
    pads,
    update,
    dispose() {
      disposables.forEach((item) => item.dispose());
      for (const mesh of [moving, fixed, gyroGlowPlus, gyroGlowMinus, ...Object.values(glowMeshes)]) mesh.dispose();
    },
  };
}
