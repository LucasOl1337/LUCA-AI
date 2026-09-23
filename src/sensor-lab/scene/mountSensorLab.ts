import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import {
  REAL_GAP_PER_G,
  VISUAL_GAP_PER_G,
  MEMS as MEMS_SPEC,
  getSensorScenario,
  sampleSensorLab,
  type SensorReading,
  type SensorScenarioId,
} from '../physics.js';
import { createImuPackage, PACKAGE, PACKAGE_HEIGHT } from './imuPackage';
import { createLabelLayer, type LabelSpec } from './labels';
import { createLabEnvironment, createLabMaterials, createLabPalette } from './materials';
import { DRAWN_GAP } from './mems';
import { createMotionRig } from './motionRig';
import { createPostChain } from './post';
import { BENCH, createRoom, STAGE, SUN_DIRECTION } from './room';
import { createScope } from './scope';

export type SensorView = 'bancada' | 'caminhao' | 'chip' | 'massa' | 'dedos';
export type SensorLabEvent = { kind: 'atencao' | 'risco' | 'tombou' | 'frenada' | 'impacto'; reading: SensorReading };

export const SENSOR_VIEWS: readonly { id: SensorView; label: string }[] = [
  { id: 'bancada', label: 'Bancada' },
  { id: 'caminhao', label: 'Caminhão' },
  { id: 'chip', label: 'Chip' },
  { id: 'massa', label: 'Massa' },
  { id: 'dedos', label: 'Dedos' },
];

export interface SensorLabOptions {
  scenario: SensorScenarioId;
  param: number;
  exploded: boolean;
  amplified: boolean;
  view: SensorView;
  paused: boolean;
  labels: boolean;
  reducedMotion: boolean;
  onReading(reading: SensorReading): void;
  onEvent(event: SensorLabEvent): void;
  onViewChange(view: SensorView | 'livre'): void;
  onExplodedChange(open: boolean): void;
  onScenarioChange(id: SensorScenarioId, param: number): void;
  onReady(): void;
}

export interface SensorLabApi {
  setScenario(id: SensorScenarioId, param: number): void;
  setParam(value: number): void;
  setExploded(open: boolean): void;
  setAmplified(on: boolean): void;
  setView(view: SensorView): void;
  setPaused(paused: boolean): void;
  setLabels(on: boolean): void;
  restart(): void;
  dispose(): void;
}

const RIG_POSITION = new THREE.Vector3(-3.75, BENCH.y, 0.35);
const SCOPE_POSITION = new THREE.Vector3(4.55, BENCH.y, -0.75);
const MACRO_VIEWS: SensorView[] = ['massa', 'dedos'];
// Só as vistas de dentro do die exigem o chip aberto.
const OPEN_VIEWS: SensorView[] = ['massa', 'dedos'];
const ease = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const pt = (value: number, digits: number) => value.toFixed(digits).replace('.', ',').replace('-', '−');

