const DEFAULT_SCENARIO_ID = 'normal';

export const SOMPO_SIMULATION_SCENARIOS = Object.freeze({
  normal: Object.freeze({
    scenarioId: 'normal',
    label: 'Operação normal',
    description: 'Caminhão em terreno regular, sem flags de risco.',
    speedKph: 80,
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
    speedKph: 50,
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
    description: 'Em 14 s: deslocamento a 80 km/h, frenagem de emergência até parar (~55 m) e repouso. Pulso de desaceleração e mergulho da cabine; sem impacto. Reinicie para repetir.',
    speedKph: 80,
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
    description: 'Descida rural de 22° com piso úmido, velocidade de rodovia em serra (~90 km/h esticando para 100) e alerta sintético de inclinação.',
    speedKph: 88,
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
    speedKph: 80,
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
    description: 'Saída de pista a 75 km/h, contra-esterço vira deslize lateral e o pneu tropeça: rolagem progressiva até 82° e imobilização de lado. Roteiro de 16 s; reinicie para repetir.',
    speedKph: 75, distance: 180, temperature: 29, humidity: 48,
    pitch: 1, roll: 2, roughness: 0.5, collisionRisk: false, inclinationRisk: false,
  }),
  'tire-blowout': Object.freeze({
    scenarioId: 'tire-blowout', label: 'Estouro de pneu',
    description: 'Estalo a 90 km/h, puxada para o lado do pneu dianteiro estourado, contra-esterço e parada no acostamento. Pulso de vibração e fumaça do pneu arrastando.',
    speedKph: 90, distance: 220, temperature: 32, humidity: 42,
    pitch: 1, roll: 0, roughness: 0.4, collisionRisk: false, inclinationRisk: false,
  }),
  'animal-crossing': Object.freeze({
    scenarioId: 'animal-crossing', label: 'Animal na pista',
    description: 'Um bovino cruza a estrada a 80 km/h; a distância frontal cai, o alerta dispara e o caminhão freia antes do contato.',
    speedKph: 80, distance: 280, temperature: 26, humidity: 63,
    pitch: 1, roll: 0, roughness: 0.4, collisionRisk: false, inclinationRisk: false,
  }),
  'aquaplaning': Object.freeze({
    scenarioId: 'aquaplaning', label: 'Chuva e aquaplanagem',
    description: 'Chuva intensa a 85 km/h: a lâmina de água tira a resposta da direção e as rodas perdem rotação; deriva lateral progressiva até a aderência voltar.',
    speedKph: 85, distance: 260, temperature: 21, humidity: 98,
    pitch: 0, roll: 1, roughness: 0.5, collisionRisk: false, inclinationRisk: false,
  }),
  'brake-failure': Object.freeze({
    scenarioId: 'brake-failure', label: 'Perda de freio em descida',
    description: 'Descida prolongada a partir de 60 km/h: o pedal morre, a redução de marcha segura o embalo por instantes e a gravidade volta a vencer até ~105 km/h.',
    speedKph: 60, distance: 290, temperature: 34, humidity: 44,
    pitch: -14, roll: 0, roughness: 0.5, collisionRisk: false, inclinationRisk: true,
  }),
  'engine-fire': Object.freeze({
    scenarioId: 'engine-fire', label: 'Princípio de incêndio',
    description: 'Fumaça no compartimento dianteiro a 70 km/h, perda de potência, parada no acostamento e chamas crescendo com o motor parado. Não representa temperatura interna do motor.',
    speedKph: 70, distance: 220, temperature: 36, humidity: 30,
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
    description: 'Desvios sucessivos de faixa a 85 km/h, aproximação do acostamento e correção tardia de trajetória.',
    speedKph: 85, distance: 240, temperature: 25, humidity: 55,
    pitch: 0, roll: 1, roughness: 0.3, collisionRisk: false, inclinationRisk: false,
  }),
  'fast-corner': Object.freeze({
    scenarioId: 'fast-corner', label: 'Excesso em curva',
    description: 'Entrada a 95 km/h em curva, aceleração lateral e transferência de carga; redução de velocidade ao recuperar a trajetória.',
    speedKph: 95, distance: 230, temperature: 28, humidity: 47,
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
  totalMs: 14_000,
  // Janelas declarativas calibradas para o desfecho padrão a 80 km/h
  // (frenagem real ≈ 4,9 s); a fase efetiva é derivada da velocidade inicial.
  phases: Object.freeze([
    Object.freeze({ id: 'deslocamento', label: 'Deslocamento', startMs: 0, endMs: 3_000 }),
    Object.freeze({ id: 'frenagem', label: 'Frenagem', startMs: 3_000, endMs: 8_000 }),
    Object.freeze({ id: 'repouso', label: 'Parado, sem impacto', startMs: 8_000, endMs: 14_000 }),
  ]),
});

/**
 * Duração da frenagem de emergência: desaceleração média de ~4,5 m/s²,
 * então 80→0 km/h percorre ~55 m. O teto cobre descidas a ~120 km/h.
 */
function sompoBrakingDurationMs(speedMps) {
  return clamp(speedMps / 4.5, 0.8, 7.5) * 1_000;
}

/**
 * Função pura compartilhada pela telemetria e animação. O perfil de velocidade
 * tem derivada contínua: integral do pulso de desaceleração = velocidade inicial.
 * Após o roteiro, mantém repouso até o operador reiniciar (não faz loop oculto).
 */
export function getSompoBrakingScriptState(elapsedMs, initialSpeedKph = 80) {
  const elapsed = clamp(finite(elapsedMs, 0), 0, SOMPO_BRAKING_SCRIPT.totalMs);
  const speed = clamp(finite(initialSpeedKph, 80), 0, 120);
  const speedMps = speed / 3.6;
  const brakeMs = sompoBrakingDurationMs(speedMps);
  const brakeEndMs = 3_000 + brakeMs;
  const phase = elapsed < 3_000 ? SOMPO_BRAKING_SCRIPT.phases[0]
    : elapsed < brakeEndMs ? SOMPO_BRAKING_SCRIPT.phases[1]
    : SOMPO_BRAKING_SCRIPT.phases[2];
  const brakeSeconds = brakeMs / 1_000;
  const progress = clamp((elapsed - 3_000) / brakeMs, 0, 1);
  const pulse = phase.id === 'frenagem' ? Math.sin(Math.PI * progress) : 0;
  const speedFactor = (1 + Math.cos(Math.PI * progress)) / 2;
  return {
    phaseId: phase.id,
    phaseLabel: phase.label,
    speedKph: speed * speedFactor,
    accelerationX: -(speedMps * Math.PI / (2 * brakeSeconds)) * pulse,
    pitchOffset: -6 * pulse,
    pitchRate: phase.id === 'frenagem' ? -6 * Math.PI * Math.cos(Math.PI * progress) / brakeSeconds : 0,
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
    [2_200, 'Deriva para o acostamento', { yaw: 4, lateral: 0.8, roll: 5, speedKph: 72, roughness: 1.4 }],
    [3_600, 'Contra-esterço no acostamento', { yaw: -12, lateral: 1.8, roll: 12, speedKph: 60, roughness: 2.2 }],
    [4_800, 'Tropeço e rolagem', { yaw: -14, roll: 45, lateral: 2.6, speedKph: 36, inclinationRisk: true }],
    [6_200, 'Casco toca o solo', { roll: 74, lateral: 3.4, speedKph: 10, roughness: 1.4, collisionRisk: true }],
    [7_800, 'Imobilizado de lado', { speedKph: 0, roll: 82, lateral: 3.8, roughness: 0 }],
    [16_000, 'Imobilizado de lado', {}],
  ]),
  'tire-blowout': ruralScript('tire-blowout', [
    [0, 'Rodagem', {}],
    [2_750, 'Rodagem a 90 km/h', {}],
    [3_000, 'Estouro do pneu dianteiro', { roughness: 5, roll: 4, yaw: 4, pitch: -1 }],
    [4_200, 'Puxada para o lado do pneu', { yaw: 11, lateral: 1.1, roll: 6, speedKph: 74, collisionRisk: true }],
    [5_400, 'Contra-esterço', { yaw: -5, lateral: 1.6, roll: 3, speedKph: 58, roughness: 3.4 }],
    [7_200, 'Busca o acostamento', { yaw: 3, lateral: 2.2, speedKph: 30, roll: 4, collisionRisk: false }],
    [9_500, 'Parada no acostamento', { speedKph: 0, yaw: 1, lateral: 2.5, roll: 3.5, roughness: 0 }],
    [14_000, 'Imobilizado — pneu destruído', {}],
  ]),
  'animal-crossing': ruralScript('animal-crossing', [
    [0, 'Animal no acostamento', { animalZ: -6 }],
    [1_500, 'Animal começa a atravessar', { animalZ: -4.9 }],
    [2_800, 'Travessia detectada', { animalZ: -3.4, distance: 150, collisionRisk: true }],
    [4_100, 'Animal entra na faixa do caminhão', { animalZ: -1.7, distance: 110, speedKph: 64, pitch: -1.5 }],
    [5_400, 'Frenagem máxima', { animalZ: -0.2, distance: 72, speedKph: 32, pitch: -3.5 }],
    [6_700, 'Nariz quase no animal', { animalZ: 1.0, distance: 52, speedKph: 8, pitch: -1 }],
    [7_400, 'Parada de emergência', { speedKph: 0, animalZ: 1.6, distance: 46, pitch: 0 }],
    [8_000, 'Animal dispara assustado', { animalZ: 3.4, distance: 70 }],
    [10_000, 'Animal deixa a pista', { animalZ: 4.8, distance: 110 }],
    [13_000, 'Animal sai da pista', { animalZ: 6.2, distance: 200 }],
    [15_000, 'Travessia encerrada', { animalZ: 7, distance: 280, collisionRisk: false, roughness: 0 }],
  ]),
  aquaplaning: ruralScript('aquaplaning', [
    [0, 'Chuva intensa', { rain: 1 }],
    [1_800, 'Chuva intensa', {}],
    [2_600, 'Lâmina d’água sob os eixos', { wheelSpeedKph: 58, roughness: 0.18, yaw: 2, lateral: 0.35 }],
    [5_200, 'Deriva sem resposta da direção', { wheelSpeedKph: 30, yaw: 5, lateral: 1.5, speedKph: 81, roll: 1.5, collisionRisk: true, roughness: 0.12 }],
    [7_400, 'Pneus retomam contato', { wheelSpeedKph: 74, yaw: 11, lateral: 1.9, speedKph: 73, roll: 4.5, roughness: 0.9 }],
    [9_800, 'Contraesterço e frenagem molhada', { wheelSpeedKph: null, yaw: -3, lateral: 1.0, speedKph: 52, roll: -2, collisionRisk: false }],
    [12_500, 'Marcha reduzida sob chuva', { yaw: 0, lateral: 0, roll: 0, speedKph: 45, roughness: 0.5 }],
    [16_000, 'Marcha reduzida sob chuva', {}],
  ]),
  'brake-failure': ruralScript('brake-failure', [
    [0, 'Descida com carga', {}],
    [4_500, 'Freio começa a ceder', { speedKph: 76, distance: 195, temperature: 36 }],
    [7_000, 'Pedal no fundo sem resposta', { speedKph: 88, distance: 140, collisionRisk: true, pitch: -15 }],
    [7_400, 'Redução forçada de marcha', { speedKph: 86, roughness: 2.6, pitch: -15.5 }],
    [9_800, 'Freio-motor segura o embalo', { speedKph: 92, roughness: 1.2, pitch: -14 }],
    [13_000, 'Embalo vence a redução', { speedKph: 101, distance: 70, temperature: 40 }],
    [16_000, 'Risco persiste — intervenção necessária', { speedKph: 105, distance: 32 }],
  ]),
  'engine-fire': ruralScript('engine-fire', [
    [0, 'Operação', {}],
    [2_500, 'Fumaça sob o capô', { smoke: 0.3, temperature: 42 }],
    [5_200, 'Perda de potência', { speedKph: 56, smoke: 0.55, temperature: 48 }],
    [7_000, 'Busca o acostamento', { speedKph: 34, lateral: 1.7, yaw: 5, smoke: 0.75, temperature: 54 }],
    [9_200, 'Parada no acostamento', { speedKph: 0, lateral: 2.5, yaw: 1, smoke: 0.9, temperature: 58, roughness: 0 }],
    [12_000, 'Imobilizado — foco ativo', { smoke: 1, temperature: 62, humidity: 20 }],
  ]),
  'tight-reverse': ruralScript('tight-reverse', [
    [0, 'Parado no acesso', { speedKph: 0 }],
    [900, 'Engata a ré', { direction: -1 }],
    [2_400, 'Ré — traseira entra no acesso', { speedKph: 2.5, yaw: -10, lateral: 0.4, distance: 165 }],
    [4_500, 'Correção de esterco', { yaw: -18, lateral: 0.95, distance: 200 }],
    [5_600, 'Segura — confere a lateral', { speedKph: 0 }],
    [6_400, 'Ré — endireita o conjunto', { speedKph: 2, yaw: 4, lateral: 1.15, distance: 235 }],
    [8_600, 'Pausa final', { speedKph: 0, yaw: 5 }],
    [9_600, 'Encosta os últimos metros', { speedKph: 1.2, yaw: 0 }],
    [11_500, 'Manobra concluída', { speedKph: 0, roughness: 0, distance: 250 }],
    [13_000, 'Imobilizado junto ao acesso', {}],
  ]),
  'bogged-down': ruralScript('bogged-down', [
    [0, 'Entrada no trecho de lama', { rain: 0.2 }],
    [2_200, 'Rodas começam a patinar', { speedKph: 5, wheelSpeedKph: 13, sink: 0.1, pitch: -2, roughness: 1.8 }],
    [3_600, 'Perda de tração', { speedKph: 1.2, wheelSpeedKph: 17, sink: 0.22, pitch: -4, roll: 7, roughness: 2.6 }],
    [5_200, 'Primeira tentativa — sem avanço', { speedKph: 0, wheelSpeedKph: 15, sink: 0.3 }],
    [5_800, 'Balanço: engata a ré', { direction: -1, wheelSpeedKph: 4 }],
    [6_600, 'Balanço: ré', { speedKph: 1.2, wheelSpeedKph: 6, pitch: -1, roll: 5 }],
    [7_400, 'Segura no freio', { speedKph: 0, wheelSpeedKph: 0 }],
    [8_000, 'Balanço: à frente', { direction: 1, wheelSpeedKph: 9 }],
    [8_800, 'Surto para frente — patina', { speedKph: 1.4, wheelSpeedKph: 16, pitch: -5, roll: 8, sink: 0.42 }],
    [9_800, 'Enterra sem sair', { speedKph: 0, wheelSpeedKph: 10, sink: 0.5, roll: 9 }],
    [10_400, 'Último esforço: engata a ré', { direction: -1, wheelSpeedKph: 0 }],
    [11_000, 'Ré final — enterra mais', { speedKph: 0.8, wheelSpeedKph: 5, pitch: -3, roll: 8, sink: 0.53 }],
    [12_000, 'Imobilizado', { speedKph: 0, wheelSpeedKph: 3, sink: 0.55, roll: 10, pitch: -5 }],
    [13_000, 'Tentativa encerrada', { wheelSpeedKph: 0, roughness: 0, rain: 0.15 }],
  ]),
  'driver-drowsiness': ruralScript('driver-drowsiness', [
    [0, 'Rodagem contínua', {}],
    [2_400, 'Nariz deriva para o acostamento', { yaw: 3 }],
    [3_600, 'Primeiro desvio de faixa', { yaw: -1, lateral: 1.2, roll: 1.5 }],
    [4_400, 'Motorista reage e corrige', { yaw: -4.5 }],
    [6_600, 'Correção excessiva', { yaw: -3.5, lateral: -1.4, roll: -2, collisionRisk: true }],
    [7_400, 'Corrige de volta', { yaw: 3.5 }],
    [9_500, 'Aproximação do acostamento', { yaw: 4, lateral: 1.9, roll: 2.5 }],
    [10_800, 'Recupera a direção', { yaw: -3, lateral: 1.85, roll: -1 }],
    [15_000, 'Motorista reduz e retoma a faixa', { yaw: 0, lateral: 0, roll: 0, speedKph: 55, collisionRisk: false }],
  ]),
  'fast-corner': ruralScript('fast-corner', [
    [0, 'Entrada em curva', {}],
    [1_800, 'Esterço para a curva', { yaw: -10, roll: 5, speedKph: 92 }],
    [3_200, 'Limite de aderência lateral', { yaw: -19, roll: 11, lateral: 0.5, speedKph: 78, inclinationRisk: true, roughness: 1.1 }],
    [4_800, 'Freio em curva segura a linha', { yaw: -24, roll: 13, lateral: 0.9, speedKph: 58, roughness: 1.4 }],
    [7_000, 'Apex — retoma a trajetória', { yaw: -14, roll: 6, lateral: 0.6, speedKph: 52, inclinationRisk: false, roughness: 0.9 }],
    [9_500, 'Saída de curva', { yaw: 0, roll: 1, lateral: 0, speedKph: 48, roughness: 0.6 }],
    [14_000, 'Segue em marcha reduzida', {}],
  ]),
});

