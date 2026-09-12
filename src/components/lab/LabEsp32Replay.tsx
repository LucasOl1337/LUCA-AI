import { useMemo } from 'react';
import { formatLabTime, type LabCase, type LabReplayFrame, type LabSample } from '../../../shared/lab-telemetry.js';

const number = (value: unknown) => typeof value === 'number' ? value.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : 'Indisponível';
const flag = (value: boolean | null | undefined) => value == null ? 'Indisponível' : value ? 'Acionado' : 'Não acionado';
const channels = [
  { field: 'obstacle_distance_cm', label: 'Distância ao obstáculo', unit: 'cm' },
  { field: 'ambient_temp_c', label: 'Temperatura ambiente', unit: '°C' },
  { field: 'relative_humidity_pct', label: 'Umidade relativa', unit: '%' },
] as const;

function SensorTrace({ labCase, frame, field, label, unit }: { labCase: LabCase; frame: LabReplayFrame; field: keyof LabSample; label: string; unit: string }) {
  const trace = useMemo(() => {
    const values = labCase.samples.map(sample => sample[field]).filter((value): value is number => typeof value === 'number');
    if (!values.length) return null;
    let min = Infinity, max = -Infinity;
    for (const value of values) { min = Math.min(min, value); max = Math.max(max, value); }
    const y = (value: number) => 64 - (value - min) / (max - min || 1) * 52;
    let path = '';
    labCase.samples.forEach((sample, i) => {
      const value = sample[field];
      if (typeof value !== 'number') return;
      const previous = labCase.samples[i - 1];
      const x = 4 + sample.elapsedMs / labCase.durationMs * 392;
      const connected = previous && typeof previous[field] === 'number' && sample.elapsedMs - previous.elapsedMs <= labCase.sampleIntervalMs * 1.5;
      path += connected ? `H${x.toFixed(2)}V${y(value).toFixed(2)}` : `M${x.toFixed(2)},${y(value).toFixed(2)}h0.5`;
    });
    return { path, min, max };
  }, [labCase, field]);
  const value = frame.recordingGap ? null : frame.sample[field];
  return <article className="lab-esp32-trace">
    <span>{label}</span><strong>{number(value)} <small>{typeof value === 'number' ? unit : ''}</small></strong>
    {trace ? <><svg viewBox="0 0 400 76" role="img" aria-label={`${label}: de ${number(trace.min)} a ${number(trace.max)} ${unit}. Lacunas não são conectadas.`}>
      <path d={trace.path} fill="none" stroke="currentColor" strokeWidth="2" />
      <line x1={4 + frame.elapsedMs / labCase.durationMs * 392} x2={4 + frame.elapsedMs / labCase.durationMs * 392} y1="2" y2="74" stroke="#ae7637" strokeWidth="1.5" />
    </svg><small>{number(trace.min)}–{number(trace.max)} {unit} · episódio completo</small></> : <p>Sem leitura neste episódio.</p>}
  </article>;
}

export default function LabEsp32Replay({ labCase, frame }: { labCase: LabCase; frame: LabReplayFrame }) {
  const sample = frame.recordingGap ? null : frame.sample;
  return <div className="lab-esp32-replay" data-lab-esp32>
    <header><span>{labCase.synthetic ? 'SENSORES SIMULADOS' : 'SENSORES ESP32'}</span><h2>{labCase.title}</h2>
      <p>{labCase.machineId} · {formatLabTime(frame.elapsedMs)} / {formatLabTime(labCase.durationMs)}</p></header>
    <p className="lab-esp32-notice" role="status">{frame.recordingGap ? 'Intervalo sem registro: leituras indisponíveis.' : 'Reprodução das amostras registradas.'} {!frame.hasGps && 'Sem posição GPS; trajetória indisponível.'}</p>
    <div className="lab-esp32-channels">{channels.map(channel => <SensorTrace key={channel.field} labCase={labCase} frame={frame} {...channel} />)}</div>
    <div className="lab-esp32-flags" aria-label="Alertas do dispositivo">
      <p data-active={sample?.collision_warning_active === true}><span>Alerta de colisão</span><strong>{flag(sample?.collision_warning_active)}</strong></p>
      <p data-active={sample?.inclination_warning_active === true}><span>Alerta de inclinação</span><strong>{flag(sample?.inclination_warning_active)}</strong></p>
      <p><span>Validade do eco</span><strong>{sample?.ultrasonic_echo_valid == null ? 'Não registrada' : sample.ultrasonic_echo_valid ? 'Válido' : 'Sem eco válido'}</strong></p>
    </div>
    <p className="lab-footnote">Flags são avisos registrados pelo dispositivo; não confirmam ocorrência ou causa de um acidente.</p>
    <div className="lab-esp32-imu"><h3>IMU · leituras na unidade de origem</h3><p>Valores preservados sem converter eixos ou presumir graus, g ou m/s². A calibração do gêmeo não é aplicada a este arquivo.</p>
      <table><caption>Aceleração e rotação registradas</caption><thead><tr><th scope="col">Sinal</th><th scope="col">X</th><th scope="col">Y</th><th scope="col">Z</th></tr></thead><tbody>
        <tr><th scope="row">Aceleração</th><td>{number(sample?.acceleration_x_raw)}</td><td>{number(sample?.acceleration_y_raw)}</td><td>{number(sample?.acceleration_z_raw)}</td></tr>
        <tr><th scope="row">Rotação</th><td>{number(sample?.rotation_x_raw)}</td><td>{number(sample?.rotation_y_raw)}</td><td>{number(sample?.rotation_z_raw)}</td></tr>
      </tbody></table>
      <p>Pitch da origem: <strong>{number(sample?.imu_pitch_raw)}</strong> · Roll da origem: <strong>{number(sample?.imu_roll_raw)}</strong></p>
      <p>Contador do dispositivo: <strong>{number(sample?.device_timestamp)}</strong> · Horário registrado: {sample?.timestamp || 'Indisponível'}</p>
    </div>
  </div>;
}