export function mountSensorLab(container: HTMLElement, options: SensorLabOptions): SensorLabApi {
  const state = { ...options };
  const compact = window.matchMedia('(max-width: 760px), (pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
  let pixelRatio = Math.min(window.devicePixelRatio || 1, compact ? 1.25 : 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.className = 'sensor-canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.appendChild(renderer.domElement);
  RectAreaLightUniformsLib.init();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07090d);
  const environment = createLabEnvironment(renderer);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.5;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 900);
  camera.position.set(7.5, 7.8, 25);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.minDistance = 0.28;
  controls.maxDistance = 30;
  controls.maxPolarAngle = 1.5;
  controls.target.set(0, 2.4, 0);
  controls.zoomSpeed = 0.9;
  controls.rotateSpeed = 0.6;

  // ---------------------------------------------------------------- luzes
  const sun = new THREE.DirectionalLight(0xffb27a, 2.3);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(-32).add(new THREE.Vector3(0, 2, 0));
  sun.target.position.set(0, 1, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(compact ? 2048 : 4096, compact ? 2048 : 4096);
  const sunCamera = sun.shadow.camera as THREE.OrthographicCamera;
  sunCamera.left = -15; sunCamera.right = 15; sunCamera.top = 9; sunCamera.bottom = -9;
  sunCamera.near = 10; sunCamera.far = 70;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.025;
  scene.add(sun, sun.target);

  const hemisphere = new THREE.HemisphereLight(0x9db5e6, 0x2b231d, 0.3);
  scene.add(hemisphere);

  const chipLight = new THREE.SpotLight(0xfff1df, 9, 10, 0.55, 0.85, 2);
  // Atrás, à direita e acima: o reflexo especular vai para longe das câmeras do chip.
  chipLight.position.set(STAGE.x + 2.6, BENCH.y + 4.3, STAGE.z - 1.7);
  chipLight.target.position.set(STAGE.x, STAGE.top, STAGE.z);
  chipLight.castShadow = true;
  chipLight.shadow.mapSize.set(2048, 2048);
  chipLight.shadow.camera.near = 1.5;
  chipLight.shadow.camera.far = 6.5;
  chipLight.shadow.bias = -0.00008;
  chipLight.shadow.normalBias = 0.003;
  scene.add(chipLight, chipLight.target);

  const truckLight = new THREE.SpotLight(0xcfe0ff, 24, 18, 0.42, 0.8, 2);
  truckLight.position.set(RIG_POSITION.x + 3.5, BENCH.y + 6.5, RIG_POSITION.z + 6);
  truckLight.target.position.set(RIG_POSITION.x, BENCH.y + 1.1, RIG_POSITION.z);
  scene.add(truckLight, truckLight.target);

  const ceiling = new THREE.RectAreaLight(0xe4ecff, 0.9, 16, 1.2);
  ceiling.position.set(0, 8.9, 1.5);
  ceiling.lookAt(0, 0, 1.5);
  scene.add(ceiling);

  const scopeGlow = new THREE.PointLight(0x5eead4, 0.8, 6, 2);
  scopeGlow.position.set(SCOPE_POSITION.x - 0.2, BENCH.y + 1.8, SCOPE_POSITION.z + 1.2);
  scene.add(scopeGlow);

  // ------------------------------------------------------------- montagem
  const materials = createLabMaterials();
  const palette = createLabPalette();
  const room = createRoom(materials);
  scene.add(room.group);

  const rig = createMotionRig(materials, palette);
  rig.group.position.copy(RIG_POSITION);
  scene.add(rig.group);

  const chip = createImuPackage(materials, palette);
  chip.group.position.set(STAGE.x, STAGE.top, STAGE.z);
  scene.add(chip.group);

  const scope = createScope(materials);
  scope.group.position.copy(SCOPE_POSITION);
  scope.group.rotation.y = -0.55;
  scene.add(scope.group);

  // Cone de ampliação: do ESP32 no caminhão até o chip gigante.
  const coneMaterial = new THREE.LineBasicMaterial({ color: palette.plus.clone().multiplyScalar(1.5), transparent: true, opacity: 0, depthWrite: false });
  const conePositions = new Float32Array(8 * 3);
  const coneGeometry = new THREE.BufferGeometry();
  coneGeometry.setAttribute('position', new THREE.BufferAttribute(conePositions, 3));
  const cone = new THREE.LineSegments(coneGeometry, coneMaterial);
  cone.frustumCulled = false;
  scene.add(cone);
  const coneLabel = new THREE.Object3D();
  scene.add(coneLabel);
  const packageCorners = [
    new THREE.Vector3(-PACKAGE.size / 2, PACKAGE_HEIGHT, -PACKAGE.size / 2),
    new THREE.Vector3(-PACKAGE.size / 2, PACKAGE_HEIGHT, PACKAGE.size / 2),
    new THREE.Vector3(-PACKAGE.size / 2, 0, -PACKAGE.size / 2),
    new THREE.Vector3(-PACKAGE.size / 2, 0, PACKAGE.size / 2),
  ];

  const post = createPostChain(renderer, scene, camera, { samples: compact ? 2 : 4, bloom: true });
  post.setDepthOfField(!compact);

  // ------------------------------------------------------------- etiquetas
  let reading = sampleSensorLab(state.scenario, state.param, 0);
  const memsAnchors = chip.mems.anchors;
  const labelSpecs: LabelSpec[] = [
    { id: 'hexapod', title: 'Plataforma de movimento', object: rig.anchors.hexapod, views: ['bancada'], detail: () => 'seis atuadores' },
    { id: 'esp32', title: 'ESP32 + IMU', object: rig.anchors.esp32, views: ['bancada', 'caminhao'], detail: () => '100 leituras/s', tone: 'plus' },
    { id: 'cg', title: 'Centro de gravidade', object: rig.anchors.cg, views: ['caminhao'], detail: () => '1,75 m do chão' },
    { id: 'load', title: 'Seta de carga', object: rig.anchors.load, views: ['caminhao'], tone: 'force', detail: () => `${pt(Math.abs(reading.lateralG), 2)} g de lado`, when: () => reading.tip.deg < 5 },
    { id: 'limit', title: 'Limite de tombamento', object: rig.anchors.limit, views: ['caminhao'], tone: 'danger', detail: () => `${Math.round(Math.max(0, reading.ratio) * 100)}% usado`, when: () => reading.tip.deg < 1 },
    { id: 'mold', title: 'Tampa de epóxi', object: chip.anchors.mold, views: ['chip'], detail: () => 'marcação a laser', when: () => explode > 0.6 },
    { id: 'mems', title: 'Die MEMS', object: chip.anchors.mems, views: ['chip'], detail: () => 'o silício que se mexe', when: () => explode > 0.6 },
    { id: 'asic', title: 'ASIC', object: chip.anchors.asic, views: ['chip'], detail: () => 'mede fF, entrega número', when: () => explode > 0.6 },
    { id: 'wires', title: 'Fios de ouro', object: chip.anchors.wires, views: ['chip'], detail: () => '25 µm de diâmetro', tone: 'force', when: () => explode > 0.6 },
    { id: 'leadframe', title: 'Terminais', object: chip.anchors.leadframe, views: ['chip'], detail: () => 'soldados na placa' },
    { id: 'proof-mass', title: 'Massa de prova', object: memsAnchors['proof-mass'], views: ['massa', 'chip'], tone: 'force', detail: () => `${pt(Math.hypot(reading.mems.x.nm, reading.mems.y.nm), 1)} nm fora do centro`, when: () => explode > 0.6 },
    { id: 'spring', title: 'Mola dobrada', object: memsAnchors.spring, views: ['massa'], detail: () => '12 N/m' },
    { id: 'anchor', title: 'Âncora', object: memsAnchors.anchor, views: ['massa'], detail: () => 'presa no substrato' },
    { id: 'fixed-fingers', title: 'Dedos fixos', object: memsAnchors['fixed-fingers'], views: ['massa', 'dedos'], tone: 'plus', detail: () => `C₊ ${pt(reading.mems.x.plusFF, 1)} fF` },
    { id: 'lateral-comb', title: 'Pente lateral', object: memsAnchors['lateral-comb'], views: ['massa'], tone: 'minus', detail: () => `ΔC ${pt(reading.mems.y.deltaFF, 2)} fF` },
    { id: 'finger-gap', title: 'Vão entre dedos', object: memsAnchors['finger-gap'], views: ['dedos'], tone: 'plus', detail: () => `${pt(MEMS_SPEC.gapUm - reading.mems.x.nm / 1000, 4)} µm` },
    { id: 'seesaw', title: 'Gangorra do eixo Z', object: memsAnchors.seesaw, views: ['massa', 'chip'], detail: () => `${pt(reading.forceG.z, 2)} g`, when: () => explode > 0.6 },
    { id: 'electrode', title: 'Eletrodo', object: memsAnchors.electrode, views: ['massa'], tone: 'plus', detail: () => 'debaixo do braço' },
    { id: 'gyro', title: 'Giroscópio', object: memsAnchors.gyro, views: ['massa', 'chip'], tone: 'coriolis', detail: () => `${pt(reading.gyroDps.z, 1)} °/s`, when: () => explode > 0.6 },
    { id: 'gyro-drive', title: 'Acionamento', object: memsAnchors['gyro-drive'], views: ['massa'], detail: () => `vibra a ${MEMS_SPEC.gyroDriveKHz} kHz` },
    { id: 'pads', title: 'Pads', object: memsAnchors.pads, views: ['massa'], detail: () => 'saída para o ASIC' },
    { id: 'scope', title: 'O que o ESP32 manda', object: scope.anchors.scope, views: ['bancada'], tone: 'plus', detail: () => 'aceleracaoX/Y/Z' },
    { id: 'wafer', title: 'Wafer de 200 mm', object: room.anchors.wafer, views: ['bancada'], detail: () => 'centenas de chips' },
    { id: 'zoom', title: 'Ampliado 5.000×', object: coneLabel, views: ['bancada'], tone: 'plus', detail: () => 'chip de 4 mm' },
  ];
  const labels = createLabelLayer(container, labelSpecs);
  labels.setVisible(state.labels);

  const hint = document.createElement('div');
  hint.className = 'sensor-hint';
  hint.setAttribute('aria-hidden', 'true');
  container.appendChild(hint);

  // --------------------------------------------------------------- câmera
  let view: SensorView | 'livre' = state.view;
  let flight: null | {
    fromPosition: THREE.Vector3; fromTarget: THREE.Vector3; fromAperture: number;
    to: () => { position: THREE.Vector3; target: THREE.Vector3; aperture: number };
    start: number; duration: number;
  } = null;
  let aperture = 0.06;
  let explode = state.exploded ? 1 : 0;
  let explodeTarget = explode;
  let automated = false;
  const anchorWorld = (object: THREE.Object3D) => object.getWorldPosition(new THREE.Vector3());

  function preset(id: SensorView) {
    const aspect = Math.max(0.4, camera.aspect);
    const wide = aspect < 1.2 ? Math.pow(1.2 / aspect, 0.85) : 1;
    switch (id) {
      case 'bancada': {
        // Da esquerda: caminhão em primeiro plano, chip no meio, monitor e janela ao fundo.
        const target = new THREE.Vector3(0.9, 1.9, -0.4);
        return { target, position: target.clone().add(new THREE.Vector3(-7.7, 2.0, 9.2).multiplyScalar(wide)), aperture: 0.07 };
      }
      case 'caminhao': {
        const target = RIG_POSITION.clone().add(new THREE.Vector3(0.05, 1.22, 0));
        return { target, position: target.clone().add(new THREE.Vector3(2.35, 1.05, 3.05).multiplyScalar(wide)), aperture: 0.13 };
      }
      case 'chip': {
        const target = new THREE.Vector3(STAGE.x, STAGE.top + 1.25, STAGE.z - 0.25);
        return { target, position: target.clone().add(new THREE.Vector3(2.1, 2.45, 5.3).multiplyScalar(wide)), aperture: 0.14 };
      }
      case 'massa': {
        const target = anchorWorld(memsAnchors['proof-mass']).add(new THREE.Vector3(0.28, 0, -0.05));
        return { target, position: target.clone().add(new THREE.Vector3(0.28, 1.5, 1.12).multiplyScalar(wide)), aperture: 0.3 };
      }
      case 'dedos': {
        const target = anchorWorld(memsAnchors['finger-gap']);
        return { target, position: target.clone().add(new THREE.Vector3(0.2, 0.26, 0.42).multiplyScalar(wide)), aperture: 0.7 };
      }
    }
  }

  function flyTo(id: SensorView, duration = 1.5) {
    view = id;
    if (OPEN_VIEWS.includes(id) && explodeTarget < 1) {
      explodeTarget = 1;
      state.exploded = true;
      options.onExplodedChange(true);
    }
    if (state.reducedMotion) duration = 0.01;
    flight = {
      fromPosition: camera.position.clone(),
      fromTarget: controls.target.clone(),
      fromAperture: aperture,
      to: () => preset(id),
      start: performance.now() / 1000,
      duration,
    };
  }

  controls.addEventListener('start', () => {
    if (automated) return;
    flight = null;
    if (view !== 'livre') {
      view = 'livre';
      options.onViewChange('livre');
    }
  });

  function updateFlight(now: number) {
    if (!flight) return;
    const u = Math.min(1, (now - flight.start) / flight.duration);
    const k = ease(u);
    const destination = flight.to();
    const control = flight.fromPosition.clone().lerp(destination.position, 0.5);
    const lift = flight.fromPosition.distanceTo(destination.position) * 0.18;
    control.y += lift;
    const a = flight.fromPosition.clone().lerp(control, k);
    const b = control.clone().lerp(destination.position, k);
    camera.position.copy(a.lerp(b, k));
    controls.target.copy(flight.fromTarget).lerp(destination.target, k);
    aperture = THREE.MathUtils.lerp(flight.fromAperture, destination.aperture, k);
    if (u >= 1) flight = null;
  }

  // ----------------------------------------------------------- interação
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let drag: null | { x: number; y: number; start: number; id: number } = null;
  const pick = (event: PointerEvent | MouseEvent, objects: THREE.Object3D[]) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(objects, true)[0] ?? null;
  };
  const chipPickables = [chip.group];
  const truckPickables = [rig.group];

  function setHint(text: string, event?: PointerEvent) {
    if (!text) { hint.classList.remove('shown'); return; }
    hint.textContent = text;
    if (event) {
      const rect = container.getBoundingClientRect();
      hint.style.transform = `translate3d(${event.clientX - rect.left + 16}px, ${event.clientY - rect.top + 18}px, 0)`;
    }
    hint.classList.add('shown');
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    const hit = pick(event, rig.pickables);
    if (!hit) return;
    const start = state.scenario === 'encosta' ? state.param : 0;
    if (state.scenario !== 'encosta') {
      state.scenario = 'encosta';
      state.param = start;
      simTime = 0;
      scope.reset();
      options.onScenarioChange('encosta', start);
    }
    drag = { x: event.clientX, y: event.clientY, start, id: event.pointerId };
    controls.enabled = false;
    renderer.domElement.setPointerCapture(event.pointerId);
    renderer.domElement.style.cursor = 'grabbing';
  }
  function onPointerMove(event: PointerEvent) {
    if (drag) {
      const delta = (event.clientY - drag.y) * 0.075 + (event.clientX - drag.x) * 0.04;
      const value = Math.round(THREE.MathUtils.clamp(drag.start + delta, 0, 30) * 2) / 2;
      if (value !== state.param) {
        state.param = value;
        simTime = 0;
        options.onScenarioChange('encosta', value);
      }
      setHint(`Encosta ${pt(value, 1)}°`, event);
      return;
    }
    if (event.pointerType !== 'mouse') return;
    const deck = pick(event, rig.pickables);
    if (deck) {
      renderer.domElement.style.cursor = 'grab';
      setHint('Arraste para inclinar a mesa', event);
      return;
    }
    renderer.domElement.style.cursor = '';
    const onChip = view !== 'massa' && view !== 'dedos' && pick(event, chipPickables);
    setHint(onChip ? 'Duplo clique para ver a massa' : '', event);
  }
  function onPointerUp(event: PointerEvent) {
    if (!drag || drag.id !== event.pointerId) return;
    drag = null;
    controls.enabled = true;
    renderer.domElement.releasePointerCapture(event.pointerId);
    renderer.domElement.style.cursor = 'grab';
    setHint('');
  }
  function onDoubleClick(event: MouseEvent) {
    if (pick(event, chipPickables)) { flyTo(view === 'massa' ? 'dedos' : 'massa'); options.onViewChange(view); return; }
    if (pick(event, truckPickables)) { flyTo('caminhao'); options.onViewChange('caminhao'); }
  }
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointercancel', onPointerUp);
  renderer.domElement.addEventListener('pointerleave', () => { if (!drag) setHint(''); });
  renderer.domElement.addEventListener('dblclick', onDoubleClick);

  // -------------------------------------------------------------- tamanho
  let width = 1, height = 1;
  function resize() {
    const rect = container.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = camera.aspect < 0.8 ? 40 : 30;
    // O centro óptico vai para o meio da área livre à direita do texto de abertura.
    const intro = container.parentElement?.querySelector('.sensor-intro');
    const introRight = intro ? intro.getBoundingClientRect().right - rect.left + 16 : 0;
    const hudInset = width > 860 ? THREE.MathUtils.clamp(introRight, 0, width * 0.34) : 0;
    if (hudInset > 0) camera.setViewOffset(width, height, -hudInset / 2, 0, width, height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    post.setSize(width, height);
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  // ----------------------------------------------------------------- laço
  let simTime = 0;
  let last = performance.now();
  let frame = 0;
  let lastReport = 0;
  let lastScopeDraw = 0;
  let lastLevel = reading.level;
  let lastFlags = { ...reading.flags };
  let slowFrames = 0;
  let governorStep = 0;
  let elapsed = 0;
  const massDisp = new THREE.Vector2();
  const massVelocity = new THREE.Vector2();
  let seesaw = 0, seesawVelocity = 0;
  let gyroPhase = 0;
  let disposed = false;
  let raf = 0;

  // Abertura: a câmera entra da porta da sala até a bancada.
  if (state.reducedMotion) {
    const start = preset(state.view);
    camera.position.copy(start.position);
    controls.target.copy(start.target);
    aperture = start.aperture;
  } else {
    controls.target.set(0, 2.6, 0);
    flyTo(state.view, 3.2);
  }

  function emit(kind: SensorLabEvent['kind']) {
    options.onEvent({ kind, reading });
  }

  const cost = { js: 0, render: 0 };
  function tick(nowMs: number) {
    if (disposed) return;
    raf = requestAnimationFrame(tick);
    const tickStart = performance.now();
    const dt = Math.min(0.05, Math.max(0, (nowMs - last) / 1000));
    last = nowMs;
    const now = nowMs / 1000;
    elapsed += dt;
    frame++;
    if (!state.paused) simTime += dt;

    reading = sampleSensorLab(state.scenario, state.param, simTime);

    // Massa de prova: alvo pela física, balanço desenhado em câmera lenta.
    const perG = (state.amplified ? VISUAL_GAP_PER_G : REAL_GAP_PER_G) * DRAWN_GAP;
    const stop = DRAWN_GAP * 0.86;
    const targetX = THREE.MathUtils.clamp(-reading.forceG.x * perG, -stop, stop);
    const targetZ = THREE.MathUtils.clamp(reading.forceG.y * perG, -stop, stop);
    const omega = 2 * Math.PI * 3.2, zeta = 0.34;
    const step = Math.min(dt, 1 / 60);
    for (let t = 0; t < dt - 1e-6; t += step) {
      const h = Math.min(step, dt - t);
      massVelocity.x += (-(omega ** 2) * (massDisp.x - targetX) - 2 * zeta * omega * massVelocity.x) * h;
      massVelocity.y += (-(omega ** 2) * (massDisp.y - targetZ) - 2 * zeta * omega * massVelocity.y) * h;
      massDisp.x = THREE.MathUtils.clamp(massDisp.x + massVelocity.x * h, -stop, stop);
      massDisp.y = THREE.MathUtils.clamp(massDisp.y + massVelocity.y * h, -stop, stop);
      const seesawTarget = -reading.forceG.z * (state.amplified ? 0.0315 : 0.0315 * (REAL_GAP_PER_G / VISUAL_GAP_PER_G));
      seesawVelocity += (-(omega ** 2) * (seesaw - THREE.MathUtils.clamp(seesawTarget, -0.07, 0.07)) - 2 * zeta * omega * seesawVelocity) * h;
      seesaw += seesawVelocity * h;
    }
    const xv = massDisp.x / DRAWN_GAP, zv = massDisp.y / DRAWN_GAP;
    // Brilho ∝ capacitância do vão (1/d), ao quadrado para o olho perceber a diferença.
    const glow = (fraction: number) => THREE.MathUtils.clamp(0.9 / Math.pow(1 - THREE.MathUtils.clamp(fraction, -0.95, 0.95), 2), 0.12, 7);
    const seesawArm = (Math.sin(seesaw) * 0.26) / 0.03;
    gyroPhase += dt * 2 * Math.PI * (state.reducedMotion ? 0.6 : 2.2);
    const sense = state.amplified ? THREE.MathUtils.clamp(reading.gyroDps.z / 30, -1, 1) * 0.02 : 0;
    chip.mems.update({
      disp: { x: massDisp.x, z: massDisp.y },
      forceInPlane: { x: -reading.forceG.x, z: reading.forceG.y },
      seesaw,
      gyro: { phase: gyroPhase, drive: state.amplified ? 0.022 : 0.004, sense, omegaDps: state.amplified ? reading.gyroDps.z : 0 },
      glow: {
        xPlus: glow(xv), xMinus: glow(-xv), zPlus: glow(zv), zMinus: glow(-zv),
        seesawHeavy: glow(-seesawArm), seesawLight: glow(seesawArm),
        gyroPlus: glow(sense / 0.028 * Math.cos(gyroPhase)), gyroMinus: glow(-sense / 0.028 * Math.cos(gyroPhase)),
      },
      showGhost: MACRO_VIEWS.includes(view as SensorView) && state.amplified ? 0.9 : 0,
    });

    // Chip abrindo ou fechando.
    explode += (explodeTarget - explode) * Math.min(1, dt * 3.2);
    if (Math.abs(explodeTarget - explode) < 0.001) explode = explodeTarget;
    chip.setExplode(ease(explode));

    rig.update(reading, state.paused ? 0 : dt, state.reducedMotion, camera);
    room.update(elapsed);
    scope.push(reading);
    if (now - lastScopeDraw > 1 / 24) { scope.draw(reading, now); lastScopeDraw = now; }

    // Cone de ampliação.
    const sensorWorld = rig.sensorBox.getWorldPosition(new THREE.Vector3());
    const coneVisible = view === 'bancada' ? 0.4 : 0;
    coneMaterial.opacity += (coneVisible - coneMaterial.opacity) * Math.min(1, dt * 4);
    cone.visible = coneMaterial.opacity > 0.01;
    if (cone.visible) {
      chip.group.updateMatrixWorld();
      packageCorners.forEach((corner, index) => {
        const world = corner.clone().applyMatrix4(chip.group.matrixWorld);
        conePositions.set([sensorWorld.x, sensorWorld.y, sensorWorld.z, world.x, world.y, world.z], index * 6);
      });
      coneGeometry.attributes.position.needsUpdate = true;
      coneLabel.position.copy(sensorWorld).lerp(chip.group.position, 0.5).add(new THREE.Vector3(0, 0.5, 0));
    }

    // Câmera.
    automated = true;
    if (flight) {
      controls.enabled = false;
      updateFlight(now);
      camera.lookAt(controls.target);
      if (!flight && !drag) controls.enabled = true;
    }
    controls.update();
    automated = false;
    const focus = camera.position.distanceTo(controls.target);
    camera.near = THREE.MathUtils.clamp(focus * 0.02, 0.01, 0.3);
    camera.updateProjectionMatrix();
    post.setFocus(focus, aperture);

    labels.update(camera, width, height, view, now);
    const renderStart = performance.now();
    post.render(elapsed);
    cost.render += (performance.now() - renderStart - cost.render) * 0.05;
    cost.js += (renderStart - tickStart - cost.js) * 0.05;

    // Eventos para o HUD.
    if (reading.level !== lastLevel) {
      if (reading.level === 'atencao' && lastLevel === 'estavel') emit('atencao');
      if (reading.level === 'risco') emit('risco');
      if (reading.level === 'tombou') emit('tombou');
      lastLevel = reading.level;
    }
    if (reading.flags.frenagemBrusca && !lastFlags.frenagemBrusca) emit('frenada');
    if (reading.flags.impacto && !lastFlags.impacto) emit('impacto');
    lastFlags = { ...reading.flags };
    if (now - lastReport > 0.08) { options.onReading(reading); lastReport = now; }

    // Governador: só alivia abaixo de ~25 quadros/s sustentados. Não liga nem
    // desliga sombra (isso recompila todos os shaders e trava a tela).
    if (frame > 90) {
      slowFrames = dt > 0.04 ? slowFrames + 1 : Math.max(0, slowFrames - 2);
      if (slowFrames > 70 && governorStep < 3) {
        governorStep++;
        slowFrames = 0;
        if (governorStep === 1) post.setDepthOfField(false);
        if (governorStep === 2) { pixelRatio = 1; renderer.setPixelRatio(1); resize(); }
        if (governorStep === 3) {
          for (const light of [sun, chipLight]) {
            light.shadow.mapSize.multiplyScalar(0.5);
            light.shadow.map?.dispose();
            light.shadow.map = null;
          }
        }
      }
    }
    if (frame === 3) options.onReady();
  }
  // Compila os shaders em paralelo antes do primeiro quadro: o véu segue animado
  // em vez de a aba congelar alguns segundos na primeira visita.
  let started = false;
  const start = () => { if (started || disposed) return; started = true; last = performance.now(); raf = requestAnimationFrame(tick); };
  renderer.compileAsync(scene, camera).then(start, start);
  window.setTimeout(start, 6000);

  const debugTarget = window as unknown as { __sensorLab?: unknown };
  if (new URLSearchParams(window.location.search).has('sensorDebug')) {
    debugTarget.__sensorLab = { scene, camera, controls, renderer, cost, post, sun, chipLight, get reading() { return reading; }, get time() { return simTime; }, set time(value: number) { simTime = value; } };
  }

  return {
    setScenario(id, param) {
      const scenario = getSensorScenario(id);
      state.scenario = scenario.id;
      state.param = param;
      simTime = 0;
      scope.reset();
      massVelocity.set(0, 0);
    },
    setParam(value) {
      state.param = value;
      if (state.scenario === 'encosta') simTime = 0;
    },
    setExploded(open) {
      state.exploded = open;
      explodeTarget = open ? 1 : 0;
      if (!open && (view === 'massa' || view === 'dedos')) {
        flyTo('chip');
        options.onViewChange('chip');
      }
    },
    setAmplified(on) { state.amplified = on; },
    setView(next) { flyTo(next); },
    setPaused(paused) { state.paused = paused; },
    setLabels(on) { state.labels = on; labels.setVisible(on); },
    restart() { simTime = 0; scope.reset(); },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      renderer.domElement.removeEventListener('dblclick', onDoubleClick);
      controls.dispose();
      labels.dispose();
      hint.remove();
      rig.dispose();
      chip.dispose();
      scope.dispose();
      room.dispose();
      materials.dispose();
      coneGeometry.dispose();
      coneMaterial.dispose();
      post.dispose();
      environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      if (debugTarget.__sensorLab) delete debugTarget.__sensorLab;
    },
  };
}
