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

// 6 km/h = 1,667 m/s. O alerta de 150 cm cai em 7,0 s quando o fardo começa a 13,17 m.
const OBSTACLE_START_GAP_M = 1.5 + ((6 / 3.6) * 7);

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
  };
}
