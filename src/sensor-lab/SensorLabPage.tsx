import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Expand, HelpCircle, Pause, Play, Tag, X } from 'lucide-react';
import {
  C0_FF,
  COUNTS_PER_G,
  MEMS,
  NM_PER_G,
  SENSOR_SCENARIOS,
  SLOPE_TIP_DEG,
  SPRING_N_PER_M,
  THRESHOLDS,
  TRUCK,
  getSensorScenario,
  sampleSensorLab,
  scenarioTimeline,
  type SensorReading,
  type SensorScenarioId,
} from './physics.js';
import { SENSOR_VIEWS, mountSensorLab, type SensorLabApi, type SensorLabEvent, type SensorView } from './scene/mountSensorLab';
import { loadLabFonts } from './scene/textures';
import './sensor-lab.css';

const fmt = (value: number, digits: number) => value.toFixed(digits).replace('.', ',').replace('-', '−');
const pct = (ratio: number) => `${Math.round(Math.max(0, ratio) * 100)}%`;
const VIEW_ORDER = SENSOR_VIEWS.map((item) => item.id);

type Tone = 'force' | 'plus' | 'minus' | 'ok' | 'warn' | 'danger' | 'coriolis' | 'strong';
const T = ({ tone, children }: { tone: Tone; children: ReactNode }) => <em className={`t-${tone}`}>{children}</em>;

function defaultParams(): Record<SensorScenarioId, number> {
  return Object.fromEntries(SENSOR_SCENARIOS.map((item) => [item.id, item.param.value])) as Record<SensorScenarioId, number>;
}

