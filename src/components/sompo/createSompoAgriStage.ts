import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createSompoAgriScene } from './createSompoAgriScene';
import { loadSompoAgriAsset, disposeSompoAgriAsset } from './loadSompoAgriAsset';
import {
  SOMPO_AGRI_EQUIPMENT,
  getSompoAgriFrame,
  getSompoAgriScenario,
  type SompoAgriScenarioId,
} from '../../../shared/sompo-agri-scenarios.js';
import { getSompoAgriTravelMeters } from '../../../shared/sompo-agri-brief.js';
import { frameDamping } from './frameDamping.js';

export interface SompoAgriStageApi {
  focus(target: 'truck' | 'sensor'): void;
  adjust(action: 'rotate-left' | 'rotate-right' | 'zoom-in' | 'zoom-out'): void;
  recenterHeading(): void;
  dispose(): void;
}

function dampAngle(current: number, target: number, factor: number) {
  const shortestTurn = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + (shortestTurn * factor);
}

/** Silhueta honesta com as dimensões nominais quando o GLB gerado não carrega. */
function fallbackMachine(equipmentId: 'tractor' | 'harvester') {
  const size = SOMPO_AGRI_EQUIPMENT[equipmentId].nominalSizeM;
  const group = new THREE.Group();
  group.name = `agri-${equipmentId}-fallback`;
  const paint = new THREE.MeshStandardMaterial({ color: equipmentId === 'tractor' ? 0x1f6b35 : 0xb0392a, roughness: 0.5, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x181c1e, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(size.length * 0.72, size.height * 0.42, size.width * 0.6), paint);
  body.position.set(-size.length * 0.08, size.height * 0.42, 0);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(size.length * 0.3, size.height * 0.38, size.width * 0.5), paint);
  cab.position.set(size.length * 0.18, size.height * 0.76, 0);
  group.add(body, cab);
  for (const x of [size.length * 0.3, -size.length * 0.3]) {
    for (const side of [-1, 1]) {
      const radius = x > 0 ? size.height * 0.16 : size.height * 0.24;
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.5, 20), dark);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, radius, side * size.width * 0.36);
      group.add(wheel);
    }
  }
  group.traverse((node) => { const mesh = node as THREE.Mesh; if (mesh.isMesh) mesh.castShadow = mesh.receiveShadow = true; });
  return group;
}

/**
 * Palco agrícola autocontido: renderer, campo, equipamento gerado e movimento
 * real em forma fechada — separado do loop do caminhão para não arriscar o
 * fluxo rural. Desmontado e remontado a cada troca de cenário/desfecho.
 */
