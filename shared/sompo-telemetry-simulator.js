const DEFAULT_SCENARIO_ID = 'normal';

export const SOMPO_SIMULATION_SCENARIOS = Object.freeze({
  normal: Object.freeze({
    scenarioId: 'normal',
    label: 'Operação normal',
    description: 'Caminhão em terreno regular, sem flags de risco.',
    speedKph: 22,
    distance: 210,
    temperature: 27,
    humidity: 48,
    pitch: 1.5,
    roll: 1,
    roughness: 0.35,
    collisionRisk: false,
    inclinationRisk: false,
  }),
  obstacle: Object.freeze({
    scenarioId: 'obstacle',
    label: 'Obstáculo frontal',
    description: 'Objeto próximo ao sensor e flag sintética de colisão ativa.',
    speedKph: 9,
    distance: 32,
    temperature: 28,
    humidity: 46,
    pitch: 1,
    roll: 0.5,
    roughness: 0.25,
    collisionRisk: true,
    inclinationRisk: false,
  }),
  inclination: Object.freeze({
    scenarioId: 'inclination',
    label: 'Inclinação lateral',
    description: 'Caminhão inclinado e flag sintética de inclinação ativa.',
    speedKph: 7,
    distance: 145,
    temperature: 29,
    humidity: 51,
    pitch: 7,
    roll: 17,
    roughness: 0.5,
    collisionRisk: false,
    inclinationRisk: true,
  }),
  'rough-road': Object.freeze({
    scenarioId: 'rough-road',
    label: 'Pista irregular',
    description: 'Vibração elevada para observar aceleração e rotação vetorial.',
    speedKph: 16,
    distance: 96,
    temperature: 30,
    humidity: 43,
    pitch: 4,
    roll: 5,
    roughness: 3.2,
    collisionRisk: false,
    inclinationRisk: false,
  }),
});

function finite(value, fallback) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function vector(x, y, z) {
  return {
    x: round(x),
    y: round(y),
    z: round(z),
    magnitude: round(Math.sqrt((x ** 2) + (y ** 2) + (z ** 2))),
  };
}

export function getSompoSimulationScenario(scenarioId = DEFAULT_SCENARIO_ID) {
  const profile = SOMPO_SIMULATION_SCENARIOS[scenarioId] || SOMPO_SIMULATION_SCENARIOS[DEFAULT_SCENARIO_ID];
  return { ...profile };
}

export function createSompoSimulationSnapshot(controls = {}, {
  observedAt = new Date().toISOString(),
  elapsedMs = 0,
  connectedAt,
} = {}) {
  const profile = getSompoSimulationScenario(controls.scenarioId);
  const scenarioId = profile.scenarioId;
  const elapsed = Math.max(0, finite(elapsedMs, 0));
  const phase = elapsed / 1_000;
  const roughness = clamp(finite(controls.roughness, profile.roughness), 0, 5);
  const speedKph = clamp(finite(controls.speedKph, profile.speedKph), 0, 60);
  const distanceBase = clamp(finite(controls.distance, profile.distance), 5, 400);
  const pitchBase = clamp(finite(controls.pitch, profile.pitch), -25, 25);
  const rollBase = clamp(finite(controls.roll, profile.roll), -25, 25);
  const temperatureBase = clamp(finite(controls.temperature, profile.temperature), -10, 70);
  const humidityBase = clamp(finite(controls.humidity, profile.humidity), 0, 100);
  const motionFactor = speedKph / 30;

  const distance = round(clamp(distanceBase + (Math.sin(phase * 0.7) * Math.min(2.5, roughness)), 5, 400));
  const pitch = round(pitchBase + (Math.sin(phase * 2.1) * roughness * 0.28));
  const roll = round(rollBase + (Math.sin((phase * 2.7) + 0.6) * roughness * 0.34));
  const temperature = round(temperatureBase + (Math.sin(phase * 0.08) * 0.2), 1);
  const humidity = round(clamp(humidityBase + (Math.cos(phase * 0.06) * 0.3), 0, 100), 1);
  const acceleration = vector(
    (Math.sin(phase * 3.4) * roughness * 0.48) + (motionFactor * 0.08),
    Math.cos((phase * 2.9) + 0.4) * roughness * 0.42,
    9.81 + (Math.sin(phase * 4.2) * roughness * 0.36),
  );
  const rotation = vector(
    Math.cos(phase * 2.1) * roughness * 0.7,
    Math.sin(phase * 1.4) * roughness * 0.28,
    Math.cos((phase * 2.7) + 0.6) * roughness * 0.82,
  );
  const collisionRisk = typeof controls.collisionRisk === 'boolean'
    ? controls.collisionRisk
    : profile.collisionRisk;
  const inclinationRisk = typeof controls.inclinationRisk === 'boolean'
    ? controls.inclinationRisk
    : profile.inclinationRisk;
  const customized = [
    speedKph !== profile.speedKph,
    distanceBase !== profile.distance,
    temperatureBase !== profile.temperature,
    humidityBase !== profile.humidity,
    pitchBase !== profile.pitch,
    rollBase !== profile.roll,
    roughness !== profile.roughness,
    collisionRisk !== profile.collisionRisk,
    inclinationRisk !== profile.inclinationRisk,
  ].some(Boolean);
  const parsedObservedAt = Date.parse(observedAt);
  const sessionConnectedAt = connectedAt || (
    Number.isFinite(parsedObservedAt)
      ? new Date(parsedObservedAt - elapsed).toISOString()
      : observedAt
  );

  return {
    tractorId: 'SIM-001',
    observedAt,
    changedAt: observedAt,
    unchangedForMs: 0,
    freshness: 'fresh',
    connection: {
      state: 'live',
      connectedAt: sessionConnectedAt,
      lastEventAt: observedAt,
      retryAttempt: 0,
    },
    deviceTimestamp: Math.round(elapsed),
    status: collisionRisk || inclinationRisk ? 'alert' : 'normal',
    risks: {
      collision: collisionRisk,
      inclination: inclinationRisk,
    },
    readings: {
      distance,
      temperature,
      humidity,
      pitch,
      roll,
      acceleration,
      rotation,
    },
    source: {
      kind: 'simulation',
      provider: 'Simulador 3D local',
      path: 'simulation://sompo/caminhao/SIM-001/esp32',
      scenarioId,
      scenarioLabel: customized ? `${profile.label} · ajustado manualmente` : profile.label,
    },
  };
}
