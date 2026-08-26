import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  Box as BoxIcon,
  Cpu,
  Focus,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Truck,
} from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SompoTelemetrySnapshot } from '@/lib/types';
import { lucaApi } from '@/lib/api';
import {
  SOMPO_COLLISION_SCRIPT,
  SOMPO_SIMULATION_SCENARIOS,
  createSompoCollisionScriptSnapshot,
  createSompoSimulationSnapshot,
  getSompoCollisionScriptPhase,
  getSompoSimulationScenario,
  type SompoSimulationControls,
  type SompoSimulationScenarioId,
} from '../../shared/sompo-telemetry-simulator.js';

interface SompoTruckSimulatorProps {
  source: 'firebase' | 'simulation';
  telemetry?: SompoTelemetrySnapshot | null;
  onTelemetry?: (snapshot: SompoTelemetrySnapshot) => void;
  onEpisodeRecorded?: (episode: { publicId: string; kind: string }) => void;
}

type CollisionRunState =
  | { status: 'idle' }
  | { status: 'starting' }
  | { status: 'recording'; publicId: string }
  | { status: 'finishing'; publicId: string }
  | { status: 'done'; publicId: string }
  | { status: 'error'; message: string };

interface CollisionRunHandle {
  publicId: string;
  startedAt: number;
  queue: Record<string, unknown>[];
  lastSampleMs: number;
}

interface SceneApi {
  focus: (target: 'truck' | 'sensor') => void;
  adjust: (action: 'rotate-left' | 'rotate-right' | 'zoom-in' | 'zoom-out') => void;
}

const SCENARIO_IDS = Object.keys(SOMPO_SIMULATION_SCENARIOS) as SompoSimulationScenarioId[];

function controlsForScenario(scenarioId: SompoSimulationScenarioId): SompoSimulationControls {
  const {
    label: _label,
    description: _description,
    ...controls
  } = getSompoSimulationScenario(scenarioId);
  return controls;
}

const INITIAL_CONTROLS = controlsForScenario('normal');
const SIMULATION_HISTORY_FLUSH_MS = 2_000;
const SIMULATION_HISTORY_MAX_BATCH = 50;
const COLLISION_TICK_MS = 250;
const COLLISION_START_DISTANCE_CM = 210;

/** Mesma régua da cena: distância (cm) → comprimento do feixe/afastamento do obstáculo. */
function rangeForDistance(distance: number | null | undefined): number {
  const clamped = Math.min(300, Math.max(5, distance || 5));
  return 1.2 + (((clamped - 5) * (7.2 - 1.2)) / (300 - 5));
}

function snapshotToSimulationRaw(snapshot: SompoTelemetrySnapshot): Record<string, unknown> {
  const readings = snapshot.readings;
  return {
    trator: snapshot.tractorId,
    timestamp: snapshot.deviceTimestamp,
    distancia: readings.distance,
    temperatura: readings.temperature,
    umidade: readings.humidity,
    pitch: readings.pitch,
    roll: readings.roll,
    aceleracaoX: readings.acceleration?.x,
    aceleracaoY: readings.acceleration?.y,
    aceleracaoZ: readings.acceleration?.z,
    rotacaoX: readings.rotation?.x,
    rotacaoY: readings.rotation?.y,
    rotacaoZ: readings.rotation?.z,
    riscoColisao: snapshot.risks.collision,
    riscoInclinacao: snapshot.risks.inclination,
    scenarioLabel: snapshot.source.scenarioLabel,
    observedAt: snapshot.observedAt,
  };
}

function disposeMaterial(material: THREE.Material) {
  const withMaps = material as THREE.Material & Record<string, unknown>;
  for (const value of Object.values(withMaps)) {
    if (value instanceof THREE.Texture) value.dispose();
  }
  material.dispose();
}

