import * as THREE from 'three';
import { integrateSompoMotion, sompoSteeringAngle } from '../../../shared/sompo-motion.js';
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
export function mountSompoRuralStage({ mount, isFirebase, controlsRef, previewRef, axisCalibrationRef, startedAtRef, setModelStatus, setModelAsset, setWebglError, onAfterRender, studioRef, getElapsed, onStats }: {
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

    const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 360);
    camera.position.set(7.2, 4.9, 15.4);

    // Small local fallback while the rural HDRIs load; the real HDRIs replace this IBL.
    const environmentScene = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(environmentScene, 0.04);
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.55;
    environmentScene.dispose();
    pmrem.dispose();

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.07;
    orbit.enablePan = false;
    orbit.minDistance = 6;
    orbit.maxDistance = 24;
    orbit.maxPolarAngle = Math.PI * 0.49;
    orbit.target.set(0, 1.5, 0);

    scene.add(new THREE.HemisphereLight(0xd8e9ff, 0x776346, 0.3));
    const keyLight = new THREE.DirectionalLight(0xffefcd, 2.4);
    keyLight.position.set(-10, 12, 9);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(sompoRenderBudget().shadowSize, sompoRenderBudget().shadowSize);
    keyLight.shadow.camera.left = -26; keyLight.shadow.camera.right = 26;
    keyLight.shadow.camera.top = 26; keyLight.shadow.camera.bottom = -26;
    keyLight.shadow.camera.near = 0.5; keyLight.shadow.camera.far = 110;
    keyLight.shadow.normalBias = 0.018;
    keyLight.shadow.bias = -0.0001;
    keyLight.shadow.radius = 4;
    scene.add(keyLight);
    // A sombra acompanha o caminhão pelo mundo: luz e alvo transladam juntos.
    scene.add(keyLight.target);
    const atmosphere = createSompoAtmosphere(scene, renderer, keyLight);
    const roadScene = createSompoRoadScene(scene, renderer, camera, { onHdri: (kind, tex) => atmosphere.setSkyTexture(kind, tex) });
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
    if (modular) { setModelAsset('SompoModularTruck'); setModelStatus('modular'); }
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
      // Preserve horizontal room for the full vehicle in a portrait canvas.
      camera.fov = Math.min(72, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(37 / 2)) * Math.max(1, 1.25 / camera.aspect))));
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
          orbit.target.set(truckPoseGroup.position.x, 1.9, truckPoseGroup.position.z);
          camera.position.set(truckPoseGroup.position.x + 7.0, 4.6, 13.4);
          orbit.minDistance = 6;
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

    function render(time: number) {
      meter.begin();
      const frameDelta = Math.max(0, (time - previousTime) / 1_000);
      const delta = Math.min(0.04, frameDelta);
      previousTime = time;
      const settings = controlsRef.current;
      const snapshot = previewRef.current;
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
        deltaSeconds: reduceMotion.matches || (isFirebase && !physicalCurrent) ? 0 : delta,
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
        focusPoint.set(truckPoseGroup.position.x + effectFrame.focusX, truckPoseGroup.position.y, truckPoseGroup.position.z);
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
      roadScene.update(effectFrame, ruralFrame, visualElapsed, truckPoseGroup.position, reduceMotion.matches, slope, { animalAnchorX, wind: studio.wind });
      // Posição, cor e intensidade do sol são da atmosfera (alinhada ao HDRI).
      // Sem leitura de distância não há alvo do feixe: esconde obstáculo e raio
      // em vez de desenhá-los numa posição inventada.
      obstacleGroup.visible = isFirebase
        ? Number.isFinite(snapshot.readings.distance)
        : settings.scenarioId === 'obstacle' || settings.scenarioId === 'brake-failure';
      rayGroup.visible = obstacleGroup.visible;
      const rangeLength = rangeForDistance(isFirebase ? snapshot.readings.distance : ruralFrame?.distance ?? settings.distance);
      rayGroup.scale.x = rangeLength;
      // Alvo do feixe ultrassônico: anotação de sensor à frente do caminhão.
      obstacleGroup.position.x = truckWorldX + SOMPO_TRUCK_FRONT_X + rangeLength;
      obstacleGroup.position.y = Math.tan(slope) * (obstacleGroup.position.x - truckWorldX);
      const uncertain = isFirebase && (!physicalCurrent || snapshot.status === 'unknown');
      rayMaterial.color.set(uncertain ? 0xc9ad74 : snapshot.risks.collision ? 0xff5d52 : 0x7dff9a);
      rayMaterial.opacity = snapshot.risks.collision ? 1 : 0.68;
      ledMaterial.color.set(uncertain ? 0xc9ad74 : snapshot.status === 'alert' ? 0xff5d52 : 0x7dff9a);
      ledMaterial.emissive.set(uncertain ? 0x473d20 : snapshot.status === 'alert' ? 0xff2d22 : 0x2dff6b);
      ledMaterial.emissiveIntensity = reduceMotion.matches ? 2.4 : 2.2 + (Math.sin(visualElapsed * 0.007) * 1.1);
      if (!isFirebase) scenarioEffects.update(effectFrame, visualElapsed, visualScenario, drivingSpeed * (ruralFrame?.direction ?? 1), reduceMotion.matches, slope, effectOutcomeId ?? '', truckWorldX, ruralFrame?.direction ?? 1, at => runOriginX + scenarioTravelMeters(settings, at));
      atmosphere.update(studio, camera, truckPoseGroup.position, visualElapsed, (ruralFrame?.rain ?? 0) > 0);
      orbit.update();
      postProcessing.render(delta);
      // Captura síncrona no mesmo rAF do render: o framebuffer WebGL ainda está
      // válido sem precisar de preserveDrawingBuffer.
      meter.end();
      onAfterRender(renderer.domElement);
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