function scenarioOutcome(id, label, description) {
  return Object.freeze({ id, label, description });
}

/**
 * Desfechos declarativos por cenário. O primeiro é o padrão e preserva o
 * comportamento canônico (roteiro existente ou controles manuais); os demais
 * são ramos determinísticos com seus próprios keyframes.
 */
export const SOMPO_SCENARIO_OUTCOMES = Object.freeze({
  normal: Object.freeze([
    scenarioOutcome('livre', 'Condução livre', 'Operação contínua com os controles manuais.'),
    scenarioOutcome('viagem-completa', 'Viagem completa', 'Saída, cruzeiro e chegada ao talhão com parada final.'),
    scenarioOutcome('parada-tecnica', 'Parada técnica', 'Vibração incomum leva a uma parada preventiva de inspeção.'),
  ]),
  obstacle: Object.freeze([
    scenarioOutcome('livre', 'Controles manuais', 'Obstáculo estático com distância ajustável.'),
    scenarioOutcome('parada-segura', 'Parada segura', 'O alerta dispara e o caminhão para a 38 cm do obstáculo.'),
    scenarioOutcome('toque-leve', 'Toque leve', 'O alerta chega tarde e há um contato de baixa energia.'),
  ]),
  inclination: Object.freeze([
    scenarioOutcome('livre', 'Controles manuais', 'Inclinação lateral com ângulos ajustáveis.'),
    scenarioOutcome('estabiliza', 'Estabiliza', 'O operador busca a linha baixa e o alerta é encerrado.'),
    scenarioOutcome('quase-tomba', 'Quase tomba', 'A roda sobe no barranco e chega ao limite antes da correção.'),
  ]),
  'rough-road': Object.freeze([
    scenarioOutcome('livre', 'Controles manuais', 'Pista irregular contínua com vibração ajustável.'),
    scenarioOutcome('reduz-e-atravessa', 'Reduz e atravessa', 'Velocidade reduzida vence o trecho degradado sem avaria.'),
    scenarioOutcome('parada-inspecao', 'Parada para inspeção', 'Impacto forte em buraco força checagem da carga.'),
  ]),
  'hard-braking': Object.freeze([
    scenarioOutcome('sem-impacto', 'Parada sem impacto', 'Frenagem brusca preventiva; o veículo para livre.'),
    scenarioOutcome('obstaculo-na-pista', 'Obstáculo na pista', 'Frenagem máxima diante de obstáculo; para a 35 cm.'),
    scenarioOutcome('derrapagem', 'Derrapagem', 'Frenagem sobre piso solto termina atravessado na pista.'),
  ]),
  'steep-climb': Object.freeze([
    scenarioOutcome('livre', 'Controles manuais', 'Aclive contínuo com ângulos ajustáveis.'),
    scenarioOutcome('vence-a-rampa', 'Vence a rampa', 'Subida lenta até a crista e platô seguro.'),
    scenarioOutcome('perda-de-tracao', 'Perda de tração', 'Rodas patinam, recuo controlado em ré até a base.'),
  ]),
  'steep-descent': Object.freeze([
    scenarioOutcome('livre', 'Controles manuais', 'Declive contínuo com ângulos ajustáveis.'),
    scenarioOutcome('desce-controlado', 'Desce controlado', 'Descida em marcha reduzida até o plano.'),
    scenarioOutcome('freio-aquece', 'Freio aquece', 'Fade inicial do freio força parada técnica para resfriar.'),
  ]),
  'yard-maneuver': Object.freeze([
    scenarioOutcome('livre', 'Controles manuais', 'Manobra no terreiro com distância ajustável.'),
    scenarioOutcome('encosta-na-doca', 'Encosta na doca', 'Ajuste fino até os 12 cm previstos, sem contato.'),
    scenarioOutcome('toque-no-portao', 'Toque no portão', 'Espaço mais estreito que o previsto; contato leve e recuo.'),
  ]),
  'shifted-load': Object.freeze([
    scenarioOutcome('livre', 'Controles manuais', 'Carga assimétrica com inclinação ajustável.'),
    scenarioOutcome('reacomoda', 'Reacomoda a carga', 'Parada imediata, reamarração e alerta encerrado.'),
    scenarioOutcome('tomba-parado', 'Tomba parado', 'A carga vence a amarração e tomba em marcha lenta.'),
  ]),
  'hot-weather': Object.freeze([
    scenarioOutcome('livre', 'Controles manuais', 'Calor intenso com temperatura ajustável.'),
    scenarioOutcome('pausa-preventiva', 'Pausa preventiva', 'Pausa à sombra antes de a temperatura virar problema.'),
    scenarioOutcome('superaquecimento', 'Superaquecimento', 'Vapor no radiador e parada de emergência.'),
  ]),
  rollover: Object.freeze([
    scenarioOutcome('tombamento', 'Tombamento', 'Rolagem progressiva até a imobilização lateral.'),
    scenarioOutcome('recuperacao', 'Recuperação', 'Correção de direção devolve o caminhão à faixa.'),
    scenarioOutcome('parada-no-acostamento', 'Parada no acostamento', 'Inclinação estabiliza e o veículo para sem tombar.'),
  ]),
  'tire-blowout': Object.freeze([
    scenarioOutcome('parada-controlada', 'Parada controlada', 'Contra-esterço domina a puxada e o caminhão para no acostamento.'),
    scenarioOutcome('saida-de-pista', 'Saída de pista', 'A puxada vence a correção e o caminhão para na vegetação.'),
    scenarioOutcome('tombamento', 'Tombamento', 'Correção excessiva termina em rolagem lateral.'),
  ]),
  'animal-crossing': Object.freeze([
    scenarioOutcome('freada-a-tempo', 'Freada a tempo', 'O caminhão para antes do contato e o animal atravessa.'),
    scenarioOutcome('desvio', 'Desvio por pouco', 'Desvio de emergência passa rente ao animal, sem contato.'),
    scenarioOutcome('colisao', 'Colisão com o animal', 'Frenagem tardia não evita o impacto com o bovino.'),
  ]),
  aquaplaning: Object.freeze([
    scenarioOutcome('recuperacao', 'Aderência recuperada', 'Correção em piso molhado e marcha reduzida sob chuva.'),
    scenarioOutcome('saida-de-pista', 'Saída de pista', 'A lâmina d’água arrasta o caminhão para fora da pista.'),
    scenarioOutcome('parada-preventiva', 'Parada preventiva', 'Redução e parada no acostamento até a chuva passar.'),
  ]),
  'brake-failure': Object.freeze([
    scenarioOutcome('risco-persiste', 'Risco persiste', 'A velocidade segue crescendo; intervenção necessária.'),
    scenarioOutcome('area-de-escape', 'Área de escape', 'O leito de brita desacelera e imobiliza o conjunto.'),
    scenarioOutcome('colisao', 'Colisão no fim da descida', 'Sem freio, o caminhão atinge o obstáculo na base.'),
  ]),
  'engine-fire': Object.freeze([
    scenarioOutcome('foco-ativo', 'Foco ativo', 'Parada de emergência com o foco ainda ativo.'),
    scenarioOutcome('fogo-contido', 'Fogo contido', 'Extintor aplicado cedo controla o princípio de incêndio.'),
    scenarioOutcome('fogo-alastra', 'Fogo se alastra', 'As chamas crescem e a cabine é abandonada.'),
  ]),
  'tight-reverse': Object.freeze([
    scenarioOutcome('concluida', 'Manobra concluída', 'Ré alinhada e concluída sem contato.'),
    scenarioOutcome('toque-na-doca', 'Toque na doca', 'Aproximação rápida demais termina em contato leve.'),
    scenarioOutcome('reinicia-manobra', 'Reinicia a manobra', 'Ângulo insuficiente: avanço de correção e nova ré.'),
  ]),
  'bogged-down': Object.freeze([
    scenarioOutcome('atolado', 'Atolado', 'Pneus patinam sem avanço; tentativa encerrada.'),
    scenarioOutcome('desatola', 'Desatola', 'Balanço recupera tração e o caminhão segue em marcha lenta.'),
    scenarioOutcome('afunda-mais', 'Afunda mais', 'Aceleração cava a lama; afundamento lateral e resgate.'),
  ]),
  'driver-drowsiness': Object.freeze([
    scenarioOutcome('recupera', 'Retoma a faixa', 'Correção tardia, redução e retomada da faixa.'),
    scenarioOutcome('saida-de-pista', 'Saída de pista', 'Sem correção, o caminhão sai da pista e desperta no terreno.'),
    scenarioOutcome('parada-descanso', 'Parada para descanso', 'O motorista reconhece a fadiga e encosta em segurança.'),
  ]),
  'fast-corner': Object.freeze([
    scenarioOutcome('recupera', 'Recupera a trajetória', 'Transferência de carga controlada e saída em marcha reduzida.'),
    scenarioOutcome('tombamento', 'Tombamento na curva', 'A transferência de carga vence e o conjunto rola.'),
    scenarioOutcome('saida-de-frente', 'Sai pela tangente', 'Subesterço leva o caminhão para fora da curva.'),
  ]),
});