/** Zonas do slider tiradas da própria física: onde começa atenção, risco e tombamento. */
function sliderZones(id: SensorScenarioId) {
  const { min, max } = getSensorScenario(id).param;
  const steps = 120;
  const stops: string[] = [];
  const color = (value: number) => {
    const timeline = scenarioTimeline(id, value);
    if (timeline.tipAtS !== null) return '#ff4d4d';
    if (timeline.alertAtS !== null) return '#ff7a6b';
    if (timeline.attentionAtS !== null) return '#ffc46b';
    return '#5eead4';
  };
  let previous = color(min);
  stops.push(`${previous} 0%`);
  for (let i = 1; i <= steps; i++) {
    const value = min + ((max - min) * i) / steps;
    const next = color(value);
    if (next !== previous) {
      const at = (i / steps) * 100;
      stops.push(`${previous} ${at}%`, `${next} ${at}%`);
      previous = next;
    }
  }
  stops.push(`${previous} 100%`);
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

function primaryAxis(reading: SensorReading) {
  if (reading.id === 'frenada') return { label: 'FRENADA', g: Math.max(0, -reading.forceG.x), axis: reading.mems.x };
  if (reading.id === 'buraco') return { label: 'VERTICAL', g: reading.forceG.z, axis: reading.mems.z };
  // O que o chip lê (aceleracaoY): inclui a rolagem da carroceria e, deitado, a gravidade.
  return { label: 'LATERAL', g: Math.abs(reading.forceG.y), axis: reading.mems.y };
}

function narration(reading: SensorReading, amplified: boolean): ReactNode {
  const { axis } = primaryAxis(reading);
  const nm = <T tone="force">{fmt(Math.abs(axis.nm), 1)} nm</T>;
  const dc = <T tone="plus">{fmt(Math.abs(axis.deltaFF), 2)} fF</T>;
  const lead = reading.alertLeadS;
  let text: ReactNode;
  if (reading.id === 'curva') {
    const g = <T tone="strong">{fmt(Math.abs(reading.forceG.y), 2)} g</T>;
    if (reading.level === 'tombou') text = <>A seta de carga saiu da base: <T tone="danger">tombou</T>. O LUCA marcou risco <T tone="strong">{fmt(lead ?? 0, 2)} s</T> antes. Numa curva isso é pouco, por isso ele aprende onde cada motorista entra forte antes do dia do tombo. Deitado, o chip lê {g} de lado: é a gravidade.</>;
    else if (reading.level === 'risco') text = <><T tone="danger">Risco</T>: o chip lê {g} de lado, {pct(reading.ratio)} do limite. O LUCA sobe <T tone="plus">riscoInclinacao</T> agora, antes da roda de dentro levantar.</>;
    else if (reading.level === 'atencao') text = <><T tone="warn">Atenção</T>: {g} empurrando pra fora, {pct(reading.ratio)} do limite. A seta de carga anda na direção da roda de fora.</>;
    else if (reading.curve.k > 0.05) text = <>A curva empurra a carga pra fora e o chip lê {g} de lado. A massa de prova sai do centro {nm} e o pente sente {dc} de diferença. {pct(reading.ratio)} do limite.</>;
    else text = <>Na reta, o sensor só vê a gravidade. Suba a velocidade e espere a curva: a massa de prova vai pro lado de fora junto com a carga.</>;
  } else if (reading.id === 'encosta') {
    const deg = <T tone="strong">{fmt(reading.road.rollDeg, 1)}°</T>;
    if (reading.level === 'tombou') text = <>Acima de <T tone="strong">{fmt(SLOPE_TIP_DEG, 1)}°</T> a seta de carga cai fora da base e ele <T tone="danger">tomba parado</T>. Nenhuma curva, só a ladeira.</>;
    else text = <>Parado numa encosta de {deg}, o chip lê <T tone="strong">{fmt(Math.abs(reading.forceG.y), 2)} g</T> de lado. Pra massa de prova, ladeira e curva são a mesma coisa: ela só sente a seta. {reading.level !== 'estavel' ? <T tone={reading.level === 'risco' ? 'danger' : 'warn'}>{pct(reading.ratio)} do limite.</T> : 'Arraste a mesa pra inclinar.'}</>;
  } else if (reading.id === 'frenada') {
    const g = <T tone="strong">{fmt(Math.max(0, -reading.forceG.x), 2)} g</T>;
    if (reading.flags.frenagemBrusca) text = <><T tone="danger">Frenada brusca</T>: {g}. Acima de {fmt(THRESHOLDS.hardBrakeG, 2)} g o LUCA registra o evento com hora e lugar.</>;
    else if (reading.phase === 'freando') text = <>Freando a {g}, a massa de prova vai pra frente {nm}, igual o motorista contra o cinto.</>;
    else text = <>O caminhão roda a {fmt(TRUCK.cruiseKph, 0)} km/h. Na frenada, a massa de prova escorrega pra frente e o pente da frente fecha o vão.</>;
  } else {
    const extra = <T tone="strong">{fmt(Math.abs(reading.forceG.z - 1), 2)} g</T>;
    const peak = <T tone="strong">{fmt(reading.timeline.peakRatio * THRESHOLDS.impactG, 2)} g</T>;
    if (reading.flags.impacto) text = <><T tone="danger">Impacto</T>: pico de {peak} além da gravidade em poucos milissegundos. A gangorra do eixo Z bate e volta.</>;
    else if (reading.phase === 'no buraco') text = <>A roda cai e bate na borda: {extra} a mais que a gravidade. A gangorra do eixo Z balança sobre os eletrodos.</>;
    else text = <>Parado, a gangorra do eixo Z já pende pro lado mais pesado: é a gravidade. No buraco ela vai bater e voltar.</>;
  }
  return (
    <>
      {text}
      {!amplified && <span className="sensor-story-note">Modo real: 1 g move a massa {fmt(NM_PER_G, 1)} nm, menos de 1% do vão. A olho nu não se vê nada; o ASIC vê.</span>}
    </>
  );
}

function TipDiagram({ reading }: { reading: SensorReading }) {
  const S = 21;
  const cx = 110, groundY = 122;
  const roadRoll = (reading.road.rollDeg * Math.PI) / 180;
  const bodyRoll = ((reading.body.rollDeg + reading.tip.deg * reading.tip.side) * Math.PI) / 180;
  const cos = Math.cos(roadRoll), sin = Math.sin(roadRoll);
  // Vista de trás: direita do caminhão à direita da tela; gravidade para baixo.
  const toScreen = (x: number, y: number) => {
    const [rx, ry] = [x * cos + y * sin, -x * sin + y * cos];
    return [cx + rx * S, groundY - ry * S] as const;
  };
  const pivotX = reading.tip.deg > 0 ? 1.3 : 0;
  const pivotY = reading.tip.deg > 0 ? 0 : 1.0;
  const bodyPoint = (x: number, y: number) => {
    const dx = x - pivotX, dy = y - pivotY;
    const c = Math.cos(bodyRoll), s = Math.sin(bodyRoll);
    return toScreen(pivotX + dx * c + dy * s, pivotY - dx * s + dy * c);
  };
  const poly = (points: [number, number][]) => points.map(([x, y]) => bodyPoint(x, y).join(',')).join(' ');
  const box = poly([[-1.25, 1.25], [1.25, 1.25], [1.25, 3.6], [-1.25, 3.6]]);
  const wheels = [-1.145, -0.8, 0.8, 1.145].map((x) => poly([[x - 0.15, 0], [x + 0.15, 0], [x + 0.15, 1.16], [x - 0.15, 1.16]]));
  const [cgx, cgy] = bodyPoint(0, TRUCK.cgHeightM);
  const lateral = reading.id === 'curva' ? Math.abs(reading.lateralG) : 0;
  const tipped = reading.tip.deg > 1;
  const loadLength = 34 * Math.hypot(lateral, 1);
  const angle = Math.atan2(1, lateral);
  const ax = cgx + Math.cos(angle) * loadLength, ay = cgy + Math.sin(angle) * loadLength;
  // Onde a linha de carga cruza o chão (no referencial da pista).
  const limit = TRUCK.rolloverG * TRUCK.cgHeightM;
  const hitOffset = Math.max(0, reading.ratio) * limit;
  const [hx, hy] = toScreen(hitOffset, 0);
  const segment = (from: number, to: number) => { const a = toScreen(from, 0), b = toScreen(to, 0); return { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }; };
  const zone = (from: number, to: number, color: string, key: string) => <line key={key} {...segment(from, to)} stroke={color} strokeWidth={5} strokeLinecap="butt" />;
  const [g1x, g1y] = toScreen(-4, 0), [g2x, g2y] = toScreen(4, 0);
  const tone = reading.level === 'estavel' ? '#5eead4' : reading.level === 'atencao' ? '#ffc46b' : '#ff6b6b';
  return (
    <figure className="sensor-diagram" aria-label={`Vista de trás: ${pct(reading.ratio)} do limite de tombamento`}>
      <figcaption><span>VISTA DE TRÁS</span><b style={{ color: tone }}>{tipped ? 'TOMBOU' : `${pct(reading.ratio)} do limite`}</b></figcaption>
      <svg viewBox="0 0 220 142" role="img" aria-hidden="true">
        <line x1={g1x} y1={g1y} x2={g2x} y2={g2y} stroke="#56657a" strokeWidth={1.5} />
        {!tipped && [
          zone(-limit, -limit * THRESHOLDS.alert, '#ff6b6b', 'l3'), zone(-limit * THRESHOLDS.alert, -limit * THRESHOLDS.attention, '#ffc46b', 'l2'),
          zone(-limit * THRESHOLDS.attention, limit * THRESHOLDS.attention, '#5eead4', 'c'),
          zone(limit * THRESHOLDS.attention, limit * THRESHOLDS.alert, '#ffc46b', 'r2'), zone(limit * THRESHOLDS.alert, limit, '#ff6b6b', 'r3'),
        ]}
        <polygon points={box} fill="rgba(160,180,205,.1)" stroke="#9fb3c8" strokeWidth={1.2} />
        {wheels.map((points, index) => <polygon key={index} points={points} fill="#1b2230" stroke="#6f829a" strokeWidth={1} />)}
        {!tipped && <line x1={cgx} y1={cgy} x2={hx} y2={hy} stroke="#ffb547" strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />}
        {!tipped && <line x1={cgx} y1={cgy} x2={ax} y2={ay} stroke="#ffb547" strokeWidth={2.4} markerEnd="url(#sensor-arrow)" />}
        <circle cx={cgx} cy={cgy} r={4.2} fill="#f4f1ea" stroke="#101318" strokeWidth={1.4} />
        {!tipped && <circle cx={hx} cy={hy} r={3.4} fill={tone} />}
        <defs>
          <marker id="sensor-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#ffb547" />
          </marker>
        </defs>
      </svg>
    </figure>
  );
}

const TOASTS: Record<SensorLabEvent['kind'], { tone: Tone; title: string }> = {
  atencao: { tone: 'warn', title: 'Atenção' },
  risco: { tone: 'danger', title: 'LUCA marcou risco de tombamento' },
  tombou: { tone: 'danger', title: 'Tombou' },
  frenada: { tone: 'danger', title: 'Frenada brusca registrada' },
  impacto: { tone: 'danger', title: 'Impacto registrado' },
};

function toastDetail(event: SensorLabEvent) {
  const reading = event.reading;
  if (event.kind === 'tombou') return reading.alertLeadS !== null ? `O aviso saiu ${fmt(reading.alertLeadS, 2)} s antes.` : 'Sem aviso antes: passou do limite de uma vez.';
  if (event.kind === 'risco') return `${fmt(Math.abs(reading.forceG.y), 2)} g no chip · riscoInclinacao = true`;
  if (event.kind === 'frenada') return `${fmt(Math.max(0, -reading.forceG.x), 2)} g de desaceleração`;
  if (event.kind === 'impacto') return `pico de ${fmt(reading.timeline.peakRatio * THRESHOLDS.impactG, 2)} g acima da gravidade`;
  return `${pct(reading.ratio)} do limite`;
}

export default function SensorLabPage() {
  const shellRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<SensorLabApi | null>(null);
  const reducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const [scenario, setScenario] = useState<SensorScenarioId>('curva');
  const [params, setParams] = useState(defaultParams);
  const [exploded, setExploded] = useState(true);
  const [amplified, setAmplified] = useState(true);
  const [view, setView] = useState<SensorView | 'livre'>('bancada');
  const [paused, setPaused] = useState(false);
  const [labels, setLabels] = useState(true);
  const [help, setHelp] = useState(false);
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState('');
  const [reading, setReading] = useState<SensorReading>(() => sampleSensorLab('curva', getSensorScenario('curva').param.value, 0));
  const [toast, setToast] = useState<{ id: number; event: SensorLabEvent } | null>(null);
  const spec = getSensorScenario(scenario);
  const param = params[scenario];
  const zones = useMemo(() => sliderZones(scenario), [scenario]);
  const initial = useRef({ scenario, param, exploded, amplified, view: 'bancada' as SensorView, paused, labels });

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    let api: SensorLabApi | null = null;
    let toastTimer = 0;
    let cancelled = false;
    void loadLabFonts().then(() => {
      if (cancelled) return;
      try {
        api = mountSensorLab(stage, {
          ...initial.current,
          reducedMotion,
          onReading: setReading,
          onEvent: (event) => {
            window.clearTimeout(toastTimer);
            setToast({ id: performance.now(), event });
            toastTimer = window.setTimeout(() => setToast(null), event.kind === 'tombou' ? 5200 : 3400);
          },
          onViewChange: setView,
          onExplodedChange: setExploded,
          onScenarioChange: (id, value) => {
            setScenario(id);
            setParams((current) => ({ ...current, [id]: value }));
          },
          onReady: () => setReady(true),
        });
        apiRef.current = api;
      } catch (error) {
        setFailure(error instanceof Error ? error.message : 'WebGL indisponível');
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
      window.clearTimeout(toastTimer);
      api?.dispose();
      apiRef.current = null;
    };
  }, [reducedMotion]);

  const chooseScenario = useCallback((id: SensorScenarioId) => {
    setScenario(id);
    apiRef.current?.setScenario(id, params[id]);
  }, [params]);

  const changeParam = useCallback((value: number) => {
    setParams((current) => ({ ...current, [scenario]: value }));
    apiRef.current?.setParam(value);
  }, [scenario]);

  const chooseView = useCallback((next: SensorView) => {
    setView(next);
    apiRef.current?.setView(next);
  }, []);

  const toggleExploded = useCallback((open: boolean) => {
    setExploded(open);
    apiRef.current?.setExploded(open);
  }, []);

  const toggleAmplified = useCallback((on: boolean) => {
    setAmplified(on);
    apiRef.current?.setAmplified(on);
  }, []);

  const togglePaused = useCallback(() => {
    setPaused((current) => { apiRef.current?.setPaused(!current); return !current; });
  }, []);

  const toggleLabels = useCallback(() => {
    setLabels((current) => { apiRef.current?.setLabels(!current); return !current; });
  }, []);

  const fullscreen = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void shell.requestFullscreen?.().catch(() => undefined);
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (target && (target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'range' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const key = event.key.toLowerCase();
      const byKey = SENSOR_SCENARIOS.find((item) => item.key === key);
      if (byKey) { chooseScenario(byKey.id); return; }
      if (key === 'x') toggleExploded(!exploded);
      else if (key === 'a') toggleAmplified(!amplified);
      else if (key === 'c') {
        const index = VIEW_ORDER.indexOf(view as SensorView);
        const next = VIEW_ORDER[(index + (event.shiftKey ? VIEW_ORDER.length - 1 : 1) + VIEW_ORDER.length) % VIEW_ORDER.length];
        chooseView(next);
      } else if (key === ' ') { event.preventDefault(); togglePaused(); }
      else if (key === 'l') toggleLabels();
      else if (key === 'f') fullscreen();
      else if (key === '?' || key === 'h') setHelp((current) => !current);
      else if (key === 'escape') setHelp(false);
      else if ((key === 'arrowright' || key === 'arrowleft') && target?.tagName !== 'INPUT') {
        const direction = key === 'arrowright' ? 1 : -1;
        const next = Math.min(spec.param.max, Math.max(spec.param.min, param + direction * spec.param.step * (event.shiftKey ? 5 : 1)));
        changeParam(Number(next.toFixed(3)));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [amplified, changeParam, chooseScenario, chooseView, exploded, fullscreen, param, spec, toggleAmplified, toggleExploded, toggleLabels, togglePaused, view]);

  const primary = primaryAxis(reading);
  const showDiagram = scenario === 'curva' || scenario === 'encosta';

  return (
    <div className="sensor-lab" ref={shellRef} data-level={reading.level} data-ready={ready ? 'true' : 'false'}>
      <div className="sensor-stage" ref={stageRef} />
      {failure && (
        <div className="sensor-failure" role="alert">
          <strong>O laboratório 3D precisa de WebGL.</strong>
          <p>Este navegador não abriu o contexto gráfico ({failure}). Tente o Chrome, Edge ou Firefox atualizados, com aceleração de hardware ligada.</p>
        </div>
      )}
      <div className="sensor-veil" aria-hidden="true"><span>Polindo o silício…</span></div>

      <header className="sensor-intro">
        <h1><span>A MASSA</span><strong>DE PROVA</strong></h1>
        <p className="sensor-lede">Todo caminhão tomba pelo mesmo motivo: a soma do peso com a força da curva sai de cima das rodas. O chip do ESP32 sente essa seta com um pedaço de silício de {MEMS.proofMassUg} µg preso em molas. Suba a velocidade e veja os dois se mexerem juntos.</p>
        <p className="sensor-live"><i />ESP32 simulado · {MEMS.sampleHz} Hz · {spec.label.toLowerCase()}</p>
        <dl className="sensor-stats">
          <div><dt>{primary.label}</dt><dd>{fmt(primary.g, 2)} <small>g</small></dd></div>
          <div><dt>MASSA</dt><dd className="t-force">{fmt(Math.abs(primary.axis.nm), 2)} <small>nm</small></dd></div>
          <div><dt>ΔC</dt><dd className="t-plus">{fmt(Math.abs(primary.axis.deltaFF), 2)} <small>fF</small></dd></div>
        </dl>
        <p className="sensor-story">{narration(reading, amplified)}</p>
      </header>
      {showDiagram && <TipDiagram reading={reading} />}

      <section className="sensor-panel" aria-label="Controles do laboratório">
        <div className="sensor-row">
          <div className="sensor-group sensor-group-wide">
            <div className="sensor-group-head"><span>MANOBRA</span><kbd>1 2 3 4</kbd></div>
            <div className="sensor-seg" role="radiogroup" aria-label="Manobra">
              {SENSOR_SCENARIOS.map((item) => (
                <button key={item.id} type="button" role="radio" aria-checked={scenario === item.id} className={scenario === item.id ? 'on' : ''} onClick={() => chooseScenario(item.id)}>{item.label}</button>
              ))}
            </div>
          </div>
          <label className="sensor-group sensor-slider">
            <div className="sensor-group-head"><span>{spec.param.label.toUpperCase()}</span><b>{fmt(param, spec.param.digits)} {spec.param.unit}</b></div>
            <input
              type="range"
              min={spec.param.min}
              max={spec.param.max}
              step={spec.param.step}
              value={param}
              style={{ '--zones': zones } as React.CSSProperties}
              onChange={(event) => changeParam(Number(event.target.value))}
              aria-valuetext={`${fmt(param, spec.param.digits)} ${spec.param.unit}`}
            />
          </label>
        </div>
        <div className="sensor-row">
          <div className="sensor-group">
            <div className="sensor-group-head"><span>CHIP</span><kbd>X</kbd></div>
            <div className="sensor-seg" role="radiogroup" aria-label="Chip">
              <button type="button" role="radio" aria-checked={!exploded} className={!exploded ? 'on' : ''} onClick={() => toggleExploded(false)}>Fechado</button>
              <button type="button" role="radio" aria-checked={exploded} className={exploded ? 'on' : ''} onClick={() => toggleExploded(true)}>Aberto</button>
            </div>
          </div>
          <div className="sensor-group">
            <div className="sensor-group-head"><span>MOVIMENTO</span><kbd>A</kbd></div>
            <div className="sensor-seg" role="radiogroup" aria-label="Escala do movimento">
              <button type="button" role="radio" aria-checked={!amplified} className={!amplified ? 'on' : ''} onClick={() => toggleAmplified(false)}>Real</button>
              <button type="button" role="radio" aria-checked={amplified} className={amplified ? 'on' : ''} onClick={() => toggleAmplified(true)}>Ampliado</button>
            </div>
          </div>
          <div className="sensor-icons">
            <button type="button" onClick={togglePaused} aria-pressed={paused} aria-label={paused ? 'Continuar (espaço)' : 'Pausar (espaço)'} title={paused ? 'Continuar · espaço' : 'Pausar · espaço'}>{paused ? <Play /> : <Pause />}</button>
            <button type="button" onClick={toggleLabels} aria-pressed={labels} aria-label="Etiquetas (L)" title="Etiquetas · L" className={labels ? 'on' : ''}><Tag /></button>
            <button type="button" onClick={fullscreen} aria-label="Tela cheia (F)" title="Tela cheia · F"><Expand /></button>
            <button type="button" onClick={() => setHelp(true)} aria-label="Como funciona (?)" title="Como funciona · ?"><HelpCircle /></button>
          </div>
        </div>
      </section>

      <nav className="sensor-views" aria-label="Vistas da câmera">
        <kbd>C</kbd>
        {SENSOR_VIEWS.map((item) => (
          <button key={item.id} type="button" aria-pressed={view === item.id} className={view === item.id ? 'on' : ''} onClick={() => chooseView(item.id)}>{item.label}</button>
        ))}
      </nav>
      <p className="sensor-orbit-hint" aria-hidden="true">{view === 'livre' ? 'Câmera livre · C volta às vistas' : 'Arraste para girar · role para aproximar · arraste a mesa para inclinar'}</p>

      <div className="sensor-toasts" role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className={`sensor-toast t-${TOASTS[toast.event.kind].tone}`}>
            <b>{TOASTS[toast.event.kind].title}</b>
            <span>{toastDetail(toast.event)}</span>
          </div>
        )}
      </div>

      {help && (
        <aside className="sensor-help" role="dialog" aria-modal="false" aria-label="Como o sensor funciona">
          <button type="button" className="sensor-help-close" onClick={() => setHelp(false)} aria-label="Fechar"><X /></button>
          <h2>Como um chip de 4 mm sente o tombo</h2>
          <section>
            <h3>Uma massa presa em molas</h3>
            <p>Dentro do chip existe um pedaço de silício de uns {MEMS.proofMassUg} µg solto no ar, segurado por molas dobradas de {fmt(SPRING_N_PER_M, 0)} N/m. Quando o caminhão acelera, a massa fica pra trás. Com ressonância de {fmt(MEMS.resonanceHz / 1000, 1)} kHz, cada 1 g desloca a massa {fmt(NM_PER_G, 1)} nm, x = a / ω₀².</p>
          </section>
          <section>
            <h3>Dedos que viram capacitor</h3>
            <p>Presos na massa há dedos intercalados com dedos fixos, a {fmt(MEMS.gapUm, 1)} µm de distância. Cada vão é um capacitor de placas paralelas: {MEMS.fingerPairs} pares somam {fmt(C0_FF, 0)} fF de cada lado. Quando a massa anda, um lado fecha e o outro abre. O ASIC mede a diferença, uns {fmt(C0_FF * 2 * NM_PER_G / (MEMS.gapUm * 1000), 1)} fF por g, e converte em número: {COUNTS_PER_G.toLocaleString('pt-BR')} contagens por g em 16 bits.</p>
          </section>
          <section>
            <h3>Pra ele, ladeira e curva são a mesma coisa</h3>
            <p>O acelerômetro não mede velocidade nem inclinação. Mede a força que segura a massa no lugar, peso e inércia somados. Parado numa encosta de {fmt(Math.atan(0.3) * 180 / Math.PI, 0)}° ou numa curva de 0,3 g, a massa vai pro mesmo lugar. É o giroscópio, com massas vibrando a {MEMS.gyroDriveKHz} kHz e o efeito Coriolis, que diz se o caminhão está girando.</p>
          </section>
          <section>
            <h3>Quando a seta sai das rodas</h3>
            <p>O caminhão tomba quando a seta de carga, que sai do centro de gravidade, cruza a linha das rodas de fora. Pela geometria, esse caminhão aguentaria {fmt(TRUCK.trackM / (2 * TRUCK.cgHeightM), 2)} g; suspensão, pneus e carga deslocada baixam o limite efetivo pra uns {fmt(TRUCK.rolloverG, 2)} g. O LUCA avisa em {pct(THRESHOLDS.attention)} e marca risco em {pct(THRESHOLDS.alert)} desse limite. Os limites aqui são ilustrativos.</p>
          </section>
          <section>
            <h3>Do chip ao LUCA</h3>
            <p>O ESP32 lê o IMU {MEMS.sampleHz} vezes por segundo e publica <code>aceleracaoX/Y/Z</code>, <code>rotacaoX/Y/Z</code> e <code>riscoInclinacao</code> via MQTT. O Firebase repassa, o LUCA guarda o histórico e a equipe de agentes cruza episódios de vários caminhões pra achar quem entra forte em qual curva, antes do dia do tombo.</p>
          </section>
          <p className="sensor-help-keys"><kbd>1–4</kbd> manobra <kbd>←→</kbd> ajuste <kbd>X</kbd> abrir chip <kbd>A</kbd> real/ampliado <kbd>C</kbd> vista <kbd>L</kbd> etiquetas <kbd>espaço</kbd> pausa <kbd>F</kbd> tela cheia</p>
        </aside>
      )}
    </div>
  );
}
