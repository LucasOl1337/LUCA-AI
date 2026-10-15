import { STAND_SCENARIOS, type StandScenarioId } from './standScenarios';
import './firstPersonHud.css';

export interface FirstPersonHudData {
  speedKph: number | null;
  distanceCm: number | null;
  collision: boolean;
  inclination: boolean;
  pitch: number | null;
  roll: number | null;
  phase: string;
}

const fmt = (value: number | null, digits: number, unit: string) => (
  value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(digits).replace('.', ',')}${unit}`
);

/**
 * Painel da cabine: só repete o que o snapshot simulado já diz (velocidade,
 * HC-SR04, atitude e fase), com o selo SIMULADO sempre visível.
 */
export function FirstPersonHud({ data, mode }: { data: FirstPersonHudData; mode: 'cenario' | 'livre' }) {
  const alert = data.collision ? 'Alerta de colisão' : data.inclination ? 'Alerta de inclinação' : null;
  return (
    <div className="sompo-fp-hud" data-alert={!!alert} aria-live="polite" aria-label="Painel da cabine">
      <span className="sompo-fp-badge">SIMULADO{mode === 'livre' ? ' · condução livre' : ''}</span>
      <dl>
        <div><dt>Velocidade</dt><dd>{fmt(data.speedKph, 1, ' km/h')}</dd></div>
        <div data-alert={data.collision}><dt>HC-SR04</dt><dd>{fmt(data.distanceCm, 0, ' cm')}</dd></div>
        <div data-alert={data.inclination}><dt>Rolagem · arfagem</dt><dd>{fmt(data.roll, 1, '°')} · {fmt(data.pitch, 1, '°')}</dd></div>
      </dl>
      <p>{alert ?? data.phase}</p>
    </div>
  );
}

/** Os três cenários do stand como botões, com o botão do controle ao lado. */
export function StandScenarioButtons({ disabled, active, onRun }: {
  disabled: boolean;
  active: StandScenarioId | null;
  onRun: (id: StandScenarioId) => void;
}) {
  return (
    <div className="sompo-fp-scenarios" role="group" aria-label="Cenários do stand">
      {STAND_SCENARIOS.map((item) => (
        <button key={item.id} type="button" disabled={disabled} aria-pressed={active === item.id} onClick={() => onRun(item.id)}>
          <kbd aria-hidden="true">{item.botao}</kbd> {item.rotulo}
        </button>
      ))}
    </div>
  );
}