export function getSompoScenarioOutcomes(scenarioId = DEFAULT_SCENARIO_ID) {
  return Object.hasOwn(SOMPO_SCENARIO_OUTCOMES, scenarioId)
    ? SOMPO_SCENARIO_OUTCOMES[scenarioId] : SOMPO_SCENARIO_OUTCOMES[DEFAULT_SCENARIO_ID];
}

/** Roteiros dos desfechos alternativos; o padrão vive em SOMPO_RURAL_SCRIPTS (ou é manual). */
const SOMPO_OUTCOME_SCRIPTS = Object.freeze({
  normal: Object.freeze({
    'viagem-completa': ruralScript('normal', [
      [0, 'Saída da sede', { speedKph: 12 }],
      [4_000, 'Ganho de velocidade', { speedKph: 45 }],
      [10_000, 'Cruzeiro na estrada rural', { speedKph: 80 }],
      [15_000, 'Chegada ao talhão', { speedKph: 25 }],
      [18_000, 'Parada no destino', { speedKph: 0, roughness: 0 }],
    ]),
    'parada-tecnica': ruralScript('normal', [
      [0, 'Rodagem normal', {}],
      [4_000, 'Vibração incomum percebida', { roughness: 1.6 }],
      [7_000, 'Redução por precaução', { speedKph: 25 }],
      [10_000, 'Parada para inspeção', { speedKph: 0, roughness: 0 }],
      [16_000, 'Checagem concluída — sem avaria', {}],
    ]),
  }),
  obstacle: Object.freeze({
    'parada-segura': ruralScript('obstacle', [
      [0, 'Aproximação do obstáculo', { distance: 120, collisionRisk: false, speedKph: 8 }],
      [3_000, 'Alerta de proximidade', { distance: 60, collisionRisk: true, speedKph: 5 }],
      [6_000, 'Parada segura', { distance: 38, speedKph: 0, roughness: 0 }],
      [12_000, 'Aguardando liberação da via', {}],
    ]),
    'toque-leve': ruralScript('obstacle', [
      [0, 'Aproximação do obstáculo', { distance: 120, collisionRisk: false, speedKph: 8 }],
      [3_000, 'Alerta tardio', { distance: 55, collisionRisk: true, speedKph: 6 }],
      [5_200, 'Toque leve no obstáculo', { distance: 6, speedKph: 0, pitch: -2, roughness: 2.2 }],
      [8_000, 'Parado após o toque', { pitch: 1, roughness: 0, distance: 8 }],
      [13_000, 'Imobilizado junto ao obstáculo', {}],
    ]),
  }),
  inclination: Object.freeze({
    estabiliza: ruralScript('inclination', [
      [0, 'Terreno lateral inclinado', {}],
      [3_000, 'Busca a linha mais baixa', { roll: 15, yaw: 5, lateral: 0.7, speedKph: 5 }],
      [5_600, 'Atravessa o ponto mais fundo', { roll: 10, lateral: 1.2, pitch: 4, roughness: 1.1, speedKph: 4 }],
      [8_200, 'Retorno ao plano', { roll: 5, yaw: -2, lateral: 0.3, speedKph: 8, inclinationRisk: false, pitch: 3 }],
      [11_500, 'Operação estabilizada', { roll: 2, yaw: 0, lateral: 0, speedKph: 10, pitch: 2, roughness: 0.5 }],
      [14_000, 'Segue no plano', {}],
    ]),
    'quase-tomba': ruralScript('inclination', [
      [0, 'Terreno lateral inclinado', {}],
      [2_800, 'Roda sobe no barranco', { roll: 23, lateral: 0.9, yaw: -4, speedKph: 5, roughness: 1.7 }],
      [4_200, 'Peso pendurado', { roll: 28, speedKph: 3, lateral: 1.35, pitch: 8 }],
      [5_200, 'Limite de tombamento', { roll: 32, speedKph: 0.5, lateral: 1.55, sink: 0.06, roughness: 0.9 }],
      [6_300, 'Assenta no limite', { roll: 29, speedKph: 0, lateral: 1.5 }],
      [7_800, 'Correção para o declive', { roll: 18, yaw: -8, speedKph: 4, lateral: 1, roughness: 1.2 }],
      [9_800, 'Desce do barranco', { roll: 12, yaw: -3, lateral: 0.4, speedKph: 5, pitch: 6 }],
      [11_500, 'Parado para reavaliar o trajeto', { speedKph: 0, roll: 11, yaw: 0, lateral: 0.2, roughness: 0, pitch: 4 }],
      [15_000, 'Aguardando rota alternativa', {}],
    ]),
  }),
  'rough-road': Object.freeze({
    'reduz-e-atravessa': ruralScript('rough-road', [
      [0, 'Trecho degradado', {}],
      [2_200, 'Costelas de vaca sacodem a cabine', { pitch: -2, roll: -3, roughness: 4.0 }],
      [4_000, 'Reduz para poupar a suspensão', { speedKph: 26, pitch: 3, roll: 4, roughness: 3.4 }],
      [6_000, 'Trecho de erosão', { pitch: -3, roll: -4, speedKph: 22, roughness: 4.4 }],
      [8_500, 'Pior trecho vencido', { pitch: 2, roll: 2, roughness: 2.0, speedKph: 32 }],
      [11_500, 'Pista regular novamente', { pitch: 1, roll: 1, roughness: 0.6, speedKph: 45 }],
      [16_000, 'Segue viagem', { speedKph: 50, pitch: 4, roll: 5 }],
    ]),
    'parada-inspecao': ruralScript('rough-road', [
      [0, 'Trecho degradado', {}],
      [2_000, 'Costelas antes do buraco', { pitch: -2, roll: -3, roughness: 3.8 }],
      [2_900, 'Roda entra no buraco', { pitch: -4, roll: -6, roughness: 4.8, speedKph: 42 }],
      [3_300, 'Impacto no fundo do buraco', { pitch: 5, roll: 5, roughness: 5, speedKph: 30 }],
      [4_500, 'Vibração anormal persiste', { roughness: 3.4, speedKph: 16, pitch: 2, roll: 2 }],
      [7_500, 'Parada para inspecionar a carga', { speedKph: 0, roughness: 0, pitch: 3, roll: 3 }],
      [14_000, 'Amarração reforçada — apto a seguir', { pitch: 4, roll: 5 }],
    ]),
  }),
  'hard-braking': Object.freeze({
    'obstaculo-na-pista': ruralScript('hard-braking', [
      [0, 'Deslocamento', {}],
      [2_500, 'Obstáculo surge à frente', { distance: 120, collisionRisk: true }],
      [7_500, 'Frenagem máxima', { speedKph: 6, distance: 60, pitch: -5 }],
      [8_500, 'Parada a tempo', { speedKph: 0, distance: 35, pitch: 0, roughness: 0 }],
      [12_000, 'Parado diante do obstáculo', {}],
    ]),
    derrapagem: ruralScript('hard-braking', [
      [0, 'Deslocamento', {}],
      [3_000, 'Frenagem sobre piso solto', { speedKph: 55, roughness: 3.5, yaw: -6, roll: -2 }],
      [5_000, 'Traseira desliza', { yaw: 10, lateral: 0.9, speedKph: 25, collisionRisk: true }],
      [7_500, 'Parada atravessada na pista', { speedKph: 0, yaw: 14, roughness: 0 }],
      [12_000, 'Parado em diagonal', { collisionRisk: false }],
    ]),
  }),
  'steep-climb': Object.freeze({
    'vence-a-rampa': ruralScript('steep-climb', [
      [0, 'Aproximação da rampa', { pitch: 3, speedKph: 28, inclinationRisk: false }],
      [2_000, 'Pé embaixo — entra na rampa', { pitch: 15, speedKph: 14, inclinationRisk: true, roughness: 1.4 }],
      [4_200, 'Subida de 21°', { pitch: 21, speedKph: 7 }],
      [7_000, 'Motor no limite', { speedKph: 4.5, roughness: 1.8 }],
      [9_800, 'Crista da subida', { pitch: 9, speedKph: 6, roughness: 1 }],
      [12_500, 'Platô alcançado', { pitch: 2, speedKph: 10, inclinationRisk: false }],
      [16_000, 'Segue no topo', { pitch: 1, speedKph: 14 }],
    ]),
    'perda-de-tracao': ruralScript('steep-climb', [
      [0, 'Aproximação da rampa', { pitch: 3, speedKph: 26, inclinationRisk: false }],
      [2_000, 'Entra na rampa de cascalho', { pitch: 16, speedKph: 13, inclinationRisk: true }],
      [4_000, 'Subida de 21°', { pitch: 21, speedKph: 7 }],
      [5_000, 'Rodas patinam no cascalho', { speedKph: 3, wheelSpeedKph: 12, roughness: 2.4 }],
      [6_200, 'Tração se esgota — estanca', { speedKph: 0, wheelSpeedKph: 5 }],
      [7_000, 'Segura no freio', { wheelSpeedKph: 0 }],
      [7_800, 'Engata a ré', { direction: -1 }],
      [9_600, 'Recuo controlado em ré', { speedKph: 2.8, wheelSpeedKph: 2.8, pitch: 15 }],
      [11_500, 'Parada na base da rampa', { speedKph: 0, wheelSpeedKph: 0, pitch: 5, roughness: 0, inclinationRisk: false }],
      [15_000, 'Aguardando apoio para subir', { pitch: 3 }],
    ]),
  }),
  'steep-descent': Object.freeze({
    'desce-controlado': ruralScript('steep-descent', [
      [0, 'Rodovia na serra', { pitch: -4, speedKph: 88 }],
      [2_200, 'Entra no declive', { pitch: -16, speedKph: 93 }],
      [5_200, 'Freio motor segura a descida', { pitch: -22, speedKph: 98 }],
      [8_600, 'Meio da serra — velocidade estica', { speedKph: 100, roughness: 1.5 }],
      [11_500, 'Base da serra', { pitch: -8, speedKph: 95 }],
      [13_500, 'Plano alcançado', { pitch: -1, speedKph: 88, inclinationRisk: false }],
      [16_000, 'Segue no plano', { pitch: 0, speedKph: 85 }],
    ]),
    'freio-aquece': ruralScript('steep-descent', [
      [0, 'Rodovia na serra', { pitch: -4, speedKph: 86 }],
      [2_400, 'Entra no declive', { pitch: -17, speedKph: 92 }],
      [5_000, 'Freio no limite — velocidade cresce', { pitch: -22, speedKph: 100, temperature: 27 }],
      [7_600, 'Fade do freio de serviço', { speedKph: 106, temperature: 32, roughness: 1.6 }],
      [9_600, 'Reduz marcha — freio motor pega', { speedKph: 68, temperature: 34, roughness: 2, pitch: -18 }],
      [11_500, 'Busca o acostamento', { speedKph: 30, lateral: 1.4, yaw: -4, pitch: -8 }],
      [13_000, 'Parada técnica para resfriar', { speedKph: 0, lateral: 2, yaw: 0, pitch: -2, roughness: 0, inclinationRisk: false }],
      [17_000, 'Aguardando os freios resfriarem', { temperature: 30, pitch: -1 }],
    ]),
  }),
  'yard-maneuver': Object.freeze({
    'encosta-na-doca': ruralScript('yard-maneuver', [
      [0, 'Manobra no terreiro', { distance: 130, collisionRisk: false, speedKph: 3 }],
      [2_600, 'Diagonal de aproximação', { yaw: -5, lateral: 0.5, distance: 95, speedKph: 2.5 }],
      [4_600, 'Endireita junto à doca', { yaw: 2.5, lateral: 0.9, distance: 70, collisionRisk: true, speedKph: 2 }],
      [6_800, 'Pausa — confere o espelho', { speedKph: 0, distance: 55 }],
      [8_200, 'Ajuste fino', { speedKph: 1, yaw: 0, distance: 30 }],
      [10_800, 'Encostado na doca', { speedKph: 0, distance: 12, roughness: 0 }],
      [14_000, 'Posicionado para a carga', {}],
    ]),
    'toque-no-portao': ruralScript('yard-maneuver', [
      [0, 'Manobra no terreiro', { distance: 130, collisionRisk: false, speedKph: 3 }],
      [3_200, 'Espaço mais estreito que o previsto', { yaw: -4, lateral: 0.5, distance: 60, collisionRisk: true, speedKph: 3.5 }],
      [5_400, 'Toque no portão', { distance: 8, speedKph: 0, pitch: -1.8, yaw: -5.5, roll: 1.5, roughness: 2.4 }],
      [6_600, 'Parado — confere o dano', { pitch: 0, yaw: -5, roughness: 0.5, distance: 10 }],
      [7_400, 'Engata a ré', { direction: -1 }],
      [9_200, 'Recuo para avaliar', { speedKph: 1.5, distance: 60, yaw: -2, lateral: 0.4, roll: 0 }],
      [11_200, 'Parado para avaliar o dano', { speedKph: 0, roughness: 0 }],
      [15_000, 'Manobra suspensa', {}],
    ]),
  }),
  'shifted-load': Object.freeze({
    reacomoda: ruralScript('shifted-load', [
      [0, 'Carga deslocada a 19°', {}],
      [2_500, 'Parada imediata', { speedKph: 0, roughness: 0.2 }],
      [5_500, 'Cintas aliviam — carga cede mais', { roll: 23, roughness: 1.2 }],
      [8_500, 'Reamarração puxa a carga', { roll: 14, roughness: 0.8 }],
      [11_500, 'Carga reacomodada', { roll: 4, inclinationRisk: false, roughness: 0.3 }],
      [15_000, 'Retoma em marcha lenta', { speedKph: 5 }],
    ]),
    'tomba-parado': ruralScript('shifted-load', [
      [0, 'Carga deslocada a 19°', {}],
      [2_500, 'Carga escora a cada balanço', { roll: 24, speedKph: 2, roughness: 1.4 }],
      [4_500, 'Passa do ponto de equilíbrio', { roll: 33, speedKph: 0, roughness: 0.6 }],
      [6_000, 'Queda acelera', { roll: 52, lateral: 0.5, roughness: 0 }],
      [7_200, 'Carroceria toca o solo', { roll: 78, lateral: 1.1, collisionRisk: true }],
      [9_000, 'Imobilizado de lado', { roll: 84, lateral: 1.3 }],
      [14_000, 'Imobilizado — carga ao solo', {}],
    ]),
  }),
  'hot-weather': Object.freeze({
    'pausa-preventiva': ruralScript('hot-weather', [
      [0, 'Operação sob calor de 43 °C', {}],
      [3_500, 'Sensores marcam 46 °C', { temperature: 46 }],
      [6_500, 'Busca sombra no acostamento', { speedKph: 40, lateral: 0.8, temperature: 47 }],
      [9_500, 'Parada preventiva à sombra', { speedKph: 0, lateral: 2.9, temperature: 47, roughness: 0, yaw: -4 }],
      [16_000, 'Resfriando à sombra', { temperature: 42, yaw: 0 }],
    ]),
    superaquecimento: ruralScript('hot-weather', [
      [0, 'Operação sob calor de 43 °C', {}],
      [3_500, 'Motor perde rendimento', { temperature: 47, speedKph: 66, roughness: 1.1 }],
      [6_000, 'Temperatura dispara no painel', { temperature: 52, speedKph: 45, roughness: 1.5 }],
      [8_000, 'Vapor no radiador', { temperature: 57, smoke: 0.3, speedKph: 18, roughness: 0.9 }],
      [10_000, 'Parada de emergência', { speedKph: 0, temperature: 59, smoke: 0.45, roughness: 0 }],
      [15_000, 'Motor desligado — aguardando resfriar', { temperature: 53, smoke: 0.15 }],
    ]),
  }),
  rollover: Object.freeze({
    recuperacao: ruralScript('rollover', [
      [0, 'Aproximação do acostamento', {}],
      [2_400, 'Deriva para o acostamento', { yaw: 4, lateral: 0.9, roll: 6, roughness: 1.6, speedKph: 70 }],
      [4_200, 'Contra-esterço sobre a terra', { yaw: -9, lateral: 1.5, roll: 12, inclinationRisk: true, speedKph: 55 }],
      [7_000, 'Rodas voltam ao pavimento', { roll: 5, lateral: 0.8, yaw: -3, speedKph: 48, inclinationRisk: false }],
      [11_000, 'Estabilizado na faixa', { roll: 1, lateral: 0, yaw: 0, speedKph: 65, roughness: 0.5 }],
    ]),
    'parada-no-acostamento': ruralScript('rollover', [
      [0, 'Aproximação do acostamento', {}],
      [2_600, 'Deriva para o acostamento', { yaw: 4, lateral: 1.0, roll: 7, roughness: 1.8, speedKph: 68 }],
      [5_000, 'Inclinação estabiliza', { roll: 12, lateral: 2.0, speedKph: 40, inclinationRisk: true, yaw: -2 }],
      [9_000, 'Parada no acostamento', { speedKph: 0, roll: 11, lateral: 2.6, roughness: 0, yaw: 0 }],
      [15_000, 'Imobilizado inclinado, sem tombar', {}],
    ]),
  }),
  'tire-blowout': Object.freeze({
    'saida-de-pista': ruralScript('tire-blowout', [
      [0, 'Rodagem', {}],
      [2_750, 'Rodagem a 90 km/h', {}],
      [3_000, 'Estouro do pneu dianteiro', { roughness: 5, roll: 4, yaw: 4, pitch: -1 }],
      [4_300, 'Puxada vence a correção', { yaw: 14, lateral: 2.0, roll: 7, speedKph: 66, collisionRisk: true }],
      [6_200, 'Sai da pista', { lateral: 3.6, yaw: 9, speedKph: 40, roughness: 4.2, pitch: -2, inclinationRisk: true }],
      [9_500, 'Parada na vegetação', { speedKph: 0, lateral: 4.4, yaw: 2, roll: 5, roughness: 0, collisionRisk: false }],
      [15_000, 'Imobilizado fora da pista', {}],
    ]),
    tombamento: ruralScript('tire-blowout', [
      [0, 'Rodagem', {}],
      [2_750, 'Rodagem a 90 km/h', {}],
      [3_000, 'Estouro do pneu dianteiro', { roughness: 5, roll: 5, yaw: 5, pitch: -1 }],
      [4_400, 'Contra-esterço excessivo', { yaw: -16, lateral: 1.0, roll: 7, speedKph: 66, collisionRisk: true }],
      [5_800, 'Rolagem inicia', { roll: 30, yaw: -17, lateral: 2.2, speedKph: 44, inclinationRisk: true }],
      [7_200, 'Tombamento lateral', { roll: 68, lateral: 3.3, speedKph: 10, roughness: 1.5 }],
      [8_600, 'Imobilizado de lado', { roll: 76, speedKph: 0, lateral: 3.9, roughness: 0 }],
      [15_000, 'Imobilizado de lado', {}],
    ]),
  }),
  'animal-crossing': Object.freeze({
    desvio: ruralScript('animal-crossing', [
      [0, 'Animal no acostamento', { animalZ: -6 }],
      [900, 'Animal arranca para a pista', { animalZ: -4.9 }],
      [2_200, 'Animal cruza a faixa contrária', { animalZ: -3.0, distance: 160 }],
      [2_800, 'Travessia repentina', { animalZ: -1.6, distance: 120, collisionRisk: true, speedKph: 76 }],
      [2_900, 'Nariz morde a esquerda', { animalZ: -1.1, yaw: -5, lateral: -0.15, roll: -2, speedKph: 72 }],
      [3_600, 'Desvio para a outra faixa', { animalZ: -0.2, lateral: -1.9, yaw: -5.5, roll: -4, distance: 92, speedKph: 66 }],
      [4_400, 'Passagem rente ao animal', { animalZ: 0.8, lateral: -3.0, yaw: -2, roll: -2.5, distance: 70, speedKph: 56, pitch: -1 }],
      [5_400, 'Na faixa oposta', { animalZ: 2.0, lateral: -3.1, yaw: 5, roll: 3, distance: 130, speedKph: 55 }],
      [6_600, 'Retorno à faixa', { animalZ: 3.6, lateral: -1.7, yaw: 4.5, roll: 2, distance: 200, speedKph: 62 }],
      [7_800, 'Alinhando na faixa', { animalZ: 5.0, lateral: -0.4, yaw: 1.5, roll: 0.5, distance: 250, collisionRisk: false, speedKph: 70 }],
      [9_000, 'Segue viagem', { animalZ: 6.2, lateral: 0, yaw: 0, distance: 280, speedKph: 75 }],
      [13_000, 'Animal já no pasto', { animalZ: 7, roughness: 0 }],
    ]),
    colisao: ruralScript('animal-crossing', [
      [0, 'Animal no acostamento', { animalZ: -6 }],
      [1_100, 'Animal arranca para a pista', { animalZ: -4.8 }],
      [2_800, 'Travessia detectada tarde', { animalZ: -2.4, distance: 140, collisionRisk: true }],
      [4_200, 'Animal entra na faixa', { animalZ: -0.9, distance: 70, speedKph: 52, pitch: -3 }],
      [5_200, 'Frenagem máxima', { animalZ: -0.3, distance: 30, speedKph: 28, pitch: -5 }],
      [5_900, 'Impacto com o animal', { animalZ: 0.05, distance: 8, speedKph: 14, pitch: -2, roughness: 3.2 }],
      [8_000, 'Parado após o impacto', { animalZ: 0.2, speedKph: 0, pitch: 0, roughness: 0.4, distance: 10 }],
      [14_000, 'Imobilizado — animal ferido na pista', { animalZ: 0.35, roughness: 0 }],
    ]),
  }),
  aquaplaning: Object.freeze({
    'saida-de-pista': ruralScript('aquaplaning', [
      [0, 'Chuva intensa', { rain: 1 }],
      [1_800, 'Chuva intensa', {}],
      [2_600, 'Lâmina d’água sob os eixos', { wheelSpeedKph: 58, roughness: 0.18, yaw: 2, lateral: 0.35 }],
      [5_000, 'Deriva sem resposta da direção', { wheelSpeedKph: 30, yaw: 6, lateral: 1.7, speedKph: 82, roll: 1.5, collisionRisk: true, roughness: 0.12 }],
      [7_200, 'Roda cruza a borda da pista', { lateral: 3.0, yaw: 9, speedKph: 74, wheelSpeedKph: 42, roll: 3, roughness: 1.6 }],
      [9_000, 'Grama encharcada arrasta o conjunto', { lateral: 4.0, yaw: 4, speedKph: 38, wheelSpeedKph: 30, roll: 7, sink: 0.1, inclinationRisk: true, roughness: 3.0, pitch: -2 }],
      [11_500, 'Parada no campo', { speedKph: 0, wheelSpeedKph: 0, yaw: 0, lateral: 4.4, roll: 5, sink: 0.14, roughness: 0, collisionRisk: false, pitch: 0 }],
      [16_000, 'Imobilizado fora da pista sob chuva', {}],
    ]),
    'parada-preventiva': ruralScript('aquaplaning', [
      [0, 'Chuva intensa', { rain: 1 }],
      [2_800, 'Aquaplanagem breve percebida', { wheelSpeedKph: 60, roughness: 0.2, lateral: 0.3, yaw: 2 }],
      [5_200, 'Alivia e deixa a velocidade cair', { speedKph: 70, wheelSpeedKph: 70, yaw: 0, lateral: 0.5, roughness: 0.45 }],
      [8_500, 'Frenagem leve até o acostamento', { speedKph: 28, lateral: 1.7, yaw: -3 }],
      [11_500, 'Parada no acostamento', { speedKph: 0, lateral: 2.6, roughness: 0, yaw: 0 }],
      [16_000, 'Aguardando a chuva passar', {}],
    ]),
  }),
  'brake-failure': Object.freeze({
    'area-de-escape': ruralScript('brake-failure', [
      [0, 'Descida com carga', {}],
      [4_500, 'Freio começa a ceder', { speedKph: 76, distance: 195, temperature: 36 }],
      [7_000, 'Pedal no fundo sem resposta', { speedKph: 87, distance: 150, collisionRisk: true, pitch: -15 }],
      [7_400, 'Redução forçada de marcha', { speedKph: 85, roughness: 2.4, pitch: -15.5 }],
      [9_500, 'Freio-motor segura o embalo', { speedKph: 90, roughness: 1.2, pitch: -14 }],
      [11_500, 'Mira a área de escape', { speedKph: 94, yaw: 7, lateral: 1.4, distance: 95 }],
      [13_000, 'Entra no leito de brita', { speedKph: 62, lateral: 2.9, yaw: 3, roughness: 4.4, sink: 0.14, pitch: -8 }],
      [14_800, 'Brita engole o conjunto', { speedKph: 12, sink: 0.32, roughness: 2.6, pitch: -5 }],
      [15_800, 'Parada na área de escape', { speedKph: 0, roughness: 0, collisionRisk: false, distance: 220, pitch: -6, yaw: 2 }],
    ]),
    colisao: ruralScript('brake-failure', [
      [0, 'Descida com carga', {}],
      [4_500, 'Freio começa a ceder', { speedKph: 76, distance: 195, temperature: 36 }],
      [7_000, 'Pedal no fundo sem resposta', { speedKph: 88, distance: 140, collisionRisk: true, pitch: -15 }],
      [7_400, 'Redução forçada de marcha', { speedKph: 86, roughness: 2.6, pitch: -15.5 }],
      [10_000, 'Embalo vence a redução', { speedKph: 96, distance: 75, pitch: -14, roughness: 1.2 }],
      [12_800, 'Impacto iminente', { speedKph: 99, distance: 12 }],
      [13_300, 'Impacto no obstáculo', { speedKph: 22, distance: 6, pitch: -18, roughness: 4.8 }],
      [15_500, 'Imobilizado após o impacto', { speedKph: 0, pitch: -14, roughness: 0, temperature: 41 }],
    ]),
  }),
  'engine-fire': Object.freeze({
    'fogo-contido': ruralScript('engine-fire', [
      [0, 'Operação', {}],
      [2_500, 'Fumaça no compartimento', { smoke: 0.3, temperature: 42 }],
      [5_000, 'Perda de potência', { speedKph: 56, smoke: 0.5, temperature: 46 }],
      [7_200, 'Parada imediata no acostamento', { speedKph: 0, lateral: 2.3, yaw: 2, smoke: 0.6, temperature: 50, roughness: 0 }],
      [9_000, 'Extintor aplicado', { smoke: 0.18, temperature: 38 }],
      [13_000, 'Foco contido — aguardando resgate', { smoke: 0.05, temperature: 33 }],
    ]),
    'fogo-alastra': ruralScript('engine-fire', [
      [0, 'Operação', {}],
      [2_500, 'Fumaça densa', { smoke: 0.45, temperature: 44 }],
      [5_200, 'Perda de potência', { speedKph: 54, smoke: 0.7, temperature: 52 }],
      [8_600, 'Parada de emergência no acostamento', { speedKph: 0, lateral: 2.4, yaw: 2, smoke: 0.9, temperature: 58, roughness: 0 }],
      [9_500, 'Chamas se alastram', { smoke: 1, temperature: 68, humidity: 16 }],
      [14_000, 'Abandono do veículo — fogo ativo', { temperature: 70 }],
    ]),
  }),
  'tight-reverse': Object.freeze({
    'toque-na-doca': ruralScript('tight-reverse', [
      [0, 'Parado no acesso', { speedKph: 0 }],
      [800, 'Engata a ré', { direction: -1 }],
      [2_200, 'Ré rápida demais', { speedKph: 3.5, yaw: -12, lateral: 0.6, distance: 175 }],
      [3_800, 'Sem corrigir o ângulo', { yaw: -16, lateral: 1, distance: 220, collisionRisk: true }],
      [5_200, 'Toque na doca', { speedKph: 0, pitch: -1.5, yaw: -14, roll: -2, roughness: 2.2, distance: 240 }],
      [6_400, 'Parado — impacto leve', { pitch: 0, roll: 0, roughness: 0.4 }],
      [13_000, 'Manobra suspensa', { roughness: 0 }],
    ]),
    'reinicia-manobra': ruralScript('tight-reverse', [
      [0, 'Parado no acesso', { speedKph: 0 }],
      [800, 'Engata a ré', { direction: -1 }],
      [2_200, 'Ré entra no acesso', { speedKph: 2.8, yaw: -12, lateral: 0.5, distance: 170 }],
      [3_600, 'Ângulo insuficiente', { yaw: -20, lateral: 1.1, distance: 210, collisionRisk: true }],
      [4_800, 'Para para corrigir', { speedKph: 0 }],
      [5_600, 'Engata à frente', { direction: 1 }],
      [6_800, 'Avanço de correção', { speedKph: 2.5, yaw: -4, lateral: 0.7, distance: 185 }],
      [8_200, 'Pausa para a nova ré', { speedKph: 0, yaw: -2 }],
      [9_000, 'Engata a ré', { direction: -1 }],
      [10_400, 'Nova ré alinhada', { speedKph: 2, yaw: 3, lateral: 1, distance: 235 }],
      [12_500, 'Encosta no ponto', { speedKph: 0, yaw: 0 }],
      [14_000, 'Manobra concluída', { roughness: 0, distance: 250 }],
    ]),
  }),
  'bogged-down': Object.freeze({
    desatola: ruralScript('bogged-down', [
      [0, 'Entrada no trecho de lama', { rain: 0.2 }],
      [2_500, 'Perda de tração', { speedKph: 2.5, wheelSpeedKph: 15, sink: 0.18, pitch: -4, roll: 7, roughness: 2.4 }],
      [4_800, 'Patina sem avanço', { speedKph: 0, wheelSpeedKph: 14, sink: 0.3 }],
      [5_600, 'Balanço: engata a ré', { direction: -1, wheelSpeedKph: 3 }],
      [6_400, 'Balanço: ré', { speedKph: 1.4, wheelSpeedKph: 6, pitch: -1, roll: 4 }],
      [7_200, 'Converte o balanço', { speedKph: 0, wheelSpeedKph: 0 }],
      [7_800, 'Engata à frente', { direction: 1 }],
      [8_600, 'Surto para frente', { speedKph: 2.2, wheelSpeedKph: 14, pitch: -5, roll: 7, sink: 0.3 }],
      [9_800, 'Tração recuperada — sai do berço', { speedKph: 5.5, wheelSpeedKph: 9, sink: 0.1, pitch: -1, roll: 2 }],
      [11_500, 'Segue em marcha lenta', { speedKph: 7, wheelSpeedKph: 7, sink: 0, roll: 3, roughness: 0.9 }],
      [14_000, 'Fora do trecho de lama', { roughness: 0.5, rain: 0.1 }],
    ]),
    'afunda-mais': ruralScript('bogged-down', [
      [0, 'Entrada no trecho de lama', { rain: 0.2 }],
      [2_500, 'Perda de tração', { speedKph: 2.5, wheelSpeedKph: 15, sink: 0.18, pitch: -4, roll: 7, roughness: 2.4 }],
      [5_000, 'Aceleração cava a lama', { speedKph: 0, wheelSpeedKph: 19, sink: 0.4, roll: 9, distance: 160, roughness: 2.8 }],
      [6_800, 'Insiste e enterra', { wheelSpeedKph: 17, sink: 0.5, roll: 11, pitch: -5 }],
      [8_400, 'Última ré sem saída', { direction: -1, wheelSpeedKph: 4 }],
      [9_200, 'Ré enterra a traseira', { speedKph: 0.9, wheelSpeedKph: 7, sink: 0.56, roll: 12, pitch: -3 }],
      [10_400, 'Afundamento lateral', { direction: 1, speedKph: 0, wheelSpeedKph: 8, sink: 0.62, roll: 13, inclinationRisk: true, pitch: -6 }],
      [11_500, 'Enterrado até o eixo', { wheelSpeedKph: 3, sink: 0.64, roll: 14 }],
      [14_000, 'Operação abortada — resgate necessário', { wheelSpeedKph: 0, roughness: 0, rain: 0.15 }],
    ]),
  }),
  'driver-drowsiness': Object.freeze({
    'saida-de-pista': ruralScript('driver-drowsiness', [
      [0, 'Rodagem contínua', {}],
      [2_000, 'Nariz deriva para o acostamento', { yaw: 3 }],
      [3_600, 'Primeiro desvio de faixa', { yaw: 2, lateral: 1.2, roll: 1.5 }],
      [5_000, 'Sem correção — rumo ao acostamento', { yaw: 3.5, lateral: 2.0, collisionRisk: true }],
      [7_500, 'Sai da pista dormindo', { yaw: 2, lateral: 3.6, roughness: 3.2, speedKph: 60, pitch: -2 }],
      [9_000, 'Desperta no terreno', { yaw: -3.5, speedKph: 32, roll: 4, roughness: 3.8 }],
      [11_500, 'Parada no campo', { speedKph: 0, yaw: 0, roughness: 0, pitch: 0, roll: 2 }],
      [16_000, 'Parado fora da pista', {}],
    ]),
    'parada-descanso': ruralScript('driver-drowsiness', [
      [0, 'Rodagem contínua', {}],
      [2_000, 'Nariz deriva para o acostamento', { yaw: 3 }],
      [3_600, 'Primeiro desvio de faixa', { yaw: -1.5, lateral: 1.1, roll: 1.5 }],
      [5_500, 'Motorista reconhece a fadiga', { yaw: -2.5, lateral: 0.1, roll: -1, speedKph: 60 }],
      [7_000, 'Decide encostar', { yaw: 2.5, lateral: 0.4, speedKph: 45 }],
      [9_500, 'Encosta no acostamento', { yaw: 3, lateral: 2.2, speedKph: 15, roll: 1.5 }],
      [12_000, 'Parada para descanso', { speedKph: 0, lateral: 2.6, roughness: 0, yaw: 0, roll: 1 }],
      [15_000, 'Veículo parado em segurança', {}],
    ]),
  }),
  'fast-corner': Object.freeze({
    tombamento: ruralScript('fast-corner', [
      [0, 'Entrada em curva', {}],
      [1_800, 'Esterço para a curva', { yaw: -10, roll: 5, speedKph: 92 }],
      [3_000, 'Limite de aderência lateral', { yaw: -20, roll: 14, lateral: 0.7, speedKph: 76, inclinationRisk: true, roughness: 1.2 }],
      [4_200, 'Rolagem passa do equilíbrio', { yaw: -24, roll: 32, lateral: 1.3, speedKph: 62, collisionRisk: true, roughness: 1.6 }],
      [5_400, 'Tomba para fora da curva', { roll: 72, lateral: 2.2, speedKph: 18, yaw: -12, roughness: 2.4 }],
      [7_000, 'Conjunto de lado na pista', { roll: 84, lateral: 2.6, speedKph: 0, yaw: -6, roughness: 0 }],
      [14_000, 'Imobilizado de lado', {}],
    ]),
    'saida-de-frente': ruralScript('fast-corner', [
      [0, 'Entrada em curva', {}],
      [1_800, 'Esterço para a curva', { yaw: -10, roll: 5, speedKph: 92 }],
      [3_000, 'Frente escapa — subesterço', { yaw: -13, lateral: 0.9, roll: 9, speedKph: 80, inclinationRisk: true, roughness: 1.2 }],
      [5_000, 'Sai pela tangente da curva', { yaw: -6, lateral: 2.6, roll: 7, speedKph: 58, roughness: 2.6, collisionRisk: true }],
      [7_500, 'Freia no cascalho do acostamento', { speedKph: 22, lateral: 3.6, roll: 4, yaw: -2, roughness: 3.0 }],
      [10_000, 'Parada fora da curva', { speedKph: 0, yaw: 0, roll: 2, roughness: 0, inclinationRisk: false, collisionRisk: false }],
      [15_000, 'Parado fora da pista', {}],
    ]),
  }),
});

