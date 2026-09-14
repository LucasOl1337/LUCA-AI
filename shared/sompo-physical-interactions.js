// Visual interpretation only: never changes device flags or sends commands.
export const SOMPO_CARGO_LIMITS = { temperature: 30, humidity: 75 };
const finite = value => typeof value === 'number' && Number.isFinite(value);
export function physicalInteractionState(snapshot, previous = null, limits = SOMPO_CARGO_LIMITS) {
  const live = snapshot?.source.kind === 'firebase' && snapshot.freshness === 'fresh' && snapshot.connection.state === 'live';
  const r = snapshot?.readings;
  const distance = finite(r?.distance) && r.distance > 0 && r.distance < 999 ? r.distance : null;
  const angle = Math.max(Math.abs(r?.pitch || 0), Math.abs(r?.roll || 0));
  const magnitude = r?.acceleration?.magnitude;
  const before = previous?.readings.acceleration?.magnitude;
  const contiguous = previous?.tractorId === snapshot?.tractorId
    && finite(snapshot?.deviceTimestamp) && finite(previous?.deviceTimestamp)
    && snapshot.deviceTimestamp > previous.deviceTimestamp
    && snapshot.deviceTimestamp - previous.deviceTimestamp < 2000;
  // Magnitude avoids treating a change of gravity direction as an impact.
  const shock = live && contiguous && finite(magnitude) && finite(before)
    ? Math.min(1, Math.max(0, (Math.abs(magnitude - before) - 2.5) / 8)) : 0;
  const proximity = live && distance !== null ? Math.max(0, Math.min(1, (200 - distance) / 175)) : 0;
  const collision = live && (snapshot.risks.collision === true || (distance !== null && distance <= 100));
  const inclination = live && (snapshot.risks.inclination === true || angle >= 20);
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