function createLabelTexture(label: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgba(4, 12, 8, 0.9)';
    context.fillRect(8, 8, 496, 112);
    context.strokeStyle = '#e8c96a';
    context.lineWidth = 5;
    context.strokeRect(8, 8, 496, 112);
    context.fillStyle = '#f8e7a8';
    context.font = '700 42px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, 256, 65);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
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

function formatReading(value: number | null | undefined, suffix: string) {
  if (!Number.isFinite(value)) return '—';
  return `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${suffix}`;
}

function LiveReadings({ telemetry }: { telemetry: SompoTelemetrySnapshot }) {
  return (
    <aside className="sompo-simulator-controls sompo-simulator-live-readings" aria-label="Leituras que movimentam o gêmeo digital">
      <div className="sompo-simulator-control-head">
        <div>
          <span>Telemetria acoplada</span>
          <strong>Trator {telemetry.tractorId}</strong>
          <p>Cada evento recebido atualiza diretamente a cena, sem escrever comandos no equipamento.</p>
        </div>
      </div>

      <div className="sompo-simulator-live-grid">
        <article>
          <span>Pitch</span>
          <strong>{formatReading(telemetry.readings.pitch, '°')}</strong>
          <small>inclina frente / trás</small>
        </article>
        <article>
          <span>Roll</span>
          <strong>{formatReading(telemetry.readings.roll, '°')}</strong>
          <small>inclina lateralmente</small>
        </article>
        <article className="is-wide">
          <span>Distância frontal</span>
          <strong>{formatReading(telemetry.readings.distance, ' cm')}</strong>
          <small>move o obstáculo na cena</small>
        </article>
        <article>
          <span>Rotação Z</span>
          <strong>{formatReading(telemetry.readings.rotation?.z, ' °/s*')}</strong>
          <small>giro relativo</small>
        </article>
        <article>
          <span>Aceleração</span>
          <strong>{formatReading(telemetry.readings.acceleration?.magnitude, ' m/s²*')}</strong>
          <small>atividade do sensor</small>
        </article>
      </div>

      <div className="sompo-simulator-live-flags" aria-label="Alertas do dispositivo">
        <div data-alert={telemetry.risks.collision}>
          {telemetry.risks.collision ? <ShieldAlert /> : <ShieldCheck />}
          <span><small>Colisão</small><strong>{telemetry.risks.collision ? 'Alerta ativo' : 'Livre'}</strong></span>
        </div>
        <div data-alert={telemetry.risks.inclination}>
          {telemetry.risks.inclination ? <ShieldAlert /> : <ShieldCheck />}
          <span><small>Inclinação</small><strong>{telemetry.risks.inclination ? 'Alerta ativo' : 'Estável'}</strong></span>
        </div>
      </div>

      <p className="sompo-simulator-disclaimer">
        * A cena usa a convenção atual de exibição dos sensores. Confirme unidades e eixos no firmware para calibração física precisa.
      </p>
    </aside>
  );
}

export default function SompoTruckSimulator({
  source,
  telemetry,
  onTelemetry,
  onEpisodeRecorded,
}: SompoTruckSimulatorProps) {
  const isFirebase = source === 'firebase';
  const [controls, setControls] = useState<SompoSimulationControls>(INITIAL_CONTROLS);
  const [preview, setPreview] = useState<SompoTelemetrySnapshot>(() => (
    telemetry || createSompoSimulationSnapshot(INITIAL_CONTROLS, { elapsedMs: 0 })
  ));
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneApiRef = useRef<SceneApi | null>(null);
  const controlsRef = useRef<SompoSimulationControls>(INITIAL_CONTROLS);
  const previewRef = useRef<SompoTelemetrySnapshot>(preview);
  const onTelemetryRef = useRef(onTelemetry);
  const onEpisodeRecordedRef = useRef(onEpisodeRecorded);
  const startedAtRef = useRef(performance.now());
  const connectedAtRef = useRef(new Date().toISOString());
  const [webglError, setWebglError] = useState(false);
  const [historyOffline, setHistoryOffline] = useState(false);
  const [collisionRun, setCollisionRun] = useState<CollisionRunState>({ status: 'idle' });
  const [collisionElapsedSec, setCollisionElapsedSec] = useState(0);
  const pendingSamplesRef = useRef<Record<string, unknown>[]>([]);
  const flushBusyRef = useRef(false);
  const collisionRunRef = useRef<CollisionRunHandle | null>(null);
  const collisionVisualRef = useRef<{ baseRange: number } | null>(null);

  const collisionActive = collisionRun.status === 'starting'
    || collisionRun.status === 'recording'
    || collisionRun.status === 'finishing';

  const activeScenario = useMemo(
    () => SOMPO_SIMULATION_SCENARIOS[controls.scenarioId],
    [controls.scenarioId],
  );

  const collisionPhaseLabel = useMemo(() => {
    const phaseId = getSompoCollisionScriptPhase(collisionElapsedSec * 1_000);
    return SOMPO_COLLISION_SCRIPT.phases.find((phase) => phase.id === phaseId)?.label || phaseId;
  }, [collisionElapsedSec]);

  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);

  useEffect(() => {
    previewRef.current = preview;
  }, [preview]);

  useEffect(() => {
    onTelemetryRef.current = onTelemetry;
  }, [onTelemetry]);

  useEffect(() => {
    onEpisodeRecordedRef.current = onEpisodeRecorded;
  }, [onEpisodeRecorded]);

  useEffect(() => {
    if (!isFirebase || !telemetry) return;
    previewRef.current = telemetry;
    setPreview(telemetry);
  }, [isFirebase, telemetry]);

  useEffect(() => {
    // Durante o roteiro de colisão, quem emite os valores é o roteiro.
    if (isFirebase || collisionActive) return undefined;

    function emitSnapshot() {
      const snapshot = createSompoSimulationSnapshot(controls, {
        elapsedMs: performance.now() - startedAtRef.current,
        connectedAt: connectedAtRef.current,
      });
      previewRef.current = snapshot;
      setPreview(snapshot);
      onTelemetryRef.current?.(snapshot);
      pendingSamplesRef.current.push(snapshotToSimulationRaw(snapshot));
      if (pendingSamplesRef.current.length > SIMULATION_HISTORY_MAX_BATCH) {
        pendingSamplesRef.current = pendingSamplesRef.current.slice(-SIMULATION_HISTORY_MAX_BATCH);
      }
    }

    emitSnapshot();
    const timer = window.setInterval(emitSnapshot, 250);
    return () => window.clearInterval(timer);
  }, [collisionActive, controls, isFirebase]);

  useEffect(() => {
    if (isFirebase) {
      pendingSamplesRef.current = [];
      setHistoryOffline(false);
      return undefined;
    }

    let cancelled = false;
    async function flushHistory() {
      if (flushBusyRef.current) return;
      const batch = pendingSamplesRef.current.splice(0, SIMULATION_HISTORY_MAX_BATCH);
      if (batch.length === 0) return;
      flushBusyRef.current = true;
      try {
        await lucaApi.postSompoTelemetrySimulation(batch);
        if (!cancelled) setHistoryOffline(false);
      } catch {
        if (!cancelled) setHistoryOffline(true);
      } finally {
        flushBusyRef.current = false;
      }
    }

    const timer = window.setInterval(() => {
      void flushHistory();
    }, SIMULATION_HISTORY_FLUSH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isFirebase]);

  // Roteiro de colisão: dono do relógio, das amostras e do finish do episódio.
  useEffect(() => {
    if (collisionRun.status !== 'recording') return undefined;
    const handle = collisionRunRef.current;
    if (!handle) return undefined;
    const run: CollisionRunHandle = handle;

    let settled = false;
    let flushBusy = false;

    function stopTimers() {
      window.clearInterval(tickTimer);
      window.clearInterval(flushTimer);
    }

    function abortRun(message: string) {
      if (settled) return;
      settled = true;
      stopTimers();
      collisionVisualRef.current = null;
      collisionRunRef.current = null;
      setCollisionRun({ status: 'error', message });
      // Marca aborted no servidor; se a rede seguir fora, o timeout de 10 min resolve.
      void lucaApi.postSompoTelemetryEpisodeFinish(run.publicId, 'aborted').catch(() => undefined);
    }

    async function finishRun() {
      if (settled) return;
      settled = true;
      stopTimers();
      setCollisionRun({ status: 'finishing', publicId: run.publicId });
      try {
        while (run.queue.length > 0) {
          await lucaApi.postSompoTelemetrySimulation(
            run.queue.splice(0, SIMULATION_HISTORY_MAX_BATCH),
            run.publicId,
          );
        }
        const result = await lucaApi.postSompoTelemetryEpisodeFinish(run.publicId, 'complete');
        if (!result?.ok) throw new Error('sompo_episode_finish_failed');
        collisionVisualRef.current = null;
        collisionRunRef.current = null;
        setCollisionRun({ status: 'done', publicId: run.publicId });
        onEpisodeRecordedRef.current?.({ publicId: run.publicId, kind: SOMPO_COLLISION_SCRIPT.kind });
      } catch {
        collisionVisualRef.current = null;
        collisionRunRef.current = null;
        setCollisionRun({
          status: 'error',
          message: 'Falha de rede ao fechar o episódio — gravação abortada. O simulador continua ativo.',
        });
        void lucaApi.postSompoTelemetryEpisodeFinish(run.publicId, 'aborted').catch(() => undefined);
      }
    }

    const tickTimer = window.setInterval(() => {
      const elapsed = performance.now() - run.startedAt;
      if (elapsed >= SOMPO_COLLISION_SCRIPT.totalMs) {
        void finishRun();
        return;
      }
      const snapshot = createSompoCollisionScriptSnapshot(elapsed, {
        connectedAt: connectedAtRef.current,
      });
      previewRef.current = snapshot;
      setPreview(snapshot);
      onTelemetryRef.current?.(snapshot);
      setCollisionElapsedSec(Math.floor(elapsed / 1_000));
      if (elapsed - run.lastSampleMs >= SOMPO_COLLISION_SCRIPT.sampleIntervalMs) {
        run.lastSampleMs = elapsed;
        run.queue.push(snapshotToSimulationRaw(snapshot));
      }
    }, COLLISION_TICK_MS);

    const flushTimer = window.setInterval(() => {
      if (flushBusy) return;
      const batch = run.queue.splice(0, SIMULATION_HISTORY_MAX_BATCH);
      if (batch.length === 0) return;
      flushBusy = true;
      lucaApi.postSompoTelemetrySimulation(batch, run.publicId)
        .catch(() => abortRun('Falha de rede ao gravar o episódio — gravação abortada. O simulador continua ativo.'))
        .finally(() => {
          flushBusy = false;
        });
    }, SIMULATION_HISTORY_FLUSH_MS);

    return () => {
      stopTimers();
    };
  }, [collisionRun.status]);

  async function startCollisionRun() {
    if (isFirebase || collisionActive) return;
    setCollisionRun({ status: 'starting' });
    let publicId = '';
    try {
      const result = await lucaApi.postSompoTelemetryEpisodeStart({
        kind: SOMPO_COLLISION_SCRIPT.kind,
        trator: 'SIM-001',
        scenarioLabel: SOMPO_COLLISION_SCRIPT.label,
      });
      if (!result?.ok || !result.episode?.publicId) throw new Error('sompo_episode_start_failed');
      publicId = result.episode.publicId;
    } catch {
      setCollisionRun({
        status: 'error',
        message: 'Não foi possível abrir o episódio no servidor. O roteiro não começou; o simulador continua ativo.',
      });
      return;
    }
    collisionRunRef.current = {
      publicId,
      startedAt: performance.now(),
      queue: [],
      lastSampleMs: Number.NEGATIVE_INFINITY,
    };
    collisionVisualRef.current = { baseRange: rangeForDistance(COLLISION_START_DISTANCE_CM) };
    setCollisionElapsedSec(0);
    setCollisionRun({ status: 'recording', publicId });
  }

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
      setWebglError(false);
    } catch {
      setWebglError(true);
      return undefined;
    }

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x08110d, 0.045);
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(9.4, 6.4, 10.5);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x07100c, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    mount.appendChild(renderer.domElement);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.07;
    orbit.enablePan = false;
    orbit.minDistance = 6;
    orbit.maxDistance = 20;
    orbit.maxPolarAngle = Math.PI * 0.49;
    orbit.target.set(0, 1.5, 0);

    scene.add(new THREE.HemisphereLight(0xcce9dc, 0x172219, 2.2));
    const keyLight = new THREE.DirectionalLight(0xffe6a0, 3.8);
    keyLight.position.set(5, 9, 7);
    scene.add(keyLight);
    const rimLight = new THREE.PointLight(0x57ff8a, 18, 15, 2);
    rimLight.position.set(-3, 3.5, -4);
    scene.add(rimLight);

    const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x101814, roughness: 0.94, metalness: 0.05 });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(32, 18), roadMaterial);
    road.rotation.x = -Math.PI / 2;
    road.position.y = -0.02;
    scene.add(road);

    const grid = new THREE.GridHelper(32, 32, 0x56634e, 0x263029);
    grid.position.y = 0.01;
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMaterials.forEach((material) => {
      material.transparent = true;
      material.opacity = 0.28;
    });
    scene.add(grid);

    const centerLineMaterial = new THREE.MeshBasicMaterial({ color: 0xc9a227, transparent: true, opacity: 0.5 });
    for (let x = -13; x < 14; x += 3) {
      addBox(scene, [1.4, 0.025, 0.08], [x, 0.025, -3.15], centerLineMaterial);
    }

    const truckGroup = new THREE.Group();
    truckGroup.position.y = 0.05;
    scene.add(truckGroup);

    const gold = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.56, metalness: 0.35 });
    const darkGreen = new THREE.MeshStandardMaterial({ color: 0x173c2b, roughness: 0.66, metalness: 0.18 });
    const deepGreen = new THREE.MeshStandardMaterial({ color: 0x09251a, roughness: 0.72, metalness: 0.12 });
    const glass = new THREE.MeshStandardMaterial({
      color: 0x82b8a9,
      roughness: 0.18,
      metalness: 0.12,
      transparent: true,
      opacity: 0.42,
    });
    const tire = new THREE.MeshStandardMaterial({ color: 0x080b09, roughness: 0.92 });
    const hub = new THREE.MeshStandardMaterial({ color: 0x737b70, roughness: 0.5, metalness: 0.7 });
    const warning = new THREE.MeshStandardMaterial({ color: 0xff4f45, roughness: 0.45, metalness: 0.2 });

    addBox(truckGroup, [6.2, 0.42, 2.25], [0, 1.02, 0], deepGreen);
    addBox(truckGroup, [2.05, 1.9, 2.05], [2.05, 2.05, 0], gold);
    addBox(truckGroup, [2.12, 0.78, 2.09], [2.02, 3.2, 0], gold).rotation.z = -0.08;
    addBox(truckGroup, [0.08, 0.75, 1.62], [3.09, 2.62, 0], glass);
    addBox(truckGroup, [3.55, 2.05, 2.08], [-0.92, 2.2, 0], darkGreen);
    addBox(truckGroup, [3.62, 0.12, 2.18], [-0.92, 3.26, 0], gold);
    addBox(truckGroup, [0.42, 0.38, 2.32], [3.18, 1.08, 0], gold);

    const wheels: THREE.Mesh[] = [];
    for (const x of [-1.85, 1.75]) {
      for (const z of [-1.18, 1.18]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.42, 28), tire);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(x, 0.78, z);
        truckGroup.add(wheel);
        wheels.push(wheel);
        const wheelHub = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.45, 20), hub);
        wheelHub.rotation.x = Math.PI / 2;
        wheelHub.position.copy(wheel.position);
        truckGroup.add(wheelHub);
      }
    }

    const sensorGroup = new THREE.Group();
    sensorGroup.position.set(0.2, 3.62, 0);
    truckGroup.add(sensorGroup);
    const enclosureMaterial = new THREE.MeshStandardMaterial({
      color: 0xe8c96a,
      roughness: 0.2,
      metalness: 0.1,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const enclosure = addBox(sensorGroup, [1.42, 0.86, 1.16], [0, 0, 0], enclosureMaterial);
    const enclosureEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(enclosure.geometry),
      new THREE.LineBasicMaterial({ color: 0xe8c96a, transparent: true, opacity: 0.95 }),
    );
    sensorGroup.add(enclosureEdges);
    const boardMaterial = new THREE.MeshStandardMaterial({ color: 0x0c8f57, roughness: 0.58, metalness: 0.25 });
    addBox(sensorGroup, [0.9, 0.12, 0.62], [0, -0.04, 0], boardMaterial);
    const chipMaterial = new THREE.MeshStandardMaterial({ color: 0x121713, roughness: 0.5, metalness: 0.45 });
    addBox(sensorGroup, [0.28, 0.12, 0.28], [0.05, 0.08, 0], chipMaterial);
    const ledMaterial = new THREE.MeshStandardMaterial({
      color: 0x7dff9a,
      emissive: 0x2dff6b,
      emissiveIntensity: 3,
      roughness: 0.2,
    });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), ledMaterial);
    led.position.set(0.34, 0.14, 0.18);
    sensorGroup.add(led);

    const labelTexture = createLabelTexture(isFirebase ? 'ESP32 FÍSICO' : 'ESP32 VIRTUAL');
    const labelSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture, transparent: true }));
    labelSprite.scale.set(2.35, 0.59, 1);
    labelSprite.position.set(0.2, 1.05, 0);
    sensorGroup.add(labelSprite);

    const rayMaterial = new THREE.LineBasicMaterial({ color: 0x7dff9a, transparent: true, opacity: 0.78 });
    const rayGroup = new THREE.Group();
    rayGroup.position.set(3.42, 1.55, 0);
    truckGroup.add(rayGroup);
    for (const z of [-0.16, 0.16]) {
      const ray = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, z),
          new THREE.Vector3(1, 0, z * 1.8),
        ]),
        rayMaterial,
      );
      rayGroup.add(ray);
    }

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
      camera.updateProjectionMatrix();
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    sceneApiRef.current = {
      focus(target) {
        if (target === 'sensor') {
          camera.position.set(1.4, 4.75, 3.6);
          orbit.target.set(0.2, 3.55, 0);
          orbit.minDistance = 2.5;
        } else {
          camera.position.set(9.4, 6.4, 10.5);
          orbit.target.set(0, 1.5, 0);
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
    let liveHeading = 0;

    function render(time: number) {
      const delta = Math.min(0.04, Math.max(0, (time - previousTime) / 1_000));
      previousTime = time;
      const settings = controlsRef.current;
      const snapshot = previewRef.current;
      const pitch = THREE.MathUtils.degToRad(
        reduceMotion.matches ? settings.pitch : snapshot.readings.pitch || 0,
      );
      const roll = THREE.MathUtils.degToRad(
        reduceMotion.matches ? settings.roll : snapshot.readings.roll || 0,
      );
      if (reduceMotion.matches) {
        truckGroup.rotation.z = pitch;
        truckGroup.rotation.x = roll;
      } else {
        truckGroup.rotation.z = THREE.MathUtils.lerp(truckGroup.rotation.z, pitch, 0.08);
        truckGroup.rotation.x = THREE.MathUtils.lerp(truckGroup.rotation.x, roll, 0.08);
      }
      if (isFirebase && !reduceMotion.matches) {
        const yawRate = THREE.MathUtils.clamp(snapshot.readings.rotation?.z || 0, -180, 180);
        liveHeading += THREE.MathUtils.degToRad(yawRate) * delta;
        truckGroup.rotation.y = liveHeading;
      }
      const liveActivity = isFirebase
        ? THREE.MathUtils.clamp((snapshot.readings.rotation?.magnitude || 0) * 0.012, 0, 0.1)
        : settings.roughness * 0.008;
      truckGroup.position.y = 0.05 + (reduceMotion.matches ? 0 : Math.sin(time * 0.008) * liveActivity);
      const collisionVisual = collisionVisualRef.current;
      if (!isFirebase && !reduceMotion.matches) {
        // No roteiro de colisão a roda para junto com o caminhão (flag ativa = impacto/parado).
        const wheelSpeed = collisionVisual ? (snapshot.risks.collision ? 0 : 16) : settings.speedKph;
        for (const wheel of wheels) wheel.rotation.y -= delta * wheelSpeed * 0.12;
      }
      const rangeLength = rangeForDistance(snapshot.readings.distance);
      rayGroup.scale.x = rangeLength;
      if (collisionVisual) {
        // Obstáculo fixo no mundo; o caminhão avança até fechar a distância do roteiro.
        obstacleGroup.position.x = 3.42 + collisionVisual.baseRange;
        truckGroup.position.x = Math.max(0, collisionVisual.baseRange - rangeLength);
        if (snapshot.risks.collision && (snapshot.readings.acceleration?.magnitude || 0) > 15) {
          truckGroup.position.y += reduceMotion.matches ? 0 : Math.sin(time * 0.09) * 0.05;
        }
      } else {
        obstacleGroup.position.x = 3.42 + rangeLength;
        if (truckGroup.position.x !== 0) {
          truckGroup.position.x = Math.abs(truckGroup.position.x) < 0.01
            ? 0
            : THREE.MathUtils.lerp(truckGroup.position.x, 0, 0.06);
        }
      }
      rayMaterial.color.set(snapshot.risks.collision ? 0xff5d52 : 0x7dff9a);
      rayMaterial.opacity = snapshot.risks.collision ? 1 : 0.68;
      ledMaterial.color.set(snapshot.status === 'alert' ? 0xff5d52 : 0x7dff9a);
      ledMaterial.emissive.set(snapshot.status === 'alert' ? 0xff2d22 : 0x2dff6b);
      ledMaterial.emissiveIntensity = reduceMotion.matches ? 2.4 : 2.2 + (Math.sin(time * 0.007) * 1.1);
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

    return () => {
      window.cancelAnimationFrame(frameId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      resizeObserver.disconnect();
      orbit.dispose();
      sceneApiRef.current = null;
      scene.traverse((object) => {
        const renderable = object as THREE.Mesh & { material?: THREE.Material | THREE.Material[] };
        if (renderable.geometry) renderable.geometry.dispose();
        if (renderable.material) {
          const materials = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
          materials.forEach(disposeMaterial);
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [isFirebase]);

  function selectScenario(scenarioId: SompoSimulationScenarioId) {
    startedAtRef.current = performance.now();
    connectedAtRef.current = new Date().toISOString();
    setControls(controlsForScenario(scenarioId));
  }

  function updateNumber(
    key: 'distance' | 'temperature' | 'humidity' | 'pitch' | 'roll',
    value: number,
  ) {
    setControls((current) => ({ ...current, [key]: value }));
  }

  function restartScenario() {
    selectScenario(controls.scenarioId);
  }

  function handleCameraKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const action = {
      ArrowLeft: 'rotate-left',
      ArrowRight: 'rotate-right',
      ArrowUp: 'zoom-in',
      ArrowDown: 'zoom-out',
    }[event.key] as Parameters<SceneApi['adjust']>[0] | undefined;
    if (!action) return;
    event.preventDefault();
    sceneApiRef.current?.adjust(action);
  }

  const firebaseLive = preview.connection.state === 'live';
  const firebaseStatusLabel = firebaseLive
    ? preview.freshness === 'stale' ? 'Conectado · leitura parada' : 'Firebase ao vivo'
    : preview.connection.state === 'reconnecting' ? 'Reconectando ao Firebase' : 'Conectando ao Firebase';

  return (
    <section
      className={`sompo-simulator${isFirebase ? ' sompo-simulator-live' : ''}`}
      aria-labelledby="sompo-simulator-title"
      data-sompo-simulator
      data-sompo-simulator-source={source}
    >
      <header className="sompo-simulator-head">
        <div>
          <span><BoxIcon /> {isFirebase ? 'Gêmeo digital' : 'Laboratório virtual'}</span>
          <h2 id="sompo-simulator-title">
            {isFirebase ? 'Caminhão 3D acoplado ao dispositivo físico' : 'Caminhão + caixa ESP32 em Three.js'}
          </h2>
          <p>
            {isFirebase
              ? 'A cena acompanha em tempo real a orientação, a distância frontal e os alertas recebidos do Firebase.'
              : 'Dados sintéticos locais para testar a mesma leitura da telemetria sem o dispositivo físico.'}
          </p>
        </div>
        <div className="sompo-simulator-head-status">
          <strong className={isFirebase && firebaseLive ? 'is-live' : ''}>
            <Cpu /> {isFirebase ? firebaseStatusLabel : 'Não envia ao Firebase'}
          </strong>
          {!isFirebase && historyOffline && (
            <span className="sompo-simulator-history-offline" role="status" data-sompo-history-offline>
              histórico offline
            </span>
          )}
        </div>
      </header>

      <div className="sompo-simulator-workspace">
        <div className="sompo-simulator-stage">
          <div
            ref={mountRef}
            className="sompo-simulator-canvas"
            role={webglError ? undefined : 'img'}
            tabIndex={webglError ? undefined : 0}
            aria-keyshortcuts={webglError ? undefined : 'ArrowLeft ArrowRight ArrowUp ArrowDown'}
            onKeyDown={handleCameraKeyDown}
            aria-label={webglError
              ? undefined
              : `Modelo 3D interativo de um caminhão com caixa ESP32 ${isFirebase ? 'movido pela telemetria física' : 'virtual'}. Setas esquerda e direita giram; setas para cima e para baixo controlam o zoom.`}
          >
            {webglError && (
              <div className="sompo-simulator-webgl" role="status">
                <Truck />
                <strong>Visualização 3D indisponível</strong>
                <p>{isFirebase ? 'A telemetria física continua atualizando abaixo.' : 'Os controles e a telemetria simulada continuam funcionando.'}</p>
              </div>
            )}
          </div>
          <div className="sompo-simulator-stage-badges" aria-hidden="true">
            <span><span className="sompo-simulator-led" /> {isFirebase ? `ESP32 físico · trator ${preview.tractorId}` : 'ESP32 virtual transmitindo'}</span>
            <span>{isFirebase ? `tick ${preview.deviceTimestamp ?? '—'}` : `${Math.round(preview.deviceTimestamp || 0)} ms`}</span>
          </div>
          <div className="sompo-simulator-camera" role="group" aria-label="Controles da câmera 3D">
            <button type="button" onClick={() => sceneApiRef.current?.focus('truck')}>
              <Truck /> Visão geral
            </button>
            <button type="button" onClick={() => sceneApiRef.current?.focus('sensor')}>
              <Focus /> Focar ESP32
            </button>
          </div>
          <p className="sompo-simulator-hint">Arraste para girar · roda ou setas ↑↓ para zoom · setas ←→ para girar</p>
        </div>

        {isFirebase ? (
          <LiveReadings telemetry={preview} />
        ) : (
        <aside className="sompo-simulator-controls" aria-label="Controles do simulador">
          <div className="sompo-simulator-control-head">
            <div>
              <span>Cenário ativo</span>
              <strong>{preview.source.scenarioLabel || activeScenario.label}</strong>
              <p>{activeScenario.description}</p>
            </div>
            <button
              type="button"
              onClick={restartScenario}
              disabled={collisionActive}
              aria-label="Reiniciar cenário"
              title="Reiniciar cenário"
            >
              <RotateCcw />
            </button>
          </div>

          <div className="sompo-simulator-presets" role="group" aria-label="Cenários de teste">
            {SCENARIO_IDS.map((scenarioId) => {
              const scenario = SOMPO_SIMULATION_SCENARIOS[scenarioId];
              return (
                <button
                  key={scenarioId}
                  type="button"
                  aria-pressed={controls.scenarioId === scenarioId}
                  disabled={collisionActive}
                  onClick={() => selectScenario(scenarioId)}
                >
                  {scenario.label}
                </button>
              );
            })}
          </div>

          <div className="sompo-simulator-collision" data-sompo-collision-panel>
            <button
              type="button"
              className="sompo-simulator-collision-run"
              data-sompo-collision-run
              disabled={collisionActive}
              onClick={() => void startCollisionRun()}
            >
              <Siren /> {collisionActive ? 'Roteiro em andamento…' : 'Simular colisão'}
            </button>
            {collisionRun.status === 'starting' && (
              <p className="sompo-simulator-collision-status" role="status">
                Abrindo episódio no servidor…
              </p>
            )}
            {collisionRun.status === 'recording' && (
              <p className="sompo-simulator-collision-status" role="status" data-sompo-collision-recording>
                Gravando episódio de colisão… {collisionElapsedSec}s · fase: {collisionPhaseLabel}
              </p>
            )}
            {collisionRun.status === 'finishing' && (
              <p className="sompo-simulator-collision-status" role="status">
                Fechando episódio…
              </p>
            )}
            {collisionRun.status === 'done' && (
              <p className="sompo-simulator-collision-status is-done" role="status" data-sompo-collision-done>
                Episódio registrado. Use “Analisar colisão na bancada” no painel abaixo.
              </p>
            )}
            {collisionRun.status === 'error' && (
              <p className="sompo-simulator-collision-status is-error" role="alert" data-sompo-collision-error>
                {collisionRun.message}
              </p>
            )}
          </div>

          <div className="sompo-simulator-ranges">
            <label>
              <span>Distância frontal <strong>{controls.distance} cm</strong></span>
              <input
                type="range"
                min="5"
                max="300"
                step="1"
                value={controls.distance}
                disabled={collisionActive}
                onChange={(event) => updateNumber('distance', Number(event.target.value))}
              />
            </label>
            <label>
              <span>Pitch <strong>{controls.pitch}°</strong></span>
              <input
                type="range"
                min="-25"
                max="25"
                step="0.5"
                value={controls.pitch}
                disabled={collisionActive}
                onChange={(event) => updateNumber('pitch', Number(event.target.value))}
              />
            </label>
            <label>
              <span>Roll <strong>{controls.roll}°</strong></span>
              <input
                type="range"
                min="-25"
                max="25"
                step="0.5"
                value={controls.roll}
                disabled={collisionActive}
                onChange={(event) => updateNumber('roll', Number(event.target.value))}
              />
            </label>
            <label>
              <span>Temperatura <strong>{controls.temperature} °C</strong></span>
              <input
                type="range"
                min="-10"
                max="70"
                step="1"
                value={controls.temperature}
                disabled={collisionActive}
                onChange={(event) => updateNumber('temperature', Number(event.target.value))}
              />
            </label>
            <label>
              <span>Umidade <strong>{controls.humidity}%</strong></span>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={controls.humidity}
                disabled={collisionActive}
                onChange={(event) => updateNumber('humidity', Number(event.target.value))}
              />
            </label>
          </div>

          <div className="sompo-simulator-flags" role="group" aria-label="Flags sintéticas do cenário">
            <button
              type="button"
              aria-pressed={controls.collisionRisk}
              disabled={collisionActive}
              onClick={() => setControls((current) => ({ ...current, collisionRisk: !current.collisionRisk }))}
            >
              {controls.collisionRisk ? <ShieldAlert /> : <ShieldCheck />}
              Colisão {controls.collisionRisk ? 'ativa' : 'livre'}
            </button>
            <button
              type="button"
              aria-pressed={controls.inclinationRisk}
              disabled={collisionActive}
              onClick={() => setControls((current) => ({ ...current, inclinationRisk: !current.inclinationRisk }))}
            >
              {controls.inclinationRisk ? <ShieldAlert /> : <ShieldCheck />}
              Inclinação {controls.inclinationRisk ? 'ativa' : 'livre'}
            </button>
          </div>
          <p className="sompo-simulator-disclaimer">
            As flags são comandos do cenário. Não representam limiares confirmados do firmware.
          </p>
        </aside>
        )}
      </div>
    </section>
  );
}