/**
 * Roteiro ativo para um cenário + desfecho. Desfecho padrão (ou desconhecido)
 * devolve o roteiro canônico de SOMPO_RURAL_SCRIPTS, ou null (cenário manual).
 */
export function getSompoScenarioScript(scenarioId, outcomeId) {
  if (!Object.hasOwn(SOMPO_SIMULATION_SCENARIOS, scenarioId)) return null;
  if (typeof outcomeId === 'string' && Object.hasOwn(SOMPO_OUTCOME_SCRIPTS, scenarioId)
    && Object.hasOwn(SOMPO_OUTCOME_SCRIPTS[scenarioId], outcomeId)) {
    return SOMPO_OUTCOME_SCRIPTS[scenarioId][outcomeId];
  }
  return Object.hasOwn(SOMPO_RURAL_SCRIPTS, scenarioId) ? SOMPO_RURAL_SCRIPTS[scenarioId] : null;
}

export function getSompoRuralFrame(scenarioId, elapsedMs = 0, outcomeId) {
  const script = getSompoScenarioScript(scenarioId, outcomeId);
  if (!script) return null;
  const elapsed = clamp(finite(elapsedMs, 0), 0, script.totalMs);
  const from = script.keyframes.findLast((frame) => elapsed >= frame.atMs) || script.keyframes[0];
  const to = script.keyframes.find((frame) => frame.atMs > elapsed) || from;
  const duration = to.atMs - from.atMs;
  const progress = duration ? (elapsed - from.atMs) / duration : 1;
  const blend = progress * progress * (3 - 2 * progress);
  const derivative = duration ? 6 * progress * (1 - progress) / (duration / 1000) : 0;
  const frame = { ...from };
  for (const key of Object.keys(from)) {
    if (key !== 'direction' && typeof from[key] === 'number' && typeof to[key] === 'number') frame[key] = from[key] + (to[key] - from[key]) * blend;
  }
  frame.wheelSpeedKph = (from.wheelSpeedKph ?? from.speedKph)
    + ((to.wheelSpeedKph ?? to.speedKph) - (from.wheelSpeedKph ?? from.speedKph)) * blend;
  frame.phaseLabel = from.phaseLabel;
  frame.accelerationX = (to.speedKph - from.speedKph) / 3.6 * derivative;
  frame.yawRate = (to.yaw - from.yaw) * derivative;
  frame.lateralRate = (to.lateral - from.lateral) * derivative;
  frame.animalRate = (to.animalZ - from.animalZ) * derivative;
  frame.pitchRate = (to.pitch - from.pitch) * derivative;
  frame.rollRate = (to.roll - from.roll) * derivative;
  frame.lateralAcceleration = frame.speedKph / 3.6 * frame.yawRate * Math.PI / 180;
  return frame;
}

