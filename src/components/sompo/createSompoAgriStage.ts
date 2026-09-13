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
import { getSompoGeofenceSite } from '../../../shared/sompo-geofence-sites.js';
import { bandGrid, resolveHazards } from '../../../shared/lab-geofence.js';
import { polygonContains } from '../../../shared/lab-telemetry.js';
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
  const startX = scenario.startX ?? -totalTravel / 2;
  if (operation) field.setHarvestPath(Array.from({ length: scenario.totalMs / 250 + 1 }, (_, i) => {
    const atMs = i * 250, frame = getSompoAgriFrame(scenarioId, atMs, outcomeId);
    const point = path.sample(atMs, { x: 0, z: 0 });
    return { x: startX + point.x, z: point.z + frame.lateral, atMs, yaw: frame.yaw, harvesting: frame.headerSpeed > 0.8 && frame.implementLift < 0.1 && frame.speedKph > 0 };
  }));
  else if (scenario.equipmentId === 'harvester') field.setHarvestPath(Array.from({ length: 8 }, (_, i) => {
    const point = path.sample(scenario.totalMs * i / 7, { x: 0, z: 0 }); point.x += startX; return point;
  }));
  const site = getSompoGeofenceSite(scenario.environmentId, totalTravel);
  const geofenceLayer = new THREE.Group();
  geofenceLayer.name = 'sompo-geofence-synthetic';
  worldRoot.add(geofenceLayer);
  if (site) {
    const hazards = resolveHazards(site.manifestRules, site.polygons, { profile: { max_roll_deg: SOMPO_AGRI_EQUIPMENT[scenario.equipmentId].profile.max_roll_deg } });
    const grid = bandGrid(site.polygons, hazards, 2);
    // Cor por faixa, da mais interna para a mais externa, igual para todo perigo: a faixa diz "quão perto", não "de quê".
    // O perigo em si já está desenhado (contorno, lâmina d'água). Regra 1 do SPEC: a grade que soma a área é a que pinta.
    const BAND_RAMP = [0xd63a2f, 0xe8902c, 0xe9c74a];
    const paint = grid ? new Int32Array(grid.cols * grid.rows).fill(-1) : null;
    // Faixa "dentro" (max_m 0) vira hachura em xadrez, não bloco sólido: dentro do declive o plantio inteiro ficava vermelho.
    const hatch = grid ? new Uint8Array(grid.cols * grid.rows) : null;
    const water = site.polygons.filter(polygon => polygon.role === 'water');
    if (grid && paint) {
      const center = { x: 0, z: 0 };
      for (let cell = 0; cell < paint.length; cell += 1) {
        if (!grid.inside[cell]) continue;
        center.x = grid.minX + (cell % grid.cols + 0.5) * grid.cellM; center.z = grid.minZ + (Math.floor(cell / grid.cols) + 0.5) * grid.cellM;
        if (water.some(polygon => polygonContains(center, polygon))) continue; // dentro da água é lâmina d'água, não faixa
        let bestMax = Infinity;
        for (let h = 0; h < hazards.length; h += 1) {
          const band = grid.bands[h][cell];
          if (band < 0 || hazards[h].bands[band].max_m >= bestMax) continue;
          bestMax = hazards[h].bands[band].max_m;
          // Perigo de contexto (declive, alertable false) pinta um degrau mais fraco: dentro laranja, borda amarela.
          paint[cell] = BAND_RAMP[Math.min(band + (hazards[h].alertable ? 0 : 1), BAND_RAMP.length - 1)];
          hatch![cell] = bestMax === 0 && ((cell % grid.cols + Math.floor(cell / grid.cols)) & 1) ? 1 : 0;
        }
      }
    }
    const cellAt = (x: number, z: number): number => {
      if (!grid) return -1;
      const col = Math.floor((x - grid.minX) / grid.cellM), row = Math.floor((z - grid.minZ) / grid.cellM);
      return col < 0 || row < 0 || col >= grid.cols || row >= grid.rows ? -1 : row * grid.cols + col;
    };
    if (grid && paint) {
      const { cols, rows, cellM, minX, minZ } = grid;
      const rgba = new Uint8Array(cols * rows * 4);
      for (let row = 0; row < rows; row += 1) for (let col = 0; col < cols; col += 1) {
        const color = paint[row * cols + col];
        if (color < 0) continue;
        // v=0 cai em +Z após a rotação do plano: inverte as linhas da grade.
        const at = ((rows - 1 - row) * cols + col) * 4;
        rgba[at] = color >> 16 & 255; rgba[at + 1] = color >> 8 & 255; rgba[at + 2] = color & 255; rgba[at + 3] = hatch![row * cols + col] ? 60 : 150;
      }
      // O map é liberado por disposeSompoObject(scene) junto com os materiais.
      const texture = new THREE.DataTexture(rgba, cols, rows, THREE.RGBAFormat);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
      const width = cols * cellM, depth = rows * cellM;
      const centerX = minX + width / 2, centerZ = minZ + depth / 2;
      const geometry = new THREE.PlaneGeometry(width, depth, cols, rows);
      const vertices = geometry.attributes.position;
      for (let i = 0; i < vertices.count; i += 1) {
        vertices.setZ(i, field.groundHeight(centerX + vertices.getX(i), centerZ - vertices.getY(i)));
      }
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(centerX, 0.05, centerZ);
      mesh.renderOrder = 1;
      geofenceLayer.add(mesh);
    }
    // O plantio cobre o chão onde a máquina anda; cada pé dentro de uma faixa recebe a cor dela (mesma grade) e
    // pés em cima da água somem. Só pós-processa as instâncias: o módulo do plantio do Lucas fica intacto.
    const tint = new THREE.Color(), position = new THREE.Vector3(), matrix = new THREE.Matrix4();
    field.root.getObjectByName('sompo-agri-crop-rows')?.traverse((node) => {
      const strip = node as THREE.InstancedMesh;
      if (!strip.isInstancedMesh) return;
      for (let i = 0; i < strip.count; i += 1) {
        strip.getMatrixAt(i, matrix);
        position.setFromMatrixPosition(matrix);
        if (water.some(polygon => polygonContains(position, polygon)) || (operation && site.polygons.some(polygon => polygon.category === 'structure' && polygonContains(position, polygon)))) {
          strip.setMatrixAt(i, matrix.makeScale(0, 0, 0));
          continue;
        }
        const cell = cellAt(position.x, position.z);
        const color = cell < 0 ? -1 : paint![cell];
        // A faixa mais interna não tinge o plantio: o relevo (morro, degrau) e a textura do chão já a mostram, e o
        // xadrez vermelho sobre a cultura lia como incêndio. Borda/elevada/atenção continuam tingindo.
        strip.setColorAt(i, color < 0 || color === BAND_RAMP[0] ? tint.setScalar(1) : tint.setHex(color).lerp(tint.clone().setScalar(1), 0.15));
      }
      strip.instanceMatrix.needsUpdate = true;
      if (strip.instanceColor) strip.instanceColor.needsUpdate = true;
    });
    for (const polygon of site.polygons) {
      const ring = polygon.rings[0];
      const color = polygon.role === 'water' ? 0x79b9c0 : polygon.role === 'hazard' ? 0xe6ad52 : 0x73c48c;
      const points: THREE.Vector3[] = [];
      for (let i = 1; i < ring.length; i += 1) {
        const a = ring[i - 1], b = ring[i];
        const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z)));
        for (let step = 0; step < steps; step += 1) {
          const x = THREE.MathUtils.lerp(a.x, b.x, step / steps);
          const z = THREE.MathUtils.lerp(a.z, b.z, step / steps);
          points.push(new THREE.Vector3(x, field.groundHeight(x, z) + 0.08, z));
        }
      }
      points.push(points[0].clone());
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), polygon.role === 'allowed_area'
        ? new THREE.LineDashedMaterial({ color, dashSize: 1.5, gapSize: 1 })
        : new THREE.LineBasicMaterial({ color }));
      line.computeLineDistances();
      geofenceLayer.add(line);
      if (polygon.role === 'water') {
        // Forma livre (o córrego é um L). Vértice y = -z vira z do mundo após rotateX(-90°).
        const geometry = new THREE.ShapeGeometry(new THREE.Shape(ring.map(point => new THREE.Vector2(point.x, -point.z))));
        geometry.rotateX(-Math.PI / 2);
        const positions = geometry.attributes.position;
        // ponytail: só os vértices do contorno seguem o relevo; +0.3 m cobre o ruído do terreno entre eles.
        for (let i = 0; i < positions.count; i += 1) {
          positions.setY(i, field.groundHeight(positions.getX(i), positions.getZ(i)) + 0.3);
        }
        geofenceLayer.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
          color, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide,
        })));
      }
    }
  }
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
  orbit.maxDistance = operation ? 650 : 30;
  orbit.maxPolarAngle = Math.PI * 0.49;
  orbit.target.set(startX, 1.6, 0);
  camera.position.set(startX + 10.5, 5.2, 12.5);

  let focusTarget: 'truck' | 'sensor' = 'truck';
  let overviewPending = operation; // Visão geral do talhão inteiro: só na montagem e ao clicar, não a cada relayout.
  function resize() {
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
    if (operation && focusTarget === 'truck') focusPoint.set(0, 0, 0);
    cameraShift.copy(focusPoint).sub(orbit.target);
    camera.position.add(cameraShift);
    orbit.target.copy(focusPoint);
    orbit.update();
    atmosphere.update(studio, camera, machine.position, elapsed, scenario.environmentId === 'muddy-field', night);
    if (operation && focusTarget === 'truck' && scene.fog instanceof THREE.Fog) { scene.fog.near = 500; scene.fog.far = 800; }
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
