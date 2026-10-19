// Visual interpretation only: never changes device flags or sends commands.
export const SOMPO_CARGO_LIMITS = { temperature: 30, humidity: 75 };
const finite = value => typeof value === 'number' && Number.isFinite(value);
/** Faixas do painel: atenção abaixo de 200 cm, perigo até 100 cm ou com a flag; inclinação a partir de 20° ou com a flag. */
export const SOMPO_PANEL_BANDS = Object.freeze({ attentionCm: 200, dangerCm: 100, inclinationDeg: 20 });

/**
 * Regra visual do painel, sem trava de fonte: serve ao gêmeo físico (com a trava
 * `live` por fora) e à cabine do gameplay, que lê leituras simuladas a cada quadro.
 */
export function physicalRiskBands({ distance: rawDistance, pitch, roll, collisionFlag, inclinationFlag } = {}) {
  const distance = finite(rawDistance) && rawDistance > 0 && rawDistance < 999 ? rawDistance : null;
  const angle = Math.max(Math.abs(finite(pitch) ? pitch : 0), Math.abs(finite(roll) ? roll : 0));
  const proximity = distance !== null ? Math.max(0, Math.min(1, (SOMPO_PANEL_BANDS.attentionCm - distance) / 175)) : 0;
  const collision = collisionFlag === true || (distance !== null && distance <= SOMPO_PANEL_BANDS.dangerCm);
  const inclination = inclinationFlag === true || angle >= SOMPO_PANEL_BANDS.inclinationDeg;
  const proximityLevel = collision ? 'danger' : distance === null ? 'unavailable' : proximity > 0 ? 'attention' : 'clear';
  return { distance, angle, proximity, collision, inclination, proximityLevel };
}

export function physicalInteractionState(snapshot, previous = null, limits = SOMPO_CARGO_LIMITS) {
  const live = snapshot?.source.kind === 'firebase' && snapshot.freshness === 'fresh' && snapshot.connection.state === 'live';
  const r = snapshot?.readings;
  const bands = physicalRiskBands({ distance: r?.distance, pitch: r?.pitch, roll: r?.roll, collisionFlag: snapshot?.risks.collision, inclinationFlag: snapshot?.risks.inclination });
  const { distance, angle } = bands;
  const magnitude = r?.acceleration?.magnitude;
  const before = previous?.readings.acceleration?.magnitude;
  const contiguous = previous?.tractorId === snapshot?.tractorId
    && finite(snapshot?.deviceTimestamp) && finite(previous?.deviceTimestamp)
    && snapshot.deviceTimestamp > previous.deviceTimestamp
    && snapshot.deviceTimestamp - previous.deviceTimestamp < 2000;
  // Magnitude avoids treating a change of gravity direction as an impact.
  const shock = live && contiguous && finite(magnitude) && finite(before)
    ? Math.min(1, Math.max(0, (Math.abs(magnitude - before) - 2.5) / 8)) : 0;
  const proximity = live ? bands.proximity : 0;
  const collision = live && bands.collision;
  const inclination = live && bands.inclination;
  const heat = live && finite(r?.temperature) && r.temperature > limits.temperature;
  const damp = live && finite(r?.humidity) && r.humidity > limits.humidity;
  const labels = [];
  if (collision) labels.push('Obstáculo próximo');
  if (inclination) labels.push('Risco de tombamento');
  if (shock > 0.15) labels.push('Movimento brusco');
  if (heat || damp) labels.push('Ambiente fora da faixa');
  return { live, distance, angle, proximity, collision, inclination, shock,
    cargo: heat || damp, heat, damp, labels,
    severity: !live ? 'offline' : collision || inclination ? 'danger' : labels.length || proximity > 0 ? 'attention' : 'clear' };
}

export function appendPhysicalFrame(frames, frame) {
  // Time and count bounds also protect against unusually fast publishers.
  return [...frames.filter(item => item.at >= frame.at - 30000), frame].slice(-600);
}

export function physicalReplayFrame(frames, offsetMs) {
  if (!frames.length) return null;
  const at = frames[0].at + Math.max(0, offsetMs);
  let selected = frames[0];
  for (const frame of frames) {
    if (frame.at > at) break;
    selected = frame;
  }
  return selected;
}
