import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, ChevronRight, Compass, Droplets, FileText, FolderOpen, History, LoaderCircle, Map, Pause, Play, RotateCcw, Save, ScanLine, Search, ShieldCheck, SkipBack, SkipForward, Thermometer, Tractor, Upload, Waves, WifiOff, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { parseLabCase, parseLabSite, associateLabSite, getReplayFrame, formatLabTime, polygonDistance, type LabCase, type LabSite } from '../../shared/lab-telemetry.js';
import { convertSompoDataset } from '../../shared/sompo-lab-export.js';
import { createFarmDemo } from '../../shared/lab-farm-demo.js';
import LabEsp32Replay from '@/components/lab/LabEsp32Replay';
// geofencing (módulo src/geofencing/lab): legenda, minimapa e painel de faixas do laboratório.
import LabBandLegend from '@/geofencing/lab/LabBandLegend';
import LabMiniMap from '@/geofencing/lab/LabMiniMap';
import { LabGeofencePanel, LabExposureStrip } from '@/geofencing/lab/LabGeofencePanel';
import { hazardsOf } from '@/geofencing/lab/labBands';
import { LAB_EXAMPLES, exampleMetadata, loadDefaultLabSite, categories, labRequest, downloadFile, exportLabReport, type CaseSummary, type SavedCase, type LabAnalysis, type ConclusionDraft, type Category, type Hypothesis, type LabExample } from '@/lib/lab-client';
import '@/laboratorio-page.css';

const LabScene = lazy(() => import('@/components/lab/LabScene'));
const STEPS = ['Carregar caso', 'Explorar incidente', 'Investigar causas', 'Registrar conclusão'];
const AXES = ['Operação e utilização', 'Saúde mecânica', 'Ambiente e localização', 'Revisão das evidências'];
const emptyDraft = (): ConclusionDraft => ({ observations: '', category: 'inconclusive', action: 'Solicitar inspeção técnica', hypothesisReviews: [] });
// A demonstração do caminhão é escrita para a fazenda de Fairfax; qualquer outra área não a oferece.
const FARM_DEMO_SITE_ID = 'frying-pan-farm-fairfax-v1';
const EXAMPLE_ICONS: Record<string, typeof Tractor> = { normal: Tractor, water: Waves, heat: Thermometer, 'piracicaba-normal': Tractor, 'piracicaba-slope': Compass };
const prettyNumber = (value: unknown, digits = 0) => typeof value === 'number' ? value.toLocaleString('pt-BR', { maximumFractionDigits: digits }) : 'Indisponível';
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir. Tente novamente.';

