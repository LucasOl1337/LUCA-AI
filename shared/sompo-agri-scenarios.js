/**
 * Agricultural scenario catalog for the Sompo simulator.
 *
 * This module deliberately has no timers or random source. A frame is a pure
 * function of scenario + outcome + elapsed time, so UI seeking, telemetry and
 * screenshots can all consume the same clock. The top-level control fields
 * match SompoSimulationScenario and can be passed to the existing simulator.
 */

import { freeze, phase, outcome, scenario } from './sompo-agri-scenario-builders.js';
// geofencing (módulo shared/geofencing): os dois cenários com talhão entram no catálogo pelo spread abaixo.
import { GEOFENCING_AGRI_SCENARIOS } from './geofencing/agri-scenarios.js';

const BASE_FRAME = freeze({
  yaw: 0,
  lateral: 0,
  vertical: 0,
  direction: 1,
  wheelSpeedKph: null,
  dust: 0,
  mud: 0,
  sink: 0,
  cropCut: 0,
  headerSpeed: 0,
  implementLift: 0,
  implementRoll: 0,
  implementYaw: 0,
  hydraulicPressure: 1,
  // Mechanical rattle envelope (0..1): the stage turns it into fast body and
  // implement shake; keyframes only script the intensity.
  shudder: 0,
  headlights: 0,
  workLights: 0,
  brakeLights: 0,
  beacon: 0,
  engineSmoke: 0,
});

export const SOMPO_AGRI_EQUIPMENT = freeze({
  tractor: freeze({
    id: 'tractor',
    label: 'Trator agrícola 4x4',
    assetUrl: '/models/sompo/generated-agri-tractor.glb',
    provenanceUrl: '/models/sompo/generated-agri-tractor.provenance.json',
    nominalSizeM: freeze({ length: 5.8, width: 2.7, height: 3.2 }),
    forwardAxis: '+X',
  }),
  harvester: freeze({
    id: 'harvester',
    label: 'Colheitadeira de grãos',
    assetUrl: '/models/sompo/generated-agri-harvester.glb',
    provenanceUrl: '/models/sompo/generated-agri-harvester.provenance.json',
    nominalSizeM: freeze({ length: 9.2, width: 7.6, height: 4.0 }),
    forwardAxis: '+X',
  }),
});

