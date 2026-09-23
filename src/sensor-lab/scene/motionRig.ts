import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createSompoTruckModel } from '@/components/sompo/createSompoTruckModel';
import { refineSompoTruck } from '@/components/sompo/refineSompoTruck';
import { SOMPO_STUDIO_DEFAULT } from '@/components/sompo/sompoStudioConfig';
import { disposeSompoObject } from '@/components/sompo/sompoStage';
import { TRUCK, THRESHOLDS, type SensorReading } from '../physics.js';
import { boxAt, merge, roundedBoxAt } from './geometry';
import { asphaltTexture } from './textures';

/**
 * Plataforma de movimento (hexápode) com o caminhão cara-chata do simulador
 * SOMPO em cima. O tabuleiro faz o papel do chão (encosta, solavanco); o
 * caminhão rola e arfa sobre a suspensão e tomba em torno das rodas de fora.
 * A sobreposição em raio-X mostra a seta de carga saindo do centro de gravidade
 * e onde ela cai dentro da base efetiva.
 */

export const TRUCK_SCALE = 0.19;
const BASE_R = 0.86;
const TOP_R = 0.6;
const DECK_Y = 0.86;
const DECK = Object.freeze({ w: 2.36, d: 1.9, t: 0.07 });
// O caminhão fica um pouco para trás: tombando para a direita (+z), ele cai dentro do tabuleiro.
const LANE_Z = -0.3;
const ROAD_T = 0.035;
export const DECK_TOP = DECK.t / 2 + ROAD_T;
const BASE_ANGLES = [76, 104, 196, 224, 316, 344];
const TOP_ANGLES = [46, 134, 166, 254, 286, 14];
const OUTER_CONTACT_M = 1.3;
const ROLL_CENTER_M = 1.0;
const CG = Object.freeze({ x: -0.6, y: TRUCK.cgHeightM });
const LIMIT_M = TRUCK.rolloverG * TRUCK.cgHeightM;
const AXLE_SPAN = Object.freeze({ front: 3.14, rear: -3.53 });

export interface RigMaterials {
  anodized: THREE.MeshStandardMaterial;
  brushed: THREE.MeshStandardMaterial;
  chrome: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
}

export interface RigPalette {
  force: THREE.Color;
  ok: THREE.Color;
  warn: THREE.Color;
  danger: THREE.Color;
  plus: THREE.Color;
}

export interface MotionRig {
  group: THREE.Group;
  deck: THREE.Group;
  anchors: Record<string, THREE.Object3D>;
  pickables: THREE.Object3D[];
  sensorBox: THREE.Object3D;
  update(reading: SensorReading, dt: number, reduced: boolean, camera: THREE.Camera): void;
  dispose(): void;
}

const levelColor = (palette: RigPalette, level: SensorReading['level']) =>
  level === 'estavel' ? palette.ok : level === 'atencao' ? palette.warn : palette.danger;

function xray(color: THREE.Color, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color: color.clone(), transparent: true, opacity, depthTest: false, depthWrite: false, toneMapped: true });
}

