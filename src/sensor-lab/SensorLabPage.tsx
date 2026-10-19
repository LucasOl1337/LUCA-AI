import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import {
  MEMS, NM_PER_G, C0_FF, COUNTS_PER_G, sensorScenarios, getSensorScenario,
  sampleSensorLab, operationalTelemetry, sensorVehicleProfile,
  type SensorReading, type SensorScenarioId, type SensorVehicle,
} from './physics.js';
import { SENSOR_VIEWS, mountSensorLab, type SensorLabApi, type SensorView } from './scene/mountSensorLab';
import { loadLabFonts } from './scene/textures';
import './sensor-lab.css';

const fmt = (value: number, digits = 1) => value.toFixed(digits).replace('.', ',');
const initialVehicle = (): SensorVehicle => new URLSearchParams(window.location.search).get('veiculo') === 'trator' ? 'trator' : 'caminhao';
const defaultParams = (vehicle: SensorVehicle) => ({
  encosta: getSensorScenario('encosta', vehicle).param.value,
  curva: getSensorScenario('curva', vehicle).param.value,
  frenada: getSensorScenario('frenada', vehicle).param.value,
  buraco: getSensorScenario('buraco', vehicle).param.value,
});
const PROCESS = [
  ['ESP32 no veículo', 'O equipamento lê distância, inclinação, movimento e ambiente e publica seu pacote.'],
  ['Mosquitto', 'O servidor de mensagens recebe a publicação MQTT do ESP32.'],
  ['Firebase', 'A ponte mantém o snapshot mais recente do dispositivo.'],
  ['Servidor LUCA', 'O servidor acompanha mudanças por SSE e guarda amostras no histórico SQLite.'],
  ['Painel e gêmeo 3D', 'O WebSocket autenticado entrega a mesma leitura à tela e ao modelo. Sem dado há 15 s, o painel marca como desatualizado.'],
  ['Alerta e avaliação', 'O painel destaca proximidade ou inclinação. O operador ou gestor avalia o aviso. Não é controle automático do veículo.'],
  ['Episódio no SOMPO', 'Quando alguém grava no simulador SOMPO, o sistema reúne o roteiro, as amostras e os quadros disponíveis.'],
  ['Análise na bancada', 'A pessoa envia o episódio à bancada. Os agentes cruzam a telemetria com as evidências disponíveis.'],
  ['Safra', 'O gestor compara jornadas, alertas e episódios ao longo do tempo para avaliar mudanças na operação.'],
];

function ReadingCard({ label, detail, value, decision }: { label: string; detail: string; value: string; decision: string }) {
  return <article className="sensor-reading-card"><h3>{label}</h3><small>{detail}</small><strong>{value}</strong><p>{decision}</p></article>;
}

