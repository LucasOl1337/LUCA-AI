/**
 * Cases do Trator MAX (o trator de brinquedo das fotos em missoes/trator-referencias).
 *
 * Mesmo contrato dos cenários agrícolas: frame é função pura de cenário, desfecho e tempo.
 * Tombamento e atolamento reaproveitam os roteiros do trator agrícola sem os canais de
 * implemento (o MAX não tem implemento). O obstáculo frontal deriva a leitura do HC-SR04
 * da própria cinemática, para o feixe na cena e a telemetria contarem a mesma distância.
 * Todos os dados são sintéticos.
 */

import { freeze, phase, outcome, scenario } from './sompo-agri-scenario-builders.js';
import { integrateSompoMotion } from './sompo-motion.js';

export const SOMPO_MAX_TRACTOR_EQUIPMENT_ID = 'max-tractor';

// Alcance do HC-SR04 no modelo: 400 cm significa "sem eco em alcance".
const ECHO_LIMIT_CM = 400;
const IMPLEMENT_KEYS = new Set(['implementLift', 'implementRoll', 'implementYaw', 'hydraulicPressure']);

const withoutImplement = (source, label, description) => outcome(
  source.id,
  label ?? source.label,
  description ?? source.description,
  source.keyframes.map(({ atMs, ...values }) => [atMs, Object.fromEntries(Object.entries(values).filter(([key]) => !IMPLEMENT_KEYS.has(key)))]),
  source.phases,
);

const smooth = (p) => p * p * (3 - (2 * p));
function speedAt(profile, atMs) {
  const to = profile.findIndex(([t]) => t > atMs);
  if (to < 0) return profile.at(-1)[1];
  if (to === 0) return profile[0][1];
  const [t0, v0] = profile[to - 1];
  const [t1, v1] = profile[to];
  return v0 + ((v1 - v0) * smooth((atMs - t0) / (t1 - t0)));
}

/**
 * Aproximação reta até um obstáculo parado. A velocidade vem de um perfil esparso;
 * a leitura do sensor é amostrada a cada `stepMs` na janela em que o obstáculo está
 * no alcance, a partir do deslocamento integrado com a mesma fórmula do palco 3D.
 */
function scriptedApproach({ startGapM, speedProfile, events, totalMs, denseFromMs, denseToMs, stepMs = 250 }) {
  const times = new Set([0, totalMs, ...speedProfile.map(([t]) => t), ...events.map(([t]) => t)]);
  for (let t = denseFromMs; t <= denseToMs; t += stepMs) times.add(t);
  const sorted = [...times].sort((a, b) => a - b);
  const motion = sorted.map((atMs) => ({ atMs, speedKph: Number(speedAt(speedProfile, atMs).toFixed(4)), direction: 1 }));
  const byTime = new Map(events);
  return motion.map((frame) => {
    // integrateSompoMotion devolve km/h·s; /3,6 converte para metros.
    const gapCm = Math.round((startGapM - (integrateSompoMotion(motion, frame.atMs, 'speedKph') / 3.6)) * 100);
    return [frame.atMs, { speedKph: frame.speedKph, distance: Math.max(2, Math.min(ECHO_LIMIT_CM, gapCm)), ...(byTime.get(frame.atMs) || {}) }];
  });
}

/**
 * Destino de cada case agrícola no Trator MAX: adaptado (com o id do case MAX e o
 * que mudou) ou incompatível (com motivo).
 */
