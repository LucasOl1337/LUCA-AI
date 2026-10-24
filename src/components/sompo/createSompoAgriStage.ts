import { createSompoFloodSheets } from './createSompoFloodSheet';
import * as THREE from 'three';
import { criarPropsRurais } from '../gameplay/criarPropsRurais';
import { COLISORES_RURAIS } from '../gameplay/propsRurais';
import { criarSinalizacaoCircuito } from '../gameplay/sinalizacaoCircuito';
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
  isSompoTractorLike,
  type SompoAgriEquipmentId,
  type SompoAgriScenarioId,
} from '../../../shared/sompo-agri-scenarios.js';
import { createSompoGeofenceLayer } from '../../geofencing/createSompoGeofenceLayer';
import { createSompoRenderer, sompoRenderBudget, disposeSompoObject, type SompoStageApi, type SompoCameraRig } from './sompoStage';
import { createSompoEnvironmentAssets } from './createSompoEnvironmentAssets';
import { createSompoAtmosphere } from './createSompoAtmosphere';
import { createSompoPostProcessing } from './createSompoPostProcessing';
import { createSompoRenderMeter } from './sompoStage';
import { soltarLutCompartilhada } from './soltarLutCompartilhada';
import { soltarOrbit } from './soltarOrbit';
import { PERFIL_PADRAO, criarPortaoDeAquecimento, pixelRatioDoDegrau, qualidadeInicial, regularQualidade, type PerfilQualidade } from './qualidadeAdaptativa';
import { exportSompoModel } from './refineSompoTruck';
import { SOMPO_STUDIO_DEFAULT, type SompoStudioConfig, type SompoRenderStats } from './sompoStudioConfig';
import { sensorReadingToPose, type SompoAxisCalibration } from './sensorPose.js';
import { frameDamping } from './frameDamping.js';
import type { SompoTelemetrySnapshot } from '@/lib/types';

export type SompoAgriStageApi = SompoStageApi;

export interface SompoLookContexto {
  mount: HTMLElement;
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  sun: THREE.DirectionalLight;
  /** Liga/desliga o grade do pós (o look que já gradua no tone mapping desliga). */
  setPostGrade(enabled: boolean): void;
  night: boolean;
}

export interface SompoLook {
  quadro(camera: THREE.Camera, anchor: THREE.Vector3): void;
  dispose(): void;
}

/** Modo físico: a máquina do cadastro acoplada ao ESP32 do feed, em vez do roteiro. */
export interface SompoAgriPhysicalInput {
  previewRef: { current: SompoTelemetrySnapshot };
  axisCalibrationRef: { current: SompoAxisCalibration };
}

function dampAngle(current: number, target: number, factor: number) {
  return current + Math.atan2(Math.sin(target - current), Math.cos(target - current)) * factor;
}


/** Silhueta honesta com as dimensões nominais quando o GLB gerado não carrega. */
function fallbackMachine(equipmentId: SompoAgriEquipmentId) {
  const tractor = isSompoTractorLike(equipmentId);
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
  if (equipmentId !== 'max-tractor') {
    const implement = new THREE.Mesh(new THREE.BoxGeometry(tractor ? 1.9 : 1.6, .18, tractor ? 1.1 : 5.4), paint);
    implement.position.set(tractor ? -1.9 : 3.5, .55, 0); group.add(implement);
  }
  group.traverse((node) => { const mesh = node as THREE.Mesh; if (mesh.isMesh) mesh.castShadow = mesh.receiveShadow = true; });
  return group;
}

const HAY_BALE_RADIUS = 0.72;
// Face interna da parede do fundo do barracão, em x local (createBarn: D=6, chapa de 0,18 m).
const BARN_BACK_WALL_INNER_X = 5.91;

