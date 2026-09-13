/**
 * Cenários agrícolas do geofencing (módulo shared/geofencing). Entram no catálogo
 * SOMPO_AGRI_SCENARIOS por spread; nenhum outro cenário muda por causa deles.
 * Mesma forma dos demais (builders de sompo-agri-scenario-builders.js); os campos
 * environmentId apontam para os talhões de sites.js e startX fixa a origem do percurso.
 */
import { freeze, phase, outcome, scenario } from '../sompo-agri-scenario-builders.js';

// Demonstração em tempo físico (7 km/h no trabalho, 3 km/h na cabeceira): duas passadas e uma cabeceira,
// partindo e parando fora de qualquer faixa. A manobra do C (para dentro da ribanceira, recua em ré) leva 58 s.
function operacaoFrames(kind) {
  const extra = kind === 'gully' ? 58_000 : 0;
  const frames = [
    [0, { speedKph: 0, lateral: -10, headerSpeed: 0, implementLift: 0.4 }],
    [4_000, { speedKph: 7, headerSpeed: 1, implementLift: 0, cropCut: 0.3, dust: 0.35 }],
    [13_000, { roll: 2 }],
    [16_000, { roll: kind === 'slope' ? 17 : 4 }],
    [18_000, { roll: kind === 'slope' ? 17 : 4 }],
    [21_000, { roll: 2 }],
    [73_500, { speedKph: 7 }],
    [75_500, { speedKph: 3, headerSpeed: 0.3, implementLift: 0.4 }],
  ];
  if (extra) frames.push(
    [98_500, { speedKph: 3 }],
    [100_500, { speedKph: 0, brakeLights: 1 }],
    [102_500, { speedKph: 0, direction: -1 }],
    [104_500, { speedKph: 3, brakeLights: 0 }],
    [127_500, { speedKph: 3 }],
    [129_500, { speedKph: 0, brakeLights: 1 }],
    [131_500, { speedKph: 0, direction: 1 }],
    [133_500, { speedKph: 3, brakeLights: 0 }],
  );
  const rest = [
    [85_000, { yaw: -45 }], [94_500, { yaw: -90 }],
    [104_000, { yaw: -135 }], [113_500, { yaw: -180 }],
    [115_500, { speedKph: 7, headerSpeed: 1, implementLift: 0, cropCut: 0.6 }],
    [119_500, { yaw: -150 }],
    [138_000, { yaw: -150 }],
    [142_000, { yaw: -210 }],
    [160_500, { yaw: -210 }],
    [164_500, { yaw: -180 }],
    [168_000, { speedKph: 7 }],
    [172_000, { speedKph: 0, headerSpeed: 0, dust: 0, brakeLights: 1 }],
  ];
  frames.push(...rest.map(([at, values]) => [at + extra, values]));
  frames.push([232_000, { speedKph: 0 }]);
  return frames;
}

const operacaoPhases = (extra = 0) => [
  phase('entrada', 'Entrada no talhão', 0, 4_000),
  phase('passada-1', 'Primeira passada · encosta', 4_000, 75_500),
  phase('cabeceira-leste', 'Cabeceira leste · ribanceira', 75_500, 115_500 + extra),
  phase('passada-2', 'Segunda passada · córrego', 115_500 + extra, 172_000 + extra),
  phase('parada', 'Operação concluída · parada', 172_000 + extra, 232_000),
];

