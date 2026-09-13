import * as THREE from 'three';
import { rigSompoAgriAsset, SOMPO_AGRI_RIG_LAYOUT } from './rigSompoAgriAsset';
import { createSompoMotionPath, integrateSompoMotion } from '../../../shared/sompo-motion.js';
import { createSompoPastureSurface } from './createSompoPastureSurface';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createSompoAgriScene } from './createSompoAgriScene';
import { loadSompoAgriAsset, disposeSompoAgriAsset } from './loadSompoAgriAsset';
import {
  SOMPO_AGRI_EQUIPMENT,
  getSompoAgriFrame,
  getSompoAgriKeyframes,
  getSompoAgriScenario,
  type SompoAgriScenarioId,
} from '../../../shared/sompo-agri-scenarios.js';
import { createSompoRenderer, sompoRenderBudget, disposeSompoObject, type SompoStageApi } from './sompoStage';
import { createSompoEnvironmentAssets } from './createSompoEnvironmentAssets';
import { createSompoAtmosphere } from './createSompoAtmosphere';
import { createSompoPostProcessing } from './createSompoPostProcessing';
import { createSompoRenderMeter } from './sompoStage';
import { exportSompoModel } from './refineSompoTruck';
import { SOMPO_STUDIO_DEFAULT, type SompoStudioConfig, type SompoRenderStats } from './sompoStudioConfig';

export type SompoAgriStageApi = SompoStageApi;


/** Silhueta honesta com as dimensões nominais quando o GLB gerado não carrega. */
function fallbackMachine(equipmentId: 'tractor' | 'harvester') {
  const tractor = equipmentId === 'tractor';
  const group = new THREE.Group(); group.name = `agri-${equipmentId}-fallback`;
  const paint = new THREE.MeshStandardMaterial({ color: 0x1f6b35, roughness: .55, metalness: .2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x181c1e, roughness: .9 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x31464d, roughness: .22, metalness: .3 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(tractor ? 2.9 : 4.5, tractor ? .7 : 1.4, tractor ? 1.1 : 2.1), paint);
  body.position.set(tractor ? .85 : -.25, tractor ? 1.12 : 1.8, 0); group.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.05, tractor ? 1.25 : 1.7), glass);
  cab.position.set(tractor ? .35 : 1.45, tractor ? 2.05 : 2.6, 0); group.add(cab);
  for (const axle of SOMPO_AGRI_RIG_LAYOUT[equipmentId].axles) for (const side of [-1, 1]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(axle.radius, axle.radius, tractor ? .42 : .62, 28), dark);
    wheel.rotation.x = Math.PI / 2; wheel.position.set(axle.x, axle.y, side * axle.z); group.add(wheel);
  }
  const implement = new THREE.Mesh(new THREE.BoxGeometry(tractor ? 1.9 : 1.6, .18, tractor ? 1.1 : 5.4), paint);
  implement.position.set(tractor ? -1.9 : 3.5, .55, 0); group.add(implement);
  group.traverse((node) => { const mesh = node as THREE.Mesh; if (mesh.isMesh) mesh.castShadow = mesh.receiveShadow = true; });
  return group;
}

/**
 * Palco agrícola autocontido: renderer, campo, equipamento gerado e movimento
 * real em forma fechada — separado do loop do caminhão para não arriscar o
 * fluxo rural. Desmontado e remontado a cada troca de cenário/desfecho.
 */