export function mountSompoAgriStage({ mount, scenarioId, outcomeId, startedAtRef, onModelStatus, onWebglError }: {
  mount: HTMLElement;
  scenarioId: SompoAgriScenarioId;
  outcomeId: string;
  startedAtRef: { current: number };
  onModelStatus: (status: 'loading' | 'gltf' | 'fallback', asset: string | null) => void;
  onWebglError: () => void;
}): SompoAgriStageApi | null {
  const scenario = getSompoAgriScenario(scenarioId);
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  } catch {
    onWebglError();
    return null;
  }
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 360);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x07100c, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  mount.appendChild(renderer.domElement);

  const environmentScene = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(environmentScene, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = scenario.environmentId === 'row-crop-field-night' ? 0.12 : 0.5;
  environmentScene.dispose();
  pmrem.dispose();
  scene.background = new THREE.Color(scenario.environmentId === 'row-crop-field-night' ? 0x060d16 : 0xb9d2d9);
  scene.fog = new THREE.Fog(scenario.environmentId === 'row-crop-field-night' ? 0x081019 : 0xb9c8c2, 60, 170);

  const worldRoot = new THREE.Group();
  scene.add(worldRoot);
  const field = createSompoAgriScene(worldRoot, scenario.environmentId);
  // A cena agrícola traz o próprio sol; só o abrimos para cobrir a máquina inteira.
  field.root.traverse((node) => {
    const light = node as THREE.DirectionalLight;
    if (light.isDirectionalLight) {
      light.castShadow = true;
      light.shadow.mapSize.set(2048, 2048);
      light.shadow.camera.left = -30; light.shadow.camera.right = 30;
      light.shadow.camera.top = 30; light.shadow.camera.bottom = -30;
      light.shadow.camera.near = 0.5; light.shadow.camera.far = 120;
      light.shadow.normalBias = 0.02;
    }
  });

  // Percurso centrado no talhão: o equipamento atravessa o campo de verdade.
  const totalTravel = getSompoAgriTravelMeters(scenarioId, scenario.totalMs, outcomeId);
  const startX = -totalTravel / 2;
  if (scenario.environmentId === 'farm-barn') {
    // O barracão gira para a manobra de ré terminar estacionada lá dentro.
    const barn = field.root.getObjectByName('sompo-agri-barn');
    if (barn) { barn.rotation.y = Math.PI; barn.position.set(startX + totalTravel + 0.5, 0, 0); }
  }
  if (scenario.environmentId === 'muddy-field') {
    // A mancha de lama fica onde o avanço estanca, não num ponto fixo do campo.
    let peakTravel = 0;
    for (let atMs = 0; atMs <= scenario.totalMs; atMs += 250) {
      peakTravel = Math.max(peakTravel, getSompoAgriTravelMeters(scenarioId, atMs, outcomeId));
    }
    const mud = field.root.children.find((child) => (child as THREE.Mesh).isMesh
      && ((child as THREE.Mesh).geometry as THREE.BufferGeometry).type === 'CircleGeometry');
    if (mud) mud.position.x = startX + peakTravel;
  }

  const machine = new THREE.Group();
  machine.name = 'sompo-agri-machine';
  machine.position.set(startX, 0, 0);
  worldRoot.add(machine);

  // Luzes de trabalho/faróis/giroflex comandados pelo frame (essenciais à noite).
  const headlight = new THREE.SpotLight(0xf3ecd8, 0, 46, Math.PI / 7, 0.45, 1.2);
  headlight.position.set(scenario.equipmentId === 'harvester' ? 3.4 : 2.6, 2.4, 0);
  headlight.target.position.set(20, 0, 0);
  machine.add(headlight, headlight.target);
  const workLight = new THREE.SpotLight(0xeaf2ff, 0, 30, Math.PI / 3.2, 0.7, 1.4);
  workLight.position.set(1.5, 3.4, 0);
  workLight.target.position.set(6, 0, 0);
  machine.add(workLight, workLight.target);
  const beacon = new THREE.PointLight(0xff9a1f, 0, 14, 1.8);
  beacon.position.set(0, scenario.equipmentId === 'harvester' ? 4.1 : 3.3, 0);
  machine.add(beacon);

  let disposed = false;
  let model: THREE.Object3D | null = null;
  const abort = new AbortController();
  onModelStatus('loading', null);
  void loadSompoAgriAsset(scenario.equipmentId, abort.signal).then((loaded) => {
    if (disposed || !loaded) { if (loaded) disposeSompoAgriAsset(loaded); return; }
    model = loaded;
    machine.add(loaded);
    onModelStatus('gltf', SOMPO_AGRI_EQUIPMENT[scenario.equipmentId].label);
  }).catch(() => {
    if (disposed) return;
    model = fallbackMachine(scenario.equipmentId);
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
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(mount);
  resize();

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const focusPoint = new THREE.Vector3();
  let frameId = 0;
  let previousTime = performance.now();

  function render(time: number) {
    const frameDelta = Math.max(0, (time - previousTime) / 1_000);
    previousTime = time;
    const elapsed = Math.max(0, time - startedAtRef.current);
    const frame = getSompoAgriFrame(scenarioId, elapsed, outcomeId);
    const travel = reduceMotion.matches ? 0 : getSompoAgriTravelMeters(scenarioId, elapsed, outcomeId);
    const x = startX + travel;
    const z = frame.lateral;
    machine.position.set(x, Math.max(0, field.groundHeight(x, z)) + frame.vertical - (frame.sink * 0.5), z);
    const damp = reduceMotion.matches ? 1 : frameDamping(frameDelta, 7.5);
    machine.rotation.y = dampAngle(machine.rotation.y, THREE.MathUtils.degToRad(frame.yaw), damp);
    machine.rotation.z = dampAngle(machine.rotation.z, THREE.MathUtils.degToRad(frame.pitch), damp);
    machine.rotation.x = dampAngle(machine.rotation.x, THREE.MathUtils.degToRad(frame.roll), damp);
    field.update(frame);
    const clock = reduceMotion.matches ? 0 : time / 1000;
    headlight.intensity = frame.headlights * 55;
    workLight.intensity = frame.workLights * 40;
    beacon.intensity = frame.beacon * (reduceMotion.matches ? 6 : 4.5 + Math.max(0, Math.sin(clock * 7)) * 6);
    focusPoint.set(machine.position.x, machine.position.y + 1.6, machine.position.z);
    const targetXBefore = orbit.target.x;
    orbit.target.lerp(focusPoint, reduceMotion.matches ? 1 : frameDamping(frameDelta, 5));
    camera.position.x += orbit.target.x - targetXBefore;
    orbit.update();
    renderer.render(scene, camera);
    if (!document.hidden) frameId = window.requestAnimationFrame(render);
  }
  function onVisibilityChange() {
    window.cancelAnimationFrame(frameId);
    if (!document.hidden) {
      previousTime = performance.now();
      frameId = window.requestAnimationFrame(render);
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChange);
  frameId = window.requestAnimationFrame(render);

  return {
    focus(target) {
      const anchor = target === 'sensor'
        ? focusPoint.set(machine.position.x + 2.5, machine.position.y + 2.2, machine.position.z)
        : focusPoint.set(machine.position.x, machine.position.y + 1.6, machine.position.z);
      orbit.target.copy(anchor);
      camera.position.set(anchor.x + (target === 'sensor' ? 6 : 10.5), target === 'sensor' ? 4 : 5.2, target === 'sensor' ? 6.5 : 12.5);
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
      abort.abort();
      window.cancelAnimationFrame(frameId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      resizeObserver.disconnect();
      orbit.dispose();
      field.dispose();
      if (model) disposeSompoAgriAsset(model);
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh & { material?: THREE.Material | THREE.Material[] };
        mesh.geometry?.dispose();
        if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => material.dispose());
      });
      environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
