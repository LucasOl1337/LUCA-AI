// Descriptive statistics over recorded telemetry, never an actuarial model.
export const FLEET_JOURNEY_GAP_MS = 10 * 60_000;
export const FLEET_OBSERVED_GAP_MS = 15_000;
const FLAGS = ['riscoColisao', 'riscoInclinacao'];
const finite = value => typeof value === 'number' && Number.isFinite(value);
const emptyFlags = () => Object.fromEntries(FLAGS.map(flag => [flag, { count: 0, durationMs: 0, knownMs: 0 }]));
const max = (a, b) => b === null ? a : a === null ? b : Math.max(a, b);

/** Rows must be ordered by sourceKind, tractorId, observedMs, id. No raw rows are retained. */
export function aggregateSompoFleet(rows) {
  const machines = [];
  let machine, journey, previous;
  for (const row of rows) {
    if (!finite(row.observedMs)) continue;
    if (!machine || row.tractorId !== machine.tractorId || row.sourceKind !== machine.sourceKind) {
      machine = { tractorId: row.tractorId, sourceKind: row.sourceKind, sampleCount: 0, durationMs: 0, observedMs: 0, gapMs: 0, peakAcceleration: null, maxInclination: null, alerts: emptyFlags(), journeys: [], months: [] };
      machines.push(machine);
      previous = null;
    }
    const dt = previous ? row.observedMs - previous.observedMs : 0;
    if (!previous || dt > FLEET_JOURNEY_GAP_MS) {
      journey = { id: `${row.sourceKind}:${row.tractorId}:${row.observedMs}`, startedAt: row.observedAt, endedAt: row.observedAt, sampleCount: 0, durationMs: 0, observedMs: 0, gapMs: 0, peakAcceleration: null, maxInclination: null, alerts: emptyFlags() };
      machine.journeys.push(journey);
      previous = null;
    }
    const interval = previous ? Math.max(0, dt) : 0;
    const observed = interval <= FLEET_OBSERVED_GAP_MS ? interval : 0;
    const acc = [row.accX, row.accY, row.accZ].every(finite) ? Math.hypot(row.accX, row.accY, row.accZ) : null;
    const angles = [row.pitch, row.roll].filter(finite).map(Math.abs);
    const inclination = angles.length ? Math.max(...angles) : null;
    const monthKey = row.observedAt.slice(0, 7);
    let month = machine.months.at(-1);
    if (!month || month.month !== monthKey) {
      month = { month: monthKey, sampleCount: 0, riscoColisao: 0, riscoInclinacao: 0 };
      machine.months.push(month);
    }
    month.sampleCount++;
    for (const target of [machine, journey]) {
      target.sampleCount++;
      target.durationMs += interval;
      target.observedMs += observed;
      target.gapMs += interval - observed;
      target.peakAcceleration = max(target.peakAcceleration, acc);
      target.maxInclination = max(target.maxInclination, inclination);
      for (const flag of FLAGS) {
        const known = typeof row[flag] === 'boolean' && typeof previous?.[flag] === 'boolean';
        // A true flag first seen after a gap is an observed alert, not proof of a new accident.
        if (row[flag] === true && (!previous || !observed || previous[flag] !== true)) target.alerts[flag].count++;
        if (known && observed) {
          target.alerts[flag].knownMs += observed;
          if (previous[flag]) target.alerts[flag].durationMs += observed;
        }
      }
    }
    for (const flag of FLAGS) {
      if (row[flag] === true && (!previous || !observed || previous[flag] !== true)) month[flag]++;
    }
    journey.endedAt = row.observedAt;
    previous = row;
  }
  return {
    journeyGapMs: FLEET_JOURNEY_GAP_MS,
    observedGapMs: FLEET_OBSERVED_GAP_MS,
    method: 'Jornadas separadas por mais de 10 min. Intervalos acima de 15 s ficam sem observação. Duração do alerta estimada pela última flag conhecida entre leituras próximas. Flags são alertas, não sinistros; aceleração e inclinação Firebase preservam a unidade de origem, sem calibração confirmada.',
    origins: ['firebase', 'simulation'].map(sourceKind => ({ sourceKind, machines: machines.filter(machine => machine.sourceKind === sourceKind) })),
  };
}