export function mountSompoAgriStage({ mount, scenarioId, outcomeId, startedAtRef, onModelStatus, onWebglError, onAfterRender, studioRef, getElapsed, onStats }: {
  mount: HTMLElement;
  scenarioId: SompoAgriScenarioId;
  outcomeId: string;
  startedAtRef: { current: number };
  onModelStatus: (status: 'loading' | 'gltf' | 'fallback', asset: string | null) => void;
  onWebglError: () => void;
  // Chamado no mesmo rAF do renderer.render — é o ponto seguro para capturar o canvas.
  onAfterRender?: (canvas: HTMLCanvasElement) => void;
  studioRef?: { current: SompoStudioConfig };
  getElapsed?: (time: number) => number;
  onStats?: (stats: SompoRenderStats) => void;
}): SompoAgriStageApi | null {
  const scenario = getSompoAgriScenario(scenarioId);
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = createSompoRenderer(mount).renderer;
  } catch {
    onWebglError();
    return null;
  }
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 360);

  const environmentScene = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(environmentScene, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = scenario.environmentId === 'row-crop-field-night' ? 0.12 : 0.5;
  environmentScene.dispose();
  pmrem.dispose();
  const nightSky = scenario.environmentId === 'row-crop-field-night';
  const skyCanvas = document.createElement('canvas'); skyCanvas.width = 8; skyCanvas.height = 256;
  const skyContext = skyCanvas.getContext('2d');
  if (skyContext) {
    const gradient = skyContext.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, nightSky ? '#081423' : '#6b99b0');
    gradient.addColorStop(.7, nightSky ? '#162436' : '#b5cdd0');
    gradient.addColorStop(1, nightSky ? '#25303b' : '#c7cdbc');
    skyContext.fillStyle = gradient; skyContext.fillRect(0, 0, 8, 256);
  }
  const skyMap = new THREE.CanvasTexture(skyCanvas); skyMap.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyMap;
  scene.fog = new THREE.Fog(scenario.environmentId === 'row-crop-field-night' ? 0x081019 : 0xb9c8c2, 60, 170);

  const worldRoot = new THREE.Group();
  scene.add(worldRoot);
  const night = scenario.environmentId === 'row-crop-field-night';
  const budget = sompoRenderBudget();
  const field = createSompoAgriScene(worldRoot, scenario.environmentId, budget.compact, scenario.equipmentId);
  const atmosphere = createSompoAtmosphere(scene, renderer, field.sun);
  const post = createSompoPostProcessing(renderer, scene, camera);
  const meter = createSompoRenderMeter(renderer, onStats);
  const assets = createSompoEnvironmentAssets(scene, renderer, { background: false, intensity: night ? 0.30 : 0.68, initialWet: scenario.environmentId === 'muddy-field', onHdri: (kind, tex) => atmosphere.setSkyTexture(kind, tex) });
  assets.surface(field.terrain.material, 'dirt', 45, 30);
  const pasture = createSompoPastureSurface(field.terrain.material, true);
  if (scenario.environmentId === 'muddy-field') {
    // Packed roughness and normals keep wet soil from becoming a flat gray mirror.
    assets.surface(field.mud.material, 'dirt', 4, 2.6);
    field.mud.material.envMapIntensity = 0.18;
  }
  field.terrain.material.color.set(night ? 0x8b8b81 : scenario.environmentId === 'muddy-field' ? 0x736b60 : 0xd7c6a5);
  // A cena agrícola traz o próprio sol; só o abrimos para cobrir a máquina inteira.
  field.root.traverse((node) => {
    const light = node as THREE.DirectionalLight;
    if (light.isDirectionalLight) {
      light.castShadow = true;
      light.shadow.mapSize.set(budget.shadowSize, budget.shadowSize);
      light.shadow.camera.left = -22; light.shadow.camera.right = 22;
      light.shadow.camera.top = 22; light.shadow.camera.bottom = -22;
      light.shadow.camera.near = 0.5; light.shadow.camera.far = 120;
      light.shadow.normalBias = 0.02;
    }
  });

  // Percurso centrado no talhão: o equipamento atravessa o campo de verdade.
  const keyframes = getSompoAgriKeyframes(scenarioId, outcomeId);
  // Lateral é deslize roteirizado: só entra no path quando algum keyframe o pede.
  const useLateral = keyframes.some((keyframe) => Math.abs(keyframe.lateral) > 1e-3);
  const path = createSompoMotionPath(at => getSompoAgriFrame(scenarioId, at, outcomeId), scenario.totalMs);
  const pathPoint = new THREE.Vector3();
  const totalTravel = path.sample(scenario.totalMs, pathPoint).x;
  const startX = -totalTravel / 2;
  if (scenario.equipmentId === 'harvester') field.setHarvestPath(Array.from({ length: 8 }, (_, i) => {
    const point = path.sample(scenario.totalMs * i / 7, { x: 0, z: 0 }); point.x += startX; return point;
  }));
  if (scenario.environmentId === 'farm-barn') {
    // O barracão gira para a manobra de ré terminar estacionada lá dentro.
    // A porta fica ~1 m atrás da ponta do implemento em t=0 — o conjunto
    // começa fora e a ré termina com o implemento dentro do vão.
    const barn = field.root.getObjectByName('sompo-agri-barn');
    if (barn) { barn.rotation.y = Math.PI; barn.position.set(startX - 10, 0, 0); }
    // Pilar interno aonde a ponta do implemento varre em t≈7000. Em
    // 'post-contact' fica na linha da varredura (o implemento engancha); em
    // 'parked' mais aberto, para a ré final passar rente sem tocar.
    const postAt = path.sample(7_000, pathPoint);
    const postX = startX + postAt.x - 2.55;
    const postZ = postAt.z + (outcomeId === 'post-contact' ? 1.45 : 1.85);
    field.barnPost?.position.set(postX, field.groundHeight(postX, postZ) - 0.08, postZ);
  }
  if (scenario.environmentId === 'muddy-field') {
    // A mancha de lama fica onde o avanço estanca, não num ponto fixo do campo.
    let peakTravel = 0;
    for (let atMs = 0; atMs <= scenario.totalMs; atMs += 250) {
      peakTravel = Math.max(peakTravel, path.sample(atMs, pathPoint).x);
    }
    field.placeMud(startX + peakTravel);
  }

  const machine = new THREE.Group();
  machine.name = 'sompo-agri-machine';
  machine.rotation.order = 'YZX';
  machine.position.set(startX, 0, 0);
  worldRoot.add(machine);

  // Luzes de trabalho/faróis/giroflex comandados pelo frame (essenciais à noite).
  const headlight = new THREE.SpotLight(0xf3ecd8, 0, 52, Math.PI / 6.5, 0.45, 1.2);
  headlight.position.set(scenario.equipmentId === 'harvester' ? 2.15 : 1.5, scenario.equipmentId === 'harvester' ? 2.9 : 2.3, 0);
  headlight.target.position.set(20, -0.5, 0);
  machine.add(headlight, headlight.target);
  // Projetores iluminam onde o trabalho acontece: a plataforma da
  // colheitadeira à frente, o implemento do trator atrás.
  const workLight = new THREE.SpotLight(0xeaf2ff, 0, 34, Math.PI / 3.1, 0.7, 1.4);
  const workAhead = scenario.equipmentId === 'harvester';
  workLight.position.set(workAhead ? 1.9 : -0.55, workAhead ? 3.55 : 2.45, 0);
  workLight.target.position.set(workAhead ? 5.6 : -4.8, workAhead ? 0.2 : 0.4, 0);
  machine.add(workLight, workLight.target);
  const beaconTop = scenario.equipmentId === 'harvester' ? 3.9 : 2.62;
  const beacon = new THREE.PointLight(0xff9a1f, 0, 14, 1.8);
  const beaconX = scenario.equipmentId === 'harvester' ? 0.6 : -0.1, beaconZ = scenario.equipmentId === 'harvester' ? 0.2 : 0.25;
  beacon.position.set(beaconX, beaconTop, beaconZ);
  machine.add(beacon);
  // Giroflex de verdade varre o campo: um feixe estreito girando no topo.
  const beaconSweep = new THREE.SpotLight(0xff9a1f, 0, 22, 0.5, 0.8, 1.5);
  beaconSweep.position.set(beaconX, beaconTop, beaconZ);
  machine.add(beaconSweep, beaconSweep.target);

  let disposed = false;
  let model: THREE.Object3D | null = null;
  let rig: ReturnType<typeof rigSompoAgriAsset> | null = null;
  const abort = new AbortController();
  onModelStatus('loading', null);
  void loadSompoAgriAsset(scenario.equipmentId, abort.signal).then((loaded) => {
    if (disposed || !loaded) { if (loaded) disposeSompoAgriAsset(loaded); return; }
    rig = rigSompoAgriAsset(loaded, scenario.equipmentId);
    model = rig.root;
    machine.add(model);
    onModelStatus('gltf', SOMPO_AGRI_EQUIPMENT[scenario.equipmentId].label);
  }).catch(() => {
    if (disposed) return;
    rig = rigSompoAgriAsset(fallbackMachine(scenario.equipmentId), scenario.equipmentId);
    model = rig.root;
    machine.add(model);
    onModelStatus('fallback', null);
  });

  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.07;
  orbit.enablePan = false;
  orbit.minDistance = 6;
  orbit.maxDistance = 30;
  orbit.maxPolarAngle = Math.PI * 0.49;
  orbit.target.set(startX, 1.6, 0);
  camera.position.set(startX + 10.5, 5.2, 12.5);

  function resize() {
    const { width, height } = mount.getBoundingClientRect();
    renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    camera.aspect = Math.max(1, width) / Math.max(1, height);
    // Preserve horizontal room for the full vehicle in a portrait canvas.
      camera.fov = Math.min(72, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(37 / 2)) * Math.max(1, 1.25 / camera.aspect))));
      camera.updateProjectionMatrix();
    post.resize(Math.max(1, width), Math.max(1, height));
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(mount);
  resize();

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const focusPoint = new THREE.Vector3();
  let focusTarget: 'truck' | 'sensor' = 'truck';
  let frameId = 0;
  const cameraShift = new THREE.Vector3();

  function render(time: number) {
    meter.begin();
    const elapsed = getElapsed ? getElapsed(time) : Math.max(0, time - startedAtRef.current);
    const frame = getSompoAgriFrame(scenarioId, elapsed, outcomeId);
    path.sample(reduceMotion.matches ? 0 : elapsed, pathPoint);
    const x = startX + pathPoint.x;
    // Authored lateral slip only applies where the script calls for it (capotamento,
    // tranco de contato); normal steering follows the integrated heading.
    const z = pathPoint.z + (useLateral ? frame.lateral : 0);
    machine.rotation.set(THREE.MathUtils.degToRad(frame.roll), THREE.MathUtils.degToRad(frame.yaw), THREE.MathUtils.degToRad(frame.pitch), 'YZX');
    // Chacoalho físico: slip de roda e roughness do roteiro viram tremor de
    // alta frequência + balanço lento das tentativas de desatolamento.
    const wheelKph = frame.wheelSpeedKph ?? frame.speedKph;
    const slip = Math.max(0, Math.abs(wheelKph) - Math.abs(frame.speedKph));
    const effort = reduceMotion.matches ? 0 : Math.min(1, frame.roughness * .14 + slip * .05 + frame.mud * .1);
    const shakeT = elapsed / 1000;
    if (effort > 0.02) {
      machine.rotation.x += effort * .011 * Math.sin(shakeT * 37 + Math.sin(shakeT * 13) * 2);
      machine.rotation.z += effort * .008 * Math.sin(shakeT * 43 + 1.7);
      machine.rotation.z += Math.min(1, slip / 15) * .02 * Math.sin(shakeT * 4.6);
    }
    // Trepidação mecânica: jitter de alta frequência limitado pelo envelope do roteiro.
    const tremor = reduceMotion.matches ? 0 : (frame.shudder ?? 0);
    if (tremor) {
      machine.rotation.x += tremor * 0.012 * Math.sin(elapsed * 0.047);
      machine.rotation.z += tremor * 0.009 * Math.sin(elapsed * 0.059 + 1.9);
    }
    rig?.update(frame, integrateSompoMotion(keyframes, elapsed) / 3.6,
      integrateSompoMotion(keyframes, elapsed, 'headerSpeed', false) * .8, reduceMotion.matches);
    const contactHeight = rig?.supportHeight(machine.rotation, x, z, field.groundHeight) ?? 0;
    machine.position.set(x, field.groundHeight(x, z) + contactHeight + THREE.MathUtils.clamp(frame.vertical, -0.6, 1) - frame.sink * .5, z);
    if (effort > 0.02) machine.position.y += effort * .014 * (0.5 + 0.5 * Math.sin(shakeT * 51));
    const studio = studioRef?.current ?? SOMPO_STUDIO_DEFAULT;
    field.update(frame, machine.position, camera.position, reduceMotion.matches, studio.wind, elapsed);
    field.sun.position.set(x - 24, 34, z + 18);
    field.sun.target.position.set(x, 0, z);
    field.sun.target.updateMatrixWorld();
    const clock = reduceMotion.matches ? 0 : elapsed / 1000;
    headlight.intensity = frame.headlights * 80;
    workLight.intensity = frame.workLights * 65;
    beacon.intensity = frame.beacon * (reduceMotion.matches ? 6 : 4.5 + Math.max(0, Math.sin(clock * 7)) * 6);
    beaconSweep.intensity = reduceMotion.matches ? 0 : frame.beacon * 34;
    const sweepAngle = clock * 5.4;
    beaconSweep.target.position.set(beaconX + Math.cos(sweepAngle) * 11, -beaconTop, beaconZ + Math.sin(sweepAngle) * 11);
    focusPoint.set(machine.position.x + (focusTarget === 'sensor' ? 2.5 : 0), machine.position.y + (focusTarget === 'sensor' ? 2.2 : 1.6), machine.position.z);
    cameraShift.copy(focusPoint).sub(orbit.target);
    camera.position.add(cameraShift);
    orbit.target.copy(focusPoint);
    orbit.update();
    atmosphere.update(studio, camera, machine.position, elapsed, scenario.environmentId === 'muddy-field', night);
    post.render(elapsed);
    meter.end();
    onAfterRender?.(renderer.domElement);
    if (!document.hidden) frameId = window.requestAnimationFrame(render);
  }
  function onVisibilityChange() {
    window.cancelAnimationFrame(frameId);
    if (!document.hidden) {
      frameId = window.requestAnimationFrame(render);
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChange);
  frameId = window.requestAnimationFrame(render);

  return {
    exportModel: () => { if (!model) return Promise.reject(new Error('Aguarde o carregamento da máquina.')); return exportSompoModel(model); },
    focus(target) {
      focusTarget = target;
      const anchor = target === 'sensor'
        ? focusPoint.set(machine.position.x + 2.5, machine.position.y + 2.2, machine.position.z)
        : focusPoint.set(machine.position.x, machine.position.y + 1.6, machine.position.z);
      orbit.target.copy(anchor);
      camera.position.set(anchor.x + (target === 'sensor' ? 6 : 10.5), machine.position.y + (target === 'sensor' ? 4 : 5.2), anchor.z + (target === 'sensor' ? 6.5 : 12.5));
      orbit.update();
    },
    adjust(action) {
      const offset = camera.position.clone().sub(orbit.target);
      if (action === 'rotate-left' || action === 'rotate-right') {
        offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), (action === 'rotate-left' ? 1 : -1) * THREE.MathUtils.degToRad(12));
      } else {
        offset.setLength(THREE.MathUtils.clamp(offset.length() * (action === 'zoom-in' ? 0.84 : 1.18), orbit.minDistance, orbit.maxDistance));
      }
      camera.position.copy(orbit.target).add(offset);
      orbit.update();
    },
    recenterHeading() { /* sem rumo integrado no palco agrícola */ },
    dispose() {
      disposed = true;
      pasture.dispose();
      post.dispose();
      atmosphere.dispose();
      abort.abort();
      window.cancelAnimationFrame(frameId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      resizeObserver.disconnect();
      orbit.dispose();
      field.dispose();
      if (model) disposeSompoAgriAsset(model);
      assets.dispose();
      skyMap.dispose();
      if (model) model.removeFromParent();
      disposeSompoObject(scene);
      environment.dispose();
      renderer.dispose();
      // Each stage owns its canvas/context. Retire driver resources immediately
      // instead of waiting for GC after repeated rural/agricultural switches.
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
