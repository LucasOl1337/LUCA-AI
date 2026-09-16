import * as THREE from 'three';
import { integrateSompoMotion, sompoSteeringAngle } from '../../../shared/sompo-motion.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadSompoTruckAsset } from './loadSompoTruckAsset';
import { createSompoTruckModel, SOMPO_TRUCK_FRONT_X, SOMPO_TRUCK_HALF_SIZE, SOMPO_TRUCK_PIVOT_Y } from './createSompoTruckModel';
import { createSompoRoadScene } from './createSompoRoadScene';
import { createSompoPostProcessing } from './createSompoPostProcessing';
import { createSompoScenarioEffects } from './createSompoScenarioEffects';
import { getSompoScenarioEffects } from '../../../shared/sompo-scenario-effects.js';
import { SOMPO_BRAKING_SCRIPT, getSompoRuralFrame, getSompoRuralTravelMeters, getSompoBrakingTravelMeters, getSompoBrakingScriptState, getSompoScenarioScript, type SompoSimulationControls } from '../../../shared/sompo-telemetry-simulator.js';
import { sensorReadingToPose, SOMPO_EULER_ORDER, type SompoAxisCalibration } from './sensorPose.js';
import { frameDamping } from './frameDamping.js';
import type { SompoTelemetrySnapshot } from '@/lib/types';
import { sompoRenderBudget, createSompoRenderer, disposeSompoObject, createSompoRenderMeter, type SompoStageApi } from './sompoStage';
import { refineSompoTruck, exportSompoModel } from './refineSompoTruck';
import { createSompoAtmosphere } from './createSompoAtmosphere';
import { SOMPO_STUDIO_DEFAULT, type SompoStudioConfig, type SompoRenderStats } from './sompoStudioConfig';
import { createPhysicalTwinEffects } from './createPhysicalTwinEffects';
import type { PhysicalTwin } from './usePhysicalTwin';

function dampAngle(current: number, target: number, factor: number) {
  const shortestTurn = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + (shortestTurn * factor);
}

function truckGroundHeight(rotation: THREE.Euler, support?: Float32Array) {
  const matrix = new THREE.Matrix4().makeRotationFromEuler(rotation).elements;
  if (support) {
    let minimum = Infinity;
    for (let i = 0; i < support.length; i += 3) {
      minimum = Math.min(minimum, matrix[1] * support[i] + matrix[5] * (support[i + 1] - SOMPO_TRUCK_PIVOT_Y) + matrix[9] * support[i + 2]);
    }
    return 0.05 - minimum;
  }
  const verticalExtent = (
    Math.abs(matrix[1]) * SOMPO_TRUCK_HALF_SIZE.x
    + Math.abs(matrix[5]) * SOMPO_TRUCK_HALF_SIZE.y
    + Math.abs(matrix[9]) * SOMPO_TRUCK_HALF_SIZE.z
  );
  return verticalExtent + 0.05;
}
/** Mesma régua da cena: distância (cm) → comprimento do feixe/afastamento do obstáculo. */
function rangeForDistance(distance: number | null | undefined): number {
  const clamped = Math.min(300, Math.max(5, distance || 5));
  return 1.2 + (((clamped - 5) * (7.2 - 1.2)) / (300 - 5));
}

// A barreira tem 56 cm no eixo longitudinal; a âncora usa o centro para que
// sua face próxima, e não o centro da malha, encontre o para-choque.
const SOMPO_OBSTACLE_HALF_X = 0.28;

/** Altura do solado do pneu no asfalto: quase encostado, sem flutuar. */
const SOMPO_WHEEL_CONTACT_Y = 0.025;
/** Curso máximo da suspensão virtual por roda (m), antes de afundar/flutuar. */
const SOMPO_SUSPENSION_TRAVEL = 0.55;

interface SompoWheelContact {
  wheel: THREE.Object3D;
  /** Centro da roda no espaço do modelo (root), X/Z fixos durante a rodagem. */
  cx: number;
  cy: number;
  cz: number;
  radius: number;
  /** `position.y` neutra da roda no pai imediato (sem compensação). */
  baseY: number;
  /** Escala Y acumulada do pai no espaço do root (GLB pode trazer escala). */
  parentScaleY: number;
}

function addBox(
  parent: THREE.Object3D,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}