export const SOMPO_MAX_TRACTOR_AGRI_PARITY = freeze({
  'agri-harvest-dust': { status: 'incompativel', reason: 'Case da colhedora; o MAX é trator e não colhe.' },
  'agri-tractor-rollover': { status: 'adaptado', maxId: 'max-slope-rollover', reason: 'Mesmo roteiro de pendente sem os canais de implemento.' },
  'agri-hydraulic-failure': { status: 'incompativel', reason: 'O MAX das fotos não tem implemento nem hidráulico de engate; não há o que falhar.' },
  'agri-field-bogging': { status: 'adaptado', maxId: 'max-field-bogging', reason: 'Mesmo roteiro de solo saturado sem os canais de implemento.' },
  'agri-barn-maneuver': { status: 'adaptado', maxId: 'max-barn-approach', reason: 'O agrícola entra de ré com implemento e mede a ré; o MAX só tem HC-SR04 na frente, então entra de frente e mede a parede do fundo.' },
  'agri-night-operation': { status: 'adaptado', maxId: 'max-night-operation', reason: 'Mesma noite de lavoura, sem plataforma de colheita; faróis e luzes do teto do MAX acendem pelo roteiro.' },
  'agri-geofencing': { status: 'incompativel', reason: 'Colheitadeira guiada por trajetória GNSS mapeada; trajetória GNSS fica fora da missão do MAX.' },
  'agri-geofencing-operacao': { status: 'incompativel', reason: 'Colheitadeira guiada por trajetória GNSS mapeada; trajetória GNSS fica fora da missão do MAX.' },
});

/**
 * Destino de cada um dos 20 cases do caminhão no Trator MAX. Nada é copiado: o
 * caminhão roda a velocidade de rodovia e o MAX a velocidade de talhão. `adaptado`
 * aponta o case MAX (e o desfecho, quando é um só) que cobre o mesmo risco;
 * `incompativel` diz por que o case não existe no MAX.
 */
export const SOMPO_MAX_TRACTOR_TRUCK_PARITY = freeze({
  normal: { status: 'adaptado', maxId: 'max-field-operation', outcomeId: 'routine-pass', reason: 'Operação sem risco a 8 km/h no talhão em vez de 80 km/h na estrada.' },
  obstacle: { status: 'adaptado', maxId: 'max-front-obstacle', reason: 'Mesmo HC-SR04 frontal; o objeto é um fardo de feno parado e a leitura sai da cinemática.' },
  inclination: { status: 'adaptado', maxId: 'max-slope-rollover', outcomeId: 'controlled-stop', reason: 'Inclinação lateral com alerta numa pendente de talhão, estabilizada a tempo.' },
  'rough-road': { status: 'adaptado', maxId: 'max-field-operation', outcomeId: 'uneven-ground', reason: 'Trepidação de solo a 6 km/h no lugar de pista irregular a 50 km/h.' },
  'hard-braking': { status: 'adaptado', maxId: 'max-front-obstacle', outcomeId: 'safe-stop', reason: 'Frenagem de emergência a 80 km/h não existe a 6 km/h; a parada curta do trator é a do obstáculo.' },
  'steep-climb': { status: 'incompativel', reason: 'Aclive longitudinal de 21°: o palco agrícola só tem pendente transversal de ~10° e não há roteiro validado de empinamento do trator.' },
  'steep-descent': { status: 'incompativel', reason: 'Descida de serra a 90–100 km/h; velocidade de rodovia que o MAX não alcança.' },
  'yard-maneuver': { status: 'adaptado', maxId: 'max-barn-approach', outcomeId: 'parked', reason: 'Manobra lenta junto ao galpão com o sensor frontal; o MAX entra de frente e para perto da parede do fundo.' },
  'shifted-load': { status: 'incompativel', reason: 'Carga deslocada na carroceria; o MAX não tem carroceria nem carga.' },
  'hot-weather': { status: 'adaptado', maxId: 'max-field-operation', outcomeId: 'hot-weather', reason: 'Mesma temperatura ambiente do sensor (43 °C) numa passada de talhão; continua sem flag térmica.' },
  rollover: { status: 'adaptado', maxId: 'max-slope-rollover', outcomeId: 'side-rollover', reason: 'Tombamento lateral em pendente de talhão, não saída de pista a 75 km/h.' },
  'tire-blowout': { status: 'incompativel', reason: 'Estouro de pneu a 90 km/h; nenhum sensor do MAX mede pressão e a velocidade é de rodovia.' },
  'animal-crossing': { status: 'adaptado', maxId: 'max-front-obstacle', reason: 'Obstáculo frontal com alerta e frenagem; no talhão o objeto é um fardo parado, sem animal nem pessoa em cena.' },
  aquaplaning: { status: 'incompativel', reason: 'Lâmina de água a 85 km/h; a perda de tração do trator no campo é o atolamento (max-field-bogging).' },
  'brake-failure': { status: 'incompativel', reason: 'Perda de freio em descida longa de rodovia até ~105 km/h; não há esse embalo no talhão.' },
  'engine-fire': { status: 'incompativel', reason: 'Fumaça e chamas presas ao compartimento do caminhão; o ESP32 do MAX não mede motor nem fumaça, então o case seria só visual.' },
  'tight-reverse': { status: 'incompativel', reason: 'O HC-SR04 do MAX só aponta para a frente: na ré ele mede o lado oposto ao movimento. O barracão do MAX é coberto de frente (max-barn-approach).' },
  'bogged-down': { status: 'adaptado', maxId: 'max-field-bogging', reason: 'Atolamento em solo saturado com rodas patinando, sem os canais de implemento.' },
  'driver-drowsiness': { status: 'incompativel', reason: 'Serpenteio de faixa a 85 km/h; sem faixa, sem GNSS e sem sensor de motorista no MAX.' },
  'fast-corner': { status: 'incompativel', reason: 'Curva a 95 km/h; o risco de curva do trator é a pendente (max-slope-rollover).' },
});