export const SOMPO_AGRI_SCENARIOS = freeze({
  'agri-harvest-dust': scenario({
    scenarioId: 'agri-harvest-dust',
    label: 'Colheita com poeira',
    description: 'Colheitadeira percorre fileiras secas; o corte e a nuvem de palha seguem o mesmo relógio da telemetria.',
    equipmentId: 'harvester',
    environmentId: 'row-crop-field',
    defaultOutcomeId: 'clean-pass',
    totalMs: 18_000,
    sampleIntervalMs: 500,
    speedKph: 7,
    distance: 220,
    temperature: 34,
    humidity: 31,
    pitch: 1,
    roll: 2,
    roughness: 0.8,
    collisionRisk: false,
    inclinationRisk: false,
    phases: [
      phase('approach', 'Alinhamento nas fileiras', 0, 3_000),
      phase('harvest', 'Plataforma em colheita', 3_000, 13_000),
      phase('headland', 'Saída para o carreador', 13_000, 18_000),
    ],
    outcomes: [
      outcome('clean-pass', 'Passada concluída', 'Fluxo de material permanece estável e a máquina reduz no carreador.', [
        [0, { implementLift: 0.55, headerSpeed: 0, cropCut: 0, dust: 0.08, workLights: 0 }],
        [2_600, { implementLift: 0.12, headerSpeed: 0.4 }],
        [3_000, { implementLift: 0, headerSpeed: 1, cropCut: 0.25, dust: 0.45 }],
        [9_000, { cropCut: 0.82, dust: 1 }],
        [13_000, { speedKph: 4, headerSpeed: 0.45, cropCut: 1, dust: 0.35, yaw: 8, implementLift: 0.5 }],
        [15_000, { implementLift: 0.55 }],
        [18_000, { speedKph: 0, headerSpeed: 0, dust: 0, yaw: 0 }],
      ]),
      outcome('header-blockage', 'Embuchamento da plataforma', 'A plataforma perde rotação e o operador imobiliza a máquina sem inventar uma flag do firmware.', [
        [0, { implementLift: 0.55, headerSpeed: 0, cropCut: 0, dust: 0.08 }],
        [2_600, { implementLift: 0.12, headerSpeed: 0.4 }],
        [3_000, { implementLift: 0, headerSpeed: 1, cropCut: 0.25, dust: 0.45 }],
        [6_500, { speedKph: 5.5, headerSpeed: 0.8, cropCut: 0.5, dust: 0.8 }],
        [8_000, { speedKph: 2, headerSpeed: 0.35, cropCut: 0.62, dust: 1, roughness: 2.4 }],
        [10_000, { speedKph: 0, headerSpeed: 0, cropCut: 0.64, dust: 0.2, beacon: 1, brakeLights: 1 }],
        [12_000, { brakeLights: 0, implementLift: 0.4 }],
        [18_000, { dust: 0, roughness: 0.1 }],
      ], [
        phase('approach', 'Alinhamento nas fileiras', 0, 3_000),
        phase('harvest', 'Plataforma em colheita', 3_000, 6_500),
        phase('blockage', 'Embuchamento da plataforma', 6_500, 10_000),
        phase('stalled', 'Parada no talhão', 10_000, 18_000),
      ]),
    ],
  }),

  'agri-tractor-rollover': scenario({
    scenarioId: 'agri-tractor-rollover',
    label: 'Trator em curva inclinada',
    description: 'Trator com implemento elevado entra em curva transversal à pendente; desfecho é selecionado explicitamente.',
    equipmentId: 'tractor',
    environmentId: 'sloped-field',
    defaultOutcomeId: 'controlled-stop',
    totalMs: 16_000,
    sampleIntervalMs: 500,
    speedKph: 12,
    // Campo aberto: o sensor de proximidade satura no teto do modelo (400 cm,
    // "sem eco em alcance"): nunca há obstáculo à frente neste cenário.
    distance: 400,
    temperature: 29,
    humidity: 48,
    pitch: 1,
    // O talhão cai para -z (~9.7°): a máquina em repouso já deita morro abaixo.
    roll: -9.5,
    roughness: 0.9,
    collisionRisk: false,
    inclinationRisk: false,
    phases: [
      phase('approach', 'Aproximação da curva', 0, 4_000),
      phase('load-transfer', 'Transferência lateral', 4_000, 8_000),
      phase('outcome', 'Desfecho', 8_000, 16_000),
    ],
    outcomes: [
      outcome('controlled-stop', 'Parada antes do tombamento', 'Implemento baixa, velocidade cai e o conjunto estabiliza.', [
        [0, { implementLift: 0.75, roll: -9.5, beacon: 1 }],
        [4_000, { yaw: 15, roll: -19, implementRoll: -8, inclinationRisk: true }],
        [6_500, { speedKph: 6, yaw: 24, roll: -27, implementLift: 0.45, implementRoll: -13, brakeLights: 1 }],
        // Peso transferido morro abaixo: o trator fica pendurado um instante antes de segurar.
        [8_000, { speedKph: 2, roll: -30, implementLift: 0.15, implementRoll: -15, pitch: -1 }],
        [10_000, { speedKph: 0, yaw: 28, roll: -19, implementLift: 0, implementRoll: -8, pitch: 0 }],
        [13_000, { roll: -13, implementRoll: -4 }],
        [16_000, { roll: -11, implementRoll: -2, inclinationRisk: false }],
      ]),
      outcome('side-rollover', 'Tombamento lateral', 'Centro de gravidade cruza a base e o conjunto permanece imobilizado de lado.', [
        [0, { implementLift: 0.85, roll: -9.5, beacon: 1 }],
        [4_000, { yaw: 15, roll: -21, implementRoll: -10, inclinationRisk: true }],
        // Roda de cima aliviada: o conjunto escorrega morro abaixo perto do equilíbrio.
        [6_500, { speedKph: 8, yaw: 27, roll: -33, lateral: -0.8, implementRoll: -22, pitch: -1 }],
        // Ponto sem retorno: a queda acelera e o tranco vem no fim, não antes.
        [7_800, { speedKph: 5, yaw: 31, roll: -39, lateral: -1.5, implementRoll: -27, pitch: -2 }],
        [8_600, { speedKph: 2, yaw: 34, roll: -82, lateral: -2.5, pitch: -4, dust: 0.9, collisionRisk: true, shudder: 1 }],
        [9_000, { speedKph: 0, roll: -91, lateral: -2.9, vertical: -0.25, dust: 1, shudder: 0.5 }],
        // O dorso bate e rola de volta alguns graus antes de assentar no solo.
        [9_700, { roll: -82, dust: 0.55, shudder: 0.15 }],
        [10_800, { roll: -86, vertical: -0.3, dust: 0.3, shudder: 0 }],
        [16_000, { roll: -86, vertical: -0.3, dust: 0.1, roughness: 0 }],
      ]),
    ],
  }),

  'agri-hydraulic-failure': scenario({
    scenarioId: 'agri-hydraulic-failure',
    label: 'Falha hidráulica no implemento',
    description: 'Comando de levante oscila e o implemento reage de forma errática; o operador pode isolar o circuito ou sofrer queda abrupta.',
    equipmentId: 'tractor',
    environmentId: 'row-crop-field',
    defaultOutcomeId: 'isolated',
    totalMs: 14_000,
    sampleIntervalMs: 500,
    speedKph: 6,
    // Talhão livre: sem obstáculo no feixe em nenhum desfecho: sensor saturado.
    distance: 400,
    temperature: 32,
    humidity: 44,
    pitch: 1,
    roll: 2,
    roughness: 0.55,
    collisionRisk: false,
    inclinationRisk: false,
    phases: [
      phase('work', 'Implemento em trabalho', 0, 3_000),
      phase('oscillation', 'Resposta hidráulica errática', 3_000, 8_000),
      phase('outcome', 'Contenção da falha', 8_000, 14_000),
    ],
    outcomes: [
      outcome('isolated', 'Circuito isolado', 'O trator para, alivia pressão e apoia o implemento no solo.', [
        [0, { implementLift: 0.18, hydraulicPressure: 0.9, cropCut: 0.2 }],
        [3_000, { implementLift: 0.8, implementRoll: -9, hydraulicPressure: 0.35, roughness: 1.6, shudder: 0.5, pitch: 1 }],
        // Válvula espástica: trancos curtos alternados, não uma oscilação lisa.
        [3_700, { implementLift: 0.5, implementRoll: 7, implementYaw: 3, hydraulicPressure: 0.62, shudder: 0.9 }],
        [4_400, { implementLift: 0.88, implementRoll: -11, implementYaw: -3, hydraulicPressure: 0.2, roll: 3.5, pitch: 1.4 }],
        [5_200, { implementLift: 0.45, implementRoll: 9, implementYaw: 2, hydraulicPressure: 0.7, speedKph: 4, pitch: -0.6, shudder: 0.8 }],
        [6_000, { implementLift: 0.9, implementRoll: -12, implementYaw: -2, hydraulicPressure: 0.15, roll: 4, pitch: 1.3, shudder: 1 }],
        [6_800, { implementLift: 0.62, implementRoll: 5, hydraulicPressure: 0.3, speedKph: 2.5, pitch: 0.4, shudder: 0.7 }],
        [7_800, { implementLift: 0.8, implementRoll: -3, speedKph: 0, brakeLights: 1, pitch: 0, shudder: 0.4 }],
        // Descida controlada sangrando o circuito; lift negativo assenta o implemento no solo.
        [9_200, { implementLift: 0.3, implementRoll: 0, implementYaw: 0, hydraulicPressure: 0, roll: 2, shudder: 0.15 }],
        [10_400, { implementLift: -0.22, pitch: -0.5, shudder: 0, beacon: 1 }],
        [14_000, { roughness: 0.1, pitch: 0, roll: 2 }],
      ]),
      outcome('implement-drop', 'Queda do implemento', 'A sustentação se perde antes da parada e o implemento toca o terreno.', [
        [0, { implementLift: 0.18, hydraulicPressure: 0.9 }],
        [3_000, { implementLift: 0.82, implementRoll: -10, hydraulicPressure: 0.3, roughness: 1.8, shudder: 0.5, pitch: 1 }],
        [4_500, { implementLift: 0.6, implementRoll: 8, implementYaw: 3, hydraulicPressure: 0.5, shudder: 0.85 }],
        [5_600, { implementLift: 0.92, implementRoll: -12, implementYaw: -3, hydraulicPressure: 0.12, pitch: 1.5, shudder: 1 }],
        [6_400, { implementLift: 0.95, implementRoll: -8, hydraulicPressure: 0.04, pitch: 1.6, shudder: 0.8 }],
        // Pressão zerada: o implemento cede em queda quase livre, ~450 ms.
        [6_900, { implementLift: 0.85, implementRoll: -5, hydraulicPressure: 0, speedKph: 3 }],
        [7_200, { implementLift: 0.25, implementRoll: 8, speedKph: 1, pitch: -0.5 }],
        // Baque: escoras cravam no solo, a traseira alivia e a frente reage.
        [7_450, { implementLift: -0.32, implementRoll: 15, speedKph: 0, pitch: 2.5, dust: 0.85, collisionRisk: true, shudder: 1, brakeLights: 1 }],
        [8_100, { implementLift: -0.12, implementRoll: 11, pitch: -1, shudder: 0.3, dust: 0.5 }],
        [9_000, { implementLift: -0.22, implementRoll: 9, pitch: -0.5, dust: 0.25, beacon: 1, shudder: 0 }],
        [14_000, { implementRoll: 0, dust: 0, roughness: 0, pitch: 0 }],
      ]),
    ],
  }),

  'agri-field-bogging': scenario({
    scenarioId: 'agri-field-bogging',
    label: 'Atolamento no talhão',
    description: 'Solo saturado reduz avanço enquanto as rodas patinam; a seleção de desfecho evita recuperação aleatória.',
    equipmentId: 'tractor',
    environmentId: 'muddy-field',
    defaultOutcomeId: 'assisted-recovery',
    totalMs: 16_000,
    sampleIntervalMs: 500,
    speedKph: 8,
    distance: 200,
    temperature: 24,
    humidity: 94,
    pitch: 2,
    roll: 3,
    roughness: 1.2,
    collisionRisk: false,
    inclinationRisk: false,
    phases: [
      phase('entry', 'Entrada no solo saturado', 0, 4_000),
      phase('traction-loss', 'Perda de tração', 4_000, 10_000),
      phase('outcome', 'Desfecho', 10_000, 16_000),
    ],
    outcomes: [
      outcome('assisted-recovery', 'Recuperação assistida', 'Patinagem cessa, o conjunto recua e sai pela própria trilha.', [
        [0, { mud: 0.2, wheelSpeedKph: 8, sink: 0.04 }],
        [4_000, { speedKph: 2, wheelSpeedKph: 17, sink: 0.24, mud: 0.8, roll: 8, pitch: 2.5 }],
        [5_600, { speedKph: 0.8, wheelSpeedKph: 11, sink: 0.3, pitch: 3.5 }],
        [7_200, { speedKph: 0.3, wheelSpeedKph: 16, sink: 0.38, pitch: 4, mud: 0.95 }],
        [9_000, { speedKph: 0, wheelSpeedKph: 6, sink: 0.42, mud: 1, pitch: 4.5 }],
        [10_000, { direction: -1, speedKph: 0, wheelSpeedKph: 0, sink: 0.34, mud: 0.6, pitch: 3 }],
        [11_000, { direction: -1, speedKph: 2, wheelSpeedKph: 3, sink: 0.3, mud: 0.55, pitch: 2, roll: 6 }],
        [14_000, { direction: -1, speedKph: 5, wheelSpeedKph: 5.5, sink: 0.08, mud: 0.2, pitch: 0.5, roll: 4 }],
        [16_000, { speedKph: 0, wheelSpeedKph: 0, mud: 0.05, pitch: 0, sink: 0, roll: 3 }],
      ], [
        phase('entry', 'Entrada no solo saturado', 0, 4_000),
        phase('traction-loss', 'Perda de tração', 4_000, 10_000),
        phase('recovery', 'Recuo pela própria trilha', 10_000, 16_000),
      ]),
      outcome('deep-stall', 'Imobilização profunda', 'Insistência aumenta o afundamento e o trator permanece imobilizado.', [
        [0, { mud: 0.2, wheelSpeedKph: 8, sink: 0.04 }],
        [4_000, { speedKph: 2, wheelSpeedKph: 18, sink: 0.25, mud: 0.85, roll: 8, pitch: 3 }],
        [5_600, { speedKph: 0.5, wheelSpeedKph: 10, sink: 0.32, pitch: 4.5 }],
        [7_000, { speedKph: 0, wheelSpeedKph: 19, sink: 0.44, pitch: 5.5, mud: 1 }],
        [8_600, { wheelSpeedKph: 12, sink: 0.55, pitch: 6, roll: 9 }],
        [9_800, { wheelSpeedKph: 17, sink: 0.62, roll: 10 }],
        [11_000, { wheelSpeedKph: 9, sink: 0.68, roll: 11, roughness: 2.8, beacon: 1 }],
        [14_000, { wheelSpeedKph: 0, roughness: 0, mud: 0.2 }],
        [16_000, { sink: 0.7, pitch: 6.5 }],
      ], [
        phase('entry', 'Entrada no solo saturado', 0, 4_000),
        phase('traction-loss', 'Perda de tração', 4_000, 7_000),
        phase('digging', 'Patinagem e afundamento', 7_000, 14_000),
        phase('immobilized', 'Imobilizado no talhão', 14_000, 16_000),
      ]),
    ],
  }),

  'agri-barn-maneuver': scenario({
    scenarioId: 'agri-barn-maneuver',
    label: 'Manobra no barracão',
    description: 'Trator entra de ré com implemento articulado e pouca folga lateral.',
    equipmentId: 'tractor',
    environmentId: 'farm-barn',
    defaultOutcomeId: 'parked',
    totalMs: 15_000,
    sampleIntervalMs: 500,
    distanceSensorPosition: 'rear',
    speedKph: 3,
    // Ré no galpão: a leitura é o sensor na direção de trabalho (implemento).
    // Em 'parked' o corredor fica livre (parede do fundo >7 m, ombreiras são
    // laterais) e o feixe satura; em 'post-contact' o pilar entra no alcance.
    distance: 400,
    temperature: 27,
    humidity: 62,
    pitch: 0,
    roll: 1,
    roughness: 0.25,
    collisionRisk: false,
    inclinationRisk: false,
    phases: [
      phase('align', 'Alinhamento externo', 0, 4_000),
      // Cobre a ré e a correção de tração do 'parked'. A fase é compartilhada
      // com 'post-contact', que não tem avanço de realinhamento.
      phase('reverse', 'Manobra de ré', 4_000, 11_000),
      phase('outcome', 'Posicionamento final', 11_000, 15_000),
    ],
    outcomes: [
      outcome('parked', 'Manobra concluída', 'Conjunto corrige o ângulo e para centralizado dentro do barracão.', [
        // O sensor de ré enxerga o vão: ombreira a ~1,9 m no arranque, ~1,5 m na
        // travessia e o pilar interno a ~1,1 m — nunca aciona a flag de colisão.
        [0, { direction: -1, yaw: 12, implementYaw: -18, distance: 190, beacon: 1 }],
        [2_600, { yaw: -4, implementYaw: 8, distance: 150 }],
        [4_200, { yaw: -15, implementYaw: 24, pitch: 0.5, distance: 120 }],
        [4_400, { distance: 110 }],
        // Freia a ré em linha torta: traseira senta, conjunto para um instante.
        [5_800, { speedKph: 0, yaw: -16, implementYaw: 20, brakeLights: 1, pitch: 0.9, distance: 400 }],
        // Troca de marcha parado; traciona pra frente alinhando antes da ré final.
        [6_200, { direction: 1, speedKph: 0, pitch: 0.3 }],
        [7_000, { speedKph: 1.5, yaw: -8, implementYaw: 14, brakeLights: 0, pitch: 0.5 }],
        [7_600, { speedKph: 0, yaw: -4, implementYaw: 8, brakeLights: 1, pitch: -0.9 }],
        [8_200, { direction: -1, speedKph: 0, pitch: -0.3 }],
        [8_800, { speedKph: 2.5, yaw: 4, implementYaw: -8, brakeLights: 0, pitch: -0.6 }],
        [11_000, { speedKph: 1.2, yaw: 0, implementYaw: 0, brakeLights: 1, pitch: 0 }],
        [12_500, { speedKph: 0, pitch: 0.7 }],
        [15_000, { speedKph: 0, direction: -1, pitch: 0 }],
      ]),
      outcome('post-contact', 'Contato com pilar', 'O implemento toca um pilar em baixa velocidade e o conjunto para.', [
        // Pilar a ~5 m da ponta em t=0: saturado até a ré encurtar o eco.
        [0, { direction: -1, yaw: 12, implementYaw: -18, distance: 400, beacon: 1 }],
        [4_000, { yaw: -16, implementYaw: 27, distance: 185 }],
        [6_200, { yaw: -20, implementYaw: 38, distance: 14 }],
        // A ponta do implemento varre para o lado da câmera e engancha no pilar.
        [6_900, { yaw: -21, implementYaw: 44, distance: 6, collisionRisk: true }],
        // Parada seca: tranco empurra o conjunto e o implemento rebate na articulação.
        [7_300, { speedKph: 0, yaw: -20, implementYaw: 40, implementRoll: 8, roll: 3.5, pitch: -1.2, lateral: -0.2, shudder: 1, brakeLights: 1, roughness: 2.6, dust: 0.4, distance: 5 }],
        [8_100, { implementYaw: 43, implementRoll: 3, roll: 1.8, pitch: -0.4, shudder: 0.3, distance: 7 }],
        [11_000, { implementRoll: 0, roll: 1.2, pitch: 0, dust: 0.1, roughness: 0, shudder: 0, distance: 8 }],
        [15_000, { distance: 8, roll: 1 }],
      ]),
    ],
  }),

  'agri-night-operation': scenario({
    scenarioId: 'agri-night-operation',
    label: 'Operação agrícola noturna',
    description: 'Faróis e luzes de trabalho recortam as fileiras; uma falha de iluminação pode exigir parada.',
    equipmentId: 'harvester',
    environmentId: 'row-crop-field-night',
    defaultOutcomeId: 'lit-pass',
    totalMs: 18_000,
    sampleIntervalMs: 500,
    speedKph: 6,
    distance: 240,
    temperature: 18,
    humidity: 79,
    pitch: 1,
    roll: 2,
    roughness: 0.7,
    collisionRisk: false,
    inclinationRisk: false,
    phases: [
      phase('startup', 'Acendimento e inspeção', 0, 3_000),
      phase('night-work', 'Colheita noturna', 3_000, 13_000),
      phase('outcome', 'Desfecho', 13_000, 18_000),
    ],
    outcomes: [
      outcome('lit-pass', 'Passada iluminada', 'Faróis e projetores permanecem ativos durante toda a passada.', [
        [0, { implementLift: 0.55, headlights: 0.6, workLights: 0.5, beacon: 1, headerSpeed: 0 }],
        [2_600, { implementLift: 0.12, headerSpeed: 0.4 }],
        [3_000, { implementLift: 0, headlights: 1, workLights: 1, headerSpeed: 1, cropCut: 0.2, dust: 0.25 }],
        [10_000, { cropCut: 0.82, dust: 0.55 }],
        [13_000, { speedKph: 3, cropCut: 1, headerSpeed: 0.4, yaw: 8, implementLift: 0.5 }],
        [18_000, { speedKph: 0, headerSpeed: 0, dust: 0.05, implementLift: 0.55 }],
      ], [
        phase('startup', 'Acendimento e inspeção', 0, 3_000),
        phase('night-work', 'Colheita noturna', 3_000, 13_000),
        phase('headland', 'Saída para o carreador', 13_000, 18_000),
      ]),
      outcome('work-light-failure', 'Falha dos projetores', 'Projetores se apagam, a plataforma para e a máquina fica sinalizada.', [
        [0, { implementLift: 0.55, headlights: 0.2, workLights: 0.2, beacon: 1 }],
        [2_600, { implementLift: 0.12, headerSpeed: 0.4 }],
        [3_000, { implementLift: 0, headlights: 1, workLights: 1, headerSpeed: 1, cropCut: 0.2, dust: 0.25 }],
        [9_000, { workLights: 0.08, headlights: 0.55, cropCut: 0.65, headerSpeed: 0.45 }],
        [11_000, { speedKph: 0, workLights: 0, headerSpeed: 0, brakeLights: 1, dust: 0.1 }],
        [13_000, { brakeLights: 0, implementLift: 0.4 }],
        [18_000, { headlights: 0.45, dust: 0 }],
      ], [
        phase('startup', 'Acendimento e inspeção', 0, 3_000),
        phase('night-work', 'Colheita noturna', 3_000, 9_000),
        phase('light-failure', 'Falha dos projetores', 9_000, 11_000),
        phase('awaiting-light', 'Aguardando iluminação', 11_000, 18_000),
      ]),
    ],
  }),

  ...GEOFENCING_AGRI_SCENARIOS,
});