/**
 * Deslocamento (m, com sinal) percorrido pelo caminhão num roteiro, em forma
 * fechada: integral do perfil suavizado de velocidade entre keyframes
 * (∫ smoothstep = p³ − p⁴/2). Depois do roteiro, mantém a velocidade final.
 * null quando o cenário/desfecho não é roteirizado (velocidade manual constante).
 */
export function getSompoRuralTravelMeters(scenarioId, elapsedMs = 0, outcomeId) {
  const script = getSompoScenarioScript(scenarioId, outcomeId);
  if (!script) return null;
  const elapsed = Math.max(0, finite(elapsedMs, 0));
  const frames = script.keyframes;
  let travel = 0;
  for (let index = 1; index < frames.length; index += 1) {
    const from = frames[index - 1];
    const to = frames[index];
    const segmentMs = to.atMs - from.atMs;
    if (segmentMs <= 0) continue;
    const speedFrom = (from.speedKph / 3.6) * from.direction;
    const speedTo = (to.speedKph / 3.6) * to.direction;
    const progress = clamp((elapsed - from.atMs) / segmentMs, 0, 1);
    travel += (segmentMs / 1000) * ((speedFrom * progress)
      + ((speedTo - speedFrom) * ((progress ** 3) - ((progress ** 4) / 2))));
    if (elapsed <= to.atMs) return travel;
  }
  const last = frames.at(-1);
  return travel + (((elapsed - script.totalMs) / 1000) * ((last.speedKph / 3.6) * last.direction));
}