export const GEOFENCING_AGRI_SCENARIOS = freeze({
  'agri-geofencing-operacao': scenario({
    scenarioId: 'agri-geofencing-operacao',
    label: 'Operação real com geofencing',
    description: 'Demonstração sintética: duas passadas e uma cabeceira, encosta, borda da ribanceira e aproximação do córrego. 7 km/h no trabalho e 3 km/h na manobra; término em 3 min 52 s.',
    synthetic: true,
    equipmentId: 'harvester', environmentId: 'geofence-operacao', defaultOutcomeId: 'operacao-completa',
    totalMs: 232_000, sampleIntervalMs: 250, speedKph: 7, distance: 230, startX: -76,
    temperature: 31, humidity: 38, pitch: 1, roll: 2, roughness: 0.8,
    collisionRisk: false, inclinationRisk: false,
    phases: operacaoPhases(),
    outcomes: [
      outcome('operacao-completa', 'Operação completa', 'Demonstração: duas passadas e uma cabeceira, para fora das faixas.', operacaoFrames('complete')),
      outcome('encosta-alem-do-limite', 'Encosta além do limite', 'Demonstração: na encosta da primeira passada, a inclinação cruza o limite de 15° da colheitadeira.', operacaoFrames('slope')),
      freeze({ ...outcome('cabeceira-na-ribanceira', 'Cabeceira na ribanceira', 'Demonstração: avança na ribanceira, para, recua e retoma as passadas.', operacaoFrames('gully')), phases: freeze(operacaoPhases(58_000)) }),
    ],
  }),

  'agri-geofencing': scenario({
    scenarioId: 'agri-geofencing',
    label: 'Operação com geofencing',
    description: 'Colheitadeira atravessa um declive mapeado e se aproxima do córrego; o radar de faixas e o limite de inclinação da máquina reagem a cada instante. Fazenda e valores sintéticos.',
    equipmentId: 'harvester',
    environmentId: 'geofence-field',
    defaultOutcomeId: 'parada-na-faixa',
    totalMs: 24_000,
    sampleIntervalMs: 500,
    speedKph: 7,
    distance: 230,
    temperature: 31,
    humidity: 38,
    pitch: 1,
    roll: 2,
    roughness: 0.8,
    collisionRisk: false,
    inclinationRisk: false,
    phases: [
      phase('passada', 'Sem perigo no alcance', 0, 5_000),
      phase('declive', 'Declive mapeado', 5_000, 15_000),
      phase('agua', 'Aproximação do córrego', 15_000, 24_000),
    ],
    outcomes: [
      outcome('parada-na-faixa', 'Parada na faixa elevada', 'O operador reduz e para quando o radar entra em proximidade elevada da água.', [
        [0, { headerSpeed: 1, cropCut: 0.3, dust: 0.35 }],
        [12_000, { cropCut: 0.7, dust: 0.6 }],
        [21_000, { speedKph: 7 }],
        [23_000, { speedKph: 0, headerSpeed: 0.3, brakeLights: 1, dust: 0.2 }],
        [24_000, { speedKph: 0, headerSpeed: 0, dust: 0 }],
      ]),
      outcome('segue-ate-critica', 'Segue até a faixa crítica', 'A máquina vira para o lado do córrego e chega à faixa crítica sem reduzir.', [
        [0, { headerSpeed: 1, cropCut: 0.3, dust: 0.35 }],
        [14_000, { cropCut: 0.7, dust: 0.6, yaw: 0 }],
        [20_000, { yaw: -70, dust: 0.7 }],
        [23_000, { yaw: -80, speedKph: 7 }],
        [24_000, { speedKph: 0, brakeLights: 1 }],
      ]),
      // Mesmo comprimento de percurso dos outros desfechos: o percurso é centrado por desfecho (startX = -travel/2),
      // então parar cedo deslocaria a origem e a máquina nasceria dentro do declive.
      outcome('declive-alem-do-limite', 'Declive além do limite da máquina', 'Dentro do declive mapeado a inclinação passa do limite declarado para a colheitadeira; o operador reduz, o conjunto estabiliza e a passada continua.', [
        [0, { headerSpeed: 1, cropCut: 0.3, dust: 0.35 }],
        [5_000, { roll: 2 }],
        [7_500, { roll: 13, inclinationRisk: true, beacon: 1 }], // a bandeira do dispositivo acende junto com o cruzamento dos 15°
        [9_000, { roll: 19, speedKph: 4, brakeLights: 1 }],
        [13_000, { roll: 6, speedKph: 7, inclinationRisk: false, brakeLights: 0 }],
        [22_000, { roll: 3 }],
        [24_000, { speedKph: 0, headerSpeed: 0, dust: 0 }],
      ]),
    ],
  }),
});

/** Ids dos cenários com talhão de geofencing. */
export const GEOFENCING_AGRI_SCENARIO_IDS = freeze(Object.keys(GEOFENCING_AGRI_SCENARIOS));
