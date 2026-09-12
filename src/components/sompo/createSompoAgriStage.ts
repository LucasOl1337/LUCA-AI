import * as THREE from 'three';
import { createSompoPastureSurface } from './createSompoPastureSurface';
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
import { getSompoAgriStartX, getSompoAgriTravelMeters } from '../../../shared/sompo-agri-brief.js';
import { getSompoGeofenceSite } from '../../../shared/sompo-geofence-sites.js';
import { bandGrid, resolveHazards } from '../../../shared/lab-geofence.js';
import { polygonContains } from '../../../shared/lab-telemetry.js';
import { frameDamping } from './frameDamping.js';
import { createSompoRenderer, sompoRenderBudget, disposeSompoObject, type SompoStageApi } from './sompoStage';
import { createSompoEnvironmentAssets } from './createSompoEnvironmentAssets';
import { createSompoAtmosphere } from './createSompoAtmosphere';
import { createSompoRenderMeter } from './sompoStage';
import { exportSompoModel } from './refineSompoTruck';
import { SOMPO_STUDIO_DEFAULT, type SompoStudioConfig, type SompoRenderStats } from './sompoStudioConfig';

export type SompoAgriStageApi = SompoStageApi;

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
  const field = createSompoAgriScene(worldRoot, scenario.environmentId, budget.compact);
  const atmosphere = createSompoAtmosphere(scene, renderer, field.sun);
  const meter = createSompoRenderMeter(renderer, onStats);
  const assets = createSompoEnvironmentAssets(scene, renderer, { background: false, intensity: night ? 0.30 : 0.68, initialWet: scenario.environmentId === 'muddy-field' });
  assets.surface(field.terrain.material, 'dirt', 45, 30);
  const pasture = createSompoPastureSurface(field.terrain.material, true);
  if (scenario.environmentId === 'muddy-field') {
    // Packed roughness and normals keep wet soil from becoming a flat gray mirror.
    assets.surface(field.mud.material, 'dirt', 4, 2.6);
    field.mud.material.envMapIntensity = 0.35;
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
  const totalTravel = getSompoAgriTravelMeters(scenarioId, scenario.totalMs, outcomeId);
  const startX = getSompoAgriStartX(scenarioId, outcomeId);
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
          paint[cell] = BAND_RAMP[Math.min(band, BAND_RAMP.length - 1)];
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
        if (water.some(polygon => polygonContains(position, polygon))) {
          strip.setMatrixAt(i, matrix.makeScale(0, 0, 0));
          continue;
        }
        const cell = cellAt(position.x, position.z);
        const color = cell < 0 ? -1 : paint![cell];
        // Na hachura, metade dos pés fica na cor natural: a zona se lê como marcação, não como erro de textura.
        strip.setColorAt(i, color < 0 || hatch![cell] ? tint.setScalar(1) : tint.setHex(color).lerp(tint.clone().setScalar(1), 0.15));
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
    const barn = field.root.getObjectByName('sompo-agri-barn');
    if (barn) { barn.rotation.y = Math.PI; barn.position.set(startX + totalTravel + 0.5, 0, 0); }
  }
  if (scenario.environmentId === 'muddy-field') {
    // A mancha de lama fica onde o avanço estanca, não num ponto fixo do campo.
    let peakTravel = 0;
    for (let atMs = 0; atMs <= scenario.totalMs; atMs += 250) {
      peakTravel = Math.max(peakTravel, getSompoAgriTravelMeters(scenarioId, atMs, outcomeId));
    }
    field.placeMud(startX + peakTravel);
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
  let focusTarget: 'truck' | 'sensor' = 'truck';
  let frameId = 0;
  let previousTime = performance.now();

  function render(time: number) {
    meter.begin();
    const frameDelta = Math.max(0, (time - previousTime) / 1_000);
    previousTime = time;
    const elapsed = getElapsed ? getElapsed(time) : Math.max(0, time - startedAtRef.current);
    const frame = getSompoAgriFrame(scenarioId, elapsed, outcomeId);
    const travel = reduceMotion.matches ? 0 : getSompoAgriTravelMeters(scenarioId, elapsed, outcomeId);
    const x = startX + travel;
    const z = frame.lateral;
    machine.position.set(x, field.groundHeight(x, z) + frame.vertical - (frame.sink * 0.5), z);
    const damp = reduceMotion.matches ? 1 : frameDamping(frameDelta, 7.5);
    machine.rotation.y = dampAngle(machine.rotation.y, THREE.MathUtils.degToRad(frame.yaw), damp);
    machine.rotation.z = dampAngle(machine.rotation.z, THREE.MathUtils.degToRad(frame.pitch), damp);
    machine.rotation.x = dampAngle(machine.rotation.x, THREE.MathUtils.degToRad(frame.roll), damp);
    const studio = studioRef?.current ?? SOMPO_STUDIO_DEFAULT;
    field.update(frame, machine.position, camera.position, reduceMotion.matches, studio.wind);
    field.sun.position.set(x - 24, 34, z + 18);
    field.sun.target.position.set(x, 0, z);
    field.sun.target.updateMatrixWorld();
    const clock = reduceMotion.matches ? 0 : elapsed / 1000;
    headlight.intensity = frame.headlights * 80;
    workLight.intensity = frame.workLights * 65;
    beacon.intensity = frame.beacon * (reduceMotion.matches ? 6 : 4.5 + Math.max(0, Math.sin(clock * 7)) * 6);
    focusPoint.set(machine.position.x + (focusTarget === 'sensor' ? 2.5 : 0), machine.position.y + (focusTarget === 'sensor' ? 2.2 : 1.6), machine.position.z);
    const targetXBefore = orbit.target.x;
    orbit.target.lerp(focusPoint, reduceMotion.matches ? 1 : frameDamping(frameDelta, 5));
    camera.position.x += orbit.target.x - targetXBefore;
    orbit.update();
    atmosphere.update(studio, camera, machine.position, elapsed, scenario.environmentId === 'muddy-field', night);
    renderer.render(scene, camera);
    meter.end();
    onAfterRender?.(renderer.domElement);
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