/** Deslocamento (m) da frenagem brusca padrão — mesma forma fechada do perfil cossenoidal. */
export function getSompoBrakingTravelMeters(elapsedMs = 0, initialSpeedKph = 80) {
  const speed = clamp(finite(initialSpeedKph, 80), 0, 120) / 3.6;
  const elapsed = Math.max(0, finite(elapsedMs, 0)) / 1000;
  const brakeSeconds = sompoBrakingDurationMs(speed) / 1_000;
  let travel = speed * Math.min(elapsed, 3);
  if (elapsed > 3) {
    const progress = clamp((elapsed - 3) / brakeSeconds, 0, 1);
    travel += speed * brakeSeconds * ((progress / 2) + (Math.sin(Math.PI * progress) / (2 * Math.PI)));
  }
  return travel;
}

/**
 * Plano de gravação de episódio: o que o botão "Gravar episódio" precisa
 * saber para registrar o roteiro do cenário + desfecho selecionados —
 * duração, fases (para a linha de status) e até 5 instantes nomeados de
 * captura de frame (evidência visual anexada à missão da bancada).
 *
 * Só existe plano para desfechos com roteiro (keyframes rurais ou o script
 * de frenagem). Desfecho manual ("livre") não tem instante crítico
 * conhecido, então não gera episódio.
 */
