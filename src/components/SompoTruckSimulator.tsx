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
  Disc,
  Focus,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadSompoTruckAsset } from './sompo/loadSompoTruckAsset';
import { createSompoScenarioEffects } from './sompo/createSompoScenarioEffects';
import { getSompoScenarioEffects } from '../../shared/sompo-scenario-effects.js';
import { createSompoRoadScene } from './sompo/createSompoRoadScene';
import { createSompoPostProcessing } from './sompo/createSompoPostProcessing';
import type { SompoTelemetrySnapshot } from '@/lib/types';
import { lucaApi } from '@/lib/api';
import {
  createSompoTruckModel,
  SOMPO_TRUCK_FRONT_X,
  SOMPO_TRUCK_HALF_SIZE,
  SOMPO_TRUCK_PIVOT_Y,
} from './sompo/createSompoTruckModel';
import {
  DEFAULT_SOMPO_AXIS_CALIBRATION,
  SOMPO_EULER_ORDER,
  sensorReadingToPose,
  type SompoAxisCalibration,
} from './sompo/sensorPose.js';
import {
  SOMPO_AGRI_SCENARIOS,
  getSompoAgriFrame,
  getSompoAgriScenario,
  type SompoAgriScenarioId,
} from '../../shared/sompo-agri-scenarios.js';
import {
  createSompoAgriSimulationSnapshot,
  getSompoAgriEpisodePlan,
  getSompoAgriOutcomes,
  isSompoAgriScenarioId,
} from '../../shared/sompo-agri-brief.js';
import { mountSompoAgriStage } from './sompo/createSompoAgriStage';
import { frameDamping } from './sompo/frameDamping.js';
import {
  SOMPO_RURAL_SCRIPTS,
  getSompoRuralFrame,
  SOMPO_BRAKING_SCRIPT,
  getSompoBrakingScriptState,
  getSompoBrakingTravelMeters,
  SOMPO_SIMULATION_SCENARIOS,
  createSompoSimulationSnapshot,
  getSompoEpisodePlan,
  getSompoRuralTravelMeters,
  getSompoScenarioOutcomes,
  getSompoScenarioScript,
  getSompoSimulationScenario,
  type SompoEpisodePlan,
  type SompoSimulationControls,
  type SompoSimulationScenarioId,
} from '../../shared/sompo-telemetry-simulator.js';

interface SompoTruckSimulatorProps {
  source: 'firebase' | 'simulation';
  telemetry?: SompoTelemetrySnapshot | null;
  onTelemetry?: (snapshot: SompoTelemetrySnapshot) => void;
  onEpisodeRecorded?: (episode: { publicId: string; kind: string; outcomeId?: string; outcomeLabel?: string } | null) => void;
}

type EpisodeRunState =
  | { status: 'idle' }
  | { status: 'starting' }
  | { status: 'recording'; publicId: string }
  | { status: 'finishing'; publicId: string }
  | { status: 'done'; publicId: string }
  | { status: 'error'; message: string };

interface EpisodeRunHandle {
  publicId: string;
  startedAt: number;
  queue: Record<string, unknown>[];
  lastSampleMs: number;
  plan: SompoEpisodePlan;
}

interface EpisodeFrameCapture {
  dataUrl: string;
  offsetMs: number;
  fase: string;
  label: string;
}

interface EpisodeCaptureHandle {
  nextIndex: number;
  frames: EpisodeFrameCapture[];
}

interface SceneApi {
  focus: (target: 'truck' | 'sensor') => void;
  adjust: (action: 'rotate-left' | 'rotate-right' | 'zoom-in' | 'zoom-out') => void;
  recenterHeading: () => void;
}

const SCENARIO_IDS = Object.keys(SOMPO_SIMULATION_SCENARIOS) as SompoSimulationScenarioId[];
const AGRI_SCENARIO_IDS = Object.keys(SOMPO_AGRI_SCENARIOS) as SompoAgriScenarioId[];

interface SompoAgriRun {
  scenarioId: SompoAgriScenarioId;
  outcomeId: string;
}

function controlsForScenario(scenarioId: SompoSimulationScenarioId, outcomeId?: string): SompoSimulationControls {
  const {
    label: _label,
    description: _description,
    ...controls
  } = getSompoSimulationScenario(scenarioId);
  const outcomes = getSompoScenarioOutcomes(scenarioId);
  const outcome = outcomes.find((item) => item.id === outcomeId) || outcomes[0];
  return { ...controls, outcomeId: outcome.id };
}

const INITIAL_CONTROLS = controlsForScenario('normal');
const SIMULATION_HISTORY_FLUSH_MS = 2_000;
const SIMULATION_HISTORY_MAX_BATCH = 50;
const SOMPO_AXIS_CALIBRATION_STORAGE_KEY = 'luca:sompo-axis-calibration:v2';

function loadAxisCalibration(): SompoAxisCalibration {
  try {
    const stored = window.localStorage.getItem(SOMPO_AXIS_CALIBRATION_STORAGE_KEY);
    if (!stored) return { ...DEFAULT_SOMPO_AXIS_CALIBRATION };
    const parsed = JSON.parse(stored) as Partial<SompoAxisCalibration>;
    return {
      invertPitch: parsed.invertPitch === true,
      invertRoll: parsed.invertRoll === true,
      invertYaw: parsed.invertYaw === true,
      swapPitchRoll: parsed.swapPitchRoll === true,
    };
  } catch {
    return { ...DEFAULT_SOMPO_AXIS_CALIBRATION };
  }
}
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
const EPISODE_TICK_MS = 250;
const EPISODE_FRAME_WIDTH = 640;
const EPISODE_FRAME_JPEG_QUALITY = 0.7;
// Aba oculta pausa o rAF: momento perdido há mais de 1s não vira frame mentiroso.
const EPISODE_FRAME_LATE_TOLERANCE_MS = 1_000;