export function createMotionRig(materials: RigMaterials, palette: RigPalette): MotionRig {
  const group = new THREE.Group();
  group.name = 'motion-rig';
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(item: T) => { disposables.push(item); return item; };
  const anchors: Record<string, THREE.Object3D> = {};
  const anchor = (parent: THREE.Object3D, name: string, x: number, y: number, z: number) => {
    const object = new THREE.Object3D();
    object.position.set(x, y, z);
    parent.add(object);
    anchors[name] = object;
    return object;
  };

  // ---------------------------------------------------------------- base
  const base = new THREE.Mesh(track(new THREE.CylinderGeometry(1.04, 1.1, 0.12, 72)), materials.anodized);
  base.position.y = 0.06;
  base.castShadow = base.receiveShadow = true;
  group.add(base);
  const baseRing = new THREE.Mesh(track(new THREE.TorusGeometry(1.02, 0.012, 8, 96)), materials.brushed);
  baseRing.rotation.x = Math.PI / 2;
  baseRing.position.y = 0.121;
  group.add(baseRing);
  const bracketParts: THREE.BufferGeometry[] = [];
  const baseJoints = BASE_ANGLES.map((deg) => {
    const a = THREE.MathUtils.degToRad(deg);
    const point = new THREE.Vector3(Math.cos(a) * BASE_R, 0.2, -Math.sin(a) * BASE_R);
    bracketParts.push(boxAt(0.13, 0.08, 0.13, point.x, 0.12, point.z));
    return point;
  });
  const brackets = new THREE.Mesh(track(merge(bracketParts)), materials.brushed);
  brackets.castShadow = true;
  group.add(brackets);

  // --------------------------------------------------------------- tabuleiro
  const deck = new THREE.Group();
  deck.position.y = DECK_Y;
  group.add(deck);
  const deckPlate = new THREE.Mesh(track(roundedBoxAt(DECK.w, DECK.t, DECK.d, 0, 0, 0, 0.025, 3)), materials.brushed);
  deckPlate.castShadow = deckPlate.receiveShadow = true;
  deck.add(deckPlate);
  const deckUnder = new THREE.Mesh(track(new THREE.CylinderGeometry(TOP_R + 0.06, TOP_R + 0.06, 0.05, 48)), materials.anodized);
  deckUnder.position.y = -DECK.t / 2 - 0.025;
  deckUnder.castShadow = true;
  deck.add(deckUnder);
  const roadTexture = track(asphaltTexture());
  roadTexture.wrapS = THREE.RepeatWrapping;
  const roadMaterial = track(new THREE.MeshStandardMaterial({ map: roadTexture, roughness: 0.86, metalness: 0.02 }));
  const road = new THREE.Mesh(track(new THREE.BoxGeometry(DECK.w - 0.08, ROAD_T, DECK.d - 0.1)), [
    materials.anodized, materials.anodized, roadMaterial, materials.anodized, materials.anodized, materials.anodized,
  ]);
  road.position.y = DECK.t / 2 + ROAD_T / 2;
  road.receiveShadow = true;
  deck.add(road);
  // A foto de asfalto gasto do simulador entra por baixo das faixas quando carrega.
  new THREE.TextureLoader().load('/sompo/gen/r30-asphalt-worn.webp', (photo) => {
    const image = photo.image as HTMLImageElement;
    const canvas = roadTexture.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx || !image?.width) { photo.dispose(); return; }
    const overlay = document.createElement('canvas');
    overlay.width = canvas.width; overlay.height = canvas.height;
    overlay.getContext('2d')!.drawImage(canvas, 0, 0);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 0.35;
    ctx.drawImage(overlay, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#e7e3d6';
    ctx.fillRect(0, 26, canvas.width, 12);
    ctx.fillRect(0, canvas.height - 38, canvas.width, 12);
    ctx.fillStyle = '#e8b53c';
    for (let x = 0; x < canvas.width; x += 256) ctx.fillRect(x + 20, canvas.height / 2 - 6, 150, 12);
    roadTexture.needsUpdate = true;
    photo.dispose();
  });
  const topJoints = TOP_ANGLES.map((deg) => {
    const a = THREE.MathUtils.degToRad(deg);
    return new THREE.Vector3(Math.cos(a) * TOP_R, -DECK.t / 2 - 0.09, -Math.sin(a) * TOP_R);
  });
  const topBracketParts = topJoints.map((point) => boxAt(0.12, 0.06, 0.12, point.x, point.y + 0.02, point.z));
  const topBrackets = new THREE.Mesh(track(merge(topBracketParts)), materials.brushed);
  deck.add(topBrackets);
  anchor(deck, 'deck', -DECK.w / 2 + 0.2, DECK_TOP, DECK.d / 2);

  // ---------------------------------------------------------------- atuadores
  const bodyGeometry = track(new THREE.CylinderGeometry(0.05, 0.05, 1, 24));
  bodyGeometry.translate(0, 0.5, 0);
  const rodGeometry = track(new THREE.CylinderGeometry(0.026, 0.026, 1, 16));
  rodGeometry.translate(0, 0.5, 0);
  const ballGeometry = track(new THREE.SphereGeometry(0.058, 20, 14));
  const ledGeometry = track(new THREE.TorusGeometry(0.052, 0.008, 6, 32));
  ledGeometry.rotateX(Math.PI / 2);
  const ledMaterial = track(new THREE.MeshBasicMaterial({ color: palette.ok.clone().multiplyScalar(2) }));
  const legs = baseJoints.map(() => {
    const leg = new THREE.Group();
    const body = new THREE.Mesh(bodyGeometry, materials.anodized);
    const rod = new THREE.Mesh(rodGeometry, materials.chrome);
    const led = new THREE.Mesh(ledGeometry, ledMaterial);
    body.castShadow = rod.castShadow = true;
    body.scale.y = 0.46;
    led.position.y = 0.4;
    leg.add(body, rod, led);
    group.add(leg);
    const lower = new THREE.Mesh(ballGeometry, materials.brass);
    const upper = new THREE.Mesh(ballGeometry, materials.brass);
    lower.castShadow = upper.castShadow = true;
    group.add(lower, upper);
    return { leg, rod, lower, upper };
  });
  anchor(group, 'hexapod', Math.cos(THREE.MathUtils.degToRad(TOP_ANGLES[1])) * 0.92, 0.5, 0.62);

  // ---------------------------------------------------------------- caminhão
  // Faixa do caminhão: tudo que mede em relação à linha de centro dele mora aqui.
  const lane = new THREE.Group();
  lane.position.z = LANE_Z;
  deck.add(lane);
  const tip = new THREE.Group();
  tip.position.set(0, DECK_TOP, OUTER_CONTACT_M * TRUCK_SCALE);
  lane.add(tip);
  const tipInner = new THREE.Group();
  tipInner.position.z = -OUTER_CONTACT_M * TRUCK_SCALE;
  tip.add(tipInner);
  const body = new THREE.Group();
  body.position.y = ROLL_CENTER_M * TRUCK_SCALE;
  tipInner.add(body);
  const truckHolder = new THREE.Group();
  truckHolder.position.set(-0.1, -ROLL_CENTER_M * TRUCK_SCALE, 0);
  truckHolder.scale.setScalar(TRUCK_SCALE);
  body.add(truckHolder);

  const truckModel = createSompoTruckModel({ sensorLabel: 'ESP32' });
  const modular = refineSompoTruck(truckModel);
  truckHolder.add(truckModel.root);
  const label = truckModel.sensorGroup.getObjectByName('sensor-label');
  if (label) label.visible = false;
  truckModel.rayGroup.visible = false;
  const assetAbort = new AbortController();
  void new GLTFLoader().loadAsync('/models/sompo/astra-sompo-truck.glb').then((gltf) => {
    if (assetAbort.signal.aborted) { disposeSompoObject(gltf.scene); return; }
    modular.replaceVisual(gltf.scene);
    const hidden = truckModel.sensorGroup.getObjectByName('sensor-label');
    if (hidden) hidden.visible = false;
  }).catch((error) => { if (!assetAbort.signal.aborted) console.warn('Caminhão Astra indisponível; segue o modelo modular', error); });
  truckModel.root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
  });

  const sensorBox = new THREE.Object3D();
  truckModel.sensorGroup.add(sensorBox);
  anchor(truckModel.sensorGroup, 'esp32', 0.1, 0.35, 0.6);
  anchor(truckHolder, 'truck', -3.4, 3.8, 1.3);

  // Anel pulsante no ESP32: é dali que sai o sinal.
  const pulseMaterial = track(new THREE.MeshBasicMaterial({ color: palette.plus.clone().multiplyScalar(2.4), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  const pulse = new THREE.Mesh(track(new THREE.RingGeometry(0.34, 0.4, 48)), pulseMaterial);
  pulse.rotation.y = Math.PI / 2;
  pulse.position.x = 0.2;
  truckModel.sensorGroup.add(pulse);

  // ---------------------------------------------------------------- raio-X
  const cgGroup = new THREE.Group();
  cgGroup.position.set(CG.x, CG.y, 0);
  truckHolder.add(cgGroup);
  anchor(cgGroup, 'cg', 0, 0.35, 0);
  const cgMaterial = track(xray(new THREE.Color(0xf4f1ea)));
  const cgDark = track(xray(new THREE.Color(0x101318)));
  const cgMarker = new THREE.Group();
  for (let q = 0; q < 4; q++) {
    const quarter = new THREE.Mesh(track(new THREE.CircleGeometry(0.22, 16, (q * Math.PI) / 2, Math.PI / 2)), q % 2 ? cgDark : cgMaterial);
    quarter.renderOrder = 20;
    cgMarker.add(quarter);
  }
  cgGroup.add(cgMarker);

  const forceMaterial = track(xray(palette.force.clone().multiplyScalar(2.2)));
  const arrow = new THREE.Group();
  const shaft = new THREE.Mesh(track(new THREE.CylinderGeometry(0.014, 0.014, 1, 12).translate(0, 0.5, 0)), forceMaterial);
  const head = new THREE.Mesh(track(new THREE.ConeGeometry(0.036, 0.1, 18)), forceMaterial);
  shaft.renderOrder = head.renderOrder = 21;
  arrow.add(shaft, head);
  group.add(arrow);
  anchor(arrow, 'load', 0, 0.3, 0);

  // Linha tracejada até o chão e o ponto onde a carga cai.
  const dashMaterial = track(new THREE.LineDashedMaterial({ color: palette.force.clone().multiplyScalar(1.6), dashSize: 0.025, gapSize: 0.02, transparent: true, depthTest: false }));
  const dashGeometry = track(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, -1, 0)]));
  const dash = new THREE.Line(dashGeometry, dashMaterial);
  dash.renderOrder = 21;
  group.add(dash);
  const hitMaterial = track(xray(palette.ok.clone().multiplyScalar(2)));
  const hit = new THREE.Mesh(track(new THREE.RingGeometry(0.03, 0.045, 32)), hitMaterial);
  hit.rotation.x = -Math.PI / 2;
  hit.renderOrder = 22;
  lane.add(hit);

  // Base efetiva: retângulo entre os eixos, largura 2 × h × limiar.
  const baseY = DECK_TOP + 0.002;
  const toDeckX = (m: number) => (m - 0.1 / TRUCK_SCALE) * TRUCK_SCALE;
  const baseFront = toDeckX(AXLE_SPAN.front), baseRear = toDeckX(AXLE_SPAN.rear);
  const limitZ = LIMIT_M * TRUCK_SCALE;
  const wheelZ = OUTER_CONTACT_M * TRUCK_SCALE;
  const zoneMaterials = {
    ok: track(xray(palette.ok.clone().multiplyScalar(1.1), 0.12)),
    warn: track(xray(palette.warn.clone().multiplyScalar(1.2), 0.2)),
    danger: track(xray(palette.danger.clone().multiplyScalar(1.3), 0.3)),
  };
  const zones = new THREE.Group();
  const zoneStrip = (from: number, to: number, material: THREE.Material) => {
    const plane = new THREE.Mesh(track(new THREE.PlaneGeometry(baseFront - baseRear, Math.abs(to - from))), material);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set((baseFront + baseRear) / 2, baseY, (from + to) / 2);
    plane.renderOrder = 19;
    zones.add(plane);
    return plane;
  };
  for (const side of [-1, 1]) {
    zoneStrip(side * 0, side * limitZ * THRESHOLDS.attention, zoneMaterials.ok);
    zoneStrip(side * limitZ * THRESHOLDS.attention, side * limitZ * THRESHOLDS.alert, zoneMaterials.warn);
    zoneStrip(side * limitZ * THRESHOLDS.alert, side * limitZ, zoneMaterials.danger);
  }
  const outlineMaterial = track(new THREE.LineBasicMaterial({ color: palette.danger.clone().multiplyScalar(1.8), transparent: true, depthTest: false }));
  const wheelLineMaterial = track(new THREE.LineDashedMaterial({ color: 0xdfe6ee, dashSize: 0.03, gapSize: 0.025, transparent: true, opacity: 0.55, depthTest: false }));
  const outline = new THREE.LineLoop(track(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(baseRear, baseY, -limitZ), new THREE.Vector3(baseFront, baseY, -limitZ),
    new THREE.Vector3(baseFront, baseY, limitZ), new THREE.Vector3(baseRear, baseY, limitZ),
  ])), outlineMaterial);
  outline.renderOrder = 20;
  const wheelLines = new THREE.LineSegments(track(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(baseRear - 0.05, baseY, -wheelZ), new THREE.Vector3(baseFront + 0.05, baseY, -wheelZ),
    new THREE.Vector3(baseRear - 0.05, baseY, wheelZ), new THREE.Vector3(baseFront + 0.05, baseY, wheelZ),
  ])), wheelLineMaterial);
  wheelLines.computeLineDistances();
  wheelLines.renderOrder = 20;
  zones.add(outline, wheelLines);
  lane.add(zones);
  anchor(lane, 'limit', baseFront - 0.12, baseY, limitZ);

  // Trajetória da curva: fita que dobra à esquerda na frente do caminhão.
  const arcSegments = 48;
  const arcGeometry = track(new THREE.BufferGeometry());
  const arcPositions = new Float32Array((arcSegments + 1) * 2 * 3);
  const arcAlong = new Float32Array((arcSegments + 1) * 2);
  const arcIndex: number[] = [];
  for (let i = 0; i < arcSegments; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    arcIndex.push(a, c, b, b, c, d);
  }
  arcGeometry.setAttribute('position', new THREE.BufferAttribute(arcPositions, 3));
  arcGeometry.setAttribute('aAlong', new THREE.BufferAttribute(arcAlong, 1));
  arcGeometry.setIndex(arcIndex);
  const arcUniforms = { uTime: { value: 0 }, uColor: { value: palette.plus.clone().multiplyScalar(1.8) }, uOpacity: { value: 0 } };
  const arcMaterial = track(new THREE.ShaderMaterial({
    uniforms: arcUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: 'attribute float aAlong; varying float vAlong; void main(){ vAlong = aAlong; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; uniform vec3 uColor; uniform float uOpacity; varying float vAlong;
      void main(){
        float chevron = step(0.45, fract(vAlong * 9.0 - uTime * 1.6));
        float fade = smoothstep(0.0, 0.08, vAlong) * (1.0 - smoothstep(0.7, 1.0, vAlong));
        gl_FragColor = vec4(uColor * (0.35 + 0.65 * chevron), uOpacity * fade);
      }`,
  }));
  const arc = new THREE.Mesh(arcGeometry, arcMaterial);
  arc.frustumCulled = false;
  arc.renderOrder = 18;
  lane.add(arc);

  function updateArc(curvature: number) {
    const start = new THREE.Vector3(0.8, DECK_TOP + 0.004, 0);
    const length = 0.95;
    const radius = curvature > 0.001 ? 0.55 / curvature : 1e6;
    for (let i = 0; i <= arcSegments; i++) {
      const s = (i / arcSegments) * length;
      const theta = s / radius;
      const cx = start.x + radius * Math.sin(theta);
      const cz = start.z - radius * (1 - Math.cos(theta));
      const nx = Math.sin(theta), nz = Math.cos(theta);
      const halfWidth = 0.055;
      arcPositions.set([cx + nx * halfWidth, start.y, cz + nz * halfWidth, cx - nx * halfWidth, start.y, cz - nz * halfWidth], i * 6);
      arcAlong[i * 2] = arcAlong[i * 2 + 1] = i / arcSegments;
    }
    arcGeometry.attributes.position.needsUpdate = true;
    arcGeometry.attributes.aAlong.needsUpdate = true;
  }
  updateArc(0);

  // --------------------------------------------------------------- animação
  let wheelTravel = 0;
  let elapsed = 0;
  const up = new THREE.Vector3(0, 1, 0);
  const tmp = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const cgWorld = new THREE.Vector3();
  const deckNormal = new THREE.Vector3();
  const deckPoint = new THREE.Vector3();
  const load = new THREE.Vector3();
  const color = new THREE.Color();
  const groupInverse = new THREE.Quaternion();
  const bodyQuaternion = new THREE.Quaternion();

  function placeLeg(index: number) {
    const leg = legs[index];
    const from = baseJoints[index];
    const to = tmp.copy(topJoints[index]).applyMatrix4(deck.matrix);
    const length = from.distanceTo(to);
    leg.leg.position.copy(from);
    leg.leg.quaternion.setFromUnitVectors(up, tmpB.copy(to).sub(from).normalize());
    leg.rod.position.y = 0.4;
    leg.rod.scale.y = Math.max(0.05, length - 0.4);
    leg.lower.position.copy(from);
    leg.upper.position.copy(to);
  }

  function update(reading: SensorReading, dt: number, reduced: boolean, camera: THREE.Camera) {
    elapsed += dt;
    const rad = THREE.MathUtils.degToRad;
    // Tabuleiro = chão. O solavanco do buraco aparece ampliado para ser visto.
    deck.position.y = DECK_Y + reading.body.heaveM * 3.2 * TRUCK_SCALE * 6;
    deck.rotation.set(rad(reading.road.rollDeg), 0, -rad(reading.road.pitchDeg));
    deck.updateMatrix();
    for (let i = 0; i < legs.length; i++) placeLeg(i);

    body.rotation.set(rad(reading.body.rollDeg), 0, -rad(reading.body.pitchDeg));
    tip.rotation.x = rad(reading.tip.deg) * reading.tip.side;

    wheelTravel += (reading.speedKph / 3.6) * dt;
    roadTexture.offset.x = (wheelTravel * TRUCK_SCALE) / (DECK.w - 0.08);
    modular.update(SOMPO_STUDIO_DEFAULT, elapsed * 1000, wheelTravel, reading.curve.k * 0.12, 0.25, 0, reduced, reading.speedKph);

    const tone = levelColor(palette, reading.level);
    ledMaterial.color.copy(tone).multiplyScalar(2.2);
    pulse.scale.setScalar(1 + ((elapsed * 1.4) % 1) * 0.9);
    pulseMaterial.opacity = 1 - ((elapsed * 1.4) % 1);

    // Seta de carga = −f (peso + inércia), no mundo, saindo do CG. O referencial
    // do corpo é o do próprio caminhão: veículo (x, y, z) = cena (x, −z, y).
    group.updateMatrixWorld(true);
    group.getWorldQuaternion(groupInverse).invert();
    cgGroup.getWorldPosition(cgWorld);
    truckHolder.getWorldQuaternion(bodyQuaternion);
    const f = reading.forceG;
    load.set(-f.x, -f.z, f.y).applyQuaternion(bodyQuaternion);
    const magnitude = load.length();
    const direction = magnitude > 1e-6 ? load.clone().divideScalar(magnitude) : new THREE.Vector3(0, -1, 0);
    const length = Math.min(1.4, 0.34 * magnitude);
    arrow.position.copy(cgWorld);
    group.worldToLocal(arrow.position);
    arrow.quaternion.setFromUnitVectors(up, direction.clone().applyQuaternion(groupInverse));
    shaft.scale.set(1, Math.max(0.02, length - 0.08), 1);
    head.position.y = Math.max(0.02, length - 0.08) + 0.05;
    arrow.visible = reading.tip.deg < 60;
    cgGroup.getWorldQuaternion(quaternion).invert();
    cgMarker.quaternion.copy(quaternion).multiply(camera.quaternion);

    // Interseção com o plano do tabuleiro.
    deck.getWorldPosition(deckPoint);
    deckNormal.set(0, 1, 0).applyQuaternion(deck.getWorldQuaternion(quaternion));
    deckPoint.addScaledVector(deckNormal, DECK_TOP);
    const denom = direction.dot(deckNormal);
    const tipped = reading.tip.deg > 1;
    hit.visible = dash.visible = !tipped && denom < -0.2;
    zones.visible = !tipped;
    if (hit.visible) {
      const t = deckPoint.clone().sub(cgWorld).dot(deckNormal) / denom;
      const hitWorld = cgWorld.clone().addScaledVector(direction, t);
      const hitLocal = lane.worldToLocal(hitWorld.clone());
      hit.position.set(hitLocal.x, DECK_TOP + 0.004, hitLocal.z);
      const ratio = Math.abs(hitLocal.z) / limitZ;
      color.copy(ratio >= 1 ? palette.danger : ratio >= THRESHOLDS.alert ? palette.danger : ratio >= THRESHOLDS.attention ? palette.warn : palette.ok);
      hitMaterial.color.copy(color).multiplyScalar(2.4);
      const localCg = group.worldToLocal(cgWorld.clone());
      const localHit = group.worldToLocal(hitWorld.clone());
      dashGeometry.setFromPoints([localCg, localHit]);
      dash.computeLineDistances();
    }

    arcUniforms.uTime.value = elapsed * (0.4 + reading.speedKph / 40);
    arcUniforms.uOpacity.value = THREE.MathUtils.lerp(arcUniforms.uOpacity.value, reading.curve.k > 0.02 && !tipped ? 1 : 0, Math.min(1, dt * 6));
    if (reading.curve.k > 0.001) updateArc(reading.curve.k);
  }

  return {
    group,
    deck,
    anchors,
    pickables: [deckPlate, road, deckUnder],
    sensorBox,
    update,
    dispose() {
      assetAbort.abort();
      modular.dispose();
      disposeSompoObject(truckModel.root);
      disposables.forEach((item) => item.dispose());
    },
  };
}
