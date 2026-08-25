import type { ReactNode } from 'react';
import {
  Activity,
  Cpu,
  Database,
  Droplets,
  Gauge,
  Loader2,
  RefreshCw,
  Ruler,
  ShieldAlert,
  ShieldCheck,
  Thermometer,
  TriangleAlert,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { SompoTelemetrySnapshot } from '@/lib/types';

interface SompoTelemetryPanelProps {
  telemetry: SompoTelemetrySnapshot | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  onRefresh?: () => void;
  children?: ReactNode;
}

function number(value: number | null | undefined, maximumFractionDigits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits }).format(value);
}

function clock(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function age(value: number): string {
  const seconds = Math.max(0, Math.round(value / 1_000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}min ${seconds % 60}s`;
}

function riskValue(active: boolean, safeLabel: string, stale: boolean): string {
  if (active) return stale ? 'Detectado no snapshot' : 'Detectado';
  return stale ? `Último valor: ${safeLabel.toLowerCase()}` : safeLabel;
}

export default function SompoTelemetryPanel({
  telemetry,
  loading,
  refreshing,
  error,
  onRefresh,
  children,
}: SompoTelemetryPanelProps) {
  const stale = telemetry?.freshness === 'stale';
  const simulation = telemetry?.source.kind === 'simulation';
  const connectionState = telemetry?.connection.state || 'connecting';
  const live = connectionState === 'live';
  const historical = stale || !live;
  const connectionWarning = simulation ? null : error
    || (connectionState === 'reconnecting'
      ? `Canal com o Firebase caiu; reconexão automática em andamento (tentativa ${telemetry?.connection.retryAttempt || 1}).`
      : connectionState === 'stopped'
        ? 'O canal em tempo real foi interrompido no runtime.'
        : null);

  return (
    <section
      className="sompo-telemetry"
      aria-label={simulation
        ? `Telemetria simulada do caminhão ${telemetry?.tractorId || 'SIM-001'}`
        : `Telemetria do trator ${telemetry?.tractorId || '001'}`}
      data-sompo-telemetry
      data-source={simulation ? 'simulation' : 'firebase'}
    >
      {loading && !telemetry && (
        <div className="sompo-telemetry-empty" role="status">
          <Loader2 className="animate-spin" />
          <strong>Abrindo canal em tempo real…</strong>
          <p>Assinando continuamente /trator/001/sensores no Firebase.</p>
        </div>
      )}

      {!loading && !telemetry && (
        <div className="sompo-telemetry-empty" role="alert">
          <WifiOff />
          <strong>Telemetria indisponível</strong>
          <p>{error || 'O Firebase não respondeu.'}</p>
          {onRefresh && (
            <button type="button" onClick={onRefresh} disabled={refreshing}>
              <RefreshCw className={refreshing ? 'animate-spin' : ''} />
              Tentar novamente
            </button>
          )}
        </div>
      )}

      {telemetry && (
        <>
          <div className="sompo-telemetry-head">
            <div className="sompo-telemetry-identity">
              <span className={`sompo-telemetry-risk-icon ${telemetry.status}`}>
                {telemetry.status === 'alert' ? <ShieldAlert /> : <ShieldCheck />}
              </span>
              <div>
                <div className="sompo-telemetry-eyebrow">
                  {simulation ? 'ESP32 virtual · Caminhão' : 'ESP32 · Trator'} {telemetry.tractorId}
                </div>
                <h2>
                  {telemetry.status === 'alert'
                    ? simulation ? 'Cenário com flags de risco' : historical ? 'Alerta registrado' : 'Alerta ativo'
                    : simulation ? 'Ensaio sem flags de risco' : 'Operação sem flags de risco'}
                </h2>
              </div>
            </div>
            <div className="sompo-telemetry-connection" aria-live={simulation ? 'off' : 'polite'}>
              <span data-freshness={telemetry.freshness} data-connection={connectionState}>
                {simulation
                  ? <Cpu />
                  : (connectionState === 'connecting' || connectionState === 'reconnecting')
                  ? <Loader2 className="animate-spin" />
                  : historical ? <WifiOff /> : <Wifi />}
                {simulation && 'Simulação local ativa'}
                {!simulation && connectionState === 'connecting' && 'Conectando ao fluxo'}
                {!simulation && connectionState === 'reconnecting' && 'Reconectando ao fluxo'}
                {!simulation && connectionState === 'stopped' && 'Fluxo interrompido'}
                {!simulation && live && telemetry.freshness === 'fresh' && 'Tempo real conectado'}
                {!simulation && live && telemetry.freshness === 'checking' && 'Canal conectado · validando dados'}
                {!simulation && live && stale && `Conectado · sem mudança há ${age(telemetry.unchangedForMs)}`}
              </span>
              <small>{simulation ? 'Amostra gerada' : 'Último evento'} às {clock(telemetry.connection.lastEventAt || telemetry.observedAt)}</small>
              {onRefresh && (
                <button
                  type="button"
                  aria-label="Atualizar telemetria agora"
                  title="Atualizar telemetria agora"
                  onClick={onRefresh}
                  disabled={refreshing}
                >
                  <RefreshCw className={refreshing ? 'animate-spin' : ''} />
                </button>
              )}
            </div>
          </div>

          {connectionWarning && (
            <p className="sompo-telemetry-warning" role="status">
              <TriangleAlert /> Último snapshot preservado. {connectionWarning}
            </p>
          )}

          <div
            className="sompo-risk-grid"
            role="group"
            aria-label={simulation ? 'Flags sintéticas do cenário' : 'Flags do firmware'}
          >
            <article data-active={telemetry.risks.collision}>
              <ShieldAlert />
              <div>
                <span>Risco de colisão</span>
                <strong>{riskValue(telemetry.risks.collision, 'Livre', historical)}</strong>
              </div>
            </article>
            <article data-active={telemetry.risks.inclination}>
              <Gauge />
              <div>
                <span>Risco de inclinação</span>
                <strong>{riskValue(telemetry.risks.inclination, 'Estável', historical)}</strong>
              </div>
            </article>
          </div>

          <div className="sompo-sensor-grid" role="group" aria-label="Leituras dos sensores">
            <article>
              <span className="sompo-sensor-icon"><Ruler /></span>
              <div><span>Distância frontal</span><strong>{number(telemetry.readings.distance)} <small>cm*</small></strong></div>
            </article>
            <article>
              <span className="sompo-sensor-icon"><Thermometer /></span>
              <div><span>Temperatura</span><strong>{number(telemetry.readings.temperature, 1)} <small>°C*</small></strong></div>
            </article>
            <article>
              <span className="sompo-sensor-icon"><Droplets /></span>
              <div><span>Umidade</span><strong>{number(telemetry.readings.humidity, 1)} <small>%*</small></strong></div>
            </article>
            <article>
              <span className="sompo-sensor-icon"><Gauge /></span>
              <div>
                <span>Inclinação</span>
                <strong>{number(telemetry.readings.pitch)}° / {number(telemetry.readings.roll)}°*</strong>
                <small>pitch / roll</small>
              </div>
            </article>
            <article>
              <span className="sompo-sensor-icon"><Activity /></span>
              <div>
                <span>Aceleração vetorial</span>
                <strong>{number(telemetry.readings.acceleration.magnitude)} <small>m/s²*</small></strong>
                <small>x {number(telemetry.readings.acceleration.x)} · y {number(telemetry.readings.acceleration.y)} · z {number(telemetry.readings.acceleration.z)}</small>
              </div>
            </article>
            <article>
              <span className="sompo-sensor-icon"><RefreshCw /></span>
              <div>
                <span>Rotação vetorial</span>
                <strong>{number(telemetry.readings.rotation.magnitude)} <small>°/s*</small></strong>
                <small>x {number(telemetry.readings.rotation.x)} · y {number(telemetry.readings.rotation.y)} · z {number(telemetry.readings.rotation.z)}</small>
              </div>
            </article>
          </div>

          <div className="sompo-telemetry-footer">
            <div className="sompo-telemetry-source">
              {simulation ? <Cpu /> : <Database />}
              <div>
                <strong>{telemetry.source.provider}</strong>
                <span>
                  {simulation
                    ? `cena local · ${telemetry.source.scenarioLabel || 'cenário virtual'} · relógio ${telemetry.deviceTimestamp ?? '—'} ms`
                    : `assinatura SSE · ${telemetry.source.path} · timestamp bruto ${telemetry.deviceTimestamp ?? '—'}`}
                </span>
              </div>
            </div>
            <p>
              {simulation
                ? '* Dados sintéticos para ensaio. Flags são controles do cenário, não regras confirmadas do firmware.'
                : '* Unidades de exibição seguem a convenção esperada dos sensores e precisam ser confirmadas no firmware.'}
            </p>
          </div>

          {children}
        </>
      )}
    </section>
  );
}