/** Fardo redondo de feno deitado no caminho do Trator MAX: obstáculo sem animal nem pessoa. */
function createHayBale() {
  const group = new THREE.Group(); group.name = 'agri-max-obstacle-hay-bale';
  const straw = new THREE.MeshStandardMaterial({ color: 0xcaa45a, roughness: .95 });
  const face = new THREE.MeshStandardMaterial({ color: 0xb48c45, roughness: 1 });
  const twine = new THREE.MeshStandardMaterial({ color: 0x8a6a2e, roughness: .9 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(HAY_BALE_RADIUS, HAY_BALE_RADIUS, 1.25, 32, 1), [straw, face, face]);
  body.rotation.x = Math.PI / 2; body.position.y = HAY_BALE_RADIUS; group.add(body);
  for (const z of [-.38, 0, .38]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(HAY_BALE_RADIUS + .005, .018, 6, 40), twine);
    band.position.set(0, HAY_BALE_RADIUS, z); group.add(band);
  }
  group.traverse((node) => { const mesh = node as THREE.Mesh; if (mesh.isMesh) mesh.castShadow = mesh.receiveShadow = true; });
  return group;
}

/** Feixe do HC-SR04: duas linhas divergentes e um cone translúcido; verde em operação, vermelho em alerta. */
function createUltrasonicBeam(origin: readonly [number, number, number]) {
  const group = new THREE.Group(); group.name = 'agri-max-ultrasonic-range';
  group.position.fromArray(origin);
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0x7dff9a, transparent: true, opacity: .78 });
  for (const z of [-.12, .12]) {
    const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, z), new THREE.Vector3(1, 0, z + Math.sign(z) * .26)]), lineMaterial);
    ray.name = `ultrasonic-ray-${z > 0 ? 'left' : 'right'}`; group.add(ray);
  }
  // Cone de ~30° (abertura nominal do HC-SR04), com o vértice no emissor.
  const coneGeometry = new THREE.ConeGeometry(Math.tan(THREE.MathUtils.degToRad(15)), 1, 28, 1, true);
  coneGeometry.translate(0, -.5, 0); coneGeometry.rotateZ(Math.PI / 2);
  const coneMaterial = new THREE.MeshBasicMaterial({ color: 0x7dff9a, transparent: true, opacity: .16, side: THREE.DoubleSide, depthWrite: false });
  const cone = new THREE.Mesh(coneGeometry, coneMaterial); cone.name = 'ultrasonic-cone'; group.add(cone);
  const pulse = new THREE.Mesh(new THREE.TorusGeometry(1, .012, 6, 36), new THREE.MeshBasicMaterial({ color: 0x7dff9a, transparent: true, opacity: .5, depthWrite: false }));
  pulse.rotation.y = Math.PI / 2; pulse.name = 'ultrasonic-pulse'; group.add(pulse);
  return {
    group,
    update(distanceCm: number, alert: boolean, elapsedMs: number, uncertain = false) {
      // 400 cm é "sem eco": feixe no alcance máximo e mais apagado.
      const echo = distanceCm < 395;
      const length = Math.max(.02, Math.min(4, distanceCm / 100));
      for (const child of group.children) if (child !== pulse) child.scale.set(length, 1, 1);
      cone.scale.set(length, length, length);
      // Leitura física velha ou desconhecida: âmbar, como o feixe do caminhão.
      const color = uncertain ? 0xc9ad74 : alert ? 0xff5d52 : 0x7dff9a;
      lineMaterial.color.set(color); coneMaterial.color.set(color); (pulse.material as THREE.MeshBasicMaterial).color.set(color);
      lineMaterial.opacity = echo ? (alert ? 1 : .78) : .4;
      coneMaterial.opacity = echo ? (alert ? .26 : .16) : .07;
      const phase = (elapsedMs / 600) % 1;
      pulse.position.x = phase * length;
      const ring = Math.max(.04, Math.tan(THREE.MathUtils.degToRad(15)) * phase * length);
      pulse.scale.set(ring, ring, ring);
      (pulse.material as THREE.MeshBasicMaterial).opacity = (1 - phase) * (echo ? .55 : .25);
    },
  };
}

/**
 * Palco agrícola autocontido: renderer, campo, equipamento gerado e movimento
 * real em forma fechada: separado do loop do caminhão para não arriscar o
 * fluxo rural. Desmontado e remontado a cada troca de cenário/desfecho.
 */