// 6 km/h = 1,667 m/s. O alerta de 150 cm cai em 7,0 s quando o fardo começa a 13,17 m.
const OBSTACLE_START_GAP_M = 1.5 + ((6 / 3.6) * 7);
// Galpão de frente: o emissor começa 2,5 m antes do vão e a parede do fundo fica a
// 11,91 m do vão (face interna). Com o perfil do desfecho 'parked' (4 km/h, 2 km/h,
// parada em 15,7 s), a leitura cruza 150 cm aos 13,5 s e termina perto de 60 cm.
const BARN_START_GAP_M = 14.406;

export function createSompoMaxTractorScenarios(base) {
  const rollover = base['agri-tractor-rollover'];
  const bogging = base['agri-field-bogging'];
  return {
    'max-field-operation': scenario({
      scenarioId: 'max-field-operation',
      label: 'Trator MAX em operação normal',
      description: 'Passada reta a 8 km/h e manobra de cabeceira a 5 km/h, sem obstáculo no alcance e sem alerta.',
      equipmentId: SOMPO_MAX_TRACTOR_EQUIPMENT_ID,
      environmentId: 'row-crop-field',
      defaultOutcomeId: 'routine-pass',
      totalMs: 18_000,
      sampleIntervalMs: 500,
      speedKph: 8,
      distance: ECHO_LIMIT_CM,
      temperature: 28,
      humidity: 52,
      pitch: 0.5,
      roll: 1,
      roughness: 0.45,
      collisionRisk: false,
      inclinationRisk: false,
      phases: [
        phase('pass', 'Passada no talhão', 0, 6_000),
        phase('slow-down', 'Redução para a cabeceira', 6_000, 7_500),
        phase('headland', 'Manobra de cabeceira', 7_500, 13_500),
        phase('return', 'Nova passada', 13_500, 18_000),
      ],
      outcomes: [
        outcome('routine-pass', 'Operação sem ocorrência', 'Velocidade e direção dentro do esperado; o HC-SR04 não encontra eco em alcance.', [
          [0, { speedKph: 8, yaw: 0, dust: 0.15 }],
          [6_000, { speedKph: 8, yaw: 0 }],
          [7_500, { speedKph: 5, yaw: 0, roll: 1.5 }],
          [10_500, { yaw: 90, roll: 2.5, dust: 0.25 }],
          [13_500, { speedKph: 5, yaw: 180, roll: 1.5 }],
          [15_000, { speedKph: 8, yaw: 180, roll: 1, dust: 0.15 }],
          [18_000, { speedKph: 8, yaw: 180 }],
        ]),
        outcome('uneven-ground', 'Terreno irregular', 'Mesma passada com trepidação de solo e velocidade reduzida a 6 km/h; continua sem alerta.', [
          [0, { speedKph: 6, yaw: 0, dust: 0.2, roughness: 1.3, shudder: 0.25 }],
          [6_000, { speedKph: 6, yaw: 0, pitch: 1.2, roll: 2.5 }],
          [7_500, { speedKph: 4, yaw: 0, roll: 3, shudder: 0.35 }],
          [10_500, { yaw: 90, roll: 3.5, pitch: 0.8, dust: 0.3 }],
          [13_500, { speedKph: 4, yaw: 180, roll: 2.5, shudder: 0.25 }],
          [15_000, { speedKph: 6, yaw: 180, roll: 2 }],
          [18_000, { speedKph: 6, yaw: 180, pitch: 0.5 }],
        ]),
        outcome('hot-weather', 'Calor intenso', 'Mesma passada sob 43 °C e 18% de umidade. É a temperatura ambiente do sensor; não mede o motor nem cria flag térmica.', [
          [0, { speedKph: 8, yaw: 0, dust: 0.3, temperature: 41, humidity: 21 }],
          [6_000, { speedKph: 8, yaw: 0, temperature: 42.5, humidity: 19 }],
          [7_500, { speedKph: 5, yaw: 0, roll: 1.5 }],
          [10_500, { yaw: 90, roll: 2.5, dust: 0.4, temperature: 43, humidity: 18 }],
          [13_500, { speedKph: 5, yaw: 180, roll: 1.5 }],
          [15_000, { speedKph: 8, yaw: 180, roll: 1, dust: 0.3 }],
          [18_000, { speedKph: 8, yaw: 180, temperature: 43.4, humidity: 18 }],
        ]),
      ],
    }),

    'max-front-obstacle': scenario({
      scenarioId: 'max-front-obstacle',
      label: 'Trator MAX com obstáculo frontal',
      description: 'Fardo de feno parado no caminho. O HC-SR04 na frente acusa a aproximação; o desfecho define se a parada vem a tempo.',
      equipmentId: SOMPO_MAX_TRACTOR_EQUIPMENT_ID,
      environmentId: 'row-crop-field',
      defaultOutcomeId: 'safe-stop',
      totalMs: 14_000,
      sampleIntervalMs: 500,
      speedKph: 6,
      distance: ECHO_LIMIT_CM,
      temperature: 27,
      humidity: 55,
      pitch: 0,
      roll: 1,
      roughness: 0.35,
      collisionRisk: false,
      inclinationRisk: false,
      obstacle: freeze({ kind: 'hay-bale', startGapM: Number(OBSTACLE_START_GAP_M.toFixed(4)) }),
      phases: [
        phase('approach', 'Aproximação em linha', 0, 5_500),
        phase('detection', 'Obstáculo no alcance do sensor', 5_500, 7_000),
        phase('alert', 'Alerta a 150 cm', 7_000, 8_400),
        phase('outcome', 'Desfecho', 8_400, 14_000),
      ],
      outcomes: [
        outcome('safe-stop', 'Parada segura', 'Alerta a 150 cm, frenagem imediata e parada a cerca de 40 cm do fardo.', scriptedApproach({
          startGapM: OBSTACLE_START_GAP_M,
          totalMs: 14_000,
          denseFromMs: 5_000,
          denseToMs: 9_000,
          speedProfile: [[0, 6], [7_000, 6], [8_300, 0], [14_000, 0]],
          events: [
            [0, { headlights: 1 }],
            [7_000, { collisionRisk: true, beacon: 1 }],
            [7_250, { brakeLights: 1, pitch: -0.8 }],
            [8_300, { pitch: 0 }],
            [11_000, { collisionRisk: false }],
          ],
        })),
        outcome('light-touch', 'Toque leve', 'Alerta a 150 cm, frenagem atrasada e contato leve com o fardo, leitura perto de 8 cm.', scriptedApproach({
          startGapM: OBSTACLE_START_GAP_M,
          totalMs: 14_000,
          denseFromMs: 5_000,
          denseToMs: 9_000,
          speedProfile: [[0, 6], [7_500, 6], [8_200, 0], [14_000, 0]],
          events: [
            [0, { headlights: 1 }],
            [7_000, { collisionRisk: true, beacon: 1 }],
            [7_500, { brakeLights: 1, pitch: -1.2 }],
            [8_200, { pitch: 0.6, shudder: 0.8 }],
            [8_700, { pitch: 0, shudder: 0.1 }],
            [9_200, { shudder: 0 }],
          ],
        }), [
          phase('approach', 'Aproximação em linha', 0, 5_500),
          phase('detection', 'Obstáculo no alcance do sensor', 5_500, 7_000),
          phase('alert', 'Alerta a 150 cm sem reação', 7_000, 7_500),
          phase('braking', 'Frenagem atrasada', 7_500, 8_200),
          phase('contact', 'Contato leve com o fardo', 8_200, 14_000),
        ]),
      ],
    }),

    'max-slope-rollover': scenario({
      ...rollover,
      scenarioId: 'max-slope-rollover',
      label: 'Trator MAX em curva inclinada',
      description: 'Trator MAX entra em curva transversal à pendente; o desfecho é selecionado explicitamente.',
      equipmentId: SOMPO_MAX_TRACTOR_EQUIPMENT_ID,
      phases: rollover.phases,
      outcomes: [
        withoutImplement(rollover.outcomes['controlled-stop'], undefined, 'Velocidade cai a tempo e o trator estabiliza na pendente.'),
        withoutImplement(rollover.outcomes['side-rollover'], undefined, 'Centro de gravidade cruza a base e o trator permanece imobilizado de lado.'),
      ],
    }),

    'max-field-bogging': scenario({
      ...bogging,
      scenarioId: 'max-field-bogging',
      label: 'Trator MAX atolado no talhão',
      description: 'Solo saturado reduz o avanço enquanto as rodas patinam; recuperação ou imobilização, escolhida explicitamente.',
      equipmentId: SOMPO_MAX_TRACTOR_EQUIPMENT_ID,
      phases: bogging.phases,
      outcomes: Object.values(bogging.outcomes).map((item) => withoutImplement(item)),
    }),

    'max-barn-approach': scenario({
      scenarioId: 'max-barn-approach',
      label: 'Trator MAX entrando no galpão de frente',
      description: 'Entrada de frente pelo vão do barracão a 4 km/h e 2 km/h; o HC-SR04 mede a parede do fundo e o desfecho define se a parada vem a tempo.',
      equipmentId: SOMPO_MAX_TRACTOR_EQUIPMENT_ID,
      environmentId: 'farm-barn',
      defaultOutcomeId: 'parked',
      totalMs: 18_000,
      sampleIntervalMs: 500,
      speedKph: 4,
      distance: ECHO_LIMIT_CM,
      temperature: 26,
      humidity: 60,
      pitch: 0,
      roll: 0.5,
      roughness: 0.2,
      collisionRisk: false,
      inclinationRisk: false,
      // O palco põe a face interna da parede do fundo a `startGapM` à frente do emissor.
      obstacle: freeze({ kind: 'barn-back-wall', startGapM: BARN_START_GAP_M }),
      phases: [
        phase('approach', 'Chegada ao vão do galpão', 0, 2_500),
        phase('inside', 'Avanço dentro do galpão', 2_500, 9_500),
        phase('detection', 'Parede do fundo no alcance do sensor', 9_500, 13_500),
        phase('alert', 'Alerta a 150 cm e parada', 13_500, 15_700),
        phase('parked', 'Parado na baia', 15_700, 18_000),
      ],
      outcomes: [
        outcome('parked', 'Parada na baia', 'Desacelera a 2 km/h com a parede no alcance, alerta a 150 cm e para a cerca de 60 cm do fundo.', scriptedApproach({
          startGapM: BARN_START_GAP_M,
          totalMs: 18_000,
          denseFromMs: 9_000,
          denseToMs: 16_000,
          speedProfile: [[0, 4], [9_000, 4], [10_500, 2], [14_500, 2], [15_700, 0], [18_000, 0]],
          events: [
            [0, { headlights: 1 }],
            [13_500, { collisionRisk: true }],
            [14_500, { brakeLights: 1, pitch: -0.4 }],
            [15_700, { pitch: 0 }],
            [16_500, { collisionRisk: false, brakeLights: 0 }],
          ],
        })),
        outcome('wall-contact', 'Encosta na parede do fundo', 'Alerta a 150 cm sem reação, frenagem só no fim e o lastro encosta na parede; a leitura cai ao mínimo de 2 cm.', scriptedApproach({
          startGapM: BARN_START_GAP_M,
          totalMs: 18_000,
          denseFromMs: 9_000,
          denseToMs: 17_000,
          speedProfile: [[0, 4], [9_000, 4], [10_500, 2], [16_000, 2], [16_300, 0], [18_000, 0]],
          events: [
            [0, { headlights: 1 }],
            [13_500, { collisionRisk: true, beacon: 1 }],
            [16_000, { brakeLights: 1, pitch: -0.6 }],
            [16_250, { pitch: 0.5, shudder: 0.7 }],
            [16_750, { pitch: 0, shudder: 0.1 }],
            [17_250, { shudder: 0 }],
          ],
        }), [
          phase('approach', 'Chegada ao vão do galpão', 0, 2_500),
          phase('inside', 'Avanço dentro do galpão', 2_500, 9_500),
          phase('detection', 'Parede do fundo no alcance do sensor', 9_500, 13_500),
          phase('alert', 'Alerta a 150 cm sem reação', 13_500, 16_000),
          phase('contact', 'Contato com a parede do fundo', 16_000, 18_000),
        ]),
      ],
    }),

    'max-night-operation': scenario({
      scenarioId: 'max-night-operation',
      label: 'Trator MAX em operação noturna',
      description: 'Passada à noite com faróis e luzes do teto; uma falha de iluminação obriga a parar no talhão.',
      equipmentId: SOMPO_MAX_TRACTOR_EQUIPMENT_ID,
      environmentId: 'row-crop-field-night',
      defaultOutcomeId: 'lit-pass',
      totalMs: 18_000,
      sampleIntervalMs: 500,
      speedKph: 6,
      distance: ECHO_LIMIT_CM,
      temperature: 18,
      humidity: 79,
      pitch: 0.5,
      roll: 1,
      roughness: 0.4,
      collisionRisk: false,
      inclinationRisk: false,
      phases: [
        phase('startup', 'Acendimento e saída', 0, 3_000),
        phase('night-work', 'Passada noturna', 3_000, 13_000),
        phase('outcome', 'Desfecho', 13_000, 18_000),
      ],
      outcomes: [
        outcome('lit-pass', 'Passada iluminada', 'Faróis e luzes do teto ficam acesos a passada inteira; o HC-SR04 segue sem eco em alcance.', [
          [0, { speedKph: 0, headlights: 0.6, workLights: 0.4, beacon: 1 }],
          [3_000, { speedKph: 6, headlights: 1, workLights: 1, dust: 0.15 }],
          [13_000, { speedKph: 6 }],
          [15_000, { speedKph: 4, yaw: 8 }],
          [18_000, { speedKph: 4, yaw: 12, dust: 0.1 }],
        ], [
          phase('startup', 'Acendimento e saída', 0, 3_000),
          phase('night-work', 'Passada noturna', 3_000, 13_000),
          phase('headland', 'Redução para a cabeceira', 13_000, 18_000),
        ]),
        outcome('light-failure', 'Falha dos faróis', 'Os faróis falham no meio da passada; o trator para no escuro com o giroflex e a lanterna de freio.', [
          [0, { speedKph: 0, headlights: 0.6, workLights: 0.4, beacon: 1 }],
          [3_000, { speedKph: 6, headlights: 1, workLights: 1, dust: 0.15 }],
          [9_000, { speedKph: 6, headlights: 0.9, workLights: 0.9 }],
          [9_600, { headlights: 0.1, workLights: 0.05 }],
          [11_000, { speedKph: 0, headlights: 0, workLights: 0, brakeLights: 1, pitch: -0.5, dust: 0.05 }],
          [12_000, { pitch: 0 }],
          [13_000, { brakeLights: 0.4 }],
          [18_000, { speedKph: 0, dust: 0 }],
        ], [
          phase('startup', 'Acendimento e saída', 0, 3_000),
          phase('night-work', 'Passada noturna', 3_000, 9_000),
          phase('light-failure', 'Falha dos faróis', 9_000, 11_000),
          phase('stopped-dark', 'Parado no escuro', 11_000, 18_000),
        ]),
      ],
    }),
  };
}
