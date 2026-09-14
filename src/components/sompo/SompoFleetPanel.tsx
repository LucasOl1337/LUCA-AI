import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowRight, BarChart3, RefreshCw, Tractor } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiGet, lucaApi } from '@/lib/api';
import { useAppLocation } from '@/hooks/useAppLocation';
import { useChatLibrary } from '@/hooks/useChatLibrary';
import { queueSompoLaunch } from '@/lib/sompo-cases';
import { buildSompoFleetEvidence, buildSompoFleetMission } from '@/lib/sompo-fleet-mission';
import { buildSompoFleetDemo } from '../../../shared/sompo-fleet-demo.js';
import type { FleetData, FleetEpisode, FleetMachine } from '../../../shared/sompo-fleet.js';
import type { SompoTelemetrySnapshot } from '@/lib/types';
import '@/sompo-fleet.css';

const number = (value: number | null | undefined, digits = 1) => value == null ? 'Não disponível' : value.toLocaleString('pt-BR', { maximumFractionDigits: digits });
const date = (value: string) => new Date(value).toLocaleString('pt-BR', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'short' });
const sourceLabel = (source: string) => source === 'firebase' ? 'Firebase · equipamento físico' : 'Simulação gravada';
const seconds = (ms: number) => `${number(ms / 1000)} s`;
const machineName = (id: string) => ({ 'DEMO-TRATOR': 'Trator', 'DEMO-COLHEITA': 'Colheitadeira', 'DEMO-CAMINHAO': 'Caminhão' })[id] || id;

function MachineTable({ machines, synthetic }: { machines: FleetMachine[]; synthetic: boolean }) {
  return <div className="sompo-fleet-table-wrap" tabIndex={0} aria-label="Tabela de desempenho por máquina, role horizontalmente se necessário">
    <table><thead><tr><th>Máquina</th><th>Jornadas / leituras</th><th>Observado / lacunas</th><th>Alertas de colisão</th><th>Alertas de inclinação</th><th>Picos</th></tr></thead>
      <tbody>{machines.map(m => <tr key={m.tractorId}><th>{machineName(m.tractorId)}<small>{m.tractorId}</small></th><td>{m.journeys.length} jornadas<small>{number(m.sampleCount, 0)} amostras · {seconds(m.durationMs)} de duração</small></td><td>{seconds(m.observedMs)} observados<small>{seconds(m.gapMs)} sem observação</small></td><td>{m.alerts.riscoColisao.count} alertas<small>{seconds(m.alerts.riscoColisao.durationMs)} ativos · {seconds(m.alerts.riscoColisao.knownMs)} conhecidos</small></td><td>{m.alerts.riscoInclinacao.count} alertas<small>{seconds(m.alerts.riscoInclinacao.durationMs)} ativos · {seconds(m.alerts.riscoInclinacao.knownMs)} conhecidos</small></td><td>|a| {number(m.peakAcceleration)} {synthetic ? 'm/s²' : 'u. origem'}<small>Inclinação {number(m.maxInclination)} {synthetic ? '°' : 'u. origem'}</small></td></tr>)}</tbody>
    </table>
  </div>;
}