/** Owns the rural WebGL lifecycle. React keeps telemetry, controls and recording. */
export function mountSompoRuralStage({ mount, isFirebase, controlsRef, previewRef, axisCalibrationRef, startedAtRef, setModelStatus, setModelAsset, setWebglError, onAfterRender, studioRef, getElapsed, onStats, physicalVisualRef }: {
  mount: HTMLElement;
  isFirebase: boolean;
  controlsRef: { current: SompoSimulationControls };
  previewRef: { current: SompoTelemetrySnapshot };
  axisCalibrationRef: { current: SompoAxisCalibration };
  startedAtRef: { current: number };
  setModelStatus: (status: 'loading' | 'gltf' | 'fallback' | 'modular') => void;
  setModelAsset: (asset: string | null) => void;
  setWebglError: (error: boolean) => void;
  onAfterRender: (canvas: HTMLCanvasElement) => void;
  studioRef?: { current: SompoStudioConfig };
  getElapsed?: (time: number) => number;
  onStats?: (stats: SompoRenderStats) => void;
  physicalVisualRef?: PhysicalTwin['visual'];
}): SompoStageApi | undefined {
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = createSompoRenderer(mount).renderer;
      setWebglError(false);
    } catch {
      setWebglError(true);
      return undefined;
    }

    const scene = new THREE.Scene();

    // Target chase pose: enough subject scale to anchor the lower third while
    // preserving the mountain corridor as the dominant part of the frame.
    const viewFov = 41;
    const compositionAspect = 16 / 9;
    // Centered chase framing: the truck anchors the lower third while the road
    // pulls into the mountain pass, matching the target's rider/path hierarchy.
    const viewOffset = { x: -37, y: 5.35, z: 1.65 };
    const viewLook = { x: 17, y: 1.5, z: -0.8 };
    const camera = new THREE.PerspectiveCamera(viewFov, 1, 0.1, 360);
    camera.position.set(viewOffset.x, viewOffset.y, viewOffset.z);

    // Small local fallback while the rural HDRIs load; the real HDRIs replace this IBL.
    const environmentScene = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(environmentScene, 0.04);
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.40;
    environmentScene.dispose();
    pmrem.dispose();

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.07;
    orbit.enablePan = false;
    orbit.minDistance = 4;
    orbit.maxDistance = 44;
    orbit.maxPolarAngle = Math.PI * 0.49;
    orbit.target.set(viewLook.x, viewLook.y, viewLook.z);

    scene.add(new THREE.HemisphereLight(0xc8dfeb, 0x263428, 0.38));
    const keyLight = new THREE.DirectionalLight(0xffddb0, 2.5);
    keyLight.position.set(8, 13, 15);
    const rimLight = new THREE.DirectionalLight(0xb9d7e8, 0.25);
    rimLight.position.set(16, 7, -11);
    scene.add(rimLight);
    const fillLight = new THREE.DirectionalLight(0xcbdce3, 0.08);
    fillLight.position.set(-8, 6.5, 10);
    scene.add(fillLight);
    // Tight sky-colored specular on the 1.70 chrome surround / hood only.
    // Directional #b7d4c4 @ 0.82 at (18,13,12) lifted the whole truck; a
    // camera-right / +Y cone hits grille+hood without filling the reefer.
    const skyCatch = new THREE.SpotLight(0xc5e8d4, 2.45, 14, THREE.MathUtils.degToRad(11), 0.35, 1.5);
    skyCatch.name = 'grille-sky-catch';
    skyCatch.position.set(9.2, 4.8, 4.2);
    skyCatch.target.position.set(4.50, 1.45, 0);
    scene.add(skyCatch);
    scene.add(skyCatch.target);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(sompoRenderBudget().shadowSize, sompoRenderBudget().shadowSize);
    // A tighter frustum spends the same 2K shadow map on the truck and the
    // near shoulder, producing a readable tire/chassis contact shadow.
    keyLight.shadow.camera.left = -18; keyLight.shadow.camera.right = 18;
    keyLight.shadow.camera.top = 14; keyLight.shadow.camera.bottom = -12;
    keyLight.shadow.camera.near = 0.5; keyLight.shadow.camera.far = 110;
    keyLight.shadow.normalBias = 0.008;
    keyLight.shadow.bias = -0.00012;
    keyLight.shadow.radius = 1.8;
    scene.add(keyLight);
    // A sombra acompanha o caminhão pelo mundo: luz e alvo transladam juntos.
    scene.add(keyLight.target);
    const atmosphere = createSompoAtmosphere(scene, renderer, keyLight);
    const roadScene = createSompoRoadScene(scene, renderer, camera, { onHdri: (kind, tex) => atmosphere.setSkyTexture(kind, tex) });
    atmosphere.setBackdropActive(true);
    const meter = createSompoRenderMeter(renderer, onStats);
    const postProcessing = createSompoPostProcessing(renderer, scene, camera);
    const frontArrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(1.4, 0.06, -2.25),
      2.2,
      0x5fd0ff,
      0.45,
      0.22,
    );
    frontArrow.name = 'frente-caminhao-mais-x';
    frontArrow.visible = isFirebase;
    scene.add(frontArrow);

    const truckPoseGroup = new THREE.Group();
    // O caminhão aponta para +X: guinada → arfagem → rolagem exige YZX para não misturar eixos.
    truckPoseGroup.rotation.order = SOMPO_EULER_ORDER;
    truckPoseGroup.name = 'sompo-rural-machine';
    truckPoseGroup.position.y = SOMPO_TRUCK_PIVOT_Y + 0.05;
    scene.add(truckPoseGroup);
    const physicalEffects = isFirebase ? createPhysicalTwinEffects(scene, truckPoseGroup) : null;

    const warning = new THREE.MeshStandardMaterial({ color: 0xff4f45, roughness: 0.45, metalness: 0.2 });
    const truckModel = createSompoTruckModel({
      sensorLabel: isFirebase ? 'ESP32 FÍSICO' : 'ESP32 VIRTUAL',
    });
    const {
      root: truckGroup,
      wheels,
      sensorGroup,
      ledMaterial,
      rayGroup,
      rayMaterial,
    } = truckModel;
    truckGroup.position.y = -SOMPO_TRUCK_PIVOT_Y;
    truckPoseGroup.add(truckGroup);
    // Local headlamp fill is intentionally shadowless: it catches the grille,
    // wet road and chrome without changing any telemetry or light state.
    for (const z of [-0.83, 0.83]) {
      const headlampFill = new THREE.PointLight(0xffe6c6, 0.07, 5.2, 2);
      headlampFill.name = `sompo-headlamp-fill-${z}`;
      headlampFill.position.set(4.5, 1.34, z);
      headlampFill.castShadow = false;
      truckGroup.add(headlampFill);
    }
    const modular = !isFirebase && (studioRef?.current.truck ?? 'modular') === 'modular' ? refineSompoTruck(truckModel) : null;
    const scenarioEffects = createSompoScenarioEffects(scene, truckModel, camera);
    const assetAbort = new AbortController();

    // Contato real das rodas: a carroceria inclina sobre a suspensão, mas os
    // solados ficam no solo. Apoiar o casco inteiro (convex hull) suspendia o
    // eixo oposto a qualquer mergulho: era o "flutuando" do bug report.
    let wheelContacts: SompoWheelContact[] = [];
    let wheelContactsSource: readonly THREE.Object3D[] = [];
    let contactMeanX = 0;
    let contactMeanZ = 0;
    let contactMeanSole = 0.02;
    const contactScratch = new THREE.Vector3();
    const contactColumn = new THREE.Vector3();
    const contactRootInverse = new THREE.Matrix4();
    const contactParentMatrix = new THREE.Matrix4();
    const contactGroundMatrix = new THREE.Matrix4();

    function captureWheelContacts() {
      wheelContactsSource = wheels.slice();
      truckGroup.updateMatrixWorld(true);
      contactRootInverse.copy(truckGroup.matrixWorld).invert();
      const next: SompoWheelContact[] = [];
      for (const wheel of wheels) {
        contactScratch.setFromMatrixPosition(wheel.matrixWorld).applyMatrix4(contactRootInverse);
        contactParentMatrix.multiplyMatrices(
          contactRootInverse,
          wheel.parent?.matrixWorld ?? wheel.matrixWorld,
        );
        const scaleY = contactColumn.setFromMatrixColumn(contactParentMatrix, 1).length() || 1;
        next.push({
          wheel,
          cx: contactScratch.x,
          cy: contactScratch.y,
          cz: contactScratch.z,
          radius: typeof wheel.userData.radius === 'number' ? wheel.userData.radius : 0.58,
          baseY: wheel.position.y,
          parentScaleY: scaleY,
        });
      }
      wheelContacts = next;
      const n = Math.max(1, wheelContacts.length);
      contactMeanX = wheelContacts.reduce((sum, item) => sum + item.cx, 0) / n;
      contactMeanZ = wheelContacts.reduce((sum, item) => sum + item.cz, 0) / n;
      contactMeanSole = wheelContacts.reduce((sum, item) => sum + item.cy - item.radius, 0) / n;
    }
    captureWheelContacts();

    setModelStatus('loading');
    setModelAsset(null);
    truckGroup.visible = !!modular;
    if (modular) {
      setModelAsset('SompoModularTruck'); setModelStatus('modular');
      void new GLTFLoader().loadAsync('/models/sompo/astra-sompo-truck.glb').then(gltf => {
        if (assetAbort.signal.aborted) { disposeSompoObject(gltf.scene); return; }
        modular.replaceVisual(gltf.scene);
      }).catch(error => { if (!assetAbort.signal.aborted) console.warn('Astra visual unavailable; retaining modular rig', error); });
    }
    else void loadSompoTruckAsset(truckModel, assetAbort.signal)
      .then((loaded) => {
        if (!assetAbort.signal.aborted) {
          truckGroup.visible = true;
          setModelAsset(loaded ? truckModel.root.userData.asset : null);
          setModelStatus(loaded ? 'gltf' : 'fallback');
        }
      })
      .catch(() => {
        if (!assetAbort.signal.aborted) {
          for (const child of truckGroup.children) child.visible = true;
          truckGroup.visible = true;
          setModelStatus('fallback');
        }
      });

    const obstacleGroup = new THREE.Group();
    scene.add(obstacleGroup);
    addBox(obstacleGroup, [0.56, 2.45, 2.6], [0, 1.22, 0], warning);
    const obstacleStripe = new THREE.MeshStandardMaterial({ color: 0xf6d763, roughness: 0.55 });
    for (const y of [0.45, 1.15, 1.85]) {
      addBox(obstacleGroup, [0.59, 0.2, 2.68], [0.02, y, 0], obstacleStripe);
    }

    function resize() {
      const { width, height } = mount!.getBoundingClientRect();
      const safeWidth = Math.max(1, width);
      const safeHeight = Math.max(1, height);
      renderer.setSize(safeWidth, safeHeight, false);
      camera.aspect = safeWidth / safeHeight;
      // Keep the target composition at its reference aspect, but pull the
      // vertical FOV back slightly on narrower/maximized viewports so the
      // entire truck keeps breathing room instead of touching both edges.
      const aspectCompensation = Math.max(1, compositionAspect / camera.aspect);
      camera.fov = Math.min(72, THREE.MathUtils.radToDeg(
        2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(viewFov / 2)) * aspectCompensation),
      ));
      camera.updateProjectionMatrix();
      postProcessing.resize(safeWidth, safeHeight);
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    let focusTarget: 'truck' | 'sensor' = 'truck';
    const focusPoint = new THREE.Vector3();
    // O rumo integrado nao tem referencia absoluta (o firmware nao manda
    // magnetometro): curvas reais deixam residuo. Recentrar e do operador.
    let liveHeading = 0;
    let savedLiveHeading = 0;
    let replayId = 0;
    let replayTime = 0;

    const api: Omit<SompoStageApi, 'dispose'> = {
      exportModel: () => exportSompoModel(truckGroup),
      recenterHeading() {
        liveHeading = 0;
        truckPoseGroup.rotation.y = 0;
      },
      focus(target) {
        focusTarget = target;
        if (target === 'sensor') {
          sensorGroup.getWorldPosition(orbit.target);
          camera.position.set(orbit.target.x + 3, 4.7, 4.1);
          orbit.minDistance = 2.5;
        } else {
          orbit.target.set(truckPoseGroup.position.x + viewLook.x, viewLook.y, truckPoseGroup.position.z);
          camera.position.set(truckPoseGroup.position.x + viewOffset.x, viewOffset.y, viewOffset.z);
          orbit.minDistance = 4;
        }
        orbit.update();
      },
      adjust(action) {
        const offset = camera.position.clone().sub(orbit.target);
        if (action === 'rotate-left' || action === 'rotate-right') {
          const direction = action === 'rotate-left' ? 1 : -1;
          offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), direction * THREE.MathUtils.degToRad(12));
        } else {
          const factor = action === 'zoom-in' ? 0.84 : 1.18;
          offset.setLength(THREE.MathUtils.clamp(
            offset.length() * factor,
            orbit.minDistance,
            orbit.maxDistance,
          ));
        }
        camera.position.copy(orbit.target).add(offset);
        orbit.update();
      },
    };

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frameId = 0;
    let previousTime = performance.now();
    let truckBaseHeight = SOMPO_TRUCK_PIVOT_Y + 0.05;
    const relativeGroundRotation = new THREE.Euler();

    // Deslocamento REAL: a posição X do caminhão no mundo é forma fechada do
    // relógio do cenário (roteiro, frenagem ou velocidade constante), então
    // seek/replay são determinísticos e o reinício continua estrada adiante.
    let lastTruckWorldX = 0;
    let runStamp = -1;
    let runOriginX = 0;
    let animalAnchorX = 9;
    let lastCruiseKph: number | null = null;
    const cameraShift = new THREE.Vector3();
    const wheelAxis = new THREE.Vector3(0, 1, 0);
    const wheelAxle = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    const wheelSteering = new THREE.Quaternion(), wheelSpin = new THREE.Quaternion();
    const REBASE_DISTANCE = 4096;

    function scenarioTravelMeters(settings: SompoSimulationControls, elapsedMs: number) {
      const scripted = getSompoRuralTravelMeters(settings.scenarioId, elapsedMs, settings.outcomeId);
      if (scripted !== null) return scripted;
      if (settings.scenarioId === SOMPO_BRAKING_SCRIPT.scenarioId) {
        return getSompoBrakingTravelMeters(elapsedMs, settings.speedKph);
      }
      return (settings.speedKph / 3.6) * (elapsedMs / 1000);
    }

    /** O bovino é ancorado no ponto do mundo onde o roteiro fecha a menor distância. */
    function animalAnchorFor(settings: SompoSimulationControls, originX: number) {
      const script = getSompoScenarioScript(settings.scenarioId, settings.outcomeId);
      if (!script) return originX + 9;
      let closest = script.keyframes[0];
      for (const keyframe of script.keyframes) if (keyframe.distance < closest.distance) closest = keyframe;
      return originX + scenarioTravelMeters(settings, closest.atMs)
        + SOMPO_TRUCK_FRONT_X + rangeForDistance(closest.distance);
    }

    /**
     * A doca/portão precisa ocupar o mesmo ponto físico do roteiro. O galpão
     * cênico sozinho era reciclado ao redor da câmera e nunca chegava ao
     * para-choque, embora a telemetria marcasse 8–12 cm.
     */
    function yardContactFor(settings: SompoSimulationControls, originX: number) {
      const contact = settings.scenarioId === 'yard-maneuver' && settings.outcomeId === 'encosta-na-doca'
        ? { atMs: 10_800, bumperX: SOMPO_TRUCK_FRONT_X, gap: 0.12, kind: 'dock' as const, facing: 'front' as const }
        : settings.scenarioId === 'yard-maneuver' && settings.outcomeId === 'toque-no-portao'
          ? { atMs: 5_400, bumperX: SOMPO_TRUCK_FRONT_X, gap: 0, kind: 'gate' as const, facing: 'front' as const }
          : settings.scenarioId === 'tight-reverse' && settings.outcomeId === 'toque-na-doca'
            ? { atMs: 5_200, bumperX: -SOMPO_TRUCK_HALF_SIZE.x, gap: 0, kind: 'dock' as const, facing: 'rear' as const }
            : null;
      if (!contact) return null;
      const frame = getSompoRuralFrame(settings.scenarioId, contact.atMs, settings.outcomeId);
      const yaw = -THREE.MathUtils.degToRad(frame?.yaw ?? 0);
      const signedGap = Math.sign(contact.bumperX) * contact.gap;
      const offset = contact.bumperX + signedGap;
      return {
        x: originX + scenarioTravelMeters(settings, contact.atMs) + Math.cos(yaw) * offset,
        z: (frame?.lateral ?? 0) - Math.sin(yaw) * offset,
        yaw,
        kind: contact.kind,
        facing: contact.facing,
      };
    }

    function obstacleContactFor(settings: SompoSimulationControls, originX: number) {
      if (settings.scenarioId !== 'obstacle' || settings.outcomeId !== 'toque-leve') return null;
      return originX + scenarioTravelMeters(settings, 4_900)
        + SOMPO_TRUCK_FRONT_X + SOMPO_OBSTACLE_HALF_X;
    }

    function render(time: number) {
      meter.begin();
      const frameDelta = Math.max(0, (time - previousTime) / 1_000);
      const delta = Math.min(0.04, frameDelta);
      previousTime = time;
      const settings = controlsRef.current;
      const snapshot = previewRef.current;
      const physical = isFirebase ? physicalVisualRef?.current : undefined;
      const isReplay = physical?.replay === true;
      if (physical && physical.replayId !== replayId) {
        if (isReplay) { if (!replayId) savedLiveHeading = liveHeading; liveHeading = 0; }
        else liveHeading = savedLiveHeading;
        replayId = physical.replayId;
        replayTime = 0;
      }
      if (isReplay && physical!.replayTime < replayTime) { liveHeading = 0; replayTime = 0; }
      const poseDelta = isReplay ? Math.max(0, physical!.replayTime - replayTime) / 1000 : delta;
      replayTime = physical?.replayTime ?? 0;
      const physicalCurrent = snapshot.freshness === 'fresh' && snapshot.connection.state === 'live';
      const attitudeKnown = Number.isFinite(snapshot.readings.pitch) && Number.isFinite(snapshot.readings.roll);
      const visualScenario = isFirebase ? 'normal' : settings.scenarioId;
      const scenarioElapsed = getElapsed ? getElapsed(time) : time - startedAtRef.current;
      const visualElapsed = scenarioElapsed;
      const effectOutcomeId = settings.outcomeId;
      const effectFrame = getSompoScenarioEffects(visualScenario, visualElapsed, effectOutcomeId);
      const ruralFrame = !isFirebase
        ? getSompoRuralFrame(settings.scenarioId, scenarioElapsed, settings.outcomeId)
        : null;

      const brakingState = !isFirebase && !ruralFrame && settings.scenarioId === SOMPO_BRAKING_SCRIPT.scenarioId
        ? getSompoBrakingScriptState(scenarioElapsed, settings.speedKph)
        : null;
      const motionScript = !isFirebase ? getSompoScenarioScript(settings.scenarioId, settings.outcomeId) : null;
      // ── Deslocamento real no mundo ────────────────────────────────────────
      if (lastCruiseKph === null) lastCruiseKph = settings.speedKph;
      else if (settings.speedKph !== lastCruiseKph) {
        // Slider de cruzeiro em cenário livre: a forma fechada v·t saltaria -
        // recalibra a origem para a posição ficar contínua.
        if (!motionScript) {
          runOriginX += scenarioTravelMeters({ ...settings, speedKph: lastCruiseKph }, scenarioElapsed)
            - scenarioTravelMeters(settings, scenarioElapsed);
        }
        lastCruiseKph = settings.speedKph;
      }
      if (runStamp !== startedAtRef.current) {
        // Novo cenário, desfecho, reinício ou episódio: o caminhão segue estrada
        // adiante a partir de onde está, sem teleporte para a origem.
        runStamp = startedAtRef.current;
        runOriginX = lastTruckWorldX;
        animalAnchorX = animalAnchorFor(settings, runOriginX);
      }
      let truckWorldX = lastTruckWorldX;
      if (!isFirebase && !reduceMotion.matches) {
        truckWorldX = runOriginX + scenarioTravelMeters(settings, scenarioElapsed);
      }
      if (truckWorldX > REBASE_DISTANCE) {
        // Recentra o mundo para preservar a precisão de float32 em corridas longas.
        runOriginX -= REBASE_DISTANCE;
        truckWorldX -= REBASE_DISTANCE;
        lastTruckWorldX -= REBASE_DISTANCE;
        animalAnchorX -= REBASE_DISTANCE;
        camera.position.x -= REBASE_DISTANCE;
        orbit.target.x -= REBASE_DISTANCE;
        scenarioEffects.rebase(REBASE_DISTANCE);
      }
      truckPoseGroup.position.x = truckWorldX;
      lastTruckWorldX = truckWorldX;
      const sensorPose = sensorReadingToPose({
        pitch: snapshot.readings.pitch,
        roll: snapshot.readings.roll,
        yawRate: snapshot.readings.rotation?.z,
        currentHeading: liveHeading,
        deltaSeconds: reduceMotion.matches || (isFirebase && !physicalCurrent) ? 0 : poseDelta,
      }, axisCalibrationRef.current);
      const drivingSpeed = ruralFrame?.speedKph ?? brakingState?.speedKph ?? settings.speedKph;
      // Micro-vibração de rodagem: a carroceria fica viva em velocidade de pista
      // e zera parado; as rodas seguem plantadas pela compensação de contato.
      const rideVibe = reduceMotion.matches ? 0
        : Math.min(1, Math.abs(drivingSpeed) / 30)
          * (0.45 + Math.min(1, (ruralFrame?.roughness ?? settings.roughness)));
      const pitchVibe = THREE.MathUtils.degToRad(
        (Math.sin(visualElapsed * .013 + .6) * .1 + Math.sin(visualElapsed * .031 + 2.1) * .05) * rideVibe,
      );
      const rollVibe = THREE.MathUtils.degToRad(
        (Math.sin(visualElapsed * .017 + 1.9) * .08 + Math.sin(visualElapsed * .029 + .4) * .04) * rideVibe,
      );
      const pitch = isFirebase
        ? attitudeKnown ? sensorPose.rotationZ : truckPoseGroup.rotation.z
        : THREE.MathUtils.degToRad(ruralFrame?.pitch ?? (settings.pitch + (brakingState?.pitchOffset ?? 0) + Math.sin(visualElapsed * .0021) * settings.roughness * .28 * Math.min(1, (brakingState?.speedKph ?? settings.speedKph) / 8)))
          + pitchVibe;
      const roll = isFirebase
        ? attitudeKnown ? sensorPose.rotationX : truckPoseGroup.rotation.x
        : THREE.MathUtils.degToRad(ruralFrame?.roll ?? (settings.roll + Math.sin(visualElapsed * .0027 + .6) * settings.roughness * .34 * Math.min(1, (brakingState?.speedKph ?? settings.speedKph) / 8)))
          + THREE.MathUtils.degToRad(THREE.MathUtils.clamp(-(ruralFrame?.lateralAcceleration ?? 0) * 0.9, -7, 7))
          + rollVibe;
      const poseDamping = frameDamping(frameDelta, 5);
      if (reduceMotion.matches || !isFirebase) {
        truckPoseGroup.rotation.z = pitch;
        truckPoseGroup.rotation.x = roll;
      } else {
        truckPoseGroup.rotation.z = dampAngle(truckPoseGroup.rotation.z, pitch, poseDamping);
        truckPoseGroup.rotation.x = dampAngle(truckPoseGroup.rotation.x, roll, poseDamping);
      }
      if (isFirebase && !reduceMotion.matches) {
        liveHeading = sensorPose.rotationY;
        truckPoseGroup.rotation.y = liveHeading;
      }
      if (!isFirebase) {
        const targetYaw = ruralFrame?.yaw ?? 0;
        const targetLateral = ruralFrame?.lateral ?? 0;
        // Heading visual = guinada do roteiro + ângulo do vetor de movimento
        // (slip angle): a carroceria aponta pra onde o deslocamento real leva,
        // em vez de transladar de lado como caranguejo. Em ré a traseira lidera.
        const dir = ruralFrame?.direction ?? 1;
        const vAbs = Math.max(1, Math.abs(drivingSpeed) / 3.6);
        // Com o casco apoiando (capotamento, rampa extrema) o slip não se aplica.
        const gripFactor = 1 - THREE.MathUtils.smoothstep(Math.abs(ruralFrame?.roll ?? settings.roll), 12, 35);
        const slipYaw = Math.atan2(-(ruralFrame?.lateralRate ?? 0) * dir, vAbs) * gripFactor;
        truckPoseGroup.rotation.y = dampAngle(
          truckPoseGroup.rotation.y,
          -THREE.MathUtils.degToRad(targetYaw) + slipYaw,
          1,
        );
        truckPoseGroup.position.z = reduceMotion.matches
          ? targetLateral
          : THREE.MathUtils.lerp(truckPoseGroup.position.z, targetLateral, frameDamping(frameDelta, 10));
      }
      const liveActivity = isFirebase
        ? physicalCurrent ? THREE.MathUtils.clamp((snapshot.readings.rotation?.magnitude || 0) * 0.012, 0, 0.1) : 0
        : (ruralFrame?.roughness ?? settings.roughness) * 0.008 * Math.min(1, (ruralFrame?.speedKph ?? brakingState?.speedKph ?? settings.speedKph) / 8);
      // Rampas roteirizadas ("vence a rampa", "desce controlado") mudam o perfil
      // do terreno junto com o pitch do roteiro; a cabine (mergulho de frenagem)
      // não gira o mundo, por isso brake-failure usa o pitch fixo do preset.
      const slope = !isFirebase && ['steep-climb', 'steep-descent', 'brake-failure'].includes(settings.scenarioId)
        ? THREE.MathUtils.degToRad(settings.scenarioId === 'brake-failure' ? settings.pitch : (ruralFrame?.pitch ?? settings.pitch))
        : 0;
      relativeGroundRotation.copy(truckPoseGroup.rotation);
      relativeGroundRotation.z -= slope;
      contactGroundMatrix.makeRotationFromEuler(relativeGroundRotation);
      const gm = contactGroundMatrix.elements;
      const hullHeight = slope
        ? truckGroundHeight(relativeGroundRotation, truckGroup.userData.groundSupport) / Math.max(0.5, Math.cos(slope))
        : truckGroundHeight(truckPoseGroup.rotation, truckGroup.userData.groundSupport);
      // Em atitudes pequenas o apoio vem das rodas (suspensão virtual); em
      // inclinações grandes (rampa extrema ou capotamento) o casco apoia.
      const groundAngle = Math.max(Math.abs(relativeGroundRotation.z), Math.abs(relativeGroundRotation.x));
      const contactFactor = 1 - THREE.MathUtils.smoothstep(groundAngle, 0.14, 0.34);
      const cosSlope = Math.max(0.5, Math.cos(slope));
      let targetHeight = hullHeight;
      if (wheelContacts.length && contactFactor > 0) {
        const wheelPoseGround = SOMPO_WHEEL_CONTACT_Y
          - (gm[1] * contactMeanX + gm[5] * (contactMeanSole - SOMPO_TRUCK_PIVOT_Y) + gm[9] * contactMeanZ);
        targetHeight = THREE.MathUtils.lerp(hullHeight, wheelPoseGround / cosSlope, contactFactor);
      }
      truckBaseHeight = reduceMotion.matches || !isFirebase
        ? targetHeight
        : THREE.MathUtils.lerp(truckBaseHeight, targetHeight, frameDamping(frameDelta, 7.5));
      truckPoseGroup.position.y = truckBaseHeight - (ruralFrame?.sink ?? 0)
        + (reduceMotion.matches ? 0 : Math.sin(visualElapsed * 0.008) * liveActivity
          + Math.sin(visualElapsed * 0.021 + 1.3) * liveActivity * 0.5
          + Math.sin(visualElapsed * 0.037 + 0.7) * liveActivity * 0.3);
      if (focusTarget === 'sensor') {
        sensorGroup.getWorldPosition(focusPoint);
      } else {
        focusPoint.set(
          truckPoseGroup.position.x + viewLook.x + effectFrame.focusX,
          viewLook.y,
          truckPoseGroup.position.z,
        );
      }
      // A câmera acompanha o deslocamento: o alvo persegue o caminhão e a câmera
      // translada junto, preservando o ângulo escolhido pelo operador no orbit.
      cameraShift.copy(focusPoint).sub(orbit.target);
      if (isFirebase) cameraShift.multiplyScalar(reduceMotion.matches ? 1 : frameDamping(frameDelta, 5));
      camera.position.add(cameraShift);
      orbit.target.add(cameraShift);
      const wheelTravel = isFirebase ? 0 : motionScript
        ? integrateSompoMotion(motionScript.keyframes, scenarioElapsed) / 3.6
        : scenarioTravelMeters(settings, scenarioElapsed);
      const steeringAngle = sompoSteeringAngle(drivingSpeed, ruralFrame?.direction ?? 1, ruralFrame?.yawRate ?? 0, 6.0);
      if (!isFirebase && !modular) {
        for (const wheel of wheels) {
          wheelSteering.setFromAxisAngle(wheelAxis, wheel.position.x > 2 ? steeringAngle : 0);
          wheelSpin.setFromAxisAngle(wheelAxis, reduceMotion.matches ? 0 : -wheelTravel / (wheel.userData.radius ?? .58));
          wheel.quaternion.copy(wheelSteering).multiply(wheelAxle).multiply(wheelSpin);
        }
      }
      const studio = studioRef?.current ?? SOMPO_STUDIO_DEFAULT;
      modular?.update(studio, visualElapsed, wheelTravel, steeringAngle, ruralFrame?.roughness ?? settings.roughness, ruralFrame?.rain ?? 0, reduceMotion.matches, drivingSpeed);
      // Suspensão virtual: cada roda compensa a inclinação da carroceria e fica
      // plantada no solo; fora do regime de rodagem o hull retoma o apoio.
      if (wheelContacts.length) {
        if (wheelContactsSource.length !== wheels.length
          || wheels.some((wheel, index) => wheel !== wheelContactsSource[index])) captureWheelContacts();
        const suspensionGain = Math.abs(gm[5]) > 0.6 ? contactFactor : 0;
        const poseGroundY = truckBaseHeight * cosSlope;
        for (const contact of wheelContacts) {
          const residual = SOMPO_WHEEL_CONTACT_Y - poseGroundY
            - (gm[1] * contact.cx + gm[5] * (contact.cy - contact.radius - SOMPO_TRUCK_PIVOT_Y) + gm[9] * contact.cz);
          const travel = suspensionGain * THREE.MathUtils.clamp(
            residual / (gm[5] || 1), -SOMPO_SUSPENSION_TRAVEL, SOMPO_SUSPENSION_TRAVEL,
          );
          contact.wheel.position.y = contact.baseY + travel / contact.parentScaleY;
        }
      }
      // Também reage à troca de desfecho feita pela URL/controle, mesmo quando
      // ela ocorre depois do primeiro frame do componente.
      const yardContactAnchor = isFirebase ? null : yardContactFor(settings, runOriginX);
      roadScene.update(effectFrame, ruralFrame, visualElapsed, truckPoseGroup.position, reduceMotion.matches, slope, {
        animalAnchorX,
        yardContactAnchor,
        wind: studio.wind,
      });
      // Posição, cor e intensidade do sol são da atmosfera (alinhada ao HDRI).
      // Sem leitura de distância não há alvo do feixe: esconde obstáculo e raio
      // em vez de desenhá-los numa posição inventada.
      obstacleGroup.visible = isFirebase
        ? !!physical?.effects.live && physical.effects.distance !== null
        : settings.scenarioId === 'obstacle' || settings.scenarioId === 'brake-failure';
      rayGroup.visible = obstacleGroup.visible;
      const rangeLength = rangeForDistance(isFirebase ? snapshot.readings.distance : ruralFrame?.distance ?? settings.distance);
      const obstacleContactAnchor = isFirebase ? null : obstacleContactFor(settings, runOriginX);
      // No desfecho de contato, a barreira fica fixa no mundo e sua face toca
      // o para-choque no keyframe de 4,9 s. Nos demais casos ela continua sendo
      // a anotação visual do alcance do sensor.
      obstacleGroup.position.x = obstacleContactAnchor
        ?? truckWorldX + SOMPO_TRUCK_FRONT_X + rangeLength;
      rayGroup.scale.x = obstacleContactAnchor === null
        ? rangeLength
        : Math.max(0.02, obstacleGroup.position.x - truckWorldX - SOMPO_TRUCK_FRONT_X - SOMPO_OBSTACLE_HALF_X);
      obstacleGroup.position.y = Math.tan(slope) * (obstacleGroup.position.x - truckWorldX);
      if (isFirebase) {
        // Keep the ultrasonic target in front of the sensor as the vehicle turns.
        obstacleGroup.position.set(SOMPO_TRUCK_FRONT_X + rangeLength, 0, 0)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), truckPoseGroup.rotation.y)
          .add(new THREE.Vector3(truckWorldX, 0, truckPoseGroup.position.z));
        obstacleGroup.rotation.y = truckPoseGroup.rotation.y;
      }
      const uncertain = isFirebase && (!physicalCurrent || snapshot.status === 'unknown');
      rayMaterial.color.set(uncertain ? 0xc9ad74 : snapshot.risks.collision ? 0xff5d52 : 0x7dff9a);
      rayMaterial.opacity = snapshot.risks.collision ? 1 : 0.68;
      ledMaterial.color.set(uncertain ? 0xc9ad74 : snapshot.status === 'alert' ? 0xff5d52 : 0x7dff9a);
      ledMaterial.emissive.set(uncertain ? 0x473d20 : snapshot.status === 'alert' ? 0xff2d22 : 0x2dff6b);
      ledMaterial.emissiveIntensity = reduceMotion.matches ? 2.4 : 2.2 + (Math.sin(visualElapsed * 0.007) * 1.1);
      if (!isFirebase) scenarioEffects.update(effectFrame, visualElapsed, visualScenario, drivingSpeed * (ruralFrame?.direction ?? 1), reduceMotion.matches, slope, effectOutcomeId ?? '', truckWorldX, ruralFrame?.direction ?? 1, at => runOriginX + scenarioTravelMeters(settings, at));
      skyCatch.position.set(
        truckPoseGroup.position.x + 9.2,
        4.8,
        truckPoseGroup.position.z + 4.2,
      );
      skyCatch.target.position.set(
        truckPoseGroup.position.x + 4.50,
        1.45,
        truckPoseGroup.position.z,
      );
      skyCatch.target.updateMatrixWorld();
      atmosphere.update(studio, camera, truckPoseGroup.position, visualElapsed, (ruralFrame?.rain ?? 0) > 0);
      orbit.update();
      const shake = physical && physicalEffects ? physicalEffects.update(physical.effects,
        isReplay ? physical.replayTime : time, delta, physical.cargoView, reduceMotion.matches || !physical.motion) : 0;
      camera.position.y += shake;
      postProcessing.render(delta);
      // Captura síncrona no mesmo rAF do render: o framebuffer WebGL ainda está
      // válido sem precisar de preserveDrawingBuffer.
      meter.end();
      onAfterRender(renderer.domElement);
      camera.position.y -= shake;
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

    return { ...api, dispose() {
      assetAbort.abort();
      atmosphere.dispose();
      roadScene.dispose();
      scenarioEffects.dispose();
      window.cancelAnimationFrame(frameId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      resizeObserver.disconnect();
      orbit.dispose();
      disposeSompoObject(scene);
      postProcessing.dispose();
      environment.dispose();
      renderer.dispose();
      // Each stage owns its canvas/context. Retire driver resources immediately
      // instead of waiting for GC after repeated rural/agricultural switches.
      renderer.forceContextLoss();
      renderer.domElement.remove();
    } };
}