export default function LaboratorioPage() {
  const { user } = useAuth();
  const [labCase, setLabCase] = useState<LabCase | null>(null);
  const [record, setRecord] = useState<SavedCase | null>(null);
  const [library, setLibrary] = useState<CaseSummary[]>([]);
  const [step, setStep] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [cameraMode, setCameraMode] = useState<'free' | 'top' | 'follow'>('top');
  const [farmSite, setFarmSite] = useState<LabSite | null>(null);
  const [customSite, setCustomSite] = useState<LabSite | null>(null);
  const [siteChoice, setSiteChoice] = useState('farm');
  const [sensorView, setSensorView] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [sceneDetails, setSceneDetails] = useState(false);
  // Amostrador de relevo publicado pela cena; o minimapa pinta as zonas de inclinação com ele. Guardado via updater porque o estado é uma função.
  const [labTerrain, setLabTerrain] = useState<((x: number, z: number) => number | null) | null>(null);
  const selectedSite = siteChoice === 'farm' ? farmSite : siteChoice === 'custom' ? customSite : null;
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ConclusionDraft>(emptyDraft);
  const [focus, setFocus] = useState('');
  const [analysisId, setAnalysisId] = useState('');
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const siteInputRef = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const ownerKey = `luca.lab.${user?.id}`;
  const labRef = useRef(labCase); labRef.current = labCase;
  const positionRef = useRef(elapsedMs); positionRef.current = elapsedMs;
  const frame = useMemo(() => labCase ? getReplayFrame(labCase, elapsedMs) : null, [labCase, elapsedMs]);
  const selectedEvent = labCase?.events.find(event => event.id === selectedEventId);
  const currentAnalysis = record?.analyses.find(a => a.id === analysisId) || record?.analyses[record.analyses.length - 1];
  useEffect(() => { if (error) setPanelOpen(true); }, [error]);

  useEffect(() => {
    let alive = true;
    void loadDefaultLabSite().then(site => {
      if (!alive) return;
      setFarmSite(site);
      if (!site) { setSiteChoice('none'); setPanelOpen(true); setNotice('Escolha um exemplo ou carregue os arquivos da sua área. O pacote da fazenda é opcional e não acompanha a distribuição pública.'); }
    }).catch(reason => { if (alive) setError(errorMessage(reason)); });
    return () => { alive = false; };
  }, []);

  const refreshLibrary = useCallback(async () => {
    const result = await labRequest<{ cases: CaseSummary[] }>(''); setLibrary(result.cases);
  }, []);

  const restoreRecord = useCallback((saved: SavedCase, resume = false) => {
    const parsed = parseLabCase(saved.rawCsv, { fileName: saved.sourceName, manifest: saved.metadata, map: saved.map, schema: saved.schema });
    setLabCase(parsed); setRecord(saved); setPlaying(false); setError(''); setSelectedEventId(null);
    setSensorView(false); setCameraMode(parsed.samples.some(sample => sample.x !== null) ? 'follow' : 'top');
    let remembered: { elapsedMs?: number; step?: number; draft?: ConclusionDraft } = {};
    try { remembered = JSON.parse(localStorage.getItem(`${ownerKey}.${saved.id}`) || '{}'); } catch { /* A corrupted UI bookmark cannot hide a persisted case. */ }
    setElapsedMs(resume ? Math.min(remembered.elapsedMs || 0, parsed.durationMs) : 0);
    setStep(resume ? Math.min(3, remembered.step ?? 1) : 1);
    setDraft(remembered.draft || saved.conclusions[saved.conclusions.length - 1] || emptyDraft());
    setAnalysisId(saved.analyses[saved.analyses.length - 1]?.id || '');
    try { localStorage.setItem(`${ownerKey}.active`, saved.id); } catch { /* Case itself is persisted on the server. */ }
  }, [ownerKey]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const result = await labRequest<{ cases: CaseSummary[] }>('');
        if (!alive) return; setLibrary(result.cases);
        let id: string | null = null; try { id = localStorage.getItem(`${ownerKey}.active`); } catch { /* Optional bookmark. */ }
        if (id && result.cases.some(item => item.id === id)) {
          const saved = await labRequest<{ case: SavedCase }>(`/${encodeURIComponent(id)}`);
          if (alive && !labRef.current) { restoreRecord(saved.case, true); setNotice('Caso recuperado da sua conta.'); }
        }
      } catch (reason) { if (alive) setError(errorMessage(reason)); }
    })();
    return () => { alive = false; generation.current += 1; };
  }, [ownerKey, restoreRecord]);

  useEffect(() => {
    if (!record) return;
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(`${ownerKey}.${record.id}`, JSON.stringify({ elapsedMs, step, draft })); }
      catch { setNotice('Caso salvo na conta. O navegador não permitiu salvar o rascunho local.'); }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [draft, elapsedMs, ownerKey, record?.id, step]);

  useEffect(() => {
    if (!playing || !labCase) return;
    let raf: number; let before = performance.now();
    const tick = (now: number) => {
      const next = Math.min(labCase.durationMs, positionRef.current + (now - before) * rate);
      before = now; positionRef.current = next; setElapsedMs(next);
      if (next >= labCase.durationMs) { setPlaying(false); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [playing, rate, labCase]);

  function seek(ms: number, eventId: string | null = null) {
    setPlaying(false); setElapsedMs(ms); positionRef.current = ms; setSelectedEventId(eventId);
  }
  function selectEvent(id: string) {
    const event = labCase?.events.find(item => item.id === id);
    if (event) { seek(event.elapsedMs, id); setPanelOpen(true); if (step === 0) setStep(1); }
  }
  function jumpEvent(direction: number) {
    if (!labCase) return;
    const event = direction < 0 ? [...labCase.events].reverse().find(e => e.elapsedMs < elapsedMs - 1) : labCase.events.find(e => e.elapsedMs > elapsedMs + 1);
    if (event) selectEvent(event.id); else seek(direction < 0 ? 0 : labCase.durationMs);
  }
  async function saveCase(parsed = labCase) {
    if (!parsed) return;
    const token = generation.current; setSaving(true);
    try {
      const result = await labRequest<{ case: SavedCase }>('', { name: parsed.title, sourceName: parsed.fileName, rawCsv: parsed.rawCsv, metadata: parsed.manifest, map: parsed.map, schema: parsed.schema });
      if (token !== generation.current) return;
      setRecord(result.case); setDraft(result.case.conclusions[result.case.conclusions.length - 1] || emptyDraft());
      try { localStorage.setItem(`${ownerKey}.active`, result.case.id); } catch { /* Server remains authoritative. */ }
      setNotice('Caso salvo na sua conta.'); await refreshLibrary();
    } catch (reason) { if (token === generation.current) setError(`O replay está disponível, mas o caso ainda não foi salvo. ${errorMessage(reason)}`); }
    finally { if (token === generation.current) setSaving(false); }
  }
  async function openCsv(csv: string, fileName: string, associated: Record<string, unknown>) {
    const parsed = parseLabCase(csv, { fileName, ...associated });
    generation.current += 1; setLabCase(parsed); setRecord(null); setElapsedMs(0); positionRef.current = 0;
    setPlaying(false); setStep(1); setSelectedEventId(null); setError(''); setNotice(''); setDraft(emptyDraft()); setAnalysisId(''); setSensorView(false); setCameraMode(parsed.samples.some(sample => sample.x !== null) ? 'follow' : 'top');
    await saveCase(parsed);
  }
  async function openExample(example: LabExample) {
    setBusy(example.kind); setError('');
    try {
      const metadata = example.metadata ?? exampleMetadata;
      const response = await fetch(example.url); if (!response.ok) throw new Error('O arquivo de exemplo não está disponível. Tente novamente.');
      const [manifestResponse, mapResponse] = await Promise.all([fetch(metadata.manifest), fetch(metadata.map)]);
      if (![manifestResponse, mapResponse].every(item => item.ok)) throw new Error('Os metadados do exemplo não estão disponíveis. Tente novamente.');
      // O dicionário é opcional: sem URL não é buscado, e uma falha não impede abrir o caso.
      const schemaResponse = metadata.schema ? await fetch(metadata.schema).catch(() => null) : null;
      await openCsv(await response.text(), example.fileName, { manifest: await manifestResponse.json(), map: await mapResponse.json(), schema: schemaResponse?.ok ? await schemaResponse.json().catch(() => null) : null });
    }
    catch (reason) { setError(errorMessage(reason)); } finally { setBusy(''); }
  }
  async function importFiles(files: File[]) {
    setUploadFiles(files); setBusy('import'); setError('');
    try {
      if (files.some(file => file.size > 12 * 1024 * 1024)) throw new Error('Cada arquivo deve ter até 12 MB.');
      const datasets = files.filter(file => /\.json$/i.test(file.name) && !/^(manifest|schema|eventos-esperados)\b/i.test(file.name));
      if (datasets.length) {
        if (files.length !== 1) throw new Error('Selecione apenas o JSON do histórico ou episódio do gêmeo digital. Ele já contém os dados da exportação.');
        let dataset: unknown;
        try { dataset = JSON.parse(await datasets[0].text()); } catch { throw new Error('O dataset não contém JSON válido.'); }
        const converted = convertSompoDataset(dataset);
        if (siteChoice !== 'none' && !selectedSite) throw new Error('A área ainda não foi carregada. Aguarde ou escolha Somente arquivos do caso.');
        await openCsv(converted.csv, converted.fileName, { ...(selectedSite ? associateLabSite(converted.manifest, selectedSite) : { manifest: converted.manifest }), schema: converted.schema });
        return;
      }
      const csvs = files.filter(file => /\.csv$/i.test(file.name));
      if (csvs.length !== 1) throw new Error('Selecione um CSV do laboratório ou um JSON exportado do gêmeo digital.');
      const associated: Record<string, unknown> = {};
      for (const file of files.filter(file => !/\.csv$/i.test(file.name))) {
        if (/^eventos-esperados/i.test(file.name)) throw new Error('O gabarito eventos-esperados.json é exclusivo dos testes. Envie apenas CSV, mapa, manifesto e dicionário.');
        if (!/^manifest\.json$|^schema\.json$|\.geojson$/i.test(file.name)) throw new Error(`Arquivo associado não reconhecido: ${file.name}. Use manifest.json, schema.json ou mapa.geojson.`);
        const key = /\.geojson$/i.test(file.name) ? 'map' : /^manifest/i.test(file.name) ? 'manifest' : 'schema';
        if (key in associated) throw new Error(`Selecione apenas um arquivo para ${key}.`);
        try { associated[key] = JSON.parse(await file.text()); } catch { throw new Error(`${file.name} não contém JSON válido.`); }
      }
      if (!associated.map && !associated.manifest) {
        if (siteChoice !== 'none' && !selectedSite) throw new Error('A área ainda não foi carregada. Aguarde ou escolha Somente arquivos do caso.');
        if (selectedSite) Object.assign(associated, associateLabSite(null, selectedSite));
      }
      await openCsv(await csvs[0].text(), csvs[0].name, associated);
    } catch (reason) { setError(errorMessage(reason)); } finally { setBusy(''); }
  }
  async function importSite(files: File[]) {
    setBusy('site'); setError('');
    try {
      const manifest = files.find(file => /^manifest\.json$/i.test(file.name));
      const map = files.find(file => /\.geojson$/i.test(file.name));
      if (files.length !== 2 || !manifest || !map || files.some(file => file.size > 12 * 1024 * 1024)) throw new Error('Selecione manifest.json e um mapa.geojson, até 12 MB por arquivo.');
      const site = parseLabSite(JSON.parse(await manifest.text()), JSON.parse(await map.text()));
      setCustomSite(site); setSiteChoice('custom'); setNotice('Área carregada. Explore o mapa ou associe aos dados do caso.');
    } catch (reason) { setError(errorMessage(reason)); } finally { setBusy(''); }
  }
  function exploreSite() {
    generation.current += 1; setLabCase(null); setRecord(null); setPlaying(false); setSaving(false); setSensorView(false); setStep(0); setElapsedMs(0); setCameraMode('top');
    setPanelOpen(false);
  }
  function openFarmDemo() {
    if (!farmSite || !farmDemoAvailable) return;
    const demo = createFarmDemo(farmSite);
    generation.current += 1; setLabCase(demo); setRecord(null); setSaving(false); setDraft(emptyDraft()); setAnalysisId('');
    setSelectedEventId(null); setElapsedMs(0); positionRef.current = 0; setRate(1); setPlaying(true);
    setSensorView(false); setCameraMode('follow'); setStep(1); setPanelOpen(false); setSceneDetails(false); setError(''); setNotice('');
  }
  async function attachSite() {
    if (!labCase || !selectedSite) return;
    setBusy('site');
    try { await openCsv(labCase.rawCsv, labCase.fileName, { ...associateLabSite(labCase.manifest, selectedSite), schema: labCase.schema }); }
    catch (reason) { setError(errorMessage(reason)); } finally { setBusy(''); }
  }
  async function openSaved(id: string) {
    setBusy('restore'); setError('');
    try { const result = await labRequest<{ case: SavedCase }>(`/${encodeURIComponent(id)}`); generation.current += 1; restoreRecord(result.case); setNotice('Caso recuperado com seu histórico.'); }
    catch (reason) { setError(errorMessage(reason)); } finally { setBusy(''); }
  }
  async function investigate() {
    if (!record) return; const token = generation.current; setBusy('analysis'); setError(''); setNotice(''); setPlaying(false);
    try {
      const result = await labRequest<{ case: SavedCase; analysis: LabAnalysis }>(`/${record.id}/analyses`, { focus });
      if (token === generation.current) { setRecord(result.case); setAnalysisId(result.analysis.id); setNotice('Investigação concluída. Revise as evidências e as limitações.'); }
    } catch (reason) {
      if (token !== generation.current) return;
      const payload = (reason as Error & { payload?: { case?: SavedCase; analysis?: LabAnalysis } }).payload;
      if (payload?.case) setRecord(payload.case);
      if (payload?.analysis) setAnalysisId(payload.analysis.id);
      setError(errorMessage(reason));
    } finally { if (token === generation.current) { setBusy(''); void refreshLibrary().catch(() => {}); } }
  }
  async function conclude() {
    if (!record) return; setBusy('conclusion'); setError('');
    try { const result = await labRequest<{ case: SavedCase }>(`/${record.id}/conclusions`, draft); setRecord(result.case); setNotice('Conclusão registrada. A versão anterior foi preservada.'); await refreshLibrary(); }
    catch (reason) { setError(errorMessage(reason)); } finally { setBusy(''); }
  }
  const farmDemoAvailable = farmSite?.manifest?.site?.id === FARM_DEMO_SITE_ID;
  const hasHazards = useMemo(() => hazardsOf(labCase).length > 0, [labCase]);
  // Faixa mais interna no instante; a distância é medida de novo na posição do quadro, não no evento.
  const bandWarning = useMemo(() => {
    if (!labCase || !frame?.position) return null;
    const event = frame.activeEvents.filter(item => item.type === 'hazard_band').sort((a, b) => Number(a.evidence.threshold_m) - Number(b.evidence.threshold_m))[0];
    if (!event) return null;
    const hazard = hazardsOf(labCase).find(item => item.key === event.evidence.hazard);
    const one = (value: number) => value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    // Perigo de máquina: a leitura é a inclinação do quadro contra o limite do perfil, não uma distância.
    if (hazard?.metric) {
      const value = frame.sample[hazard.metric as keyof typeof frame.sample];
      return `Inclinação ${typeof value === 'number' ? `${one(Math.abs(value))}°` : 'indisponível'} · limite da máquina ${hazard.limit}° · ${event.evidence.band_label}`;
    }
    const distance = hazard?.polygon ? polygonDistance(frame.position, hazard.polygon) : Number(event.evidence.distance_m);
    return `Faixa: ${event.evidence.band_label} · ${one(distance)} m de ${event.evidence.hazard_label}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labCase, frame?.position]);
  const currentWarnings = frame?.gap ? 'GPS indisponível · posição não reconstruída' : bandWarning ? bandWarning : frame?.activeEvents.some(event => event.type === 'coolant_warning') ? 'Temperatura acima do limite didático' : frame?.activeEvents.some(event => event.type === 'near_water') ? 'Máquina próxima da zona de água' : frame?.activeEvents.some(event => event.type === 'outside_fence') ? 'Máquina fora da área permitida' : 'Operação dentro das regras verificáveis';

  return <div className="lab-page lab-scene-first" data-lab-page data-panel-open={panelOpen} data-scene-details={sceneDetails}>
    <header className="lab-header"><div><span className="lab-brand">SOMPO / LUCA-AI</span><h1>Laboratório virtual</h1></div><div className="lab-header-right"><button className="lab-text-button" aria-expanded={panelOpen} aria-controls="lab-case-panel" onClick={() => setPanelOpen(value => !value)}>{panelOpen ? 'Fechar painel' : 'Dados do caso'}</button><button className="lab-icon-button" title="Abrir casos salvos" aria-label="Abrir casos salvos" onClick={() => { setStep(0); setPanelOpen(true); }}><FolderOpen size={19} /></button></div></header>
    <nav className="lab-steps" aria-label="Etapas do laboratório">{STEPS.map((title, index) => <button key={title} aria-current={panelOpen && step === index ? 'step' : undefined} disabled={index > 0 && !labCase} onClick={() => { setStep(index); setPanelOpen(true); }}><strong>{title}</strong></button>)}</nav>
    <div className="lab-workbench">
      <section className={`lab-viewport ${sensorView ? 'lab-viewport-sensors' : ''}`} aria-label={sensorView ? 'Replay dos sensores ESP32' : 'Mapa e replay do caso'}>
        {labCase?.hasEsp32 && frame && sensorView ? <LabEsp32Replay labCase={labCase} frame={frame} /> : <>
        <Suspense fallback={<div className="lab-scene-loading"><LoaderCircle className="lab-spin" />Preparando o cenário…</div>}><LabScene labCase={labCase} site={selectedSite} elapsedMs={elapsedMs} cameraMode={cameraMode} selectedEventId={selectedEventId} onSelectEvent={selectEvent} showDetails={sceneDetails} onTerrain={sample => setLabTerrain(() => sample)} /></Suspense>
        <div className="lab-scene-title"><span>{labCase ? labCase.synthetic ? 'DADOS SINTÉTICOS' : 'CASO IMPORTADO' : 'ÁREA REAL · EXPLORAÇÃO'}</span><h2>{labCase?.title || selectedSite?.manifest?.site?.name || 'Explore sua área'}</h2>{!labCase && <p>Explore a imagem e os limites. Sem telemetria, a posição do equipamento está indisponível.</p>}</div>
        <div className="lab-camera-control" role="group" aria-label="Câmera">{([{ id: 'follow', label: 'Acompanhar', icon: Tractor }, { id: 'top', label: 'Superior', icon: Map }, { id: 'free', label: 'Livre', icon: Compass }] as const).map(item => <button key={item.id} disabled={item.id === 'follow' && !frame?.position} aria-pressed={cameraMode === item.id} onClick={() => setCameraMode(item.id)}><item.icon size={15} /><span>{item.label}</span></button>)}</div>
        <button className="lab-map-details-button" aria-pressed={sceneDetails} onClick={() => setSceneDetails(value => !value)}>{sceneDetails ? 'Ocultar detalhes' : 'Camadas e fontes'}</button>
        {sceneDetails && labCase && <LabBandLegend labCase={labCase} />}
        {!labCase && !sceneDetails && farmDemoAvailable && <div className="lab-demo-start"><strong>Veja a máquina no campo</strong><p>Acompanhe um percurso de demonstração na fazenda.</p><button disabled={!farmSite || !!busy} onClick={openFarmDemo}><Play size={16} />Ver caminhão em movimento</button><small>Percurso sintético · cenário real</small></div>}
        {labCase?.manifest?.demo === 'farm-truck-v1' && <span className="lab-demo-badge">DEMONSTRAÇÃO · PERCURSO SINTÉTICO</span>}
        {labCase && frame?.position && (sceneDetails || frame.activeEvents.length > 0) && <div className={`lab-scene-signal ${frame?.activeEvents.length || frame?.gap ? 'has-warning' : ''}`} data-lab-signal>{frame?.gap ? <WifiOff size={17} /> : frame?.activeEvents.length ? <ScanLine size={17} /> : <ShieldCheck size={17} />}<span>{currentWarnings}</span></div>}
        {labCase && !labCase.hasEsp32 && <div className="lab-sensors" aria-label="Sensores no instante do replay"><div><span>Velocidade <small>GNSS</small></span><strong data-lab-speed>{prettyNumber(frame?.sample.ground_speed_kmh, 1)}<em>{typeof frame?.sample.ground_speed_kmh === 'number' ? 'km/h' : ''}</em></strong></div><div><span>Motor <small>CAN / ECU</small></span><strong>{prettyNumber(frame?.sample.engine_rpm)}<em>{typeof frame?.sample.engine_rpm === 'number' ? 'rpm' : ''}</em></strong></div><div><span>Arrefecimento <small>CAN / ECU</small></span><strong className={Number(frame?.sample.coolant_temp_c) >= 105 ? 'lab-hot' : ''}>{prettyNumber(frame?.sample.coolant_temp_c, 1)}<em>{typeof frame?.sample.coolant_temp_c === 'number' ? '°C' : ''}</em></strong></div></div>}
        {labCase && !sensorView && labCase.polygons.length > 0 && <LabMiniMap labCase={labCase} elapsedMs={elapsedMs} onSeek={ms => seek(ms)} sampleTerrain={labTerrain} />}
        </>}
      </section>
      <aside className="lab-panel" id="lab-case-panel" hidden={!panelOpen} aria-label={STEPS[step]}>
        <div className="lab-panel-heading"><span>ETAPA {step + 1} DE 4</span><h2>{STEPS[step]}</h2><p>{['Escolha o ponto de partida da sua investigação.', 'Selecione um evento para observar o que mudou.', 'Cruze sinais e examine hipóteses com os agentes.', 'A evidência orienta. A decisão continua humana.'][step]}</p></div>
        <div className="lab-panel-body">
          {error && <div className="lab-message error" role="alert"><strong>Precisamos da sua atenção</strong><p>{error}</p><button aria-label="Dispensar erro" onClick={() => setError('')}><X size={14} /></button></div>}
          {notice && <div className="lab-message" role="status"><p>{notice}</p><button aria-label="Dispensar aviso" onClick={() => setNotice('')}><X size={14} /></button></div>}
          {(step === 0 || step === 1) && <details className="lab-details lab-area">
            <summary>Área do laboratório</summary>
            <label className="lab-field">Área para associar<select aria-label="Área para associar" value={siteChoice} disabled={!!busy || saving} onChange={event => setSiteChoice(event.target.value)}><option value="farm">{farmSite?.manifest?.site?.name ?? 'Área padrão'}</option>{customSite && <option value="custom">{customSite.manifest?.site?.name || 'Área carregada'}</option>}<option value="none">Somente arquivos do caso</option></select></label>
            <input ref={siteInputRef} type="file" multiple accept=".json,.geojson" aria-label="Carregar manifesto e GeoJSON da área" className="lab-file-input" onChange={event => { void importSite(Array.from(event.target.files || [])); event.target.value = ''; }} />
            <button className="lab-text-button" disabled={!!busy || saving} onClick={() => siteInputRef.current?.click()}><Upload size={14} />Carregar outra área</button>
            <button className="lab-text-button" disabled={!!busy || saving || !selectedSite} onClick={exploreSite}><Map size={14} />Explorar área sem telemetria</button>
            {labCase && <button className="lab-text-button" disabled={!!busy || saving || !selectedSite} onClick={() => void attachSite()}><Map size={14} />Associar área ao caso</button>}
            <p>{labCase ? `Área salva neste caso: ${labCase.manifest?.site?.name || 'geometrias do arquivo'}. Trocar a seleção só afeta os próximos arquivos; associar cria uma versão independente quando a área muda.` : 'A área selecionada será associada ao JSON SOMPO ou CSV sem mapa/manifesto. Os três exemplos mantêm seus cenários fictícios.'}</p>
            {(labCase || selectedSite)?.warnings.filter(warning => /Mapa|área|Limite|fazenda/i.test(warning)).map((warning, index) => <p key={index}>{warning}</p>)}
            {selectedSite?.manifest?.satellite && <p>Imagem: {selectedSite.manifest.satellite.attribution}. {selectedSite.manifest.terrain ? 'LiDAR disponível; controle de relevo no mapa.' : 'Relevo não carregado.'}</p>}
          </details>}
          {labCase?.hasEsp32 && <div className="lab-view-tabs" role="group" aria-label="Visualização do ESP32"><button aria-pressed={!sensorView} onClick={() => setSensorView(false)}>Mapa da área</button><button aria-pressed={sensorView} onClick={() => setSensorView(true)}>Sensores ESP32</button></div>}
          {step === 0 && <>
            {farmDemoAvailable && <button className="lab-demo-library" disabled={!!busy} onClick={openFarmDemo}><Play size={16} />Caminhão na fazenda <small>Demonstração sintética · 90 s</small></button>}
            <input ref={inputRef} type="file" multiple accept=".csv,.json,.geojson" aria-label="Carregar CSV ou JSON do gêmeo digital" className="lab-file-input" onChange={event => { void importFiles(Array.from(event.target.files || [])); event.target.value = ''; }} />
            <button className="lab-upload" disabled={!!busy} onClick={() => inputRef.current?.click()} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!busy) void importFiles(Array.from(event.dataTransfer.files)); }}><Upload size={24} /><strong>Carregar um caso</strong><span>CSV do laboratório ou JSON do gêmeo</span><small>Arraste ou selecione os arquivos · até 12 MB</small></button>
            <details className="lab-details"><summary>Formato e dados associados</summary><p>Exporte JSON ou CSV no monitoramento do gêmeo digital e carregue aqui. O JSON do histórico ou episódio é convertido automaticamente, com origem e ausências preservadas. São necessárias duas amostras de uma máquina e uma origem.</p><p>CSV UTF-8, vírgula, decimal ponto e timestamps UTC. Para CSV, selecione também manifest.json, schema.json e mapa.geojson quando disponíveis. Sem posição e mapa, cerca e água não podem ser verificadas.</p></details>
            {busy === 'import' && <p className="lab-inline-status"><LoaderCircle size={15} className="lab-spin" />Validando {uploadFiles.length} arquivo(s)…</p>}
            <div className="lab-section-label">Ou explore um exemplo <span>10 min cada</span></div>
            <div className="lab-examples">{LAB_EXAMPLES.map(example => { const Icon = EXAMPLE_ICONS[example.kind] ?? Tractor; return <button key={example.kind} disabled={!!busy} onClick={() => void openExample(example)} data-lab-example={example.kind}><span className={`lab-example-icon ${example.kind}`}>{busy === example.kind ? <LoaderCircle className="lab-spin" size={19} /> : <Icon size={20} />}</span><span><strong>{example.title}</strong><small>{example.description}</small></span><ArrowRight size={16} /></button>; })}</div>
            {library.length > 0 && <><div className="lab-section-label">Seus casos salvos <span>{library.length}</span></div><div className="lab-saved-list">{library.map(item => <button key={item.id} disabled={!!busy} onClick={() => void openSaved(item.id)}><History size={16} /><span><strong>{item.name}</strong><small>{item.conclusionCount} conclusão(ões) · {item.analysisCount} análise(s)</small></span><ChevronRight size={15} /></button>)}</div></>}
            <p className="lab-footnote">Exemplos fictícios. As coordenadas servem apenas de referência; não representam uma propriedade real.</p>
          </>}
          {step === 1 && labCase && <>
            <div className="lab-case-summary"><Tractor size={20} /><div><strong>{labCase.machineId}</strong><small>{labCase.samples.length.toLocaleString('pt-BR')} amostras · {formatLabTime(labCase.durationMs)}</small></div><span className="lab-chip">{labCase.synthetic ? 'Sintético' : 'CSV'}</span></div>
            <div className="lab-section-label">Eventos registrados <span>{labCase.events.length}</span></div>
            {!labCase.events.length && <div className="lab-empty"><ShieldCheck /><strong>Nenhum evento detectado</strong><p>As amostras disponíveis não acionaram as regras aplicáveis. Isso não comprova ausência de problemas fora da cobertura dos sensores.</p></div>}
            <div className="lab-event-list">{labCase.events.map(event => <button key={event.id} className={`${selectedEventId === event.id ? 'selected' : ''} ${event.transition === 'end' ? 'resolved' : ''}`} onClick={() => selectEvent(event.id)} data-lab-event={event.id}><span className="lab-event-symbol">{event.type === 'hazard_band' ? String(event.evidence.hazard).startsWith('water') ? <Waves size={15} /> : <ScanLine size={15} /> : event.type === 'near_water' ? <Droplets size={15} /> : event.type === 'coolant_warning' ? <Thermometer size={15} /> : event.type === 'gnss_unavailable' ? <WifiOff size={15} /> : <ScanLine size={15} />}</span><span><strong>{event.title}</strong><small>{formatLabTime(event.elapsedMs)}</small></span><ChevronRight size={14} /></button>)}</div>
            {hasHazards && <><div className="lab-section-label">Faixas de proximidade <span>{labCase.geofence?.episodes.length ?? 0}</span></div><LabGeofencePanel labCase={labCase} selectedEventId={selectedEventId} onSeek={(ms, eventId) => { seek(ms, eventId); setPanelOpen(true); }} /></>}
            {selectedEvent && <div className="lab-event-detail" aria-live="polite" data-lab-event-detail><span>NO INSTANTE SELECIONADO</span><h3>{selectedEvent.title}</h3><p>{selectedEvent.description}</p><small>{new Date(selectedEvent.timestamp).toLocaleString('pt-BR', { timeZone: 'UTC' })} UTC</small></div>}
            <details className="lab-details"><summary>Qualidade, sensores e origem</summary><p>{labCase.fileName}</p><p>UTC: {labCase.startedAt}</p><p>Reprodução por amostras registradas. GNSS/IMU: 10 Hz; ECU e ambiente: 1 Hz nos exemplos. Não há edição das condições registradas.</p>{labCase.warnings.map((warning, i) => <p key={i}>{warning}</p>)}<button className="lab-text-button" onClick={() => downloadFile(labCase.rawCsv, labCase.fileName, 'text/csv;charset=utf-8')}><ArrowDownToLine size={14} />Baixar CSV original</button></details>
          </>}
          {step === 2 && labCase && <>
            <div className="lab-agent-roster">{AXES.map((axis, i) => <div key={axis}><span>{i + 1}</span><strong>{axis}</strong>{currentAnalysis?.axes[i]?.status === 'completed' ? <Check size={15} /> : <Search size={14} />}</div>)}</div>
            <label className="lab-field">Foco da investigação <textarea rows={2} value={focus} onChange={event => setFocus(event.target.value)} placeholder="Ex.: que evidências distinguem carga de falha de arrefecimento?" maxLength={4000} /></label>
            <button className="lab-primary" disabled={!!busy || !record} onClick={() => void investigate()}>{busy === 'analysis' ? <LoaderCircle size={17} className="lab-spin" /> : <Search size={17} />}{busy === 'analysis' ? 'Investigando evidências…' : currentAnalysis?.status === 'unavailable' ? 'Tentar investigação novamente' : currentAnalysis ? 'Pedir outra investigação' : 'Investigar com os agentes'}</button>
            <p className="lab-footnote">Os agentes recebem os sinais, as regras e as evidências calculadas. A análise não determina culpa nem cria probabilidades de confiança.</p>
            {record && record.analyses.length > 0 && <label className="lab-field">Versões da investigação<select value={currentAnalysis?.id || ''} onChange={event => setAnalysisId(event.target.value)}>{record.analyses.map(analysis => <option value={analysis.id} key={analysis.id}>v{analysis.version} · {analysis.status === 'completed' ? 'Concluída' : analysis.status === 'running' ? 'Em execução' : 'Indisponível'}</option>)}</select></label>}
            {currentAnalysis?.status === 'unavailable' && <div className="lab-empty"><WifiOff /><strong>Serviço de IA indisponível</strong><p>A tentativa foi registrada. Nenhuma resposta simulada substitui a análise. Você pode tentar novamente ou registrar uma conclusão inconclusiva.</p></div>}
            {currentAnalysis?.axes.filter((axis: LabAnalysis['axes'][number]) => axis.status === 'completed').map((axis: LabAnalysis['axes'][number]) => <section className="lab-analysis-axis" key={axis.id}><h3>{axis.title}</h3><p>{axis.summary}</p>{axis.hypotheses.map((hypothesis: Hypothesis) => <article className="lab-hypothesis" key={hypothesis.id}><h4>{hypothesis.title}</h4><p>{hypothesis.explanation}</p><div className="lab-evidence-links">{hypothesis.evidence.map((evidence: Hypothesis['evidence'][number], i: number) => <button key={i} onClick={() => seek(evidence.elapsedMs)}><Play size={12} /><span>{formatLabTime(evidence.elapsedMs)} · {evidence.description}</span></button>)}</div><details className="lab-details"><summary>Limitações e informações necessárias</summary>{hypothesis.limitations.map((text: string, i: number) => <p key={`l${i}`}>{text}</p>)}{hypothesis.additionalInformation.map((text: string, i: number) => <p key={`a${i}`}>{text}</p>)}</details></article>)}<details className="lab-details"><summary>Cobertura desta análise</summary>{[...axis.limitations, ...axis.additionalInformation].map((text: string, i: number) => <p key={i}>{text}</p>)}</details></section>)}
          </>}
          {step === 3 && labCase && <>
            {!record?.analyses.some(analysis => analysis.status === 'completed') && <p className="lab-inline-note">Não há investigação de IA concluída. Você pode registrar sua avaliação humana e as pendências.</p>}
            <label className="lab-field">Natureza da conclusão<select value={draft.category} onChange={event => setDraft(value => ({ ...value, category: event.target.value as Category }))}>{Object.entries(categories).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label>
            <label className="lab-field">Observações do analista<textarea rows={5} value={draft.observations} onChange={event => setDraft(value => ({ ...value, observations: event.target.value }))} placeholder="Descreva o que as evidências sustentam, as limitações e o que precisa ser confirmado." maxLength={16000} /></label>
            {record?.analyses.filter(analysis => analysis.status === 'completed').flatMap(analysis => analysis.hypotheses.map(hypothesis => { const review = draft.hypothesisReviews.find(item => item.analysisId === analysis.id && item.hypothesisId === hypothesis.id); return <div className="lab-review" key={`${analysis.id}:${hypothesis.id}`}><strong>v{analysis.version} · {hypothesis.title}</strong><select aria-label={`Revisão: ${hypothesis.title}`} value={review?.stance || 'pending'} onChange={event => setDraft(value => ({ ...value, hypothesisReviews: [...value.hypothesisReviews.filter(item => !(item.analysisId === analysis.id && item.hypothesisId === hypothesis.id)), { analysisId: analysis.id, hypothesisId: hypothesis.id, stance: event.target.value as 'agree' | 'disagree' | 'pending', note: review?.note || '' }] }))}><option value="pending">Revisão pendente</option><option value="agree">Concordo com a hipótese</option><option value="disagree">Discordo da hipótese</option></select><input aria-label={`Justificativa: ${hypothesis.title}`} placeholder="Justificativa da revisão" value={review?.note || ''} onChange={event => setDraft(value => ({ ...value, hypothesisReviews: [...value.hypothesisReviews.filter(item => !(item.analysisId === analysis.id && item.hypothesisId === hypothesis.id)), { analysisId: analysis.id, hypothesisId: hypothesis.id, stance: review?.stance || 'pending', note: event.target.value }] }))} /></div>; }))}
            <label className="lab-field">Ação a registrar<select value={draft.action} onChange={event => setDraft(value => ({ ...value, action: event.target.value }))}>{['Solicitar inspeção técnica', 'Solicitar histórico de manutenção', 'Solicitar dados complementares', 'Encaminhar para revisão humana', 'Encerrar com evidências disponíveis'].map(action => <option key={action}>{action}</option>)}</select></label>
            <button className="lab-primary" disabled={!!busy || !record || !draft.observations.trim()} onClick={() => void conclude()}>{busy === 'conclusion' ? <LoaderCircle size={16} className="lab-spin" /> : <Save size={16} />}Registrar conclusão{record?.conclusions.length ? ` v${record.conclusions.length + 1}` : ''}</button>
            <p className="lab-footnote">A ação fica no relatório. Este registro não envia mensagens nem comandos à máquina.</p>
            <button className="lab-secondary" onClick={() => setStep(2)}><RotateCcw size={15} />Pedir outra investigação</button>
            {record && record.conclusions.length > 0 && <><div className="lab-section-label">Histórico de conclusões</div>{[...record.conclusions].reverse().map(conclusion => <details key={conclusion.id} className="lab-details"><summary>v{conclusion.version} · {categories[conclusion.category]}</summary><p>{conclusion.observations}</p><p>{conclusion.action}</p><small>{new Date(conclusion.createdAt).toLocaleString('pt-BR')}</small></details>)}</>}
            <button className="lab-secondary" onClick={() => exportLabReport(labCase, record, user?.name || 'Analista')}><FileText size={16} />Exportar relatório</button>
          </>}
        </div>
        {labCase && <footer className="lab-panel-footer"><span>{saving ? 'Salvando caso…' : record ? 'Salvo na sua conta' : labCase.manifest?.demo ? 'Demonstração local' : 'Caso ainda não salvo'}</span>{!record && !saving ? <button onClick={() => void saveCase()}>{labCase.manifest?.demo ? 'Salvar demonstração' : 'Tentar salvar'}</button> : step < 3 ? <button onClick={() => setStep(step + 1)}>{step === 0 ? 'Continuar' : step === 1 ? 'Investigar' : 'Concluir'}<ArrowRight size={15} /></button> : <button onClick={() => setStep(1)}><ArrowLeft size={14} />Rever incidente</button>}</footer>}
      </aside>
    </div>
    <footer className={`lab-replay ${!labCase ? 'is-empty' : ''}`} aria-label="Controles de reprodução">
      <div className="lab-replay-top"><div className="lab-transport"><button aria-label="Evento anterior" disabled={!labCase} onClick={() => jumpEvent(-1)}><SkipBack size={17} /></button><button className="lab-play" disabled={!labCase} aria-label={playing ? 'Pausar reprodução' : 'Reproduzir operação'} onClick={() => { if (labCase && elapsedMs >= labCase.durationMs) { setElapsedMs(0); positionRef.current = 0; } setPlaying(!playing); }}>{playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button><button aria-label="Próximo evento" disabled={!labCase} onClick={() => jumpEvent(1)}><SkipForward size={17} /></button><time data-lab-clock>{formatLabTime(elapsedMs)}<span> / {formatLabTime(labCase?.durationMs || 0)}</span></time></div><div className="lab-replay-right"><label>Velocidade<select aria-label="Velocidade de reprodução" value={rate} onChange={event => setRate(Number(event.target.value))}>{[0.5, 1, 2, 5, 10, 30].map(value => <option value={value} key={value}>{value}×</option>)}</select></label><span>{labCase ? `${new Date(frame?.sample.timestamp || labCase.startedAt).toLocaleTimeString('pt-BR', { timeZone: 'UTC' })} UTC` : 'Abra um caso para explorar a linha do tempo'}</span></div></div>
      <div className="lab-timeline">{labCase?.geofence?.episodes.length ? <LabExposureStrip labCase={labCase} onSeek={(ms, eventId) => seek(ms, eventId)} /> : null}<div className="lab-timeline-markers">{labCase?.events.map(event => <button key={event.id} style={{ left: `${event.elapsedMs / (labCase.durationMs || 1) * 100}%` }} className={event.transition === 'end' ? 'resolved' : ''} title={`${formatLabTime(event.elapsedMs)} · ${event.title}`} aria-label={`Ir para ${event.title} em ${formatLabTime(event.elapsedMs)}`} onClick={() => selectEvent(event.id)} />)}</div><input type="range" aria-label="Linha do tempo" min={0} max={labCase?.durationMs || 1} step={100} value={elapsedMs} disabled={!labCase} onChange={event => seek(Number(event.target.value))} style={{ '--lab-progress': `${elapsedMs / (labCase?.durationMs || 1) * 100}%` } as React.CSSProperties} /><div className="lab-time-ticks">{[0, 0.25, 0.5, 0.75, 1].map(ratio => <span key={ratio}>{formatLabTime((labCase?.durationMs || 0) * ratio)}</span>)}</div></div>
    </footer>
  </div>;
}