/**
 * Captura síncrona após o render — o buffer WebGL ainda está preenchido no
 * mesmo rAF, então não precisamos de preserveDrawingBuffer.
 * Reduz para ~640px num canvas 2D antes de serializar em JPEG.
 */
function captureEpisodeFrameDataUrl(source: HTMLCanvasElement): string | null {
  try {
    const sourceWidth = Math.max(1, source.width);
    const width = Math.min(EPISODE_FRAME_WIDTH, sourceWidth);
    const height = Math.max(1, Math.round(width * (Math.max(1, source.height) / sourceWidth)));
    const target = document.createElement('canvas');
    target.width = width;
    target.height = height;
    const context = target.getContext('2d');
    if (!context) return null;
    context.drawImage(source, 0, 0, width, height);
    return target.toDataURL('image/jpeg', EPISODE_FRAME_JPEG_QUALITY);
  } catch {
    return null;
  }
}

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

function LiveReadings({
  telemetry,
  calibration,
  onCalibrationChange,
  onCalibrationReset,
  onRecenterHeading,
}: {
  telemetry: SompoTelemetrySnapshot;
  calibration: SompoAxisCalibration;
  onCalibrationChange: (key: keyof SompoAxisCalibration, value: boolean) => void;
  onCalibrationReset: () => void;
  onRecenterHeading: () => void;
}) {
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
          <strong>{formatReading(calibration.swapPitchRoll ? telemetry.readings.pitch : telemetry.readings.roll, '°')}</strong>
          <small>inclina frente / trás</small>
        </article>
        <article>
          <span>Roll</span>
          <strong>{formatReading(calibration.swapPitchRoll ? telemetry.readings.roll : telemetry.readings.pitch, '°')}</strong>
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

      <details className="sompo-axis-calibration" data-sompo-axis-calibration>
        <summary>Calibração de eixos</summary>
        <p>
          Incline o caminhão físico e ajuste até a tela seguir a mesma direção. O rumo é integrado
          do giroscópio e não tem norte: depois de várias curvas ele acumula erro — recentre com o
          caminhão apontado para a seta ciano.
        </p>
        <div>
          {([
            ['invertPitch', 'Inverter arfagem'],
            ['invertRoll', 'Inverter rolagem'],
            ['invertYaw', 'Inverter guinada'],
            ['swapPitchRoll', 'Trocar arfagem ↔ rolagem'],
          ] as const).map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={calibration[key]}
                onChange={(event) => onCalibrationChange(key, event.target.checked)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <div className="sompo-axis-calibration-actions">
          <button type="button" onClick={onRecenterHeading}>Recentrar guinada</button>
          <button type="button" onClick={onCalibrationReset}>Voltar ao padrão</button>
        </div>
      </details>

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
  const [agriRun, setAgriRun] = useState<SompoAgriRun | null>(null);
  const [axisCalibration, setAxisCalibration] = useState<SompoAxisCalibration>(loadAxisCalibration);
  const [preview, setPreview] = useState<SompoTelemetrySnapshot>(() => (
    telemetry || createSompoSimulationSnapshot(INITIAL_CONTROLS, { elapsedMs: 0 })
  ));
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneApiRef = useRef<SceneApi | null>(null);
  const controlsRef = useRef<SompoSimulationControls>(INITIAL_CONTROLS);
  const axisCalibrationRef = useRef(axisCalibration);
  const previewRef = useRef<SompoTelemetrySnapshot>(preview);
  const onTelemetryRef = useRef(onTelemetry);
  const onEpisodeRecordedRef = useRef(onEpisodeRecorded);
  const startedAtRef = useRef(performance.now());
  const connectedAtRef = useRef(new Date().toISOString());
  const [webglError, setWebglError] = useState(false);
  const [modelStatus, setModelStatus] = useState<'loading' | 'gltf' | 'fallback'>('loading');
  const [modelAsset, setModelAsset] = useState<string | null>(null);
  const [historyOffline, setHistoryOffline] = useState(false);
  const [episodeRun, setEpisodeRun] = useState<EpisodeRunState>({ status: 'idle' });
  const [episodeElapsedSec, setEpisodeElapsedSec] = useState(0);
  const pendingSamplesRef = useRef<Record<string, unknown>[]>([]);
  const flushBusyRef = useRef(false);
  const episodeRunRef = useRef<EpisodeRunHandle | null>(null);
  const episodeCaptureRef = useRef<EpisodeCaptureHandle | null>(null);
  const [episodeFrameCount, setEpisodeFrameCount] = useState(0);
  const [episodeFrameTotal, setEpisodeFrameTotal] = useState(0);
  const [episodeFramesWarning, setEpisodeFramesWarning] = useState<string | null>(null);

  const episodeActive = episodeRun.status === 'starting'
    || episodeRun.status === 'recording'
    || episodeRun.status === 'finishing';

  const activeScenario = useMemo(
    () => (agriRun ? getSompoAgriScenario(agriRun.scenarioId) : SOMPO_SIMULATION_SCENARIOS[controls.scenarioId]),
    [agriRun, controls.scenarioId],
  );

  // Plano de gravação do cenário + desfecho atuais: null quando o desfecho
  // é manual ("livre") — sem roteiro não há instantes conhecidos de captura.
  const episodePlan = useMemo<SompoEpisodePlan | null>(
    () => (agriRun
      ? getSompoAgriEpisodePlan(agriRun.scenarioId, agriRun.outcomeId)
      : getSompoEpisodePlan(controls.scenarioId, controls.outcomeId)),
    [agriRun, controls.scenarioId, controls.outcomeId],
  );

  const episodePhaseLabel = useMemo(() => {
    const plan = episodeRunRef.current?.plan;
    if (!plan) return '';
    const elapsedMs = episodeElapsedSec * 1_000;
    const phase = plan.phases.find((item) => elapsedMs < item.endMs) || plan.phases[plan.phases.length - 1];
    return phase?.label || '';
  }, [episodeElapsedSec]);

  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);

  useEffect(() => {
    axisCalibrationRef.current = axisCalibration;
    window.localStorage.setItem(SOMPO_AXIS_CALIBRATION_STORAGE_KEY, JSON.stringify(axisCalibration));
  }, [axisCalibration]);

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
    // Durante a gravação de episódio, quem emite os valores é o relógio do run.
    if (isFirebase || episodeActive) return undefined;

    function emitSnapshot() {
      const snapshot = agriRun
        ? createSompoAgriSimulationSnapshot(agriRun.scenarioId, agriRun.outcomeId, {
          elapsedMs: performance.now() - startedAtRef.current,
          connectedAt: connectedAtRef.current,
        })
        : createSompoSimulationSnapshot(controls, {
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
  }, [agriRun, episodeActive, controls, isFirebase]);

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
        // A falha é transitória: preserve as amostras mais recentes para a
        // próxima tentativa, em vez de removê-las silenciosamente da janela.
        if (!cancelled) {
          pendingSamplesRef.current = [...batch, ...pendingSamplesRef.current]
            .slice(-SIMULATION_HISTORY_MAX_BATCH);
          setHistoryOffline(true);
        }
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

  // Gravação de episódio: dono do relógio, das amostras e do finish.
  useEffect(() => {
    if (episodeRun.status !== 'recording') return undefined;
    const handle = episodeRunRef.current;
    if (!handle) return undefined;
    const run: EpisodeRunHandle = handle;

    let settled = false;
    let activeFlush: Promise<void> | null = null;

    function stopTimers() {
      window.clearInterval(tickTimer);
      window.clearInterval(flushTimer);
    }

    function abortRun(message: string) {
      if (settled) return;
      settled = true;
      stopTimers();
      episodeRunRef.current = null;
      episodeCaptureRef.current = null;
      setEpisodeRun({ status: 'error', message });
      // Marca aborted no servidor; se a rede seguir fora, o timeout de 10 min resolve.
      void lucaApi.postSompoTelemetryEpisodeFinish(run.publicId, 'aborted').catch(() => undefined);
    }

    // Falha no envio dos frames NÃO derruba o episódio: os dados valem sozinhos,
    // mas o painel avisa que a análise seguirá sem evidência visual.
    async function uploadCapturedFrames() {
      const frames = episodeCaptureRef.current?.frames ?? [];
      if (frames.length === 0) return;
      try {
        // Um frame por request para ficar folgado no limite de body do servidor.
        for (const frame of frames) {
          await lucaApi.postSompoTelemetryEpisodeFrames(run.publicId, [frame]);
        }
      } catch {
        setEpisodeFramesWarning(
          'Falha ao enviar os frames do simulador — o episódio foi gravado, mas a análise seguirá sem evidência visual.',
        );
      }
    }

    async function finishRun() {
      if (settled) return;
      settled = true;
      stopTimers();
      setEpisodeRun({ status: 'finishing', publicId: run.publicId });
      try {
        // O timer pode ter removido um lote da fila enquanto o request ainda
        // está em voo. Espere esse lote antes de fechar o episódio no servidor.
        if (activeFlush) await activeFlush;
        while (run.queue.length > 0) {
          await lucaApi.postSompoTelemetrySimulation(
            run.queue.splice(0, SIMULATION_HISTORY_MAX_BATCH),
            run.publicId,
          );
        }
        await uploadCapturedFrames();
        const result = await lucaApi.postSompoTelemetryEpisodeFinish(run.publicId, 'complete');
        if (!result?.ok) throw new Error('sompo_episode_finish_failed');
        episodeRunRef.current = null;
        episodeCaptureRef.current = null;
        setEpisodeRun({ status: 'done', publicId: run.publicId });
        onEpisodeRecordedRef.current?.({
          publicId: run.publicId,
          kind: run.plan.kind,
          outcomeId: run.plan.outcomeId,
          outcomeLabel: run.plan.outcomeLabel,
        });
      } catch {
        episodeRunRef.current = null;
        episodeCaptureRef.current = null;
        setEpisodeRun({
          status: 'error',
          message: 'Falha de rede ao fechar o episódio — gravação abortada. O simulador continua ativo.',
        });
        void lucaApi.postSompoTelemetryEpisodeFinish(run.publicId, 'aborted').catch(() => undefined);
      }
    }

    const tickTimer = window.setInterval(() => {
      const elapsed = performance.now() - run.startedAt;
      if (elapsed >= run.plan.totalMs) {
        void finishRun();
        return;
      }
      // A telemetria gravada é o mesmo snapshot que o cenário emite em tela —
      // o episódio é literalmente "o que está na cena agora", do início ao desfecho.
      const snapshot = run.plan.catalog === 'agri'
        ? createSompoAgriSimulationSnapshot(run.plan.scenarioId, run.plan.outcomeId, {
          elapsedMs: elapsed,
          connectedAt: connectedAtRef.current,
        })
        : createSompoSimulationSnapshot(
          { scenarioId: run.plan.scenarioId as SompoSimulationScenarioId, outcomeId: run.plan.outcomeId },
          { elapsedMs: elapsed, connectedAt: connectedAtRef.current },
        );
      previewRef.current = snapshot;
      setPreview(snapshot);
      onTelemetryRef.current?.(snapshot);
      setEpisodeElapsedSec(Math.floor(elapsed / 1_000));
      if (elapsed - run.lastSampleMs >= run.plan.sampleIntervalMs) {
        run.lastSampleMs = elapsed;
        run.queue.push(snapshotToSimulationRaw(snapshot));
      }
    }, EPISODE_TICK_MS);

    function flushQueue(): Promise<void> | null {
      if (activeFlush) return activeFlush;
      const batch = run.queue.splice(0, SIMULATION_HISTORY_MAX_BATCH);
      if (batch.length === 0) return null;
      activeFlush = lucaApi.postSompoTelemetrySimulation(batch, run.publicId)
        .then(() => undefined)
        .finally(() => {
          activeFlush = null;
        });
      return activeFlush;
    }

    const flushTimer = window.setInterval(() => {
      void flushQueue()?.catch(() => abortRun(
        'Falha de rede ao gravar o episódio — gravação abortada. O simulador continua ativo.',
      ));
    }, SIMULATION_HISTORY_FLUSH_MS);

    return () => {
      stopTimers();
    };
  }, [episodeRun.status]);

  async function startEpisodeRun() {
    const plan = episodePlan;
    if (isFirebase || episodeActive || !plan) return;
    setEpisodeRun({ status: 'starting' });
    let publicId = '';
    try {
      const result = await lucaApi.postSompoTelemetryEpisodeStart({
        kind: plan.kind,
        trator: 'SIM-001',
        scenarioLabel: plan.scenarioLabel,
      });
      if (!result?.ok || !result.episode?.publicId) throw new Error('sompo_episode_start_failed');
      publicId = result.episode.publicId;
    } catch {
      setEpisodeRun({
        status: 'error',
        message: 'Não foi possível abrir o episódio no servidor. A gravação não começou; o simulador continua ativo.',
      });
      return;
    }
    // O relógio do cenário zera no início da gravação: o episódio registra o
    // roteiro inteiro e a cena rejoga junto — os dois palcos leem o mesmo ref.
    const startedAt = performance.now();
    startedAtRef.current = startedAt;
    connectedAtRef.current = new Date().toISOString();
    episodeRunRef.current = {
      publicId,
      startedAt,
      queue: [],
      lastSampleMs: Number.NEGATIVE_INFINITY,
      plan,
    };
    episodeCaptureRef.current = { nextIndex: 0, frames: [] };
    setEpisodeFrameCount(0);
    setEpisodeFrameTotal(plan.frameMoments.length);
    setEpisodeFramesWarning(null);
    setEpisodeElapsedSec(0);
    setEpisodeRun({ status: 'recording', publicId });
    onEpisodeRecordedRef.current?.(null);
  }

  /**
   * Captura o frame do canvas quando o relógio do run passa por um momento
   * nomeado do plano. Chamado no mesmo rAF do render nos dois palcos.
   */
  function captureDueEpisodeFrames(canvas: HTMLCanvasElement) {
    const capture = episodeCaptureRef.current;
    const run = episodeRunRef.current;
    if (!capture || !run) return;
    const elapsedMs = performance.now() - run.startedAt;
    while (capture.nextIndex < run.plan.frameMoments.length) {
      const moment = run.plan.frameMoments[capture.nextIndex];
      if (elapsedMs < moment.offsetMs) break;
      capture.nextIndex += 1;
      if (elapsedMs - moment.offsetMs > EPISODE_FRAME_LATE_TOLERANCE_MS) continue;
      const dataUrl = captureEpisodeFrameDataUrl(canvas);
      if (!dataUrl) continue;
      capture.frames.push({
        dataUrl,
        offsetMs: moment.offsetMs,
        fase: moment.fase,
        label: moment.label,
      });
      setEpisodeFrameCount(capture.frames.length);
    }
  }

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    // Palco agrícola: renderer independente (campo + equipamento gerado),
    // montado no mesmo canvas sem tocar no fluxo do caminhão rural.
    if (agriRun) {
      setModelStatus('loading');
      setModelAsset(null);
      const stage = mountSompoAgriStage({
        mount,
        scenarioId: agriRun.scenarioId,
        outcomeId: agriRun.outcomeId,
        startedAtRef,
        onModelStatus: (status, asset) => {
          setModelStatus(status);
          setModelAsset(asset);
        },
        onWebglError: () => setWebglError(true),
        onAfterRender: captureDueEpisodeFrames,
      });
      if (!stage) return undefined;
      setWebglError(false);
      sceneApiRef.current = stage;
      return () => {
        sceneApiRef.current = null;
        stage.dispose();
      };
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
      setWebglError(false);
    } catch {
      setWebglError(true);
      return undefined;
    }

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 360);
    camera.position.set(9.7, 4.3, 11.2);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x07100c, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    mount.appendChild(renderer.domElement);

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
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -12; keyLight.shadow.camera.right = 12;
    keyLight.shadow.camera.top = 12; keyLight.shadow.camera.bottom = -12;
    keyLight.shadow.camera.near = 0.5; keyLight.shadow.camera.far = 65;
    keyLight.shadow.normalBias = 0.018;
    keyLight.shadow.bias = -0.0001;
    keyLight.shadow.radius = 2;
    scene.add(keyLight);
    // A sombra acompanha o caminhão pelo mundo: luz e alvo transladam juntos.
    scene.add(keyLight.target);
    const roadScene = createSompoRoadScene(scene, renderer, camera);
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
    truckPoseGroup.rotation.order = isFirebase ? SOMPO_EULER_ORDER : 'XYZ';
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
    const scenarioEffects = createSompoScenarioEffects(scene, truckModel, camera);
    const assetAbort = new AbortController();
    setModelStatus('loading');
    setModelAsset(null);
    truckGroup.visible = false;
    void loadSompoTruckAsset(truckModel, assetAbort.signal)
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

    sceneApiRef.current = {
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
          camera.position.set(truckPoseGroup.position.x + 9.7, 4.3, 11.2);
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
      const frameDelta = Math.max(0, (time - previousTime) / 1_000);
      const delta = Math.min(0.04, frameDelta);
      previousTime = time;
      const settings = controlsRef.current;
      const snapshot = previewRef.current;
      const visualScenario = isFirebase ? 'normal' : settings.scenarioId;
      const scenarioElapsed = time - startedAtRef.current;
      const visualElapsed = scenarioElapsed;
      const effectOutcomeId = settings.outcomeId;
      const effectFrame = getSompoScenarioEffects(visualScenario, visualElapsed, effectOutcomeId);
      const ruralFrame = !isFirebase
        ? getSompoRuralFrame(settings.scenarioId, scenarioElapsed, settings.outcomeId)
        : null;

      // ── Deslocamento real no mundo ────────────────────────────────────────
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
        deltaSeconds: reduceMotion.matches ? 0 : delta,
      }, axisCalibrationRef.current);
      const pitch = isFirebase
        ? sensorPose.rotationZ
        : THREE.MathUtils.degToRad(snapshot.readings.pitch ?? settings.pitch);
      const roll = isFirebase
        ? sensorPose.rotationX
        : THREE.MathUtils.degToRad(snapshot.readings.roll ?? settings.roll);
      const poseDamping = frameDamping(frameDelta, 5);
      if (reduceMotion.matches) {
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
        truckPoseGroup.rotation.y = dampAngle(
          truckPoseGroup.rotation.y,
          THREE.MathUtils.degToRad(targetYaw),
          reduceMotion.matches ? 1 : frameDamping(frameDelta, 7.5),
        );
        truckPoseGroup.position.z = targetLateral;
      }
      const brakingState = !isFirebase && !ruralFrame && settings.scenarioId === SOMPO_BRAKING_SCRIPT.scenarioId
        ? getSompoBrakingScriptState(scenarioElapsed, settings.speedKph)
        : null;
      const liveActivity = isFirebase
        ? THREE.MathUtils.clamp((snapshot.readings.rotation?.magnitude || 0) * 0.012, 0, 0.1)
        : (ruralFrame?.roughness ?? settings.roughness) * 0.008 * (brakingState ? Math.min(1, brakingState.speedKph / 8) : 1);
      // Rampas roteirizadas ("vence a rampa", "desce controlado") mudam o perfil
      // do terreno junto com o pitch do roteiro; a cabine (mergulho de frenagem)
      // não gira o mundo — por isso brake-failure usa o pitch fixo do preset.
      const slope = !isFirebase && ['steep-climb', 'steep-descent', 'brake-failure'].includes(settings.scenarioId)
        ? THREE.MathUtils.degToRad(settings.scenarioId === 'brake-failure' ? settings.pitch : (ruralFrame?.pitch ?? settings.pitch))
        : 0;
      relativeGroundRotation.copy(truckPoseGroup.rotation);
      relativeGroundRotation.z -= slope;
      const targetHeight = slope
        ? truckGroundHeight(relativeGroundRotation, truckGroup.userData.groundSupport) / Math.cos(slope)
        : truckGroundHeight(truckPoseGroup.rotation, truckGroup.userData.groundSupport);
      truckBaseHeight = reduceMotion.matches
        ? targetHeight
        : THREE.MathUtils.lerp(truckBaseHeight, targetHeight, frameDamping(frameDelta, 7.5));
      truckPoseGroup.position.y = truckBaseHeight - (ruralFrame?.sink ?? 0)
        + (reduceMotion.matches ? 0 : Math.sin(time * 0.008) * liveActivity);
      if (focusTarget === 'sensor') {
        sensorGroup.getWorldPosition(focusPoint);
      } else {
        focusPoint.set(truckPoseGroup.position.x + effectFrame.focusX, truckPoseGroup.position.y, truckPoseGroup.position.z);
      }
      // A câmera acompanha o deslocamento: o alvo persegue o caminhão e a câmera
      // translada junto, preservando o ângulo escolhido pelo operador no orbit.
      const targetXBefore = orbit.target.x;
      orbit.target.lerp(focusPoint, reduceMotion.matches ? 1 : frameDamping(frameDelta, 5));
      camera.position.x += orbit.target.x - targetXBefore;
      const drivingSpeed = ruralFrame?.speedKph ?? brakingState?.speedKph ?? settings.speedKph;
      if (!isFirebase && !reduceMotion.matches) {
        // Rodas giram coerentes com a velocidade real sobre o solo (ou patinam
        // quando o roteiro manda wheelSpeedKph diferente do avanço).
        const wheelSpeed = (ruralFrame?.wheelSpeedKph ?? drivingSpeed) * (ruralFrame?.direction ?? 1);
        for (const wheel of wheels) wheel.rotation.y -= delta * wheelSpeed / (3.6 * (wheel.userData.radius ?? 0.60));
      }
      roadScene.update(effectFrame, ruralFrame, visualElapsed, truckPoseGroup.position, reduceMotion.matches, slope, { animalAnchorX });
      keyLight.position.set(truckWorldX - 10, 12, 9);
      keyLight.target.position.set(truckWorldX, 0, truckPoseGroup.position.z);
      keyLight.intensity = (ruralFrame?.rain ?? 0) > 0 ? 0.25 : roadScene.hasHdri ? 1.8 : 2.4;
      obstacleGroup.visible = isFirebase || settings.scenarioId === 'obstacle' || settings.scenarioId === 'brake-failure';
      const rangeLength = rangeForDistance(snapshot.readings.distance);
      rayGroup.scale.x = rangeLength;
      // Alvo do feixe ultrassônico: anotação de sensor à frente do caminhão.
      obstacleGroup.position.x = truckWorldX + SOMPO_TRUCK_FRONT_X + rangeLength;
      obstacleGroup.position.y = Math.tan(slope) * (obstacleGroup.position.x - truckWorldX);
      rayMaterial.color.set(snapshot.risks.collision ? 0xff5d52 : 0x7dff9a);
      rayMaterial.opacity = snapshot.risks.collision ? 1 : 0.68;
      ledMaterial.color.set(snapshot.status === 'alert' ? 0xff5d52 : 0x7dff9a);
      ledMaterial.emissive.set(snapshot.status === 'alert' ? 0xff2d22 : 0x2dff6b);
      ledMaterial.emissiveIntensity = reduceMotion.matches ? 2.4 : 2.2 + (Math.sin(time * 0.007) * 1.1);
      if (!isFirebase) scenarioEffects.update(effectFrame, visualElapsed, visualScenario, drivingSpeed, reduceMotion.matches, slope, effectOutcomeId ?? '', truckWorldX);
      orbit.update();
      postProcessing.render(delta);
      // Captura síncrona no mesmo rAF do render: o framebuffer WebGL ainda está
      // válido sem precisar de preserveDrawingBuffer.
      captureDueEpisodeFrames(renderer.domElement);
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
      assetAbort.abort();
      roadScene.dispose();
      scenarioEffects.dispose();
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
      postProcessing.dispose();
      environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [agriRun, isFirebase]);

  function selectScenario(scenarioId: SompoSimulationScenarioId | SompoAgriScenarioId, outcomeId?: string) {
    if (episodeActive) return;
    startedAtRef.current = performance.now();
    connectedAtRef.current = new Date().toISOString();
    // Um episódio "done"/"error" era do cenário anterior: limpa para a bancada
    // não oferecer análise de um episódio que não corresponde à cena atual.
    setEpisodeRun({ status: 'idle' });
    onEpisodeRecordedRef.current?.(null);
    if (isSompoAgriScenarioId(scenarioId)) {
      const outcomes = getSompoAgriOutcomes(scenarioId);
      const outcome = outcomes.find((item) => item.id === outcomeId) || outcomes[0];
      setAgriRun({ scenarioId, outcomeId: outcome.id });
      return;
    }
    setAgriRun(null);
    setControls(controlsForScenario(scenarioId, outcomeId));
  }

  function updateNumber(
    key: 'distance' | 'temperature' | 'humidity' | 'pitch' | 'roll',
    value: number,
  ) {
    setControls((current) => ({ ...current, [key]: value }));
  }

  function restartScenario() {
    if (agriRun) selectScenario(agriRun.scenarioId, agriRun.outcomeId);
    else selectScenario(controls.scenarioId, controls.outcomeId);
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

  const agriPreview = !isFirebase && agriRun
    ? getSompoAgriFrame(agriRun.scenarioId, preview.deviceTimestamp ?? 0, agriRun.outcomeId)
    : null;
  const ruralPreview = !isFirebase && !agriRun
    ? getSompoRuralFrame(controls.scenarioId, preview.deviceTimestamp ?? 0, controls.outcomeId)
    : null;
  const brakingPreview = !isFirebase && !agriRun && !ruralPreview && controls.scenarioId === SOMPO_BRAKING_SCRIPT.scenarioId
    ? getSompoBrakingScriptState(preview.deviceTimestamp ?? 0, controls.speedKph)
    : null;
  const activeScript = agriRun ? null : getSompoScenarioScript(controls.scenarioId, controls.outcomeId);
  const scenarioScripted = agriRun ? true : !!activeScript;
  const scenarioTotalMs = agriRun ? getSompoAgriScenario(agriRun.scenarioId).totalMs : activeScript?.totalMs;
  const scenarioOutcomes = agriRun ? getSompoAgriOutcomes(agriRun.scenarioId) : getSompoScenarioOutcomes(controls.scenarioId);
  const activeOutcomeId = agriRun ? agriRun.outcomeId : controls.outcomeId;
  const activeOutcome = scenarioOutcomes.find((item) => item.id === activeOutcomeId) || scenarioOutcomes[0];
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
      data-sompo-model={modelStatus}
      data-sompo-asset={modelAsset ?? undefined}
    >
      <header className="sompo-simulator-head">
        <div>
          <span><BoxIcon /> {isFirebase ? 'Gêmeo digital' : 'Laboratório virtual'}</span>
          <h2 id="sompo-simulator-title">
            {isFirebase ? 'Caminhão 3D acoplado ao dispositivo físico' : 'Estrada rural · laboratório de sinistros'}
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
              : agriRun
                ? `Modelo 3D interativo de ${activeScenario.label.toLowerCase()} com telemetria virtual. Setas esquerda e direita giram; setas para cima e para baixo controlam o zoom.`
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
          <p className="sompo-simulator-hint">Arraste para girar · use as setas para navegar</p>
          <p className="sompo-simulator-credit">
            {agriRun ? (
              modelStatus === 'gltf'
                ? `${modelAsset ?? 'Equipamento agrícola'} · imagem → 3D por LUCA-AI`
                : modelStatus === 'loading' ? 'Carregando equipamento agrícola…' : 'Silhueta nominal · GLB agrícola indisponível'
            ) : modelAsset === 'GeneratedRuralTruck' ? 'Caminhão rural · imagem → 3D por LUCA-AI · adaptado com sensor' : modelStatus === 'gltf' ? <>
              <a href="https://sketchfab.com/3d-models/tesla-semi-39ffc7c746184e0c9ebd5bbcd0b405dd" target="_blank" rel="noreferrer">Tesla Semi © 2018 Oleksii Rozumnyi</a>
              {' · '}<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> · adaptado com sensor
            </> : modelStatus === 'loading' ? 'Carregando caminhão detalhado…' : 'Modelo simplificado · arquivo detalhado indisponível'}
          </p>
        </div>

        {isFirebase ? (
          <LiveReadings
            telemetry={preview}
            calibration={axisCalibration}
            onCalibrationChange={(key, value) => setAxisCalibration((current) => ({ ...current, [key]: value }))}
            onCalibrationReset={() => setAxisCalibration({ ...DEFAULT_SOMPO_AXIS_CALIBRATION })}
            onRecenterHeading={() => sceneApiRef.current?.recenterHeading()}
          />
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
              disabled={episodeActive}
              aria-label="Reiniciar cenário"
              title="Reiniciar cenário"
            >
              <RotateCcw />
            </button>
          </div>

          <label className="sompo-scenario-select">
            <span>Escolha entre {SCENARIO_IDS.length + AGRI_SCENARIO_IDS.length} cenários</span>
            <select name="sompo-scenario" value={agriRun ? agriRun.scenarioId : controls.scenarioId} disabled={episodeActive} onChange={(event) => selectScenario(event.target.value as SompoSimulationScenarioId | SompoAgriScenarioId)}>
              <optgroup label="Sinistros e emergências · roteiros">
                {SCENARIO_IDS.filter((id) => !!SOMPO_RURAL_SCRIPTS[id]).map((id) => <option key={id} value={id}>{SOMPO_SIMULATION_SCENARIOS[id].label}</option>)}
              </optgroup>
              <optgroup label="Operação, terreno e manobras">
                {SCENARIO_IDS.filter((id) => !SOMPO_RURAL_SCRIPTS[id]).map((id) => <option key={id} value={id}>{SOMPO_SIMULATION_SCENARIOS[id].label}</option>)}
              </optgroup>
              <optgroup label="Operações agrícolas · trator e colheitadeira">
                {AGRI_SCENARIO_IDS.map((id) => <option key={id} value={id}>{SOMPO_AGRI_SCENARIOS[id].label}</option>)}
              </optgroup>
            </select>
          </label>
          {scenarioOutcomes.length > 1 && (
            <label className="sompo-scenario-select sompo-outcome-select">
              <span>Desfecho do cenário</span>
              <select
                value={activeOutcomeId}
                name="sompo-scenario-outcome"
                disabled={episodeActive}
                data-sompo-outcome
                onChange={(event) => selectScenario(agriRun ? agriRun.scenarioId : controls.scenarioId, event.target.value)}
              >
                {scenarioOutcomes.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
              {activeOutcome && <small>{activeOutcome.description}</small>}
            </label>
          )}
          {(ruralPreview || agriPreview) && (
            <div className="sompo-scenario-phase">
              <span role="status">{(ruralPreview ?? agriPreview)!.phaseLabel}</span>
              <strong>{formatReading((ruralPreview ?? agriPreview)!.speedKph, ' km/h')}{(ruralPreview ?? agriPreview)!.direction < 0 ? ' · ré' : ''}</strong>
              <progress max={scenarioTotalMs} value={Math.min(preview.deviceTimestamp ?? 0, scenarioTotalMs ?? 1)} />
              <small>O roteiro conduz os valores abaixo. Use ↻ para repetir.</small>
            </div>
          )}

          <div className="sompo-simulator-episode" data-sompo-episode-panel>
            <button
              type="button"
              className="sompo-simulator-episode-run"
              data-sompo-episode-run
              disabled={episodeActive || !episodePlan}
              onClick={() => void startEpisodeRun()}
            >
              <Disc /> {episodeActive ? 'Gravando episódio…' : 'Gravar episódio deste cenário'}
            </button>
            {!episodePlan && !episodeActive && (
              <p className="sompo-simulator-episode-status" data-sompo-episode-manual>
                Este desfecho é manual e não gera episódio — escolha um desfecho roteirizado para gravar.
              </p>
            )}
            {episodeRun.status === 'starting' && (
              <p className="sompo-simulator-episode-status" role="status">
                Abrindo episódio no servidor…
              </p>
            )}
            {episodeRun.status === 'recording' && (
              <p className="sompo-simulator-episode-status" role="status" data-sompo-episode-recording>
                Gravando episódio… {episodeElapsedSec}s · fase: {episodePhaseLabel}
                {' '}· frames: {episodeFrameCount}/{episodeFrameTotal}
              </p>
            )}
            {episodeRun.status === 'finishing' && (
              <p className="sompo-simulator-episode-status" role="status">
                Fechando episódio…
              </p>
            )}
            {episodeRun.status === 'done' && (
              <p className="sompo-simulator-episode-status is-done" role="status" data-sompo-episode-done>
                Episódio registrado. Use “Analisar episódio na bancada” no painel abaixo.
              </p>
            )}
            {episodeRun.status === 'error' && (
              <p className="sompo-simulator-episode-status is-error" role="alert" data-sompo-episode-error>
                {episodeRun.message}
              </p>
            )}
            {episodeFramesWarning && (
              <p
                className="sompo-simulator-episode-status is-error"
                role="alert"
                data-sompo-episode-frames-warning
              >
                {episodeFramesWarning}
              </p>
            )}
          </div>

          <div className="sompo-simulator-ranges">
            {brakingPreview && (
              <p role="status">
                {brakingPreview.phaseLabel}
                {' · '}{formatReading(brakingPreview.speedKph, ' km/h')}
              </p>
            )}
            <label>
              <span>Distância frontal <strong>{scenarioScripted ? (preview.readings.distance ?? controls.distance) : controls.distance} cm</strong></span>
              <input
                type="range"
                min="5"
                max="300"
                step="1"
                value={scenarioScripted ? (preview.readings.distance ?? controls.distance) : controls.distance}
                disabled={episodeActive || scenarioScripted}
                name="sompo-distance"
                onChange={(event) => updateNumber('distance', Number(event.target.value))}
              />
            </label>
            <label>
              <span>Pitch <strong>{scenarioScripted ? (preview.readings.pitch ?? controls.pitch) : controls.pitch}°</strong></span>
              <input
                type="range"
                min="-25"
                max="25"
                step="0.5"
                value={scenarioScripted ? (preview.readings.pitch ?? controls.pitch) : controls.pitch}
                disabled={episodeActive || scenarioScripted}
                name="sompo-pitch"
                onChange={(event) => updateNumber('pitch', Number(event.target.value))}
              />
            </label>
            <label>
              <span>Roll <strong>{scenarioScripted ? (preview.readings.roll ?? controls.roll) : controls.roll}°</strong></span>
              <input
                type="range"
                min="-25"
                max={scenarioScripted ? 90 : 25}
                step="0.5"
                value={scenarioScripted ? (preview.readings.roll ?? controls.roll) : controls.roll}
                disabled={episodeActive || scenarioScripted}
                name="sompo-roll"
                onChange={(event) => updateNumber('roll', Number(event.target.value))}
              />
            </label>
            <label>
              <span>Temperatura <strong>{scenarioScripted ? (preview.readings.temperature ?? controls.temperature) : controls.temperature} °C</strong></span>
              <input
                type="range"
                min="-10"
                max="70"
                step="1"
                value={scenarioScripted ? (preview.readings.temperature ?? controls.temperature) : controls.temperature}
                disabled={episodeActive || scenarioScripted}
                name="sompo-temperature"
                onChange={(event) => updateNumber('temperature', Number(event.target.value))}
              />
            </label>
            <label>
              <span>Umidade <strong>{scenarioScripted ? (preview.readings.humidity ?? controls.humidity) : controls.humidity}%</strong></span>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={scenarioScripted ? (preview.readings.humidity ?? controls.humidity) : controls.humidity}
                disabled={episodeActive || scenarioScripted}
                name="sompo-humidity"
                onChange={(event) => updateNumber('humidity', Number(event.target.value))}
              />
            </label>
          </div>

          <div className="sompo-simulator-flags" role="group" aria-label="Flags sintéticas do cenário">
            <button
              type="button"
              aria-pressed={scenarioScripted ? preview.risks.collision : controls.collisionRisk}
              disabled={episodeActive || scenarioScripted}
              onClick={() => setControls((current) => ({ ...current, collisionRisk: !current.collisionRisk }))}
            >
              {(scenarioScripted ? preview.risks.collision : controls.collisionRisk) ? <ShieldAlert /> : <ShieldCheck />}
              Colisão {(scenarioScripted ? preview.risks.collision : controls.collisionRisk) ? 'ativa' : 'livre'}
            </button>
            <button
              type="button"
              aria-pressed={scenarioScripted ? preview.risks.inclination : controls.inclinationRisk}
              disabled={episodeActive || scenarioScripted}
              onClick={() => setControls((current) => ({ ...current, inclinationRisk: !current.inclinationRisk }))}
            >
              {(scenarioScripted ? preview.risks.inclination : controls.inclinationRisk) ? <ShieldAlert /> : <ShieldCheck />}
              Inclinação {(scenarioScripted ? preview.risks.inclination : controls.inclinationRisk) ? 'ativa' : 'livre'}
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