const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const frameCache = new WeakMap();

/** Cascaded, immutable poses are compiled once, shared by sampling and motion. */
export function getSompoAgriKeyframes(scenarioId, outcomeId) {
  const selected = getSompoAgriScenario(scenarioId);
  const selectedOutcome = selected.outcomes[outcomeId] || selected.outcomes[selected.defaultOutcomeId];
  if (!frameCache.has(selectedOutcome)) {
    const base = { ...BASE_FRAME };
    for (const key of ['speedKph', 'distance', 'temperature', 'humidity', 'pitch', 'roll', 'roughness', 'collisionRisk', 'inclinationRisk']) base[key] = selected[key];
    frameCache.set(selectedOutcome, freeze(selectedOutcome.keyframes.map(keyframe => {
      Object.assign(base, keyframe);
      return freeze({ ...base });
    })));
  }
  return frameCache.get(selectedOutcome);
}

export function getSompoAgriScenario(scenarioId = 'agri-harvest-dust') {
  const selected = Object.hasOwn(SOMPO_AGRI_SCENARIOS, scenarioId)
    ? SOMPO_AGRI_SCENARIOS[scenarioId]
    : SOMPO_AGRI_SCENARIOS['agri-harvest-dust'];
  return selected;
}

/** Fases do desfecho: roteiro próprio quando ele diverge do plano feliz do cenário. */
export function getSompoAgriOutcomePhases(scenario, outcome) {
  return (outcome && outcome.phases) || scenario.phases;
}

