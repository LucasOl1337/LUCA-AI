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
    description: 'Descida rural de 22° com piso úmido, velocidade de rodovia em serra e alerta sintético de inclinação.',
    speedKph: 65,
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
    description: 'Saída de pista a 75 km/h, rolagem progressiva até 82° e imobilização lateral. Roteiro de 16 s; reinicie para repetir.',
    speedKph: 75, distance: 180, temperature: 29, humidity: 48,
    pitch: 1, roll: 2, roughness: 0.5, collisionRisk: false, inclinationRisk: false,
  }),
  'tire-blowout': Object.freeze({
    scenarioId: 'tire-blowout', label: 'Estouro de pneu',
    description: 'Perda súbita de apoio a 90 km/h, puxada lateral e parada controlada. Pulso de vibração e redução de velocidade.',
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
    description: 'Chuva intensa a 85 km/h, lâmina de água, desvio lateral e recuperação de aderência com redução de velocidade.',
    speedKph: 85, distance: 260, temperature: 21, humidity: 98,
    pitch: 0, roll: 1, roughness: 0.5, collisionRisk: false, inclinationRisk: false,
  }),
  'brake-failure': Object.freeze({
    scenarioId: 'brake-failure', label: 'Perda de freio em descida',
    description: 'Descida prolongada a partir de 60 km/h: a velocidade cresce apesar da tentativa de frenagem, com alerta de inclinação e aproximação de risco.',
    speedKph: 60, distance: 290, temperature: 34, humidity: 44,
    pitch: -14, roll: 0, roughness: 0.5, collisionRisk: false, inclinationRisk: true,
  }),
  'engine-fire': Object.freeze({
    scenarioId: 'engine-fire', label: 'Princípio de incêndio',
    description: 'Fumaça no compartimento dianteiro a 70 km/h, aumento da temperatura junto ao sensor e parada de emergência. Não representa temperatura interna do motor.',
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
    [2_500, 'Perda de apoio lateral', { roll: 8, lateral: 1.2, speedKph: 68 }],
    [5_000, 'Tombamento', { speedKph: 30, roll: 48, lateral: 2.7, inclinationRisk: true }],
    [8_000, 'Imobilizado de lado', { speedKph: 0, roll: 82, lateral: 3.8, roughness: 0, collisionRisk: true }],
    [16_000, 'Imobilizado de lado', {}],
  ]),
  'tire-blowout': ruralScript('tire-blowout', [
    [0, 'Rodagem', {}], [3_000, 'Pneu dianteiro perde pressão', { roll: -5, yaw: -8, roughness: 4.5 }],
    [4_500, 'Correção de direção', { speedKph: 55, lateral: -0.8, roll: -7, collisionRisk: true }],
    [11_000, 'Parada controlada', { speedKph: 0, yaw: 0, roughness: 0 }],
    [14_000, 'Parada controlada', {}],
  ]),
  'animal-crossing': ruralScript('animal-crossing', [
    [0, 'Animal no acostamento', { animalZ: -6 }],
    [1_500, 'Animal começa a atravessar', { animalZ: -4.9 }],
    [2_800, 'Travessia detectada', { animalZ: -3.4, distance: 150, collisionRisk: true }],
    [4_100, 'Animal entra na faixa do caminhão', { animalZ: -1.7, distance: 110, speedKph: 60, pitch: -1.5 }],
    [5_400, 'Frenagem máxima', { animalZ: -0.2, distance: 76, speedKph: 40, pitch: -3.5 }],
    [6_700, 'Nariz quase no animal', { animalZ: 1.0, distance: 56, speedKph: 19, pitch: -1 }],
    [7_300, 'Animal dispara assustado', { animalZ: 2.2, distance: 50, speedKph: 10 }],
    [7_900, 'Parada de emergência', { speedKph: 0, animalZ: 3.4, distance: 46, pitch: 0 }],
    [10_000, 'Animal deixa a pista', { animalZ: 4.8, distance: 110 }],
    [13_000, 'Animal sai da pista', { animalZ: 6.2, distance: 200 }],
    [15_000, 'Travessia encerrada', { animalZ: 7, distance: 280, collisionRisk: false, roughness: 0 }],
  ]),
  aquaplaning: ruralScript('aquaplaning', [
    [0, 'Chuva intensa', { rain: 1 }],
    [3_000, 'Perda de aderência', { yaw: 14, lateral: 1.1, roll: 5, collisionRisk: true }],
    [6_000, 'Correção em piso molhado', { speedKph: 55, yaw: -12, lateral: -1.0, roll: -4 }],
    [11_000, 'Aderência recuperada', { speedKph: 40, yaw: 0, lateral: 0, roll: 0, collisionRisk: false }],
    [16_000, 'Marcha reduzida sob chuva', {}],
  ]),
  'brake-failure': ruralScript('brake-failure', [
    [0, 'Descida com carga', {}],
    [5_000, 'Freio perde eficiência', { speedKph: 78, distance: 180, temperature: 37 }],
    [10_000, 'Velocidade cresce', { speedKph: 94, distance: 75, collisionRisk: true }],
    [16_000, 'Risco persiste — intervenção necessária', { speedKph: 105, distance: 32, temperature: 40 }],
  ]),
  'engine-fire': ruralScript('engine-fire', [
    [0, 'Operação', {}],
    [3_000, 'Fumaça no compartimento dianteiro', { smoke: 0.35, temperature: 42 }],
    [8_500, 'Parada de emergência', { speedKph: 0, smoke: 0.8, temperature: 54, roughness: 0 }],
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
    [3_000, 'Transferência lateral de carga', { yaw: 18, lateral: 0.8, roll: 18, inclinationRisk: true }],
    [6_000, 'Correção com risco de tombamento', { yaw: 30, lateral: 1.4, roll: 24, speedKph: 55 }],
    [12_000, 'Saída de curva em marcha reduzida', { yaw: 0, lateral: 0, roll: 2, speedKph: 40, inclinationRisk: false }],
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
    scenarioOutcome('parada-controlada', 'Parada controlada', 'Correção de direção e parada na própria faixa.'),
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
      [3_500, 'Busca da linha mais baixa', { roll: 12, yaw: 4, lateral: 0.6 }],
      [7_000, 'Retorno ao plano', { roll: 4, yaw: 0, lateral: 0, inclinationRisk: false, speedKph: 9 }],
      [12_000, 'Operação estabilizada', { roll: 2 }],
    ]),
    'quase-tomba': ruralScript('inclination', [
      [0, 'Terreno lateral inclinado', {}],
      [3_000, 'Roda sobe no barranco', { roll: 24, roughness: 1.4 }],
      [5_000, 'Limite de tombamento', { roll: 31, speedKph: 2, lateral: 0.4 }],
      [7_500, 'Correção para o declive', { roll: 14, yaw: -6, speedKph: 5 }],
      [11_000, 'Parado para reavaliar o trajeto', { speedKph: 0, roll: 12, roughness: 0 }],
      [15_000, 'Aguardando rota alternativa', {}],
    ]),
  }),
  'rough-road': Object.freeze({
    'reduz-e-atravessa': ruralScript('rough-road', [
      [0, 'Trecho degradado', {}],
      [3_000, 'Redução para poupar a suspensão', { speedKph: 25, roughness: 2.4 }],
      [8_000, 'Pior trecho vencido', { roughness: 1.2, speedKph: 35 }],
      [12_000, 'Pista regular novamente', { roughness: 0.5, speedKph: 50 }],
      [16_000, 'Segue viagem', {}],
    ]),
    'parada-inspecao': ruralScript('rough-road', [
      [0, 'Trecho degradado', {}],
      [3_000, 'Impacto forte em buraco', { roughness: 4.6, pitch: 3, speedKph: 30 }],
      [5_500, 'Vibração anormal persiste', { roughness: 3.8, speedKph: 12 }],
      [8_000, 'Parada para inspecionar a carga', { speedKph: 0, roughness: 0 }],
      [14_000, 'Amarração reforçada — apto a seguir', {}],
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
      [0, 'Subida de 21°', {}],
      [5_000, 'Meio da rampa', { speedKph: 5 }],
      [9_000, 'Crista da subida', { pitch: 8, speedKph: 7 }],
      [12_000, 'Platô alcançado', { pitch: 2, inclinationRisk: false, speedKph: 10 }],
      [16_000, 'Segue no topo', { pitch: 1 }],
    ]),
    'perda-de-tracao': ruralScript('steep-climb', [
      [0, 'Subida de 21°', {}],
      [4_000, 'Rodas patinam no cascalho', { speedKph: 2, wheelSpeedKph: 10, roughness: 2.2 }],
      [6_000, 'Veículo estanca', { speedKph: 0, wheelSpeedKph: 6 }],
      [7_000, 'Engata a ré', { direction: -1, wheelSpeedKph: 0 }],
      [8_500, 'Recuo controlado em ré', { speedKph: 3, wheelSpeedKph: 3 }],
      [11_000, 'Parada na base da rampa', { speedKph: 0, roughness: 0, wheelSpeedKph: 0, pitch: 6 }],
      [15_000, 'Aguardando apoio para subir', {}],
    ]),
  }),
  'steep-descent': Object.freeze({
    'desce-controlado': ruralScript('steep-descent', [
      [0, 'Descida de 22°', {}],
      [5_000, 'Meio da descida', { speedKph: 58 }],
      [9_000, 'Base da serra', { pitch: -8, speedKph: 55 }],
      [12_000, 'Plano alcançado', { pitch: -1, inclinationRisk: false, speedKph: 65 }],
      [16_000, 'Segue no plano', { pitch: 0 }],
    ]),
    'freio-aquece': ruralScript('steep-descent', [
      [0, 'Descida de 22°', {}],
      [4_000, 'Uso contínuo do freio', { speedKph: 70, temperature: 26 }],
      [7_000, 'Cheiro de freio — fade inicial', { speedKph: 80, temperature: 31 }],
      [9_500, 'Reduz marcha e segura no motor', { speedKph: 55, temperature: 33 }],
      [13_000, 'Parada técnica para resfriar', { speedKph: 0, temperature: 34, roughness: 0 }],
      [17_000, 'Aguardando os freios resfriarem', { temperature: 30 }],
    ]),
  }),
  'yard-maneuver': Object.freeze({
    'encosta-na-doca': ruralScript('yard-maneuver', [
      [0, 'Manobra no terreiro', { distance: 110, collisionRisk: false }],
      [3_500, 'Aproximação da doca', { distance: 60, collisionRisk: true, speedKph: 2 }],
      [7_000, 'Ajuste fino', { distance: 25, speedKph: 1 }],
      [9_500, 'Encostado na doca', { distance: 12, speedKph: 0, roughness: 0 }],
      [14_000, 'Posicionado para a carga', {}],
    ]),
    'toque-no-portao': ruralScript('yard-maneuver', [
      [0, 'Manobra no terreiro', { distance: 110, collisionRisk: false }],
      [3_500, 'Espaço mais estreito que o previsto', { distance: 45, collisionRisk: true, speedKph: 2.5 }],
      [6_000, 'Toque no portão', { distance: 5, speedKph: 0, roughness: 1.6, roll: 1.5 }],
      [7_200, 'Engata a ré', { direction: -1, roughness: 0.4 }],
      [9_000, 'Recuo leve', { speedKph: 1, distance: 40, roll: 0 }],
      [11_000, 'Parado para avaliar o dano', { speedKph: 0, roughness: 0 }],
      [15_000, 'Manobra suspensa', {}],
    ]),
  }),
  'shifted-load': Object.freeze({
    reacomoda: ruralScript('shifted-load', [
      [0, 'Carga deslocada a 19°', {}],
      [3_000, 'Parada imediata', { speedKph: 0, roughness: 0 }],
      [7_000, 'Reamarração da carga', { roll: 12 }],
      [11_000, 'Carga reacomodada', { roll: 4, inclinationRisk: false }],
      [15_000, 'Retoma em marcha lenta', { speedKph: 5 }],
    ]),
    'tomba-parado': ruralScript('shifted-load', [
      [0, 'Carga deslocada a 19°', {}],
      [3_000, 'Inclinação aumenta em movimento', { roll: 26, speedKph: 3 }],
      [6_000, 'A carga vence a amarração', { roll: 38, speedKph: 0 }],
      [8_500, 'Tombamento lateral lento', { roll: 64, roughness: 0 }],
      [14_000, 'Imobilizado — carga ao solo', { collisionRisk: true }],
    ]),
  }),
  'hot-weather': Object.freeze({
    'pausa-preventiva': ruralScript('hot-weather', [
      [0, 'Operação sob calor de 43 °C', {}],
      [4_000, 'Temperatura sobe no painel', { temperature: 46 }],
      [7_500, 'Busca sombra para a pausa', { speedKph: 30, lateral: 1.4 }],
      [10_000, 'Parada preventiva', { speedKph: 0, temperature: 47, roughness: 0 }],
      [16_000, 'Resfriando à sombra', { temperature: 41 }],
    ]),
    superaquecimento: ruralScript('hot-weather', [
      [0, 'Operação sob calor de 43 °C', {}],
      [4_000, 'Temperatura do compartimento sobe', { temperature: 49 }],
      [7_000, 'Vapor no radiador', { temperature: 55, smoke: 0.25, speedKph: 25 }],
      [9_500, 'Parada de emergência', { speedKph: 0, temperature: 58, smoke: 0.4, roughness: 0 }],
      [15_000, 'Motor desligado — aguardando resfriar', { temperature: 52, smoke: 0.15 }],
    ]),
  }),
  rollover: Object.freeze({
    recuperacao: ruralScript('rollover', [
      [0, 'Aproximação do acostamento', {}],
      [3_000, 'Pneus tocam o acostamento', { roll: 8, lateral: 1.2, roughness: 1.6, speedKph: 68 }],
      [5_500, 'Correção de direção', { roll: 14, lateral: 1.6, inclinationRisk: true, speedKph: 55, yaw: -6 }],
      [8_500, 'Retorno à faixa', { roll: 4, lateral: 0.4, yaw: 2, speedKph: 50 }],
      [12_000, 'Estabilizado na pista', { roll: 1, lateral: 0, yaw: 0, inclinationRisk: false, speedKph: 70, roughness: 0.5 }],
    ]),
    'parada-no-acostamento': ruralScript('rollover', [
      [0, 'Aproximação do acostamento', {}],
      [3_000, 'Perda de apoio lateral', { roll: 8, lateral: 1.2, roughness: 1.8, speedKph: 68 }],
      [6_000, 'Inclinação estabiliza', { roll: 12, lateral: 2.2, speedKph: 40, inclinationRisk: true }],
      [9_500, 'Parada no acostamento', { speedKph: 0, roll: 11, lateral: 2.6, roughness: 0 }],
      [15_000, 'Imobilizado inclinado, sem tombar', {}],
    ]),
  }),
  'tire-blowout': Object.freeze({
    'saida-de-pista': ruralScript('tire-blowout', [
      [0, 'Rodagem', {}],
      [3_000, 'Pneu dianteiro estoura', { roll: -5, yaw: -9, roughness: 4.5 }],
      [4_500, 'Puxada forte para o acostamento', { lateral: 2.1, yaw: -14, speedKph: 60, collisionRisk: true, roll: -8 }],
      [7_500, 'Entra na vegetação', { lateral: 3.6, speedKph: 30, roughness: 3.4, yaw: -4, pitch: -2 }],
      [10_500, 'Parada fora da pista', { speedKph: 0, yaw: 0, roughness: 0, roll: -6, inclinationRisk: true }],
      [15_000, 'Imobilizado fora da pista', {}],
    ]),
    tombamento: ruralScript('tire-blowout', [
      [0, 'Rodagem', {}],
      [3_000, 'Pneu dianteiro estoura', { roll: -6, yaw: -9, roughness: 4.6 }],
      [4_500, 'Correção excessiva', { yaw: 12, lateral: -0.8, roll: 9, collisionRisk: true, speedKph: 70 }],
      [6_500, 'Rolagem inicia', { roll: 34, lateral: 1.4, speedKph: 45, inclinationRisk: true }],
      [9_000, 'Tombamento lateral', { roll: 76, lateral: 2.8, speedKph: 0, roughness: 0 }],
      [15_000, 'Imobilizado de lado', {}],
    ]),
  }),
  'animal-crossing': Object.freeze({
    desvio: ruralScript('animal-crossing', [
      [0, 'Animal no acostamento', { animalZ: -6 }],
      [900, 'Animal arranca para a pista', { animalZ: -4.9 }],
      [2_200, 'Animal cruza a faixa contrária', { animalZ: -3.0, distance: 160 }],
      [2_800, 'Travessia repentina', { animalZ: -1.6, distance: 120, collisionRisk: true, speedKph: 76 }],
      [2_900, 'Nariz morde a esquerda', { animalZ: -1.1, yaw: -5, lateral: -0.15, roll: -2, speedKph: 75 }],
      [3_600, 'Desvio para a outra faixa', { animalZ: -0.2, lateral: -1.9, yaw: -5.5, roll: -4, distance: 92, speedKph: 66 }],
      [4_400, 'Passagem rente ao animal', { animalZ: 0.8, lateral: -3.0, yaw: -2, roll: -2.5, distance: 70, speedKph: 56, pitch: -1 }],
      [5_400, 'Na faixa oposta', { animalZ: 2.0, lateral: -3.1, yaw: 5, roll: 3, distance: 130, speedKph: 55, collisionRisk: false }],
      [6_600, 'Retorno à faixa', { animalZ: 3.6, lateral: -1.7, yaw: 4.5, roll: 2, distance: 200, speedKph: 62 }],
      [7_800, 'Alinhando na faixa', { animalZ: 5.0, lateral: -0.4, yaw: 1.5, roll: 0.5, distance: 250, collisionRisk: false, speedKph: 70 }],
      [9_000, 'Segue viagem', { animalZ: 6.2, lateral: 0, yaw: 0, distance: 280, speedKph: 75 }],
      [13_000, 'Animal já no pasto', { animalZ: 7, roughness: 0 }],
    ]),
    colisao: ruralScript('animal-crossing', [
      [0, 'Animal no acostamento', { animalZ: -6 }],
      [1_100, 'Animal arranca para a pista', { animalZ: -4.8 }],
      [2_800, 'Travessia detectada tarde', { animalZ: -2.4, distance: 140, collisionRisk: true }],
      [4_200, 'Animal entra na faixa', { animalZ: -0.9, distance: 88, speedKph: 62, pitch: -3 }],
      [5_400, 'Frenagem máxima', { animalZ: -0.3, distance: 46, speedKph: 44, pitch: -5 }],
      [6_500, 'Impacto com o animal', { animalZ: 0.05, distance: 8, speedKph: 26, pitch: -2, roughness: 3.2 }],
      [8_500, 'Parado após o impacto', { animalZ: 0.2, speedKph: 0, pitch: 0, roughness: 0.4, distance: 10 }],
      [14_000, 'Imobilizado — animal ferido na pista', { animalZ: 0.35, roughness: 0 }],
    ]),
  }),
  aquaplaning: Object.freeze({
    'saida-de-pista': ruralScript('aquaplaning', [
      [0, 'Chuva intensa', { rain: 1 }],
      [3_000, 'Perda total de aderência', { yaw: 16, lateral: 1.4, roll: 5, collisionRisk: true }],
      [5_500, 'Desliza para fora da pista', { lateral: 3.4, yaw: 9, speedKph: 60, roughness: 2.6, pitch: -2 }],
      [8_000, 'Arrasta na grama encharcada', { lateral: 4.2, speedKph: 25, roll: 8, inclinationRisk: true, sink: 0.08 }],
      [10_500, 'Parada no campo', { speedKph: 0, yaw: 0, roughness: 0 }],
      [16_000, 'Imobilizado fora da pista sob chuva', {}],
    ]),
    'parada-preventiva': ruralScript('aquaplaning', [
      [0, 'Chuva intensa', { rain: 1 }],
      [3_000, 'Lâmina d’água à frente', { speedKph: 75 }],
      [7_000, 'Redução preventiva', { speedKph: 35, lateral: 1.6 }],
      [11_000, 'Encosta no acostamento', { speedKph: 0, lateral: 2.4, roughness: 0 }],
      [16_000, 'Aguardando a chuva passar', {}],
    ]),
  }),
  'brake-failure': Object.freeze({
    'area-de-escape': ruralScript('brake-failure', [
      [0, 'Descida com carga', {}],
      [5_000, 'Freio perde eficiência', { speedKph: 78, distance: 180, temperature: 37 }],
      [9_000, 'Busca a área de escape', { speedKph: 88, distance: 120, collisionRisk: true, yaw: 5, lateral: 1.2 }],
      [12_000, 'Entra no leito de brita', { speedKph: 55, lateral: 2.8, roughness: 4.2, sink: 0.16, pitch: -6 }],
      [14_500, 'Desaceleração na brita', { speedKph: 8, sink: 0.3, roughness: 2.5 }],
      [16_000, 'Parada na área de escape', { speedKph: 0, roughness: 0, collisionRisk: false, distance: 200 }],
    ]),
    colisao: ruralScript('brake-failure', [
      [0, 'Descida com carga', {}],
      [5_000, 'Freio perde eficiência', { speedKph: 78, distance: 180, temperature: 37 }],
      [10_000, 'Velocidade cresce', { speedKph: 95, distance: 75, collisionRisk: true }],
      [13_500, 'Impacto no obstáculo', { speedKph: 30, distance: 10, pitch: -19, roughness: 4.5 }],
      [16_000, 'Imobilizado após o impacto', { speedKph: 0, pitch: -14, roughness: 0, temperature: 41 }],
    ]),
  }),
  'engine-fire': Object.freeze({
    'fogo-contido': ruralScript('engine-fire', [
      [0, 'Operação', {}],
      [3_000, 'Fumaça no compartimento', { smoke: 0.35, temperature: 42 }],
      [8_000, 'Parada imediata', { speedKph: 0, smoke: 0.55, temperature: 48, roughness: 0 }],
      [9_000, 'Extintor aplicado', { smoke: 0.18, temperature: 38 }],
      [13_000, 'Foco contido — aguardando resgate', { smoke: 0.05, temperature: 33 }],
    ]),
    'fogo-alastra': ruralScript('engine-fire', [
      [0, 'Operação', {}],
      [3_000, 'Fumaça densa', { smoke: 0.5, temperature: 44 }],
      [8_500, 'Parada de emergência', { speedKph: 0, smoke: 0.85, temperature: 56, roughness: 0 }],
      [9_000, 'Chamas se alastram', { smoke: 1, temperature: 68, humidity: 16 }],
      [14_000, 'Abandono do veículo — fogo ativo', { temperature: 70 }],
    ]),
  }),
  'tight-reverse': Object.freeze({
    'toque-na-doca': ruralScript('tight-reverse', [
      [0, 'Início da ré', { direction: -1 }],
      [4_000, 'Alinhando no acesso', { yaw: -14, lateral: 0.7, distance: 190 }],
      [7_500, 'Aproximação final rápida demais', { yaw: 2, lateral: 1.0, distance: 60, collisionRisk: true }],
      [9_000, 'Toque na doca', { distance: 12, speedKph: 0, pitch: 1.5, roughness: 1.8 }],
      [13_000, 'Parado após o toque', { pitch: 0, roughness: 0 }],
    ]),
    'reinicia-manobra': ruralScript('tight-reverse', [
      [0, 'Início da ré', { direction: -1 }],
      [3_500, 'Ângulo insuficiente', { yaw: -18, lateral: 0.9, distance: 150 }],
      [5_500, 'Para para corrigir', { speedKph: 0 }],
      [6_200, 'Engata à frente', { direction: 1 }],
      [7_500, 'Avanço de correção', { speedKph: 2.5, yaw: -6, lateral: 0.4, distance: 230 }],
      [9_000, 'Pausa para a nova ré', { speedKph: 0 }],
      [9_800, 'Engata a ré', { direction: -1 }],
      [11_000, 'Nova ré alinhada', { speedKph: 2.5, yaw: 3, lateral: 0.8, distance: 170 }],
      [14_000, 'Manobra concluída', { yaw: 0, speedKph: 0, roughness: 0, distance: 250 }],
    ]),
  }),
  'bogged-down': Object.freeze({
    desatola: ruralScript('bogged-down', [
      [0, 'Entrada no trecho de lama', { rain: 0.2 }],
      [3_000, 'Perda de tração', { speedKph: 3, wheelSpeedKph: 16, sink: 0.18, pitch: -4, roll: 7 }],
      [6_000, 'Balanço para desatolar', { speedKph: 1, wheelSpeedKph: 14, sink: 0.26, roll: 5 }],
      [9_000, 'Tração recuperada', { speedKph: 5, wheelSpeedKph: 8, sink: 0.08, pitch: -1, roll: 2 }],
      [13_000, 'Segue em marcha lenta', { speedKph: 7, wheelSpeedKph: 7, sink: 0, roll: 3, roughness: 1.0 }],
    ]),
    'afunda-mais': ruralScript('bogged-down', [
      [0, 'Entrada no trecho de lama', { rain: 0.2 }],
      [3_000, 'Perda de tração', { speedKph: 3, wheelSpeedKph: 16, sink: 0.18, pitch: -4, roll: 7 }],
      [7_000, 'Aceleração cava a lama', { speedKph: 0, wheelSpeedKph: 18, sink: 0.42, roll: 9, distance: 160 }],
      [10_500, 'Afundamento lateral', { sink: 0.55, roll: 12, inclinationRisk: true, wheelSpeedKph: 6 }],
      [14_000, 'Operação abortada — resgate necessário', { wheelSpeedKph: 0, roughness: 0 }],
    ]),
  }),
  'driver-drowsiness': Object.freeze({
    'saida-de-pista': ruralScript('driver-drowsiness', [
      [0, 'Rodagem contínua', {}],
      [2_000, 'Nariz deriva para o acostamento', { yaw: 3 }],
      [3_600, 'Primeiro desvio de faixa', { yaw: 2, lateral: 1.2, roll: 1.5 }],
      [5_000, 'Sem correção — rumo ao acostamento', { yaw: 3.5, lateral: 2.0, collisionRisk: true }],
      [7_500, 'Sai da pista dormindo', { yaw: 2, lateral: 3.6, roughness: 3.2, speedKph: 60, pitch: -2 }],
      [9_500, 'Desperta no terreno', { yaw: -3.5, speedKph: 30, roll: 4, roughness: 3.8 }],
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
      [3_000, 'Transferência lateral de carga', { yaw: 18, lateral: 0.8, roll: 18, inclinationRisk: true }],
      [5_500, 'Rolagem além do limite', { yaw: 26, roll: 40, speedKph: 65, collisionRisk: true }],
      [7_500, 'Tombamento na curva', { roll: 78, lateral: 2.4, speedKph: 0, roughness: 0 }],
      [14_000, 'Imobilizado de lado', {}],
    ]),
    'saida-de-frente': ruralScript('fast-corner', [
      [0, 'Entrada em curva', {}],
      [3_000, 'Frente escapa da trajetória', { yaw: 10, lateral: 1.2, roll: 12, inclinationRisk: true }],
      [5_500, 'Sai pela tangente da curva', { lateral: 3.2, yaw: 4, speedKph: 60, roughness: 2.8, roll: 6 }],
      [8_000, 'Freia no cascalho externo', { speedKph: 20, lateral: 4.0, roll: 3 }],
      [10_000, 'Parada fora da curva', { speedKph: 0, yaw: 0, roughness: 0, inclinationRisk: false }],
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
