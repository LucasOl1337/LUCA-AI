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
  Map as MapIcon,
  Play,
  Pause,
  SlidersHorizontal,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Truck,
} from 'lucide-react';
import SompoStudio, { type SompoStudioAsset } from './sompo/SompoStudio';
// geofencing (módulo src/geofencing): painel, mapa, HUD e campos da amostra só existem nos cenários com talhão.
import SompoGeofenceMap from '../geofencing/SompoGeofenceMap';
import SompoGeofencePanel from '../geofencing/SompoGeofencePanel';
import SompoGeofenceReadout from '../geofencing/SompoGeofenceReadout';
import { sompoGeofenceRawFields } from '../geofencing/sompoGeofenceRaw';
import { withSompoAgriGeofence, type SompoAgriMaybeGeofenceSnapshot } from '../../shared/geofencing/index.js';
import { createSompoPlayback } from './sompo/sompoPlayback';
import { downloadSompoFile, loadSompoStudioConfig, type SompoStudioConfig, type SompoRenderStats } from './sompo/sompoStudioConfig';
import { mountSompoRuralStage } from './sompo/createSompoRuralStage';
import type { SompoTelemetrySnapshot } from '@/lib/types';
import { lucaApi } from '@/lib/api';
import { sompoRequestedScenarioAction } from '@/lib/sompo-scenario-selection';
import {
  DEFAULT_SOMPO_AXIS_CALIBRATION,
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
import {
  SOMPO_RURAL_SCRIPTS,
  getSompoRuralFrame,
  SOMPO_BRAKING_SCRIPT,
  getSompoBrakingScriptState,
  SOMPO_SIMULATION_SCENARIOS,
  createSompoSimulationSnapshot,
  getSompoEpisodePlan,
  sompoEpisodeSampleOffsets,
  getSompoScenarioOutcomes,
  getSompoScenarioScript,
  getSompoSimulationScenario,
  type SompoEpisodePlan,
  type SompoSimulationControls,
  type SompoSimulationScenarioId,
} from '../../shared/sompo-telemetry-simulator.js';
import { sompoDistanceSensorCopy } from '../../shared/sompo-distance-sensor.js';
import { usePhysicalTwin } from './sompo/usePhysicalTwin';
import PhysicalTwinPanel, { PhysicalTwinOverlay } from './sompo/PhysicalTwinPanel';

interface SompoTruckSimulatorProps {
  source: 'firebase' | 'simulation';
  telemetry?: SompoTelemetrySnapshot | null;
  onTelemetry?: (snapshot: SompoTelemetrySnapshot) => void;
  onEpisodeRecorded?: (episode: { publicId: string; kind: string; outcomeId?: string; outcomeLabel?: string } | null) => void;
  /** Cenário/desfecho pedidos pela URL (?cenario=&desfecho=): abrem direto no roteiro. */
  requestedScenario?: string;
  requestedOutcome?: string;
  /** Devolve a seleção do dropdown para a URL, para a faixa de regulação acompanhar. */
  onScenarioSelect?: (scenarioId: string, outcomeId: string) => void;
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
  observedStartMs: number;
  queue: Record<string, unknown>[];
  lastSampleMs: number;
  plan: SompoEpisodePlan;
  controls: SompoSimulationControls;
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
  exportModel?: () => Promise<ArrayBuffer>;
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
const EPISODE_TICK_MS = 250;
const EPISODE_FRAME_WIDTH = 640;
const EPISODE_FRAME_JPEG_QUALITY = 0.7;
// Aba oculta pausa o rAF: momento perdido há mais de 1s não vira frame mentiroso.
const EPISODE_FRAME_LATE_TOLERANCE_MS = 1_000;

/**
 * Captura síncrona após o render. O buffer WebGL ainda está preenchido no
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

// geofencing (módulo shared/geofencing): cenário com talhão ganha posição, radar e bandeira de proximidade;
// os demais cenários saem de createSompoAgriSimulationSnapshot exatamente como antes.
const agriSnapshot: typeof createSompoAgriSimulationSnapshot = (scenarioId, outcomeId, options) =>
  withSompoAgriGeofence(createSompoAgriSimulationSnapshot(scenarioId, outcomeId, options), scenarioId, outcomeId, options?.elapsedMs ?? 0);

function snapshotToSimulationRaw(snapshot: SompoTelemetrySnapshot): Record<string, unknown> {
  const readings = snapshot.readings;
  return {
    ...sompoGeofenceRawFields(snapshot), // geofencing: vazio fora dos cenários com talhão
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
    velocidade: readings.speedKph,
    velocidadeRoda: readings.wheelSpeedKph,
    riscoColisao: snapshot.risks.collision,
    riscoInclinacao: snapshot.risks.inclination,
    scenarioLabel: snapshot.source.scenarioLabel,
    observedAt: snapshot.observedAt,
  };
}

function formatReading(value: number | null | undefined, suffix: string) {
  if (!Number.isFinite(value)) return '-';
  return `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${suffix}`;
}

function LiveReadings({
  telemetry,
  replaying = false,
  calibration,
  onCalibrationChange,
  onCalibrationReset,
  onRecenterHeading,
}: {
  telemetry: SompoTelemetrySnapshot;
  replaying?: boolean;
  calibration: SompoAxisCalibration;
  onCalibrationChange: (key: keyof SompoAxisCalibration, value: boolean) => void;
  onCalibrationReset: () => void;
  onRecenterHeading: () => void;
}) {
  return (
    <aside className="sompo-simulator-controls sompo-simulator-live-readings" aria-label="Leituras que movimentam o gêmeo digital">
      <div className="sompo-simulator-control-head">
        <div>
          <span>{replaying ? 'Leituras gravadas · replay' : 'Telemetria acoplada'}</span>
          <strong>Trator {telemetry.tractorId}</strong>
          <p>{replaying ? 'Valores do evento selecionado. Volte ao vivo para acompanhar o dispositivo agora.' : telemetry.freshness === 'fresh' && telemetry.connection.state === 'live' ? 'Cena atualizada pelo snapshot; nenhum comando é enviado ao equipamento.' : 'Último snapshot preservado. Movimento interrompido até confirmar a atualização dos sensores.'}</p>
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
          {telemetry.freshness !== 'fresh' || telemetry.risks.collision === null ? <Siren /> : telemetry.risks.collision ? <ShieldAlert /> : <ShieldCheck />}
          <span><small>Colisão</small><strong>{telemetry.freshness !== 'fresh' || telemetry.connection.state !== 'live' ? 'Último snapshot' : telemetry.risks.collision === null ? 'Não informado' : telemetry.risks.collision ? 'Alerta ativo' : 'Sem flag ativa'}</strong></span>
        </div>
        <div data-alert={telemetry.risks.inclination}>
          {telemetry.freshness !== 'fresh' || telemetry.risks.inclination === null ? <Siren /> : telemetry.risks.inclination ? <ShieldAlert /> : <ShieldCheck />}
          <span><small>Inclinação</small><strong>{telemetry.freshness !== 'fresh' || telemetry.connection.state !== 'live' ? 'Último snapshot' : telemetry.risks.inclination === null ? 'Não informado' : telemetry.risks.inclination ? 'Alerta ativo' : 'Sem flag ativa'}</strong></span>
        </div>
      </div>

      <details className="sompo-axis-calibration" data-sompo-axis-calibration>
        <summary>Calibração de eixos</summary>
        <p>
          Incline o caminhão físico e ajuste até a tela seguir a mesma direção. O rumo é integrado
          do giroscópio e não tem norte: depois de várias curvas ele acumula erro: recentre com o
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
  requestedScenario = '',
  requestedOutcome = '',
  onScenarioSelect,
}: SompoTruckSimulatorProps) {
  const isFirebase = source === 'firebase';
  const physicalTwin = usePhysicalTwin(telemetry, isFirebase);
  const [studioOpen, setStudioOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false); // Mapa do talhão no lugar dos controles; a cena 3D continua rodando.
  const [studioConfig, setStudioConfig] = useState<SompoStudioConfig>(loadSompoStudioConfig);
  const studioRef = useRef(studioConfig);
  studioRef.current = { ...studioConfig, exploded: studioOpen ? studioConfig.exploded : 0, wireframe: studioOpen && studioConfig.wireframe };
  const [renderStats, setRenderStats] = useState<SompoRenderStats | null>(null);
  const [playing, setPlaying] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const playback = useRef(createSompoPlayback());
  const snapshotRequested = useRef(false);
  const historyReplay = useRef(false);
  const [captureMessage, setCaptureMessage] = useState('');
  const [controls, setControls] = useState<SompoSimulationControls>(INITIAL_CONTROLS);
  const [agriRun, setAgriRun] = useState<SompoAgriRun | null>(() => !isFirebase && ['tractor', 'harvester'].includes(studioConfig.equipment) ? { scenarioId: studioConfig.equipment === 'harvester' ? 'agri-harvest-dust' : 'agri-field-bogging', outcomeId: studioConfig.equipment === 'harvester' ? 'clean-pass' : getSompoAgriOutcomes('agri-field-bogging')[0].id } : null);
  const [axisCalibration, setAxisCalibration] = useState<SompoAxisCalibration>(loadAxisCalibration);
  const [preview, setPreview] = useState<SompoAgriMaybeGeofenceSnapshot>(() => (
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
  const [modelStatus, setModelStatus] = useState<'loading' | 'gltf' | 'fallback' | 'modular'>('loading');
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

  const episodeActiveRef = useRef(episodeActive);
  episodeActiveRef.current = episodeActive;
  function getElapsed(now: number) {
    return episodeActiveRef.current ? now - startedAtRef.current : playback.current.read(now, startedAtRef.current);
  }

  const activeScenario = useMemo(
    () => (agriRun ? getSompoAgriScenario(agriRun.scenarioId) : SOMPO_SIMULATION_SCENARIOS[controls.scenarioId]),
    [agriRun, controls.scenarioId],
  );
  const distanceSensorCopy = sompoDistanceSensorCopy(preview.source.distanceSensorPosition);

  // Plano de gravação do cenário + desfecho atuais: null quando o desfecho
  // é manual ("livre"), sem roteiro não há instantes conhecidos de captura.
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
    if (!isFirebase || !physicalTwin.snapshot) return;
    previewRef.current = physicalTwin.snapshot;
    setPreview(physicalTwin.snapshot);
  }, [isFirebase, physicalTwin.snapshot]);

  useEffect(() => {
    // Durante a gravação de episódio, quem emite os valores é o relógio do run.
    if (isFirebase || episodeActive) return undefined;

    function emitSnapshot() {
      const snapshot = agriRun
        ? agriSnapshot(agriRun.scenarioId, agriRun.outcomeId, {
          elapsedMs: getElapsed(performance.now()),
          connectedAt: connectedAtRef.current,
        })
        : createSompoSimulationSnapshot(controls, {
          elapsedMs: getElapsed(performance.now()),
          connectedAt: connectedAtRef.current,
        });
      previewRef.current = snapshot;
      setPreview(snapshot);
      onTelemetryRef.current?.(snapshot);
      if (!studioOpen && !historyReplay.current && playing && playbackRate === 1) pendingSamplesRef.current.push(snapshotToSimulationRaw(snapshot));
      if (pendingSamplesRef.current.length > SIMULATION_HISTORY_MAX_BATCH) {
        pendingSamplesRef.current = pendingSamplesRef.current.slice(-SIMULATION_HISTORY_MAX_BATCH);
      }
    }

    emitSnapshot();
    const timer = window.setInterval(emitSnapshot, 250);
    return () => window.clearInterval(timer);
  }, [agriRun, episodeActive, controls, isFirebase, studioOpen, playing, playbackRate]);

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
      if (frames.length < run.plan.frameMoments.length) {
        setEpisodeFramesWarning(`${frames.length}/${run.plan.frameMoments.length} quadros capturados. O episódio mantém as amostras; quadros ausentes não serão inventados.`);
      }
      if (frames.length === 0) return;
      let uploaded = 0;
      try {
        // Um frame por request para ficar folgado no limite de body do servidor.
        for (const frame of frames) {
          await lucaApi.postSompoTelemetryEpisodeFrames(run.publicId, [frame]);
          uploaded += 1;
        }
      } catch {
        setEpisodeFramesWarning(
          `Falha ao enviar os frames do simulador. O episódio foi gravado, mas a análise seguirá sem evidência visual. Enviados: ${uploaded}/${frames.length}.`,
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
          message: 'Falha de rede ao fechar o episódio. Gravação abortada. O simulador continua ativo.',
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
      // A telemetria gravada é o mesmo snapshot que o cenário emite em tela -
      // o episódio é literalmente "o que está na cena agora", do início ao desfecho.
      const snapshot = run.plan.catalog === 'agri'
        ? agriSnapshot(run.plan.scenarioId, run.plan.outcomeId, {
          elapsedMs: elapsed,
          connectedAt: connectedAtRef.current,
        })
        : createSompoSimulationSnapshot(
          run.controls,
          { elapsedMs: elapsed, connectedAt: connectedAtRef.current },
        );
      previewRef.current = snapshot;
      setPreview(snapshot);
      onTelemetryRef.current?.(snapshot);
      setEpisodeElapsedSec(Math.floor(elapsed / 1_000));
      // Amostras seguem a grade do plano com relógio próprio: se o tick atrasa,
      // os pontos cruzados são recuperados com o offset original, não o do tick.
      for (const offset of sompoEpisodeSampleOffsets(run.lastSampleMs, elapsed, run.plan.sampleIntervalMs, run.plan.totalMs)) {
        const sample = run.plan.catalog === 'agri'
          ? agriSnapshot(run.plan.scenarioId, run.plan.outcomeId, {
            elapsedMs: offset,
            observedAt: new Date(run.observedStartMs + offset).toISOString(),
            connectedAt: connectedAtRef.current,
          })
          : createSompoSimulationSnapshot(
            run.controls,
            { elapsedMs: offset, observedAt: new Date(run.observedStartMs + offset).toISOString(), connectedAt: connectedAtRef.current },
          );
        run.queue.push(snapshotToSimulationRaw(sample));
        run.lastSampleMs = offset;
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
        'Falha de rede ao gravar o episódio. Gravação abortada. O simulador continua ativo.',
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
        scenarioId: plan.scenarioId,
        outcomeId: plan.outcomeId,
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
    // roteiro inteiro e a cena rejoga junto. Os dois palcos leem o mesmo ref.
    const startedAt = performance.now();
    startedAtRef.current = startedAt;
    connectedAtRef.current = new Date().toISOString();
    setPlaying(true); setPlaybackRate(1); setStudioOpen(false);
    playback.current.setRate(1, startedAt, startedAt); playback.current.setPlaying(true, startedAt, startedAt);
    episodeRunRef.current = {
      publicId,
      startedAt,
      observedStartMs: Date.now(),
      queue: [],
      lastSampleMs: Number.NEGATIVE_INFINITY,
      plan,
      controls: {
        ...controls,
        scenarioId: plan.scenarioId as SompoSimulationScenarioId,
        outcomeId: plan.outcomeId,
      },
    };
    const firstSnapshot = plan.catalog === 'agri'
      ? agriSnapshot(plan.scenarioId, plan.outcomeId, {
        elapsedMs: 0,
        observedAt: new Date(episodeRunRef.current.observedStartMs).toISOString(),
        connectedAt: connectedAtRef.current,
      })
      : createSompoSimulationSnapshot(
        episodeRunRef.current.controls,
        { elapsedMs: 0, observedAt: new Date(episodeRunRef.current.observedStartMs).toISOString(), connectedAt: connectedAtRef.current },
      );
    previewRef.current = firstSnapshot;
    setPreview(firstSnapshot);
    onTelemetryRef.current?.(firstSnapshot);
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
    if (snapshotRequested.current) {
      snapshotRequested.current = false;
      canvas.toBlob(blob => {
        if (blob) { downloadSompoFile(blob, 'sompo-cena.png'); setCaptureMessage('Cena 3D capturada em PNG.'); }
        else setCaptureMessage('Não foi possível capturar a cena.');
      }, 'image/png');
    }
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
        studioRef, getElapsed, onStats: setRenderStats,
      });
      if (!stage) return undefined;
      setWebglError(false);
      sceneApiRef.current = stage;
      return () => {
        sceneApiRef.current = null;
        stage.dispose();
      };
    }

    const stage = mountSompoRuralStage({
      mount, isFirebase, controlsRef, previewRef, axisCalibrationRef, startedAtRef,
      physicalVisualRef: physicalTwin.visual,
      setModelStatus, setModelAsset, setWebglError,
      onAfterRender: captureDueEpisodeFrames,
      studioRef, getElapsed, onStats: setRenderStats,
    });
    if (!stage) return undefined;
    sceneApiRef.current = stage;
    return () => { sceneApiRef.current = null; stage.dispose(); };
  }, [agriRun, isFirebase, studioConfig.truck]);

  const onScenarioSelectRef = useRef(onScenarioSelect);
  onScenarioSelectRef.current = onScenarioSelect;
  const currentSelectionRef = useRef({ scenarioId: '', outcomeId: '' });
  currentSelectionRef.current = agriRun
    ? { scenarioId: agriRun.scenarioId, outcomeId: agriRun.outcomeId }
    : { scenarioId: controls.scenarioId, outcomeId: controls.outcomeId || '' };
  const lastHonoredRequestRef = useRef('');

  function selectScenario(scenarioId: SompoSimulationScenarioId | SompoAgriScenarioId, outcomeId?: string) {
    if (episodeActive) return;
    historyReplay.current = false;
    startedAtRef.current = performance.now();
    connectedAtRef.current = new Date().toISOString();
    // Um episódio "done"/"error" era do cenário anterior: limpa para a bancada
    // não oferecer análise de um episódio que não corresponde à cena atual.
    setEpisodeRun({ status: 'idle' });
    onEpisodeRecordedRef.current?.(null);
    let resolvedOutcome = outcomeId || '';
    if (isSompoAgriScenarioId(scenarioId)) {
      const outcomes = getSompoAgriOutcomes(scenarioId);
      const outcome = outcomes.find((item) => item.id === outcomeId) || outcomes[0];
      resolvedOutcome = outcome.id;
      setAgriRun({ scenarioId, outcomeId: outcome.id });
      setStudioConfig(current => ({ ...current, equipment: getSompoAgriFrame(scenarioId, 0).equipmentId === 'harvester' ? 'harvester' : 'tractor' }));
    } else {
      const next = controlsForScenario(scenarioId, outcomeId);
      resolvedOutcome = next.outcomeId || '';
      setAgriRun(null);
      setStudioConfig(current => ({ ...current, equipment: current.truck }));
      setControls(next);
    }
    onScenarioSelectRef.current?.(scenarioId, resolvedOutcome);
  }
  const selectScenarioRef = useRef(selectScenario);
  selectScenarioRef.current = selectScenario;

  // Deep-link (?cenario=&desfecho=) só reaplica quando a URL muda. O dropdown
  // do laboratório não compete com a faixa de regulação.
  useEffect(() => {
    if (isFirebase || episodeActive) return;
    const valid = !requestedScenario
      || isSompoAgriScenarioId(requestedScenario)
      || requestedScenario in SOMPO_SIMULATION_SCENARIOS;
    if (!valid) return;
    const action = sompoRequestedScenarioAction({
      requested: { scenarioId: requestedScenario, outcomeId: requestedOutcome },
      current: currentSelectionRef.current,
      lastHonoredKey: lastHonoredRequestRef.current,
    });
    if (action.type === 'idle') return;
    lastHonoredRequestRef.current = action.key;
    if (action.type === 'apply') {
      selectScenarioRef.current(
        action.scenarioId as SompoSimulationScenarioId | SompoAgriScenarioId,
        action.outcomeId,
      );
    }
  }, [requestedScenario, requestedOutcome, isFirebase, episodeActive]);

  function selectStudioAsset(asset: SompoStudioAsset) {
    setStudioConfig(current => ({ ...current, equipment: asset }));
    if (asset === 'tractor') selectScenario('agri-field-bogging');
    else if (asset === 'harvester') selectScenario('agri-harvest-dust');
    else { setStudioConfig(current => ({ ...current, truck: asset })); selectScenario('normal'); }
  }

  function updateNumber(
    key: 'distance' | 'temperature' | 'humidity' | 'pitch' | 'roll' | 'speedKph',
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
  const firebaseStatusLabel = physicalTwin.replay ? 'Replay · leituras gravadas' : firebaseLive
    ? preview.freshness === 'stale' ? 'Conectado · leitura parada' : 'Firebase ao vivo'
    : preview.connection.state === 'reconnecting' ? 'Reconectando ao Firebase' : 'Conectando ao Firebase';

  // Coluna direita vira painel de geofencing só no cenário com talhão (radar presente); os demais cenários ficam como eram.
  const geofencePanel = !isFirebase && agriRun && preview.geofence ? (
    <SompoGeofencePanel
      scenarioId={agriRun.scenarioId}
      outcomeId={agriRun.outcomeId}
      elapsedMs={preview.deviceTimestamp ?? 0}
      geofence={preview.geofence}
      rollDeg={preview.geofence.machine?.valueDeg ?? preview.readings.roll ?? null}
      position={preview.position ?? null}
      locked={episodeActive}
      onSeek={(ms) => { if (episodeActive) return; historyReplay.current = true; playback.current.seek(ms, performance.now(), startedAtRef.current); }}
      onOpenMap={() => { if (episodeActive) return; setStudioOpen(false); setMapOpen(true); }}
    />
  ) : null;
  const manualControls = (
    <>
          <div className="sompo-simulator-ranges">
            {brakingPreview && (
              <p role="status">
                {brakingPreview.phaseLabel}
                {' · '}{formatReading(brakingPreview.speedKph, ' km/h')}
              </p>
            )}
            <label>
              <span>Velocidade <strong>{scenarioScripted ? Math.round(ruralPreview?.speedKph ?? agriPreview?.speedKph ?? controls.speedKph) : controls.speedKph} km/h</strong></span>
              <input
                type="range"
                min="0"
                max="120"
                step="5"
                value={scenarioScripted ? Math.round(ruralPreview?.speedKph ?? agriPreview?.speedKph ?? controls.speedKph) : controls.speedKph}
                disabled={episodeActive || scenarioScripted}
                name="sompo-speed"
                onChange={(event) => updateNumber('speedKph', Number(event.target.value))}
              />
            </label>
            <label>
              <span>{distanceSensorCopy.label} <strong>{scenarioScripted ? (preview.readings.distance ?? controls.distance) : controls.distance} cm</strong></span>
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
              aria-pressed={(scenarioScripted ? preview.risks.collision : controls.collisionRisk) ?? false}
              disabled={episodeActive || scenarioScripted}
              onClick={() => setControls((current) => ({ ...current, collisionRisk: !current.collisionRisk }))}
            >
              {(scenarioScripted ? preview.risks.collision : controls.collisionRisk) ? <ShieldAlert /> : <ShieldCheck />}
              Colisão {(scenarioScripted ? preview.risks.collision : controls.collisionRisk) ? 'ativa' : 'livre'}
            </button>
            <button
              type="button"
              aria-pressed={(scenarioScripted ? preview.risks.inclination : controls.inclinationRisk) ?? false}
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
    </>
  );

  return (
    <section
      className={`sompo-simulator${isFirebase ? ' sompo-simulator-live' : ''}${studioOpen ? ' is-studio' : ''}`}
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
            {isFirebase ? 'Caminhão 3D acoplado ao dispositivo físico' : agriRun ? 'Operação agrícola · laboratório de sinistros' : 'Estrada rural · laboratório de sinistros'}
          </h2>
          <p>
            {isFirebase
              ? 'A cena acompanha em tempo real a orientação, a distância frontal e os alertas recebidos do Firebase.'
              : 'Dados sintéticos locais para testar a mesma leitura da telemetria sem o dispositivo físico.'}
          </p>
        </div>
        <div className="sompo-simulator-head-status">
          <strong className={isFirebase && firebaseLive ? 'is-live' : ''}>
            <Cpu /> {isFirebase ? firebaseStatusLabel : 'Telemetria sintética'}
          </strong>
          {!isFirebase && historyOffline && (
            <span className="sompo-simulator-history-offline" role="status" data-sompo-history-offline>
              histórico offline
            </span>
          )}
        </div>
      </header>

      {!isFirebase && <div className="sompo-simulator-toolbar">
        <div className="sompo-simulator-modes"><button type="button" aria-pressed={!studioOpen && !mapOpen} disabled={episodeActive} onClick={() => { setStudioOpen(false); setMapOpen(false); }}><Truck />Simulador</button>{agriRun && preview.geofence && <button type="button" aria-pressed={mapOpen} disabled={episodeActive} data-sompo-map-toggle onClick={() => { setStudioOpen(false); setMapOpen(true); }}><MapIcon />Mapa do talhão</button>}<button type="button" aria-pressed={studioOpen} disabled={episodeActive} onClick={() => { setMapOpen(false); setStudioOpen(true); }}><SlidersHorizontal />Oficina 3D</button></div>
        <div className="sompo-simulator-playback">
          <button type="button" disabled={episodeActive} aria-label={playing ? 'Pausar simulação' : 'Reproduzir simulação'} onClick={() => { playback.current.setPlaying(!playing, performance.now(), startedAtRef.current); setPlaying(!playing); }}>{playing ? <Pause /> : <Play />}</button>
          <input aria-label="Instante da simulação" disabled={episodeActive} type="range" min="0" max={scenarioTotalMs || 60000} step="100" value={Math.min(preview.deviceTimestamp || 0, scenarioTotalMs || 60000)} onChange={event => { historyReplay.current = true; playback.current.seek(Number(event.target.value), performance.now(), startedAtRef.current); }} />
          <output>{((preview.deviceTimestamp || 0) / 1000).toFixed(1)}s</output>
          <select aria-label="Velocidade de reprodução" disabled={episodeActive} value={playbackRate} onChange={event => { const rate = Number(event.target.value); playback.current.setRate(rate, performance.now(), startedAtRef.current); setPlaybackRate(rate); }}><option value="0.5">0,5×</option><option value="1">1×</option><option value="2">2×</option></select>
        </div>
      </div>}
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
          {isFirebase && <PhysicalTwinOverlay twin={physicalTwin} />}
          <div className="sompo-simulator-stage-badges" aria-hidden="true">
            <span><span className="sompo-simulator-led" /> {isFirebase ? `${physicalTwin.replay ? 'Replay' : 'ESP32 físico'} · trator ${preview.tractorId}` : 'ESP32 virtual transmitindo'}</span>
            <span>{isFirebase ? `tick ${preview.deviceTimestamp ?? '-'}` : `${Math.round(preview.deviceTimestamp || 0)} ms`}</span>
          </div>
          {!isFirebase && (
            <div className="sompo-simulator-readout" aria-label="Resumo do cenário">
              <div><span>{(ruralPreview ?? agriPreview)?.phaseLabel || 'Condução livre'}</span><strong>{formatReading((ruralPreview ?? agriPreview)?.speedKph ?? controls.speedKph, ' km/h')}</strong></div>
              <div data-alert={preview.risks.collision || preview.risks.inclination}>
                <span>{preview.risks.collision ? 'Alerta de colisão' : preview.risks.inclination ? 'Alerta de inclinação' : 'Colisão/inclinação sem alerta'}</span>
                <strong>{formatReading(preview.readings.distance, ' cm')} <small>{distanceSensorCopy.relative}</small></strong>
              </div>
              {agriRun && <SompoGeofenceReadout geofence={preview.geofence} proximity={!!(preview.risks as { proximity?: boolean }).proximity} />}
            </div>
          )}
          <div className="sompo-simulator-camera" role="group" aria-label="Controles da câmera 3D">
            <button type="button" onClick={() => sceneApiRef.current?.focus('truck')}>
              <Truck /> Visão geral
            </button>
            <button type="button" onClick={() => sceneApiRef.current?.focus('sensor')}>
              <Focus /> {agriRun ? 'Inspecionar máquina' : 'Focar ESP32'}
            </button>
          </div>
          {studioOpen && renderStats && <div className="sompo-simulator-stats" aria-label="Métricas do render"><span>{renderStats.fps} FPS</span><span>{renderStats.cpuMs.toFixed(1)} ms CPU</span><span>{renderStats.calls} chamadas</span><span>{Math.round(renderStats.triangles / 1000)} mil triângulos</span></div>}
          <p className="sompo-simulator-hint">Arraste para girar · use as setas para navegar</p>
          <p className="sompo-simulator-credit">
            {agriRun ? (
              modelStatus === 'gltf'
                ? `${modelAsset ?? 'Equipamento agrícola'} · modelagem procedural Blender por LUCA-AI`
                : modelStatus === 'loading' ? 'Carregando equipamento agrícola…' : 'Silhueta nominal · GLB agrícola indisponível'
            ) : modelAsset === 'SompoModularTruck' ? 'Caminhão rural · imagem → 3D por LUCA-AI · adaptado com sensor' : modelAsset === 'GeneratedRuralTruck' ? 'Caminhão rural · imagem → 3D por LUCA-AI · adaptado com sensor' : modelStatus === 'gltf' ? <>
              <a href="https://sketchfab.com/3d-models/tesla-semi-39ffc7c746184e0c9ebd5bbcd0b405dd" target="_blank" rel="noreferrer">Tesla Semi © 2018 Oleksii Rozumnyi</a>
              {' · '}<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> · adaptado com sensor
            </> : modelStatus === 'loading' ? 'Carregando caminhão detalhado…' : 'Modelo simplificado · arquivo detalhado indisponível'}
          </p>
        </div>

        {isFirebase ? (
          <div>
          <PhysicalTwinPanel twin={physicalTwin} />
          <LiveReadings
            telemetry={preview}
            replaying={!!physicalTwin.replay}
            calibration={axisCalibration}
            onCalibrationChange={(key, value) => setAxisCalibration((current) => ({ ...current, [key]: value }))}
            onCalibrationReset={() => setAxisCalibration({ ...DEFAULT_SOMPO_AXIS_CALIBRATION })}
            onRecenterHeading={() => sceneApiRef.current?.recenterHeading()}
          />
          </div>
        ) : mapOpen && agriRun && preview.geofence ? (
          <SompoGeofenceMap scenarioId={agriRun.scenarioId} outcomeId={agriRun.outcomeId} elapsedMs={preview.deviceTimestamp ?? 0} position={preview.position ?? null} />
        ) : studioOpen ? <div><SompoStudio config={studioConfig} onChange={setStudioConfig}
          asset={agriRun ? getSompoAgriFrame(agriRun.scenarioId, 0).equipmentId === 'harvester' ? 'harvester' : 'tractor' : studioConfig.truck}
          onAsset={selectStudioAsset} onSnapshot={() => { snapshotRequested.current = true; setCaptureMessage(''); }}
          onExportModel={async () => { if (!sceneApiRef.current?.exportModel) throw new Error('O modelo ainda está carregando.'); const data = await sceneApiRef.current.exportModel(); downloadSompoFile(new Blob([data], { type: 'model/gltf-binary' }), 'sompo-modelo.glb'); }}
        /><p className="sompo-studio-message" role="status">{captureMessage}</p></div> : (
        <aside className={`sompo-simulator-controls${geofencePanel ? ' has-geofence-panel' : ''}`} aria-label="Controles do simulador">
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
          {(ruralPreview || agriPreview) && !geofencePanel && (
            <div className="sompo-scenario-phase">
              <span role="status">{(ruralPreview ?? agriPreview)!.phaseLabel}</span>
              <strong>{formatReading((ruralPreview ?? agriPreview)!.speedKph, ' km/h')}{(ruralPreview ?? agriPreview)!.direction < 0 ? ' · ré' : ''}</strong>
              <progress max={scenarioTotalMs} value={Math.min(preview.deviceTimestamp ?? 0, scenarioTotalMs ?? 1)} />
              <small>{(preview.deviceTimestamp ?? 0) >= (scenarioTotalMs ?? Infinity)
                ? 'Roteiro concluído · use ↻ para repetir.'
                : 'O roteiro conduz os valores abaixo. Use ↻ para repetir.'}</small>
            </div>
          )}

          {geofencePanel}

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
                Este desfecho é manual e não gera episódio. Escolha um desfecho roteirizado para gravar.
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

          {geofencePanel ? (
            <details className="sompo-geofence-more" data-sompo-geofence-more>
              <summary>Leituras do roteiro e flags do cenário</summary>
              {manualControls}
            </details>
          ) : manualControls}
        </aside>
        )}
      </div>
    </section>
  );
}