export function mountSompoAgriStage({ mount, ruralProps = false, scenarioId, outcomeId, startedAtRef, onModelStatus, onWebglError, onAfterRender, studioRef, getElapsed, onStats, physical, cameraRig, adaptiveQuality = false, obstaclesRef, assetUrl, qualityProfile = PERFIL_PADRAO, terrainRelief, cropHeight, look, waterZones, circuitRoute }: {
  ruralProps?: boolean;
  mount: HTMLElement;
  scenarioId: SompoAgriScenarioId;
  outcomeId: string;
  startedAtRef: { current: number };
  onModelStatus: (status: 'loading' | 'gltf' | 'fallback', asset: string | null) => void;
  onWebglError: () => void;
  // Chamado no mesmo rAF do renderer.render: é o ponto seguro para capturar o canvas.
  onAfterRender?: (canvas: HTMLCanvasElement) => void;
  studioRef?: { current: SompoStudioConfig };
  getElapsed?: (time: number) => number;
  onStats?: (stats: SompoRenderStats) => void;
  /** Sem roteiro: pose do IMU e distância do HC-SR04. Parado no talhão, porque sem GNSS não há trajetória. */
  physical?: SompoAgriPhysicalInput;
  /** Câmera de cabine opcional; sem ela (ou inativa) a órbita segue igual. */
  cameraRig?: SompoCameraRig;
  /** Totem: desce pixel ratio, pós e sombras quando o FPS cai (qualidadeAdaptativa). */
  adaptiveQuality?: boolean;
  /**
   * Gameplay: obstáculos de quem dirige (centro no chão e raio), no lugar do
   * fardo fixo do case. Lido a cada quadro; trocar a lista reposiciona os fardos.
   */
  obstaclesRef?: { current: readonly { x: number; z: number; radius: number }[] };
  /** GLB da máquina no lugar do catálogo (gameplay: MAX com cabine). Sem ele, a URL de sempre. */
  assetUrl?: string;
  /** Degraus e limiares da qualidade automática; o padrão é o do totem clássico. */
  qualityProfile?: PerfilQualidade;
  /** Relevo somado ao do ambiente (gameplay: rampa lateral). O `ground` do drive já o inclui. */
  terrainRelief?: (x: number, z: number) => number;
  /** Altura da lavoura no lugar da do equipamento (gameplay: milho mais crescido). */
  cropHeight?: number;
  /**
   * Look de quem monta o palco (gameplay): ajusta luz, névoa e tone mapping a
   * cada quadro, depois da atmosfera e antes do render. Sem ele, nada muda.
   */
  look?: (ctx: SompoLookContexto) => SompoLook;
  /** Lâminas d'água planas (retângulos x0..x1, z0..z1 em metros): a área alagada do gameplay, a mesma do geofence. */
  waterZones?: readonly { x0: number; x1: number; z0: number; z1: number }[];
  circuitRoute?: readonly { x: number; z: number }[];
}): SompoAgriStageApi | null {
  const scenario = getSompoAgriScenario(scenarioId);
  const operation = scenario.environmentId === 'geofence-operacao';
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = createSompoRenderer(mount).renderer;
  } catch {
    onWebglError();
    return null;
  }
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(37, 1, 0.1, operation ? 800 : 360);

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
  const clearings = ruralProps ? COLISORES_RURAIS.map((p) => ({ x: p.x, z: p.z, radius: p.raioM + 1.7 })) : [];
  const field = createSompoAgriScene(worldRoot, scenario.environmentId, budget.compact, scenario.equipmentId, terrainRelief, cropHeight, circuitRoute, clearings);
  const propsRurais = ruralProps ? criarPropsRurais(worldRoot, field.groundHeight) : null;
  if (circuitRoute) criarSinalizacaoCircuito(worldRoot, circuitRoute, field.groundHeight);
  const atmosphere = createSompoAtmosphere(scene, renderer, field.sun);
  const post = createSompoPostProcessing(renderer, scene, camera);
  const lookAtivo = look?.({ mount, scene, renderer, sun: field.sun, setPostGrade: (on) => post.setGrade(on), night }) ?? null;
  // Qualidade automática (só no totem): o medidor de 1 s alimenta o regulador.
  const degraus = qualityProfile.degraus;
  let qualidade = qualidadeInicial(qualityProfile.degrauInicial ?? Math.max(0, degraus.findIndex(d => d.pixelRatio <= renderer.getPixelRatio())), qualityProfile);
  const aplicarDegrau = () => {
    const degrau = degraus[qualidade.degrau];
    const ratio = pixelRatioDoDegrau(degrau, window.devicePixelRatio);
    // setPixelRatio do three já refaz o tamanho do canvas e dos alvos do composer.
    if (ratio !== renderer.getPixelRatio()) { renderer.setPixelRatio(ratio); post.setPixelRatio(ratio); }
    post.setEnabled(degrau.pos);
    if (renderer.shadowMap.enabled !== degrau.sombras) {
      renderer.shadowMap.enabled = degrau.sombras;
      // Liga/desliga sombra muda o programa dos materiais: recompila uma vez.
      scene.traverse((node) => { const mesh = node as THREE.Mesh; if (mesh.isMesh) for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.needsUpdate = true; });
    }
    mount.dataset.qualidade = String(qualidade.degrau);
  };
  // O regulador só começa a julgar com o modelo na cena e depois do aquecimento.
  const aquecimento = criarPortaoDeAquecimento();
  const meter = createSompoRenderMeter(renderer, (stats) => {
    onStats?.(stats);
    if (!adaptiveQuality || !aquecimento.passa()) return;
    const anterior = qualidade.degrau;
    qualidade = regularQualidade(qualidade, stats.fps, performance.now(), qualityProfile);
    if (qualidade.degrau !== anterior) aplicarDegrau();
  });
  if (adaptiveQuality) aplicarDegrau();
  // Sonda da bancada (só com `window.__sondaPalco = true` antes de montar, e qualidade automática): fixa pixel ratio, pós e sombras para medir o que pesa.
  if (adaptiveQuality && typeof window !== 'undefined' && (window as unknown as { __sondaPalco?: boolean }).__sondaPalco === true) {
    (window as unknown as { __palcoSonda?: unknown }).__palcoSonda = {
      fixar({ pixelRatio, pos, sombras }: { pixelRatio?: number; pos?: boolean; sombras?: boolean }) {
        qualidade = { ...qualidade, travado: true };
        if (pixelRatio !== undefined) { renderer.setPixelRatio(pixelRatio); post.setPixelRatio(pixelRatio); }
        if (pos !== undefined) post.setEnabled(pos);
        if (sombras !== undefined && renderer.shadowMap.enabled !== sombras) {
          renderer.shadowMap.enabled = sombras;
          scene.traverse((node) => { const mesh = node as THREE.Mesh; if (mesh.isMesh) for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.needsUpdate = true; });
        }
        return { pixelRatio: renderer.getPixelRatio(), sombras: renderer.shadowMap.enabled };
      },
    };
  }
  const assets = createSompoEnvironmentAssets(scene, renderer, { background: false, intensity: night ? 0.30 : 0.68, initialWet: scenario.environmentId === 'muddy-field', onHdri: (kind, tex) => atmosphere.setSkyTexture(kind, tex) });
  assets.surface(field.terrain.material, 'dirt', 45, 30);
  // Talhão da operação é visto de cima e ocupa o campo todo: sem colcha vizinha.
  const pasture = createSompoPastureSurface(field.terrain.material, true, !operation);
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
  const startX = scenario.startX ?? -totalTravel / 2;
  if (operation) field.setHarvestPath(Array.from({ length: scenario.totalMs / 250 + 1 }, (_, i) => {
    const atMs = i * 250, frame = getSompoAgriFrame(scenarioId, atMs, outcomeId);
    const point = path.sample(atMs, { x: 0, z: 0 });
    return { x: startX + point.x, z: point.z + frame.lateral, atMs, yaw: frame.yaw, harvesting: frame.headerSpeed > 0.8 && frame.implementLift < 0.1 && frame.speedKph > 0 };
  }));
  else if (scenario.equipmentId === 'harvester') field.setHarvestPath(Array.from({ length: 8 }, (_, i) => {
    const point = path.sample(scenario.totalMs * i / 7, { x: 0, z: 0 }); point.x += startX; return point;
  }));
  // geofencing (módulo src/geofencing): faixas no chão, tinta no plantio e contornos do talhão; grupo vazio sem talhão.
  worldRoot.add(createSompoGeofenceLayer({ scenarioId, outcomeId, field, operation }));
  const barnWall = scenario.equipmentId === 'max-tractor' && scenario.obstacle?.kind === 'barn-back-wall' ? scenario.obstacle : null;
  if (barnWall) {
    // Trator MAX entra de frente: fachada com o vão virada para o trator e a face
    // interna da parede do fundo (x local 5,91) a `startGapM` à frente do emissor
    // do HC-SR04. Espelhado em z para o lado aberto continuar virado para a câmera
    // (o three.js inverte a face pelo determinante); o vão (centro z=1 no barracão)
    // cai na linha do percurso.
    const barn = field.root.getObjectByName('sompo-agri-barn');
    const wallX = startX + SOMPO_AGRI_RIG_LAYOUT['max-tractor'].sensor[0] + barnWall.startGapM;
    if (barn) { barn.rotation.y = 0; barn.scale.z = -1; barn.position.set(wallX - BARN_BACK_WALL_INNER_X, 0, 1); }
    // O pilar de balanço é da ré do trator agrícola; aqui ficaria no corredor.
    if (field.barnPost) field.barnPost.visible = false;
  } else if (scenario.environmentId === 'farm-barn') {
    // O barracão gira para a manobra de ré terminar estacionada lá dentro.
    // A porta fica ~1 m atrás da ponta do implemento em t=0. O conjunto
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

  const max = scenario.equipmentId === 'max-tractor';
  // Luzes de trabalho/faróis/giroflex comandados pelo frame (essenciais à noite).
  const headlight = new THREE.SpotLight(0xf3ecd8, 0, 52, Math.PI / 6.5, 0.45, 1.2);
  headlight.position.set(scenario.equipmentId === 'harvester' ? 2.15 : max ? 1.9 : 1.5, scenario.equipmentId === 'harvester' ? 2.9 : max ? 1.15 : 2.3, 0);
  headlight.target.position.set(20, -0.5, 0);
  machine.add(headlight, headlight.target);
  // Projetores iluminam onde o trabalho acontece: a plataforma da
  // colheitadeira à frente, o implemento do trator atrás.
  const workLight = new THREE.SpotLight(0xeaf2ff, 0, 34, Math.PI / 3.1, 0.7, 1.4);
  const workAhead = scenario.equipmentId === 'harvester';
  workLight.position.set(workAhead ? 1.9 : -0.55, workAhead ? 3.55 : 2.45, 0);
  workLight.target.position.set(workAhead ? 5.6 : -4.8, workAhead ? 0.2 : 0.4, 0);
  machine.add(workLight, workLight.target);
  const beaconTop = scenario.equipmentId === 'harvester' ? 3.9 : max ? 3.3 : 2.62;
  const beacon = new THREE.PointLight(0xff9a1f, 0, 14, 1.8);
  const beaconX = scenario.equipmentId === 'harvester' ? 0.6 : -0.1, beaconZ = scenario.equipmentId === 'harvester' ? 0.2 : 0.25;
  // HC-SR04 do Trator MAX: feixe e cone saem do emissor na frente, como no caminhão.
  // Aqui a régua é métrica (cm/100), e o obstáculo é fixo no mundo.
  const sensorBeam = max ? createUltrasonicBeam(SOMPO_AGRI_RIG_LAYOUT['max-tractor'].sensor) : null;
  if (sensorBeam) machine.add(sensorBeam.group);
  const obstacle = max && scenario.obstacle?.kind === 'hay-bale' && !physical && !obstaclesRef ? createHayBale() : null;
  if (obstacle && scenario.obstacle) {
    const nearX = startX + SOMPO_AGRI_RIG_LAYOUT['max-tractor'].sensor[0] + scenario.obstacle.startGapM;
    obstacle.position.set(nearX + HAY_BALE_RADIUS, field.groundHeight(nearX + HAY_BALE_RADIUS, 0), 0);
    worldRoot.add(obstacle);
  }
  // Fardos do gameplay: um por obstáculo, reaproveitados quando a lista muda.
  const driveBales: THREE.Group[] = [];
  let driveObstacles: readonly { x: number; z: number; radius: number }[] | null = null;
  const syncDriveObstacles = () => {
    const list = obstaclesRef?.current;
    if (!list || list === driveObstacles) return;
    driveObstacles = list;
    while (driveBales.length < list.length) { const bale = createHayBale(); driveBales.push(bale); worldRoot.add(bale); }
    driveBales.forEach((bale, index) => {
      const item = list[index];
      bale.visible = !!item;
      if (!item) return;
      bale.scale.setScalar(item.radius / HAY_BALE_RADIUS);
      bale.position.set(item.x, field.groundHeight(item.x, item.z), item.z);
    });
  };
  // Área alagada: lâmina com margem rasa irregular, no mesmo retângulo do geofence.
  const flood = createSompoFloodSheets(worldRoot, waterZones ?? [], field.groundHeight);
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
  void loadSompoAgriAsset(scenario.equipmentId, abort.signal, assetUrl).then((loaded) => {
    if (disposed || !loaded) { if (loaded) disposeSompoAgriAsset(loaded); return; }
    rig = rigSompoAgriAsset(loaded, scenario.equipmentId);
    model = rig.root;
    machine.add(model);
    aquecimento.abrir();
    onModelStatus('gltf', SOMPO_AGRI_EQUIPMENT[scenario.equipmentId].label);
  }).catch(() => {
    if (disposed) return;
    rig = rigSompoAgriAsset(fallbackMachine(scenario.equipmentId), scenario.equipmentId);
    model = rig.root;
    machine.add(model);
    aquecimento.abrir();
    onModelStatus('fallback', null);
  });

  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.07;
  orbit.enablePan = false;
  orbit.minDistance = 6;
  orbit.maxDistance = operation ? 650 : 30;
  orbit.maxPolarAngle = Math.PI * 0.49;
  orbit.target.set(startX, 1.6, 0);
  // Visão geral: o MAX tem 4,5 m e some no talhão a 17 m; chega mais perto e mais
  // baixo para o trator ocupar o quadro em vez dos silos ao fundo.
  // No galpão a câmera recua para fora da linha de pilares do vão aberto e sobe
  // até perto do beiral: o olhar passa entre os pilares e pega a parede do fundo.
  const overview = barnWall ? { x: 1.2, y: 4.6, z: 12.5 } : max ? { x: 6.2, y: 3.4, z: 7.6 } : { x: 10.5, y: 5.2, z: 12.5 };
  camera.position.set(startX + overview.x, overview.y, overview.z);

  let focusTarget: 'truck' | 'sensor' = 'truck';
  let overviewPending = operation; // Visão geral do talhão inteiro: só na montagem e ao clicar, não a cada relayout.
  // Zoom do navegador ou troca de monitor mudam o devicePixelRatio: o buffer acompanha
  // (no teto do degrau atual ou do orçamento) para o canvas não sair borrado nem pesado.
  let dprVisto = window.devicePixelRatio;
  function resize() {
    if (window.devicePixelRatio !== dprVisto) {
      dprVisto = window.devicePixelRatio;
      const ratio = adaptiveQuality ? pixelRatioDoDegrau(degraus[qualidade.degrau], dprVisto) : sompoRenderBudget().pixelRatio;
      if (ratio !== renderer.getPixelRatio()) { renderer.setPixelRatio(ratio); post.setPixelRatio(ratio); }
    }
    const { width, height } = mount.getBoundingClientRect();
    renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    camera.aspect = Math.max(1, width) / Math.max(1, height);
    // Preserve horizontal room for the full vehicle in a portrait canvas.
      camera.fov = Math.min(72, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(37 / 2)) * Math.max(1, 1.25 / camera.aspect))));
      camera.updateProjectionMatrix();
    post.resize(Math.max(1, width), Math.max(1, height));
    if (overviewPending) {
      overviewPending = false;
      orbit.target.set(0, 0, 0);
      const elevation = 1.15 * Math.max(90 / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect), 70 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      camera.position.set(0, elevation, elevation * 0.25);
      orbit.update();
    }
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(mount);
  resize();

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const focusPoint = new THREE.Vector3();
  let frameId = 0;
  const cameraShift = new THREE.Vector3();

  // Quadro base do modo físico: luzes e solo de operação diurna, tudo parado.
  const physicalBase = physical
    ? { ...getSompoAgriFrame(scenarioId, 0, outcomeId), speedKph: 0, wheelSpeedKph: 0, yawRate: 0, roughness: 0, mud: 0, shudder: 0, vertical: 0, sink: 0, lateral: 0, roll: 0, pitch: 0, yaw: 0 }
    : null;
  let physicalHeading = 0;
  let previousTime = performance.now();
  let rigWasActive = false;

  function render(time: number) {
    meter.begin();
    const frameDelta = Math.max(0, (time - previousTime) / 1000);
    previousTime = time;
    const elapsed = getElapsed ? getElapsed(time) : Math.max(0, time - startedAtRef.current);
    const snapshot = physical?.previewRef.current;
    const physicalCurrent = !!snapshot && snapshot.freshness === 'fresh' && snapshot.connection.state === 'live';
    const scripted = physicalBase && snapshot
      ? { ...physicalBase, distance: Number.isFinite(snapshot.readings.distance) ? Number(snapshot.readings.distance) : NaN, collisionRisk: !!snapshot.risks.collision }
      : getSompoAgriFrame(scenarioId, elapsed, outcomeId);
    // Condução livre (cabine do stand): o controle substitui o roteiro na pose, rodas e sensor.
    syncDriveObstacles();
    const drive = physical ? null : cameraRig?.drive?.(frameDelta, {
      from: { x: machine.position.x, z: machine.position.z, heading: machine.rotation.y },
      obstacles: driveObstacles ? [...driveObstacles] : obstacle ? [{ x: obstacle.position.x, z: obstacle.position.z, radius: HAY_BALE_RADIUS }] : [],
      ground: field.groundHeight,
    }) ?? null;
    const frame = drive ? {
      ...scripted, speedKph: drive.speedKph, wheelSpeedKph: drive.speedKph, direction: drive.direction, yawRate: drive.yawRateDeg,
      yaw: THREE.MathUtils.radToDeg(drive.heading), roll: drive.rollDeg ?? 0, pitch: drive.pitchDeg ?? 0, lateral: 0, vertical: 0, sink: 0, roughness: 0, shudder: 0,
      distance: drive.distanceCm, collisionRisk: drive.collision, brakeLights: drive.braking ? 1 : 0,
      ...(drive.beacon === undefined ? {} : { beacon: drive.beacon }),
    } : scripted;
    path.sample(reduceMotion.matches || physical ? 0 : elapsed, pathPoint);
    const x = drive ? drive.x : startX + pathPoint.x;
    // Authored lateral slip only applies where the script calls for it (capotamento,
    // tranco de contato); normal steering follows the integrated heading.
    const z = drive ? drive.z : pathPoint.z + (useLateral && !physical ? frame.lateral : 0);
    if (physical && snapshot) {
      // Mesma conversão de eixos do caminhão físico (calibração da página), com amortecimento.
      const attitudeKnown = Number.isFinite(snapshot.readings.pitch) && Number.isFinite(snapshot.readings.roll);
      const pose = sensorReadingToPose({
        pitch: snapshot.readings.pitch,
        roll: snapshot.readings.roll,
        yawRate: snapshot.readings.rotation?.z,
        currentHeading: physicalHeading,
        deltaSeconds: reduceMotion.matches || !physicalCurrent ? 0 : Math.min(0.04, frameDelta),
      }, physical.axisCalibrationRef.current);
      physicalHeading = pose.rotationY;
      const damping = reduceMotion.matches ? 1 : frameDamping(frameDelta, 5);
      machine.rotation.set(
        attitudeKnown ? dampAngle(machine.rotation.x, pose.rotationX, damping) : machine.rotation.x,
        reduceMotion.matches ? 0 : pose.rotationY,
        attitudeKnown ? dampAngle(machine.rotation.z, pose.rotationZ, damping) : machine.rotation.z,
        'YZX',
      );
    } else {
      machine.rotation.set(THREE.MathUtils.degToRad(frame.roll), THREE.MathUtils.degToRad(frame.yaw), THREE.MathUtils.degToRad(frame.pitch), 'YZX');
    }
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
    // Sem odômetro no ESP32: no modo físico as rodas ficam paradas, como no caminhão físico.
    rig?.update(frame, physical ? 0 : drive ? drive.travel : integrateSompoMotion(keyframes, elapsed) / 3.6,
      physical ? 0 : integrateSompoMotion(keyframes, elapsed, 'headerSpeed', false) * .8, reduceMotion.matches);
    const contactHeight = rig?.supportHeight(machine.rotation, x, z, field.groundHeight) ?? 0;
    machine.position.set(x, field.groundHeight(x, z) + contactHeight + THREE.MathUtils.clamp(frame.vertical, -0.6, 1) - frame.sink * .5, z);
    if (effort > 0.02) machine.position.y += effort * .014 * (0.5 + 0.5 * Math.sin(shakeT * 51));
    const studio = studioRef?.current ?? SOMPO_STUDIO_DEFAULT;
    field.update(frame, machine.position, camera.position, reduceMotion.matches, studio.wind, elapsed);
    pasture.update(reduceMotion.matches ? 0 : elapsed / 1000);
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
    if (sensorBeam) {
      // Sem leitura de distância não há alvo: esconde o feixe em vez de inventar alcance.
      sensorBeam.group.visible = Number.isFinite(frame.distance);
      if (sensorBeam.group.visible) sensorBeam.update(frame.distance, frame.collisionRisk, reduceMotion.matches ? 0 : elapsed, !!physical && (!physicalCurrent || snapshot?.status === 'unknown'));
    }
    const rigActive = !!cameraRig?.active();
    if (rigActive !== rigWasActive) {
      // Saindo da cabine: volta à visão geral com o FOV do enquadramento.
      rigWasActive = rigActive; orbit.enabled = !rigActive;
      if (!rigActive) {
        focusTarget = 'truck'; resize();
        orbit.target.set(machine.position.x, machine.position.y + 1.6, machine.position.z);
        camera.position.set(machine.position.x + overview.x, machine.position.y + overview.y, machine.position.z + overview.z);
      }
    }
    if (rigActive) cameraRig!.update(camera, machine);
    else {
      focusPoint.set(machine.position.x + (focusTarget === 'sensor' ? 2.5 : 0), machine.position.y + (focusTarget === 'sensor' ? 2.2 : 1.6), machine.position.z);
      if (operation && focusTarget === 'truck') focusPoint.set(0, 0, 0);
      cameraShift.copy(focusPoint).sub(orbit.target);
      camera.position.add(cameraShift);
      orbit.target.copy(focusPoint);
      orbit.update();
    }
    atmosphere.update(studio, camera, machine.position, elapsed, scenario.environmentId === 'muddy-field', night);
    if (operation && focusTarget === 'truck' && scene.fog instanceof THREE.Fog) { scene.fog.near = 500; scene.fog.far = 800; }
    if (night && scene.fog instanceof THREE.Fog) {
      // Noite de lavoura: a partir de ~25 m o campo afunda num azul de luar e
      // só a silhueta do quebra-vento e dos silos recorta o céu. Quem ilumina
      // a imagem são os faróis, o giroflex e os projetores de trabalho.
      scene.fog.color.set('#0b1622'); scene.fog.near = 24; scene.fog.far = 170;
      scene.environmentIntensity = 0.1;
      field.sun.intensity = 0.32;
    }
    lookAtivo?.quadro(camera, machine.position);
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
      if (operation && target === 'truck') {
        overviewPending = true;
        resize();
        return;
      }
      const anchor = target === 'sensor'
        ? focusPoint.set(machine.position.x + 2.5, machine.position.y + 2.2, machine.position.z)
        : focusPoint.set(machine.position.x, machine.position.y + 1.6, machine.position.z);
      orbit.target.copy(anchor);
      camera.position.set(anchor.x + (target === 'sensor' ? 6 : overview.x), machine.position.y + (target === 'sensor' ? 4 : overview.y), anchor.z + (target === 'sensor' ? 6.5 : overview.z));
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
      propsRurais?.dispose();
      soltarLutCompartilhada(renderer, scene);
      pasture.dispose();
      lookAtivo?.dispose();
      post.dispose();
      atmosphere.dispose();
      abort.abort();
      window.cancelAnimationFrame(frameId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      resizeObserver.disconnect();
      soltarOrbit(orbit);
      field.dispose();
      flood.dispose();
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
