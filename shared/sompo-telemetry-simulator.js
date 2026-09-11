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
  'hard-braking': Object.freeze({
    scenarioId: 'hard-braking',
    label: 'Frenagem brusca',
    description: 'Em 12 s: deslocamento, frenagem de 28 km/h até parar e repouso. Pulso de desaceleração e mergulho da cabine; sem impacto. Reinicie para repetir.',
    speedKph: 28,
    distance: 260,
    temperature: 29,
    humidity: 54,
    pitch: 1,
    roll: 0.5,
    roughness: 0.35,
    collisionRisk: false,
    inclinationRisk: false,
  }),
  'steep-climb': Object.freeze({
    scenarioId: 'steep-climb',
    label: 'Aclive severo',
    description: 'Subida rural de 21° em baixa velocidade, frente elevada e alerta sintético de inclinação.',
    speedKph: 6,
    distance: 180,
    temperature: 33,
    humidity: 46,
    pitch: 21,
    roll: 3,
    roughness: 1.1,
    collisionRisk: false,
    inclinationRisk: true,
  }),
  'steep-descent': Object.freeze({
    scenarioId: 'steep-descent',
    label: 'Declive severo',
    description: 'Descida rural de 22° com piso úmido, velocidade reduzida e alerta sintético de inclinação.',
    speedKph: 8,
    distance: 170,
    temperature: 23,
    humidity: 89,
    pitch: -22,
    roll: -4,
    roughness: 1.3,
    collisionRisk: false,
    inclinationRisk: true,
  }),
  'yard-maneuver': Object.freeze({
    scenarioId: 'yard-maneuver',
    label: 'Manobra no terreiro',
    description: 'Avanço a 3 km/h em espaço estreito junto ao galpão. Sensor frontal a 55 cm e alerta sintético de proximidade.',
    speedKph: 3,
    distance: 55,
    temperature: 28,
    humidity: 58,
    pitch: 2,
    roll: -2,
    roughness: 0.45,
    collisionRisk: true,
    inclinationRisk: false,
  }),
  'shifted-load': Object.freeze({
    scenarioId: 'shifted-load',
    label: 'Carga deslocada',
    description: 'Carga assimétrica mantém a carroceria inclinada a 19° mesmo em marcha lenta; alerta sintético de inclinação.',
    speedKph: 4,
    distance: 190,
    temperature: 31,
    humidity: 52,
    pitch: 2,
    roll: 19,
    roughness: 0.8,
    collisionRisk: false,
    inclinationRisk: true,
  }),
  'hot-weather': Object.freeze({
    scenarioId: 'hot-weather',
    label: 'Calor intenso',
    description: 'Operação sob calor de 43 °C e baixa umidade. Temperatura ambiente do sensor; não mede o motor nem cria uma flag térmica.',
    speedKph: 12,
    distance: 230,
    temperature: 43,
    humidity: 19,
    pitch: 2,
    roll: 1,
    roughness: 0.65,
    collisionRisk: false,
    inclinationRisk: false,
  }),
  'rollover': Object.freeze({
    scenarioId: 'rollover', label: 'Tombamento no acostamento',
    description: 'Saída de pista, rolagem progressiva até 82° e imobilização lateral. Roteiro de 16 s; reinicie para repetir.',
    speedKph: 18, distance: 180, temperature: 29, humidity: 48,
    pitch: 1, roll: 2, roughness: 0.5, collisionRisk: false, inclinationRisk: false,
  }),
  'tire-blowout': Object.freeze({
    scenarioId: 'tire-blowout', label: 'Estouro de pneu',
    description: 'Perda súbita de apoio, puxada lateral e parada controlada. Pulso de vibração e redução de velocidade.',
    speedKph: 32, distance: 220, temperature: 32, humidity: 42,
    pitch: 1, roll: 0, roughness: 0.4, collisionRisk: false, inclinationRisk: false,
  }),
  'animal-crossing': Object.freeze({
    scenarioId: 'animal-crossing', label: 'Animal na pista',
    description: 'Um bovino cruza a estrada; a distância frontal cai, o alerta dispara e o caminhão freia antes do contato.',
    speedKph: 18, distance: 280, temperature: 26, humidity: 63,
    pitch: 1, roll: 0, roughness: 0.4, collisionRisk: false, inclinationRisk: false,
  }),
  'aquaplaning': Object.freeze({
    scenarioId: 'aquaplaning', label: 'Chuva e aquaplanagem',
    description: 'Chuva intensa, lâmina de água, desvio lateral e recuperação de aderência com redução de velocidade.',
    speedKph: 42, distance: 260, temperature: 21, humidity: 98,
    pitch: 0, roll: 1, roughness: 0.5, collisionRisk: false, inclinationRisk: false,
  }),
  'brake-failure': Object.freeze({
    scenarioId: 'brake-failure', label: 'Perda de freio em descida',
    description: 'Descida prolongada: a velocidade cresce apesar da tentativa de frenagem, com alerta de inclinação e aproximação de risco.',
    speedKph: 22, distance: 290, temperature: 34, humidity: 44,
    pitch: -14, roll: 0, roughness: 0.5, collisionRisk: false, inclinationRisk: true,
  }),
  'engine-fire': Object.freeze({
    scenarioId: 'engine-fire', label: 'Princípio de incêndio',
    description: 'Fumaça no compartimento dianteiro, aumento da temperatura junto ao sensor e parada de emergência. Não representa temperatura interna do motor.',
    speedKph: 16, distance: 220, temperature: 36, humidity: 30,
    pitch: 0, roll: 0, roughness: 0.3, collisionRisk: false, inclinationRisk: false,
  }),
  'tight-reverse': Object.freeze({
    scenarioId: 'tight-reverse', label: 'Ré em acesso estreito',
    description: 'Manobra de ré a 3 km/h junto a um galpão. Rodas e deslocamento invertem; a distância continua sendo do sensor frontal.',
    speedKph: 3, distance: 140, temperature: 27, humidity: 58,
    pitch: 0, roll: 0, roughness: 0.4, collisionRisk: false, inclinationRisk: false,
  }),
  'bogged-down': Object.freeze({
    scenarioId: 'bogged-down', label: 'Atolamento em lama',
    description: 'Pneus patinam na lama, a velocidade de deslocamento cai a zero e o veículo afunda sem progredir.',
    speedKph: 9, distance: 180, temperature: 24, humidity: 91,
    pitch: 2, roll: 3, roughness: 1.2, collisionRisk: false, inclinationRisk: false,
  }),
  'driver-drowsiness': Object.freeze({
    scenarioId: 'driver-drowsiness', label: 'Sonolência e serpenteio',
    description: 'Desvios sucessivos de faixa, aproximação do acostamento e correção tardia de trajetória.',
    speedKph: 36, distance: 240, temperature: 25, humidity: 55,
    pitch: 0, roll: 1, roughness: 0.3, collisionRisk: false, inclinationRisk: false,
  }),
  'fast-corner': Object.freeze({
    scenarioId: 'fast-corner', label: 'Excesso em curva',
    description: 'Entrada rápida em curva, aceleração lateral e transferência de carga; redução de velocidade ao recuperar a trajetória.',
    speedKph: 46, distance: 230, temperature: 28, humidity: 47,
    pitch: 1, roll: 2, roughness: 0.6, collisionRisk: false, inclinationRisk: false,
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
  return Math.round(value * factor) / factor || 0;
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
  const profile = Object.hasOwn(SOMPO_SIMULATION_SCENARIOS, scenarioId)
    ? SOMPO_SIMULATION_SCENARIOS[scenarioId] : SOMPO_SIMULATION_SCENARIOS[DEFAULT_SCENARIO_ID];
  return { ...profile };
}

/** Sequência local de frenagem, sem criar um episódio de colisão no histórico. */
export const SOMPO_BRAKING_SCRIPT = Object.freeze({
  scenarioId: 'hard-braking',
  totalMs: 12_000,
  phases: Object.freeze([
    Object.freeze({ id: 'deslocamento', label: 'Deslocamento', startMs: 0, endMs: 3_000 }),
    Object.freeze({ id: 'frenagem', label: 'Frenagem', startMs: 3_000, endMs: 5_000 }),
    Object.freeze({ id: 'repouso', label: 'Parado, sem impacto', startMs: 5_000, endMs: 12_000 }),
  ]),
});

/**
 * Função pura compartilhada pela telemetria e animação. O perfil de velocidade
 * tem derivada contínua: integral do pulso de desaceleração = velocidade inicial.
 * Após o roteiro, mantém repouso até o operador reiniciar (não faz loop oculto).
 */
export function getSompoBrakingScriptState(elapsedMs, initialSpeedKph = 28) {
  const elapsed = clamp(finite(elapsedMs, 0), 0, SOMPO_BRAKING_SCRIPT.totalMs);
  const speed = clamp(finite(initialSpeedKph, 28), 0, 60);
  const phase = SOMPO_BRAKING_SCRIPT.phases.find((item) => elapsed < item.endMs)
    || SOMPO_BRAKING_SCRIPT.phases.at(-1);
  const progress = clamp((elapsed - 3_000) / 2_000, 0, 1);
  const pulse = phase.id === 'frenagem' ? Math.sin(Math.PI * progress) : 0;
  const speedFactor = (1 + Math.cos(Math.PI * progress)) / 2;
  return {
    phaseId: phase.id,
    phaseLabel: phase.label,
    speedKph: speed * speedFactor,
    accelerationX: -(speed / 3.6) * Math.PI / 4 * pulse,
    pitchOffset: -5 * pulse * (speed / 28),
    pitchRate: phase.id === 'frenagem' ? -5 * Math.PI / 2 * Math.cos(Math.PI * progress) * (speed / 28) : 0,
  };
}

/** Keyframes hold the final state. No timers, randomness or automatic replay. */
function ruralScript(scenarioId, frames) {
  let previous = {
    ...SOMPO_SIMULATION_SCENARIOS[scenarioId], yaw: 0, lateral: 0, rain: 0,
    smoke: 0, sink: 0, animalZ: -8, wheelSpeedKph: null, direction: 1,
  };
  const keyframes = frames.map(([atMs, phaseLabel, values]) => {
    previous = { ...previous, ...values, atMs, phaseLabel };
    return Object.freeze(previous);
  });
  return Object.freeze({ scenarioId, totalMs: keyframes.at(-1).atMs, keyframes: Object.freeze(keyframes) });
}

export const SOMPO_RURAL_SCRIPTS = Object.freeze({
  rollover: ruralScript('rollover', [
    [0, 'Aproximação do acostamento', {}],
    [3_000, 'Perda de apoio lateral', { roll: 8, lateral: 1.2 }],
    [6_000, 'Tombamento', { speedKph: 8, roll: 48, lateral: 2.7, inclinationRisk: true }],
    [9_000, 'Imobilizado de lado', { speedKph: 0, roll: 82, lateral: 3.8, roughness: 0, collisionRisk: true }],
    [16_000, 'Imobilizado de lado', {}],
  ]),
  'tire-blowout': ruralScript('tire-blowout', [
    [0, 'Rodagem', {}], [3_000, 'Pneu dianteiro perde pressão', { roll: -5, yaw: -8, roughness: 4.5 }],
    [4_000, 'Correção de direção', { speedKph: 21, lateral: -0.8, roll: -7, collisionRisk: true }],
    [9_000, 'Parada controlada', { speedKph: 0, yaw: 0, roughness: 0 }],
    [14_000, 'Parada controlada', {}],
  ]),
  'animal-crossing': ruralScript('animal-crossing', [
    [0, 'Animal no acostamento', { animalZ: -6 }],
    [3_000, 'Travessia detectada', { animalZ: -1.5, distance: 150, collisionRisk: true }],
    [5_000, 'Frenagem de emergência', { animalZ: 0, speedKph: 0, distance: 48, pitch: -4 }],
    [8_000, 'Animal sai da faixa', { animalZ: 3.8, pitch: 0, distance: 180 }],
    [13_000, 'Travessia encerrada', { animalZ: 7, distance: 280, collisionRisk: false, roughness: 0 }],
  ]),
  aquaplaning: ruralScript('aquaplaning', [
    [0, 'Chuva intensa', { rain: 1 }],
    [3_000, 'Perda de aderência', { yaw: 14, lateral: 1.1, roll: 5, collisionRisk: true }],
    [6_000, 'Correção em piso molhado', { speedKph: 25, yaw: -12, lateral: -1.0, roll: -4 }],
    [11_000, 'Aderência recuperada', { speedKph: 10, yaw: 0, lateral: 0, roll: 0, collisionRisk: false }],
    [16_000, 'Marcha reduzida sob chuva', {}],
  ]),
  'brake-failure': ruralScript('brake-failure', [
    [0, 'Descida com carga', {}],
    [5_000, 'Freio perde eficiência', { speedKph: 34, distance: 180, temperature: 37 }],
    [10_000, 'Velocidade cresce', { speedKph: 48, distance: 75, collisionRisk: true }],
    [16_000, 'Risco persiste — intervenção necessária', { speedKph: 54, distance: 32, temperature: 40 }],
  ]),
  'engine-fire': ruralScript('engine-fire', [
    [0, 'Operação', {}],
    [3_000, 'Fumaça no compartimento dianteiro', { smoke: 0.35, temperature: 42 }],
    [6_000, 'Parada de emergência', { speedKph: 0, smoke: 0.8, temperature: 54, roughness: 0 }],
    [12_000, 'Veículo imobilizado — foco ativo', { smoke: 1, temperature: 62, humidity: 20 }],
  ]),
  'tight-reverse': ruralScript('tight-reverse', [
    [0, 'Início da ré', { direction: -1 }],
    [4_000, 'Alinhando no acesso', { yaw: -14, lateral: 0.7, distance: 190 }],
    [8_000, 'Alinhamento final', { yaw: 5, lateral: 1.1, distance: 250, speedKph: 2 }],
    [12_000, 'Manobra concluída', { yaw: 0, speedKph: 0, roughness: 0 }],
  ]),
  'bogged-down': ruralScript('bogged-down', [
    [0, 'Entrada no trecho de lama', { rain: 0.2 }],
    [3_000, 'Perda de tração', { speedKph: 3, wheelSpeedKph: 16, sink: 0.18, pitch: -4, roll: 7 }],
    [7_000, 'Pneus patinam sem avanço', { speedKph: 0, wheelSpeedKph: 12, sink: 0.38, distance: 165, roughness: 2.3 }],
    [13_000, 'Tentativa encerrada', { wheelSpeedKph: 0, roughness: 0 }],
  ]),
  'driver-drowsiness': ruralScript('driver-drowsiness', [
    [0, 'Rodagem contínua', {}],
    [3_000, 'Primeiro desvio de faixa', { yaw: 9, lateral: 1.1, roll: 3 }],
    [6_000, 'Correção excessiva', { yaw: -13, lateral: -1.4, roll: -5, collisionRisk: true }],
    [9_000, 'Aproximação do acostamento', { yaw: 15, lateral: 1.9, roll: 6 }],
    [15_000, 'Motorista reduz e retoma a faixa', { yaw: 0, lateral: 0, roll: 0, speedKph: 8, collisionRisk: false }],
  ]),
  'fast-corner': ruralScript('fast-corner', [
    [0, 'Entrada em curva', {}],
    [3_000, 'Transferência lateral de carga', { yaw: 18, lateral: 0.8, roll: 18, inclinationRisk: true }],
    [6_000, 'Correção com risco de tombamento', { yaw: 30, lateral: 1.4, roll: 24, speedKph: 30 }],
    [12_000, 'Saída de curva em marcha reduzida', { yaw: 0, lateral: 0, roll: 2, speedKph: 12, inclinationRisk: false }],
  ]),
});

export function getSompoRuralFrame(scenarioId, elapsedMs = 0) {
  const script = SOMPO_RURAL_SCRIPTS[scenarioId];
  if (!script || !Object.hasOwn(SOMPO_RURAL_SCRIPTS, scenarioId)) return null;
  const elapsed = clamp(finite(elapsedMs, 0), 0, script.totalMs);
  const from = script.keyframes.findLast((frame) => elapsed >= frame.atMs) || script.keyframes[0];
  const to = script.keyframes.find((frame) => frame.atMs > elapsed) || from;
  const duration = to.atMs - from.atMs;
  const progress = duration ? (elapsed - from.atMs) / duration : 1;
  const blend = progress * progress * (3 - 2 * progress);
  const derivative = duration ? 6 * progress * (1 - progress) / (duration / 1000) : 0;
  const frame = { ...from };
  for (const key of Object.keys(from)) {
    if (typeof from[key] === 'number' && typeof to[key] === 'number') frame[key] = from[key] + (to[key] - from[key]) * blend;
  }
  frame.phaseLabel = from.phaseLabel;
  frame.accelerationX = (to.speedKph - from.speedKph) / 3.6 * derivative;
  frame.yawRate = (to.yaw - from.yaw) * derivative;
  frame.pitchRate = (to.pitch - from.pitch) * derivative;
  frame.rollRate = (to.roll - from.roll) * derivative;
  frame.lateralAcceleration = frame.speedKph / 3.6 * frame.yawRate * Math.PI / 180;
  return frame;
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

/**
 * Momentos de captura de frame do canvas 3D, amarrados às fases do roteiro.
 * O pico do pulso de impacto do roteiro acontece em 14 750 ms (meio da fase).
 */
export const SOMPO_COLLISION_FRAME_MOMENTS = Object.freeze([
  Object.freeze({ offsetMs: 0, fase: 'aproximacao', label: 'Início da aproximação' }),
  Object.freeze({ offsetMs: 7_000, fase: 'aproximacao', label: 'Meia aproximação' }),
  Object.freeze({ offsetMs: 14_750, fase: 'impacto', label: 'Impacto — pico de aceleração' }),
  Object.freeze({ offsetMs: 16_500, fase: 'pos-impacto', label: 'Pós-impacto imediato' }),
  Object.freeze({ offsetMs: 21_500, fase: 'pos-impacto', label: 'Final do episódio' }),
]);

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
  const originalProfile = getSompoSimulationScenario(controls.scenarioId);
  const rural = getSompoRuralFrame(originalProfile.scenarioId, elapsedMs);
  const profile = rural ? { ...originalProfile, ...rural } : originalProfile;
  const customized = Object.keys(originalProfile).some((key) => key in controls && controls[key] !== originalProfile[key]);
  if (rural) {
    controls = { ...controls };
    for (const key of Object.keys(originalProfile)) {
      if (controls[key] === undefined || controls[key] === originalProfile[key]) controls[key] = profile[key];
    }
  }
  const scenarioId = profile.scenarioId;
  const elapsed = Math.max(0, finite(elapsedMs, 0));
  const phase = elapsed / 1_000;
  const roughness = clamp(finite(controls.roughness, profile.roughness), 0, 5);
  const speedKph = clamp(finite(controls.speedKph, profile.speedKph), 0, 60);
  const distanceBase = clamp(finite(controls.distance, profile.distance), 5, 400);
  const pitchBase = clamp(finite(controls.pitch, profile.pitch), -25, 25);
  const rollBase = clamp(finite(controls.roll, profile.roll), rural ? -90 : -25, rural ? 90 : 25);
  const temperatureBase = clamp(finite(controls.temperature, profile.temperature), -10, 70);
  const humidityBase = clamp(finite(controls.humidity, profile.humidity), 0, 100);
  const braking = scenarioId === SOMPO_BRAKING_SCRIPT.scenarioId
    ? getSompoBrakingScriptState(elapsed, speedKph)
    : null;
  const motionFactor = (braking?.speedKph ?? speedKph) / 30;
  // Somente a frenagem tem repouso roteirizado; os presets antigos mantêm seu sinal.
  const vibration = braking ? roughness * Math.min(1, braking.speedKph / 8) : roughness;

  const distance = round(clamp(distanceBase + (Math.sin(phase * 0.7) * Math.min(2.5, vibration)), 5, 400));
  const pitch = round(clamp(pitchBase + (braking?.pitchOffset ?? 0) + (Math.sin(phase * 2.1) * vibration * 0.28), -25, 25));
  const roll = round(clamp(rollBase + (Math.sin((phase * 2.7) + 0.6) * vibration * 0.34), rural ? -90 : -25, rural ? 90 : 25));
  const temperature = round(clamp(temperatureBase + (Math.sin(phase * 0.08) * 0.2), -10, 70), 1);
  const humidity = round(clamp(humidityBase + (Math.cos(phase * 0.06) * 0.3), 0, 100), 1);
  const pitchRad = pitch * Math.PI / 180;
  const rollRad = roll * Math.PI / 180;
  // Scripted cases rotate gravity into the sensor frame, including after a rollover.
  const gravityX = rural ? -9.81 * Math.sin(pitchRad) : 0;
  const gravityY = rural ? 9.81 * Math.sin(rollRad) * Math.cos(pitchRad) : 0;
  const gravityZ = rural ? 9.81 * Math.cos(rollRad) * Math.cos(pitchRad) : 9.81;
  const acceleration = vector(
    gravityX + (braking?.accelerationX ?? rural?.accelerationX ?? 0) + (Math.sin(phase * 3.4) * vibration * 0.48) + (motionFactor * 0.08),
    gravityY + (rural?.lateralAcceleration ?? 0) + Math.cos((phase * 2.9) + 0.4) * vibration * 0.42,
    gravityZ + (Math.sin(phase * 4.2) * vibration * 0.36),
  );
  const rotation = vector(
    (rural?.rollRate ?? 0) + Math.cos(phase * 2.1) * vibration * 0.7,
    (braking?.pitchRate ?? rural?.pitchRate ?? 0) + Math.sin(phase * 1.4) * vibration * 0.28,
    (rural?.yawRate ?? 0) + Math.cos((phase * 2.7) + 0.6) * vibration * 0.82,
  );
  const collisionRisk = typeof controls.collisionRisk === 'boolean'
    ? controls.collisionRisk
    : profile.collisionRisk;
  const inclinationRisk = typeof controls.inclinationRisk === 'boolean'
    ? controls.inclinationRisk
    : profile.inclinationRisk;
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