export function getSompoAgriFrame(scenarioId, elapsedMs = 0, outcomeId) {
  const selected = getSompoAgriScenario(scenarioId);
  const selectedOutcome = selected.outcomes[outcomeId] || selected.outcomes[selected.defaultOutcomeId];
  const elapsed = clamp(finite(elapsedMs, 0), 0, selected.totalMs);
  const frames = getSompoAgriKeyframes(scenarioId, outcomeId);
  const from = frames.findLast((frame) => elapsed >= frame.atMs) || frames[0];
  const to = frames.find((frame) => frame.atMs > elapsed) || from;
  const duration = to.atMs - from.atMs;
  const progress = duration ? (elapsed - from.atMs) / duration : 1;
  const blend = progress * progress * (3 - (2 * progress));
  const derivative = duration ? 6 * progress * (1 - progress) / (duration / 1_000) : 0;
  const frame = { ...from };
  for (const key of Object.keys(from)) {
    if (key !== 'direction' && typeof from[key] === 'number' && typeof to[key] === 'number') {
      frame[key] = from[key] + ((to[key] - from[key]) * blend);
    }
  }
  // A gearbox is discrete. Wheel speed stays continuous through zero at a shift.
  frame.wheelSpeedKph = (from.wheelSpeedKph ?? from.speedKph)
    + ((to.wheelSpeedKph ?? to.speedKph) - (from.wheelSpeedKph ?? from.speedKph)) * blend;
  const activePhases = getSompoAgriOutcomePhases(selected, selectedOutcome);
  const activePhase = activePhases.find((item) => elapsed < item.endMs) || activePhases.at(-1);
  return {
    ...frame,
    atMs: elapsed,
    scenarioId: selected.scenarioId,
    scenarioLabel: selected.label,
    equipmentId: selected.equipmentId,
    environmentId: selected.environmentId,
    distanceSensorPosition: selected.distanceSensorPosition,
    outcomeId: selectedOutcome.id,
    outcomeLabel: selectedOutcome.label,
    phaseId: activePhase.id,
    phaseLabel: activePhase.label,
    accelerationX: (to.speedKph - from.speedKph) / 3.6 * derivative,
    yawRate: (to.yaw - from.yaw) * derivative,
    pitchRate: (to.pitch - from.pitch) * derivative,
    rollRate: (to.roll - from.roll) * derivative,
    implementLiftRate: (to.implementLift - from.implementLift) * derivative,
  };
}

/** Extract only fields understood by createSompoSimulationSnapshot. */
export function toSompoSimulationControls(frame) {
  return {
    scenarioId: frame.scenarioId,
    speedKph: frame.speedKph,
    distance: frame.distance,
    temperature: frame.temperature,
    humidity: frame.humidity,
    pitch: frame.pitch,
    roll: frame.roll,
    roughness: frame.roughness,
    collisionRisk: frame.collisionRisk,
    inclinationRisk: frame.inclinationRisk,
  };
}