export default function SensorLabPage() {
  const stageRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<SensorLabApi | null>(null);
  const [vehicle, setVehicle] = useState<SensorVehicle>(initialVehicle);
  const vehicleRef = useRef(vehicle);
  const [scenario, setScenario] = useState<SensorScenarioId>('curva');
  const [params, setParams] = useState(() => defaultParams(initialVehicle()));
  const [reading, setReading] = useState<SensorReading>(() => sampleSensorLab('curva', getSensorScenario('curva', initialVehicle()).param.value, 0, initialVehicle()));
  const [paused, setPaused] = useState(false);
  const [inside, setInside] = useState(false);
  const [exploded, setExploded] = useState(false);
  const [amplified, setAmplified] = useState(true);
  const [labels, setLabels] = useState(false);
  const [view, setView] = useState<SensorView | 'livre'>('caminhao');
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState('');
  const [modelStatus, setModelStatus] = useState('Caminhão');
  const initial = useRef({ vehicle, scenario, param: params.curva });
  const spec = getSensorScenario(scenario, vehicle);
  const packet = operationalTelemetry(reading);
  const profile = sensorVehicleProfile(vehicle);
  const scenarios = sensorScenarios(vehicle);
  const reducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);

  useEffect(() => {
    let cancelled = false;
    let api: SensorLabApi | null = null;
    void loadLabFonts().then(() => {
      if (cancelled || !stageRef.current) return;
      try {
        api = mountSensorLab(stageRef.current, {
          ...initial.current, exploded: false, amplified: true, view: 'caminhao', paused: false, labels: false, reducedMotion,
          onReading: setReading, onModelStatus: setModelStatus, onEvent: () => undefined,
          onViewChange: setView, onExplodedChange: setExploded,
          onScenarioChange: (id, value) => { setScenario(id); setParams(current => ({ ...current, [id]: value })); },
          onReady: () => setReady(true),
        });
        apiRef.current = api;
      } catch (error) { setFailure(error instanceof Error ? error.message : 'WebGL indisponível'); setReady(true); }
    }).catch(() => { setFailure('Não foi possível preparar a cena. Recarregue para tentar novamente.'); setReady(true); });
    return () => { cancelled = true; api?.dispose(); apiRef.current = null; };
  }, [reducedMotion]);

  const changeVehicle = useCallback((next: SensorVehicle, updateUrl = true) => {
    if (next === vehicleRef.current) return;
    vehicleRef.current = next;
    setVehicle(next);
    const nextParams = defaultParams(next);
    setParams(nextParams);
    apiRef.current?.setVehicle(next);
    apiRef.current?.setScenario(scenario, nextParams[scenario]);
    setReading(sampleSensorLab(scenario, nextParams[scenario], 0, next));
    if (updateUrl) {
      const url = new URL(window.location.href);
      if (next === 'trator') url.searchParams.set('veiculo', 'trator'); else url.searchParams.delete('veiculo');
      window.history.pushState(null, '', url);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }, [scenario]);

  useEffect(() => {
    const sync = () => changeVehicle(initialVehicle(), false);
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [changeVehicle]);

  const chooseScenario = (id: SensorScenarioId) => {
    setScenario(id);
    apiRef.current?.setScenario(id, params[id]);
    setReading(sampleSensorLab(id, params[id], 0, vehicle));
  };
  const chooseView = (next: SensorView) => { setView(next); apiRef.current?.setView(next); };
  const toggleInside = () => {
    setInside(!inside);
    setExploded(!inside);
    apiRef.current?.setExploded(!inside);
    chooseView(inside ? 'caminhao' : 'massa');
    stageRef.current?.parentElement?.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'instant' : 'smooth' });
  };
  const proximity = packet.distancia !== null;
  const riskLabel = proximity ? packet.panelProximity === 'danger' ? 'Perigo: obstáculo próximo' : packet.panelProximity === 'attention' ? 'Atenção à aproximação' : 'Aproximação em curso'
    : reading.level === 'tombou' ? 'Tombamento no ensaio' : packet.panelInclination ? 'Avaliar inclinação' : reading.flags.impacto ? 'Movimento brusco no ensaio' : reading.flags.frenagemBrusca ? 'Frenada brusca no ensaio' : 'Observe a leitura';
  const decision = proximity ? `${reading.phase === 'operador parou' ? 'O operador parou a 40 cm do obstáculo.' : reading.phase === 'operador freando' ? 'O operador está freando neste roteiro.' : 'O sensor indica a distância até o alvo frontal.'} A reação é roteirizada, não um comando enviado ao equipamento.`
    : packet.panelInclination ? 'A inclinação pede avaliação do operador. O limite desta demonstração não certifica a estabilidade do veículo real.'
      : 'Observe como o movimento muda as leituras. O operador ou gestor avalia o contexto antes de decidir uma ação.';

  return (
    <div className="sensor-lab sensor-operation" data-ready={ready} data-level={reading.level}>
      <header className="sensor-operation-header">
        <div><span className="sensor-eyebrow">LABORATÓRIO DO SENSOR</span><h1>Telemetria na operação</h1><p>O que o equipamento lê. O que a pessoa avalia.</p></div>
        <span className="sensor-demo-badge">Simulação didática, sem conexão com equipamento</span>
      </header>
      <section className="sensor-operation-controls" aria-label="Controles do laboratório">
        <div className="sensor-choice" role="group" aria-label="Veículo da bancada">
          <button aria-pressed={vehicle === 'caminhao'} onClick={() => changeVehicle('caminhao')}>Caminhão</button>
          <button aria-pressed={vehicle === 'trator'} onClick={() => changeVehicle('trator')}>Trator MAX</button>
        </div>
        <label className="sensor-essay-select">Ensaio<select value={scenario} onChange={event => { const found = scenarios.find(item => item.id === event.target.value); if (found) chooseScenario(found.id); }}>{scenarios.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
        <label className="sensor-operation-slider"><span>{spec.param.label} <b>{fmt(params[scenario], spec.param.digits)} {spec.param.unit}</b></span><input aria-label={spec.param.label} data-padrao={spec.param.value} type="range" min={spec.param.min} max={spec.param.max} step={spec.param.step} value={params[scenario]} onChange={event => { const value = Number(event.target.value); setParams(current => ({ ...current, [scenario]: value })); apiRef.current?.setParam(value); }} /></label>
        <button className="sensor-action" aria-label={paused ? 'Continuar' : 'Pausar'} onClick={() => { setPaused(!paused); apiRef.current?.setPaused(!paused); }}>{paused ? <Play size={17} /> : <Pause size={17} />}{paused ? 'Continuar' : 'Pausar'}</button>
        <button className="sensor-action" aria-label="Reiniciar ensaio" onClick={() => apiRef.current?.restart()}><RotateCcw size={17} />Repetir</button>
      </section>
      <div className="sensor-operation-main">
        <section className="sensor-visual" aria-label="Bancada 3D">
          <div className="sensor-stage" ref={stageRef} />
          {!ready && <div className="sensor-loading" role="status">Preparando bancada…</div>}
          {failure && <div className="sensor-loading" role="alert">A cena precisa de WebGL. {failure}</div>}
          <span className="sensor-model-status" role="status">{modelStatus}</span>
          <nav className="sensor-operation-views" aria-label="Vistas da câmera">{SENSOR_VIEWS.filter(item => inside || item.id === 'bancada' || item.id === 'caminhao').map(item => <button key={item.id} aria-pressed={view === item.id} onClick={() => chooseView(item.id)}>{item.label}</button>)}</nav>
          <span className="sensor-scene-note">{fmt(reading.speedKph)} km/h · {reading.phase} · movimento simulado</span>
        </section>
        <aside className="sensor-operation-readings" aria-label="Leituras e decisão operacional">
          <div className="sensor-decision" data-risk={proximity ? packet.panelProximity : packet.panelInclination ? 'danger' : 'clear'}><small>AVISO PRA AVALIAÇÃO DO OPERADOR / GESTOR</small><h2>{riskLabel}</h2><p>{decision}</p></div>
          <div className="sensor-reading-grid">
            <ReadingCard label="Distância frontal" detail="distancia · HC-SR04 no MAX" value={packet.distancia === null ? vehicle === 'trator' ? 'Sem alvo no ensaio' : 'Não simulado neste ensaio' : `${fmt(packet.distancia, 0)} cm`} decision="Atenção abaixo de 200 cm. Perigo até 100 cm ou flag de colisão. Avaliar a aproximação." />
            <ReadingCard label="Inclinação lateral" detail="Rolagem · roll no modelo" value={`${fmt(packet.roll)}°`} decision="A regra visual destaca 20° ou a flag. Avaliar estabilidade e contexto, não presumir um ângulo seguro." />
            <ReadingCard label="Inclinação frente/trás" detail="Arfagem · pitch no modelo" value={`${fmt(packet.pitch)}°`} decision="Ajuda a observar o balanço. Cruzar com as demais leituras antes de interpretar a manobra." />
            <ReadingCard label="Ambiente do sensor" detail="temperatura · umidade" value={packet.temperatura === null || packet.umidade === null ? 'Não simulado neste ensaio' : `${fmt(packet.temperatura, 0)} °C · ${fmt(packet.umidade, 0)} %`} decision="Valores sintéticos de contexto. Não medem a mercadoria e não geram flag térmica neste ensaio." />
          </div>
        </aside>
      </div>
      <section className="sensor-detail-section" aria-label="Regras e contrato">
        <div className="sensor-rule-grid">
          <article><h3>Limite físico ilustrativo</h3><strong>{fmt(profile.rolloverG, 2)} g</strong><p>Limite deste ensaio, não medido no veículo. Atenção em 60% e risco em 80% na encosta/curva. Não é recomendação de condução.</p></article>
          <article><h3>Flags simuladas do pacote</h3><p><code>riscoColisao</code>: <b>{packet.riscoColisao === null ? 'não simulado neste ensaio' : String(packet.riscoColisao)}</b><br /><code>riscoInclinacao</code>: <b>{String(packet.riscoInclinacao)}</b></p><p>No roteiro de aproximação, a flag entra a 150 cm. Ela não confirma uma batida.</p></article>
          <article><h3>Regra visual do painel</h3><p>Distância abaixo de <b>200 cm</b>: atenção. Até <b>100 cm</b> ou flag: perigo. Inclinação de <b>20°</b> ou flag: destaque.</p><p>O painel informa. O operador ou gestor avalia.</p></article>
        </div>
        <details className="sensor-contract"><summary>Ver leituras no formato do contrato</summary>
          <p>Identificador local: <code>{packet.trator}</code>. Relógio do ensaio: {fmt(packet.timestamp, 0)} ms. Nenhum pacote é transmitido.</p>
          <p>Convenções desta simulação: aceleração em g, rotação em °/s, distância em cm e ângulos em graus. O JSON real não declara unidades.</p>
          <p>No dispositivo documentado os nomes chegam trocados; o painel corrige na entrada.</p>
          <div className="sensor-axis-grid">{(['X', 'Y', 'Z'] as const).map(axis => <div key={axis}><span>aceleracao{axis}</span><b>{fmt(packet[`aceleracao${axis}`], 2)} g</b><span>rotacao{axis}</span><b>{fmt(packet[`rotacao${axis}`])} °/s</b></div>)}</div>
          <p>Acelerações mostram forças no chip, incluindo gravidade. Rotações mostram mudança de orientação, não posição ou norte absoluto. Movimentos bruscos pedem contexto, não provam colisão.</p>
          <p>Distância real nula, não positiva ou ≥ 999 não desenha obstáculo. “Sem alvo no ensaio” não comprova caminho livre.</p>
        </details>
      </section>
      <section className="sensor-mems-section">
        <button className="sensor-action" aria-expanded={inside} onClick={toggleInside}>{inside ? 'Voltar à operação' : 'Por dentro do sensor'}</button><p>O MEMS transforma força em sinal elétrico. A física continua aqui, sem ocupar o lugar da decisão.</p>
        {inside && <div className="sensor-mems-details"><h2>A massa de prova</h2><p>1 g desloca a massa cerca de {fmt(NM_PER_G)} nm. Capacitância de repouso: {fmt(C0_FF, 0)} fF. Conversão ilustrativa: {COUNTS_PER_G} contagens/g. Massa: {MEMS.proofMassUg} µg.</p><div className="sensor-choice"><button aria-pressed={exploded} onClick={() => { setExploded(!exploded); apiRef.current?.setExploded(!exploded); }}>Chip {exploded ? 'aberto' : 'fechado'}</button><button aria-pressed={amplified} onClick={() => { setAmplified(!amplified); apiRef.current?.setAmplified(!amplified); }}>{amplified ? 'Movimento ampliado' : 'Movimento real'}</button><button aria-pressed={labels} onClick={() => { setLabels(!labels); apiRef.current?.setLabels(!labels); }}>Etiquetas</button></div><p>Modo real: o deslocamento é pequeno demais para o olho. Ampliado muda só o desenho, não as leituras.</p></div>}
      </section>
      <section className="sensor-process" aria-labelledby="sensor-process-title"><span className="sensor-eyebrow">DO EQUIPAMENTO À AVALIAÇÃO</span><h2 id="sensor-process-title">Como o dado vira decisão na operação</h2><p>Este é o fluxo do SOMPO. Aqui na bancada, as leituras são simuladas e não percorrem essa rede.</p><ol>{PROCESS.map(([title, text], index) => <li key={title}><span>{String(index + 1).padStart(2, '0')}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol><p className="sensor-process-note">Um alerta não grava um episódio automaticamente. A gravação acontece por ação da pessoa no simulador SOMPO. Nesta página não há gravação, análise, escrita em Firebase ou comando ao equipamento.</p></section>
    </div>
  );
}
