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

/**
 * Roteiro determinístico de colisão: aproximação (distância 210→20 cm),
 * impacto (~1,5 s com pico de |aceleração| ~32-36 m/s²) e pós-impacto
 * (parado a 12 cm). Todo o episódio é função pura do relógio do sim.
 */
export const SOMPO_COLLISION_SCRIPT = Object.freeze({
  kind: 'colisao',
  scenarioId: 'colisao-roteirizada',
  label: 'Colisão frontal roteirizada',
  description: 'Roteiro determinístico: o caminhão avança, colide com o obstáculo e para; o episódio inteiro vira um caso isolado no histórico.',
  totalMs: 22_000,
  sampleIntervalMs: 500,
  phases: Object.freeze([
    Object.freeze({ id: 'aproximacao', label: 'Aproximação', startMs: 0, endMs: 14_000 }),
    Object.freeze({ id: 'impacto', label: 'Impacto', startMs: 14_000, endMs: 15_500 }),
    Object.freeze({ id: 'pos-impacto', label: 'Pós-impacto', startMs: 15_500, endMs: 22_000 }),
  ]),
});

export function getSompoCollisionScriptPhase(elapsedMs) {
  const elapsed = clamp(finite(elapsedMs, 0), 0, SOMPO_COLLISION_SCRIPT.totalMs);
  const phase = SOMPO_COLLISION_SCRIPT.phases.find((item) => elapsed < item.endMs)
    || SOMPO_COLLISION_SCRIPT.phases.at(-1);
  return phase.id;
}

export function createSompoCollisionScriptSnapshot(elapsedMs, {
  observedAt = new Date().toISOString(),
  connectedAt,
} = {}) {
  const elapsed = clamp(finite(elapsedMs, 0), 0, SOMPO_COLLISION_SCRIPT.totalMs);
  const phaseId = getSompoCollisionScriptPhase(elapsed);
  const t = elapsed / 1_000;

  let distance;
  let pitch;
  let roll;
  let acceleration;
  let rotation;
  let collisionRisk;
  if (phaseId === 'aproximacao') {
    const progress = elapsed / 14_000;
    distance = 210 - (190 * progress);
    pitch = 1.5 + (Math.sin(t * 1.7) * 0.4);
    roll = 0.6 + (Math.sin((t * 1.3) + 0.4) * 0.3);
    acceleration = vector(
      0.35 + (Math.sin(t * 2.4) * 0.25),
      Math.cos(t * 2.1) * 0.2,
      9.81 + (Math.sin(t * 3.1) * 0.22),
    );
    rotation = vector(
      Math.cos(t * 1.9) * 0.4,
      Math.sin(t * 1.2) * 0.2,
      Math.cos(t * 2.2) * 0.5,
    );
    collisionRisk = false;
  } else if (phaseId === 'impacto') {
    const tau = clamp((elapsed - 14_000) / 1_500, 0, 1);
    const pulse = Math.sin(Math.PI * tau);
    distance = 20 - (8 * tau);
    pitch = 1.5 - (7.5 * pulse);
    roll = 0.6 + (3.5 * pulse);
    acceleration = vector(
      -(30 * pulse) - 0.4,
      4 * pulse,
      9.81 + (9 * pulse),
    );
    rotation = vector(28 * pulse, -9 * pulse, 14 * pulse);
    collisionRisk = true;
  } else {
    const tau = clamp((elapsed - 15_500) / 6_500, 0, 1);
    const settle = Math.max(0, 1 - (tau * 2.5));
    distance = 12;
    pitch = 0.9 + (Math.sin(t * 5.2) * 0.6 * settle);
    roll = 0.8 + (Math.sin(t * 4.4) * 0.4 * settle);
    acceleration = vector(
      Math.sin(t * 6.1) * 1.2 * settle,
      Math.cos(t * 5.3) * 0.8 * settle,
      9.81 + (Math.sin(t * 6.8) * 0.5 * settle),
    );
    rotation = vector(2 * settle, -1 * settle, 1.5 * settle);
    collisionRisk = true;
  }

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
    status: collisionRisk ? 'alert' : 'normal',
    risks: {
      collision: collisionRisk,
      inclination: false,
    },
    readings: {
      distance: round(distance),
      temperature: round(27 + (Math.sin(t * 0.05) * 0.2), 1),
      humidity: round(48 + (Math.cos(t * 0.04) * 0.4), 1),
      pitch: round(pitch),
      roll: round(roll),
      acceleration,
      rotation,
    },
    source: {
      kind: 'simulation',
      provider: 'Simulador 3D local',
      path: 'simulation://sompo/caminhao/SIM-001/esp32',
      scenarioId: SOMPO_COLLISION_SCRIPT.scenarioId,
      scenarioLabel: SOMPO_COLLISION_SCRIPT.label,
    },
  };
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