function EpisodeEvidence({ episode }: { episode: FleetEpisode }) {
  const [frames, setFrames] = useState<{ seq: number; url: string; label: string; offsetMs: number }[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function load() {
    if (frames || loading) return;
    setLoading(true); setError('');
    try {
      const data = await apiGet<{ frames: NonNullable<typeof frames> }>(`/api/sompo/telemetry/episode/${encodeURIComponent(episode.publicId)}`);
      setFrames(data.frames);
    } catch { setError('Não foi possível carregar as imagens. Tente novamente.'); }
    finally { setLoading(false); }
  }
  return <details className="sompo-fleet-episode" onToggle={event => { if (event.currentTarget.open) void load(); }}>
    <summary>{episode.scenarioLabel || 'Episódio gravado'}<small>{episode.tractorId} · {sourceLabel(episode.sourceKind)} · {date(episode.startedAt)} UTC · {episode.status === 'complete' ? 'Concluído' : episode.status === 'recording' ? 'Gravando' : 'Interrompido'}</small></summary>
    <p>{episode.sampleCount} amostras · {episode.frameCount} imagens · pico |a| {number(episode.peakAcceleration)} {episode.sourceKind === 'firebase' ? 'u. origem' : 'm/s²'}{episode.peakAt && ` em ${date(episode.peakAt)} UTC`}</p>
    <p>{episode.phases.map(phase => `${phase.label}: ${seconds(phase.durationMs)}`).join(' · ') || 'Fases indisponíveis sem amostras.'} Fases estimadas pelo pico, sem confirmação de impacto.</p>
    {loading && <p role="status">Carregando evidências…</p>}
    {error && <p role="alert">{error} <button onClick={() => void load()}>Tentar novamente</button></p>}
    <div className="sompo-fleet-frames">{frames?.map(frame => <figure key={frame.seq}><img src={frame.url} alt={frame.label} loading="lazy" /><figcaption>{frame.label} · +{seconds(frame.offsetMs)}</figcaption></figure>)}</div>
    {frames?.length === 0 && <p>Este episódio não tem imagens gravadas.</p>}
  </details>;
}

interface Props { telemetry: SompoTelemetrySnapshot | null; episodeVersion: string; onRefreshTelemetry: () => Promise<void> }
export default function SompoFleetPanel({ telemetry, episodeVersion, onRefreshTelemetry }: Props) {
  const { navigate } = useAppLocation();
  const { createSession, busy: sessionsBusy } = useChatLibrary();
  const [recorded, setRecorded] = useState<FleetData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState('');
  const request = useRef(0);
  const demo = useMemo(buildSompoFleetDemo, []);
  const load = useCallback(async () => {
    const id = ++request.current;
    setBusy(true); setError('');
    try {
      const data = await apiGet<FleetData>('/api/sompo/telemetry/fleet', 30_000);
      if (id === request.current) setRecorded(data);
    } catch {
      if (id === request.current) setError('Não foi possível ler o histórico desta instalação. Atualize para tentar novamente.');
    } finally { if (id === request.current) setBusy(false); }
  }, []);
  useEffect(() => { void load(); return () => { request.current++; }; }, [load, episodeVersion]);
  const monthly = useMemo(() => ['2026-01', '2026-02', '2026-03', '2026-04'].map((month, i) => ({
    month: ['Jan', 'Fev', 'Mar', 'Abr'][i],
    ...Object.fromEntries(demo.machines.map(machine => [machine.tractorId, demo.episodes.filter(e => e.tractorId === machine.tractorId && e.month === month).length])),
  })), [demo]);
  const types = useMemo(() => [...new Set(demo.episodes.map(e => e.eventType))].map(type => {
    const events = demo.episodes.filter(e => e.eventType === type);
    const preventive = events.filter(e => e.prevented).length;
    return { type, preventive, total: events.length, percent: Math.round(preventive / events.length * 100) };
  }), [demo]);
  const live = telemetry?.freshness === 'fresh' && telemetry.connection.state === 'live';
  const a = telemetry?.readings.acceleration;
  const acceleration = a && [a.x, a.y, a.z].every(value => typeof value === 'number') ? Math.hypot(a.x!, a.y!, a.z!) : null;

  async function launch() {
    if (launching || sessionsBusy) return;
    setLaunching(true); setLaunchError('');
    try {
      const mission = buildSompoFleetMission(recorded, demo);
      // The runtime accepts at most 6,000 mission characters. The complete evidence travels as JSON.
      if (mission.length > 6000) throw new Error('O resumo ultrapassou o limite da bancada. Reduza o recorte antes de enviar.');
      const session = await createSession();
      if (!session) throw new Error('Não foi possível criar a sessão. Tente novamente.');
      const file = new File([JSON.stringify(buildSompoFleetEvidence(recorded, demo))], 'sompo-frota.json', { type: 'application/json' });
      const upload = await lucaApi.uploadChatAttachment(session.id, file);
      queueSompoLaunch({ caseId: 'safra-desempenho-frota', mission, mode: 'team', presetId: 'risco-agro', presetLabel: 'Equipe Risco Agro', autoRun: true, attachments: [upload.attachment] });
      navigate({ page: 'luca-ai', sessao: session.id }, 'push');
    } catch (reason) { setLaunchError(reason instanceof Error ? reason.message : 'Não foi possível abrir a bancada. Tente novamente.'); }
    finally { setLaunching(false); }
  }

  return <section className="sompo-fleet" aria-labelledby="sompo-fleet-title">
    <header className="sompo-fleet-heading"><div><span className="sompo-fleet-kicker">Safra · Desempenho da frota</span><h2 id="sompo-fleet-title">O que mudar na próxima safra?</h2><p>Compare o que cada máquina viveu e leve as evidências para a Equipe Risco Agro decidir o próximo passo.</p></div><button disabled={busy} onClick={() => { void load(); void onRefreshTelemetry(); }}><RefreshCw size={16} />{busy ? 'Atualizando…' : 'Atualizar'}</button></header>

    <section className="sompo-fleet-now" aria-label="Agora e último episódio"><div><h3><Activity size={18} />Agora · Trator {telemetry?.tractorId || '001'}</h3><strong>{live ? 'Firebase ao vivo' : 'Firebase sem sinal fresco'}</strong><p>{telemetry ? `Última leitura: ${date(telemetry.observedAt)} UTC` : 'Aguardando uma leitura do equipamento.'}</p><p>Inclinação lateral: {number(telemetry?.readings.roll)} u. origem · |a|: {number(acceleration)} u. origem</p><p>{live ? 'Alertas atuais' : 'Alertas da última leitura'}: colisão {telemetry?.risks.collision == null ? 'desconhecida' : telemetry.risks.collision ? 'acionado' : 'inativo'} · inclinação {telemetry?.risks.inclination == null ? 'desconhecida' : telemetry.risks.inclination ? 'acionado' : 'inativo'}.</p><small>IMU sem calibração confirmada. Um alerta não confirma acidente.</small><button onClick={() => navigate({ page: 'sompo', aba: 'telemetria', fonte: 'firebase', caso: '', cenario: '', desfecho: '' })}>Ver o equipamento <ArrowRight size={16} /></button></div><div><h3><Tractor size={18} />Último episódio gravado</h3>{recorded?.episodes[0] ? <EpisodeEvidence key={recorded.episodes[0].publicId} episode={recorded.episodes[0]} /> : <p>{busy ? 'Consultando episódios…' : 'Nenhum episódio disponível. Grave um roteiro na Telemetria e volte para comparar.'}</p>}</div></section>

    <section className="sompo-fleet-recorded" aria-labelledby="sompo-fleet-recorded"><h3 id="sompo-fleet-recorded">Nesta instalação (gravado)</h3><p>Todo o histórico disponível, sem recorte de safra. As origens abaixo ficam separadas.</p>{recorded && <small>Consulta: {date(recorded.generatedAt)} UTC{error ? ' · última consulta bem-sucedida' : ''}</small>}{error && <p role="alert">{error}</p>}{busy && <p role="status">Agregando jornadas…</p>}{recorded?.origins.map(origin => <div className="sompo-fleet-origin" key={origin.sourceKind}><h4>{sourceLabel(origin.sourceKind)}</h4>{origin.machines.length ? <><MachineTable machines={origin.machines} synthetic={origin.sourceKind === 'simulation'} /><details><summary>Ver jornadas por máquina</summary>{origin.machines.map(machine => <details key={machine.tractorId}><summary>{machine.tractorId} · {machine.journeys.length} jornadas</summary><ul>{machine.journeys.map(j => <li key={j.id}>{date(j.startedAt)} a {date(j.endedAt)} UTC · {j.sampleCount} amostras · {seconds(j.durationMs)} · colisão: {j.alerts.riscoColisao.count} alertas · inclinação: {j.alerts.riscoInclinacao.count} alertas</li>)}</ul></details>)}</details></> : <p>Nenhuma amostra registrada nesta origem.</p>}</div>)}{recorded && <p className="sompo-fleet-note">{recorded.method}</p>}<details><summary>Episódios registrados · {recorded?.episodes.length ?? 0} registros</summary>{recorded?.episodes.map(episode => <EpisodeEvidence key={episode.publicId} episode={episode} />)}</details></section>

    <section className="sompo-fleet-demo" aria-labelledby="sompo-fleet-demo"><span className="sompo-fleet-badge">{demo.label}</span><h3 id="sompo-fleet-demo">Três máquinas, quatro meses de situações no campo.</h3><p>{demo.season} · {demo.episodes.length} episódios sintéticos. Cada episódio reproduz um cenário e um desfecho existentes no simulador.</p><div className="sompo-fleet-charts"><article><h4>Episódios por máquina e mês</h4><small>Frota demonstrativa · contagem de episódios · 2026</small><div className="sompo-fleet-chart"><ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 300, height: 290 }}><BarChart data={monthly} margin={{ left: -15, right: 8, top: 18 }}><CartesianGrid stroke="var(--l-border)" vertical={false} /><XAxis dataKey="month" stroke="var(--l-text-mute)" /><YAxis allowDecimals={false} stroke="var(--l-text-mute)" /><Tooltip contentStyle={{ background: 'var(--l-panel)', borderColor: 'var(--l-border)', color: 'var(--l-text)' }} /><Legend height={36} iconSize={10} wrapperStyle={{ fontSize: 11 }} />{demo.machines.map((m, i) => <Bar isAnimationActive={false} key={m.tractorId} dataKey={m.tractorId} name={machineName(m.tractorId)} fill={['var(--l-gold-bright)', 'var(--l-ok)', 'var(--l-warning)'][i]} radius={[4, 4, 0, 0]} />)}</BarChart></ResponsiveContainer></div></article><article><h4>Desfechos preventivos por tipo</h4><small>Frota demonstrativa · % dos episódios roteirizados</small><div className="sompo-fleet-chart"><ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 300, height: 290 }}><BarChart data={types} layout="vertical" margin={{ left: 5, right: 25, top: 18 }}><CartesianGrid stroke="var(--l-border)" horizontal={false} /><XAxis type="number" domain={[0, 100]} unit="%" stroke="var(--l-text-mute)" /><YAxis type="category" dataKey="type" width={100} tick={{ fontSize: 11 }} stroke="var(--l-text-mute)" /><Tooltip contentStyle={{ background: 'var(--l-panel)', borderColor: 'var(--l-border)', color: 'var(--l-text)' }} /><Bar isAnimationActive={false} dataKey="percent" name="Desfechos preventivos (%)" fill="var(--l-ok)" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div><p>{types.map(t => `${t.type}: ${t.preventive}/${t.total} episódios`).join(' · ')}</p></article></div><p className="sompo-fleet-note">Prevenção aqui é o desfecho escolhido no roteiro. A proporção descreve esta demonstração e não mede eficácia, probabilidade de sinistro ou resultado financeiro.</p><MachineTable machines={demo.machines} synthetic /><details><summary>Explorar os {demo.episodes.length} episódios demonstrativos</summary><div className="sompo-fleet-demo-events">{demo.episodes.map(e => <article key={e.id}><strong>{e.machineName} · {e.eventType}</strong><p>{date(e.startedAt)} UTC · {e.outcomeLabel}</p><small>Pico |a|: {number(e.peakAcceleration)} m/s² · alerta em relação ao pico: {e.alertDelayMs == null ? 'sem alerta' : seconds(e.alertDelayMs)} · {e.prevented ? 'desfecho preventivo' : 'desfecho adverso'}</small><button onClick={() => navigate({ page: 'sompo', aba: 'telemetria', fonte: '', caso: '', cenario: e.scenarioId, desfecho: e.outcomeId })}>Ver este cenário em 3D <ArrowRight size={15} /></button></article>)}</div><p className="sompo-fleet-note">Atraso é o instante do primeiro alerta menos o instante do pico. Negativo significa antes do pico; não mede transmissão. O botão reproduz o roteiro sintético, não um replay gravado.</p></details></section>

    <footer className="sompo-fleet-decision"><div><h3><BarChart3 size={20} />Dos episódios à decisão</h3><p>Manter a carteira, treinar operadores, rever rota ou turno e discutir franquia com evidências. Valores financeiros e vínculo com apólices continuam pendentes.</p><small>A bancada recebe os dois blocos separados e o contexto demonstrativo da cooperativa, com as estatísticas completas em JSON.</small></div><button disabled={launching || sessionsBusy || busy} onClick={() => void launch()}>{launching ? 'Preparando evidências…' : 'Decidir a próxima safra na bancada'}<ArrowRight size={18} /></button>{launchError && <p role="alert">{launchError}</p>}</footer>
  </section>;
}