const SOMPO_EPISODE_FRAME_MAX = 5;
const SOMPO_EPISODE_FINAL_SLACK_MS = 500;

/** Slug curto e estável para a fase derivada de um rótulo livre de keyframe. */
function sompoPhaseSlug(label, index) {
  const slug = String(label ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return slug || `fase-${index + 1}`;
}

/**
 * Escolhe até `max` instantes de captura dentro do roteiro. O primeiro e o
 * último sempre entram; o último é grampeado em `totalMs - 500` porque o
 * episódio fecha exatamente em totalMs e frames posteriores cairiam fora.
 */
export function sompoEpisodeFrameMoments(points, totalMs, finalPhase, max = SOMPO_EPISODE_FRAME_MAX) {
  const finalMs = Math.max(0, (Number(totalMs) || 0) - SOMPO_EPISODE_FINAL_SLACK_MS);
  const ordered = (Array.isArray(points) ? points : [])
    .filter((point) => point && Number.isFinite(point.offsetMs) && point.offsetMs < finalMs)
    .sort((left, right) => left.offsetMs - right.offsetMs);
  const picked = ordered.length + 1 <= max
    ? ordered
    : Array.from({ length: max - 1 }, (_, index) => ordered[Math.round((index * (ordered.length - 1)) / (max - 2))]);
  return [
    ...picked.map((point) => ({ offsetMs: point.offsetMs, fase: point.fase, label: point.label })),
    { offsetMs: finalMs, fase: finalPhase, label: 'Final do episódio' },
  ];
}

// Amostragem determinística de episódio: quando o timer do navegador atrasa,
// recupera todos os pontos programados cruzados em vez de perder amostras.
export function sompoEpisodeSampleOffsets(lastMs, elapsedMs, intervalMs, totalMs) {
  const offsets = [];
  const end = Math.min(totalMs, elapsedMs);
  for (let offset = Number.isFinite(lastMs) ? lastMs + intervalMs : 0; offset <= end; offset += intervalMs) {
    offsets.push(offset);
  }
  return offsets;
}

/**
 * Plano de episódio para um desfecho do catálogo convencional (rural).
 * Retorna null para desfechos manuais — sem roteiro não há episódio.
 */
export function getSompoEpisodePlan(scenarioId, outcomeId) {
  if (!Object.hasOwn(SOMPO_SIMULATION_SCENARIOS, scenarioId)) return null;
  const scenario = SOMPO_SIMULATION_SCENARIOS[scenarioId];
  const outcomes = getSompoScenarioOutcomes(scenarioId);
  const outcome = outcomes.find((item) => item.id === outcomeId) ?? outcomes[0];
  const script = getSompoScenarioScript(scenarioId, outcome.id);
  const isBraking = !script && scenarioId === 'hard-braking';
  if (!script && !isBraking) return null;
  const totalMs = isBraking ? SOMPO_BRAKING_SCRIPT.totalMs : script.totalMs;

  const usedPhaseIds = new Set();
  const phases = (isBraking
    ? SOMPO_BRAKING_SCRIPT.phases
    : script.keyframes.map((frame, index) => ({
      id: sompoPhaseSlug(frame.phaseLabel, index),
      label: frame.phaseLabel,
      startMs: frame.atMs,
      endMs: index + 1 < script.keyframes.length ? script.keyframes[index + 1].atMs : totalMs,
    }))
  ).map((phase) => {
    let id = phase.id;
    let suffix = 2;
    while (usedPhaseIds.has(id)) id = `${phase.id}-${suffix++}`;
    usedPhaseIds.add(id);
    return id === phase.id ? phase : { ...phase, id };
  });
  const points = phases.map((phase) => ({ offsetMs: phase.startMs, fase: phase.id, label: phase.label }));

  return Object.freeze({
    kind: 'roteiro',
    catalog: 'rural',
    scenarioId: scenario.scenarioId,
    outcomeId: outcome.id,
    outcomeLabel: outcome.label,
    scenarioLabel: outcome.id === outcomes[0].id ? scenario.label : `${scenario.label} · ${outcome.label}`,
    totalMs,
    sampleIntervalMs: 500,
    phases: Object.freeze(phases),
    frameMoments: Object.freeze(sompoEpisodeFrameMoments(points, totalMs, phases.at(-1).id)),
  });
}

/**
 * `scriptFrame` permite que um catálogo externo (ex.: cenários agrícolas)
 * injete um frame roteirizado com o mesmo formato dos frames rurais: ganha as
 * faixas amplas de roll, a gravidade rotacionada e as taxas do roteiro.
 * `sourceOverride` corrige a proveniência (id/rótulo/desfecho) no snapshot.
 */
export function createSompoSimulationSnapshot(controls = {}, {
  observedAt = new Date().toISOString(),
  elapsedMs = 0,
  connectedAt,
  scriptFrame = null,
  sourceOverride = null,
} = {}) {
  const originalProfile = getSompoSimulationScenario(controls.scenarioId);
  const outcomes = getSompoScenarioOutcomes(originalProfile.scenarioId);
  const outcome = (typeof controls.outcomeId === 'string'
    && outcomes.find((item) => item.id === controls.outcomeId)) || outcomes[0];
  const rural = scriptFrame || getSompoRuralFrame(originalProfile.scenarioId, elapsedMs, outcome.id);
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
  const speedKph = clamp(finite(controls.speedKph, profile.speedKph), 0, 120);
  const distanceBase = clamp(finite(controls.distance, profile.distance), 5, 400);
  const pitchBase = clamp(finite(controls.pitch, profile.pitch), -25, 25);
  const rollBase = clamp(finite(controls.roll, profile.roll), rural ? -90 : -25, rural ? 90 : 25);
  const temperatureBase = clamp(finite(controls.temperature, profile.temperature), -10, 70);
  const humidityBase = clamp(finite(controls.humidity, profile.humidity), 0, 100);
  // Desfechos roteirizados da frenagem substituem o roteiro cossenoidal padrão.
  const braking = scenarioId === SOMPO_BRAKING_SCRIPT.scenarioId && !rural
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
      scenarioLabel: customized
        ? `${profile.label} · ajustado manualmente`
        : outcome.id === outcomes[0].id
          ? profile.label
          : `${profile.label} · ${outcome.label}`,
      outcomeId: outcome.id,
      outcomeLabel: outcome.label,
      ...(sourceOverride && typeof sourceOverride === 'object' ? sourceOverride : null),
    },
  };
}

/**
 * Resumo puro do ensaio (cenário + desfecho) para a missão da bancada:
 * fases roteirizadas, transições de flag e deslocamento até o instante atual.
 */
export function buildSompoScenarioRunBrief(scenarioId, outcomeId, elapsedMs = 0) {
  if (!Object.hasOwn(SOMPO_SIMULATION_SCENARIOS, scenarioId)) return null;
  const scenario = getSompoSimulationScenario(scenarioId);
  const outcomes = getSompoScenarioOutcomes(scenario.scenarioId);
  const outcome = outcomes.find((item) => item.id === outcomeId) || outcomes[0];
  const script = getSompoScenarioScript(scenario.scenarioId, outcome.id);
  const elapsed = Math.max(0, finite(elapsedMs, 0));
  const base = {
    scenarioId: scenario.scenarioId,
    scenarioLabel: scenario.label,
    outcomeId: outcome.id,
    outcomeLabel: outcome.label,
    outcomeDescription: outcome.description,
    elapsedMs: Math.round(elapsed),
  };
  if (!script) {
    const braking = scenario.scenarioId === SOMPO_BRAKING_SCRIPT.scenarioId;
    return {
      ...base,
      scripted: braking,
      totalMs: braking ? SOMPO_BRAKING_SCRIPT.totalMs : null,
      completed: braking ? elapsed >= SOMPO_BRAKING_SCRIPT.totalMs : null,
      travelMeters: braking ? round(getSompoBrakingTravelMeters(elapsed, scenario.speedKph), 1) : null,
      phases: braking
        ? SOMPO_BRAKING_SCRIPT.phases.map((phase) => ({
          atMs: phase.startMs,
          label: phase.label,
          speedKph: null,
          distance: null,
          collisionRisk: scenario.collisionRisk,
          inclinationRisk: scenario.inclinationRisk,
        }))
        : [],
      flagTransitions: [],
    };
  }
  const phases = script.keyframes.map((frame) => ({
    atMs: frame.atMs,
    label: frame.phaseLabel,
    speedKph: round(frame.speedKph, 1),
    distance: round(frame.distance),
    collisionRisk: frame.collisionRisk,
    inclinationRisk: frame.inclinationRisk,
  }));
  const flagTransitions = [];
  for (let index = 1; index < script.keyframes.length; index += 1) {
    const previous = script.keyframes[index - 1];
    const current = script.keyframes[index];
    for (const [key, flag] of [['collisionRisk', 'riscoColisao'], ['inclinationRisk', 'riscoInclinacao']]) {
      if (previous[key] !== current[key]) {
        flagTransitions.push({ atMs: current.atMs, flag, from: previous[key], to: current[key] });
      }
    }
  }
  return {
    ...base,
    scripted: true,
    totalMs: script.totalMs,
    completed: elapsed >= script.totalMs,
    travelMeters: round(getSompoRuralTravelMeters(scenario.scenarioId, elapsed, outcome.id), 1),
    phases,
    flagTransitions,
  };
}
