/**
 * Visual choreography uses the same elapsed clock as telemetry. Tracks are sampled,
 * never scheduled with timers: seeking, late GLB loading and replay are deterministic.
 * null endMs holds the final damage/mark until the operator changes/restarts the case.
 */
const track = (effect, startMs = 0, endMs = null, strength = 1, attackMs = 250) =>
  Object.freeze({ effect, startMs, endMs, strength, attackMs });
const scene = (tracks, surface = 'asphalt', setting = 'road', focusX = 0) =>
  Object.freeze({ surface, setting, focusX, tracks: Object.freeze(tracks) });

export const SOMPO_SCENARIO_EFFECTS = Object.freeze({
  normal: scene([track('road-dust', 0, null, 0.16), track('running-lights')]),
  obstacle: scene([track('hazard-lights'), track('brake-lights'), track('sensor-warning')]),
  inclination: scene([track('shoulder-dust', 0, null, 0.35), track('cargo-strain'), track('hazard-lights')]),
  'rough-road': scene([track('road-dust', 0, null, 0.8), track('gravel'), track('exhaust', 0, null, 0.12)], 'gravel'),
  'hard-braking': scene([track('tire-smoke', 3000, 8000), track('skid-marks', 3000), track('brake-lights', 3000)]),
  'steep-climb': scene([track('exhaust', 0, null, 0.5), track('road-dust', 0, null, 0.2), track('running-lights')]),
  'steep-descent': scene([track('brake-glow', 1800, null, 0.35, 3000), track('brake-lights'), track('brake-smoke', 5000, null, 0.18)]),
  'yard-maneuver': scene([track('maneuver-guides'), track('road-dust', 0, null, 0.15)], 'asphalt', 'yard'),
  'shifted-load': scene([track('cargo-strain', 800), track('cargo-shift', 1200, null, 1, 3000), track('hazard-lights')]),
  'hot-weather': scene([track('heat-haze'), track('exhaust', 0, null, 0.18), track('running-lights')]),
  rollover: scene([track('shoulder-dust', 2200, 7800), track('impact-dust', 5400, 9600, 1, 40), track('debris', 5400, null, 1, 0), track('hazard-lights', 7000)]),
  'tire-blowout': scene([track('tire-damage', 2900, null, 1, 100), track('rubber-shards', 2980, null, 1, 0), track('blowout-dust', 2980, 5600, 1, 25), track('tire-smoke', 3200, 7600, 0.7), track('skid-marks', 3050), track('shoulder-dust', 6800, 9800, 0.5), track('hazard-lights', 4800)]),
  'animal-crossing': scene([track('animal', 0, 13000), track('brake-lights', 2600, 8300), track('tire-smoke', 2700, 7900, 0.45), track('skid-marks', 2700), track('hazard-lights', 8300)], 'asphalt', 'road', 2.8),
  aquaplaning: scene([track('wheel-spray'), track('rain'), track('running-lights'), track('hazard-lights', 2600, 12500), track('brake-lights', 7400, 11500)], 'wet'),
  'brake-failure': scene([track('brake-smoke', 3800, null, 1, 3000), track('brake-glow', 3800, null, 1, 4000), track('brake-lights'), track('hazard-lights', 8000)]),
  'engine-fire': scene([track('engine-smoke', 1400, null, 1, 4500), track('engine-steam', 1500, 8000, 0.6, 1200), track('exhaust', 4600, 9400, 0.85, 700), track('brake-lights', 5600, 9600), track('engine-fire', 8000, null, 1, 2800), track('hazard-lights', 4800)]),
  'tight-reverse': scene([track('reverse-lights', 900), track('maneuver-guides'), track('brake-lights', 5600, 6400), track('brake-lights', 11500)], 'asphalt', 'yard'),
  'bogged-down': scene([track('mud-spray', 2000, 12500), track('mud-ruts', 2000), track('rain', 0, null, 0.2), track('hazard-lights', 5200), track('reverse-lights', 5800, 8000), track('reverse-lights', 10400)], 'mud'),
  'driver-drowsiness': scene([track('running-lights'), track('brake-lights', 12000, 14800), track('shoulder-dust', 8600, 12000, 0.5), track('hazard-lights', 13500)]),
  'fast-corner': scene([track('tire-smoke', 2000, 5400, 0.6), track('skid-marks', 3000), track('brake-lights', 3000, 7000)]),
});

/**
 * Coreografias específicas de desfechos alternativos. O desfecho padrão de cada
 * cenário continua usando SOMPO_SCENARIO_EFFECTS; aqui só entram os ramos que
 * mudam a cena (impacto, saída de pista, fogo contido…).
 */
export const SOMPO_SCENARIO_OUTCOME_EFFECTS = Object.freeze({
  normal: Object.freeze({
    'viagem-completa': scene([track('road-dust', 0, null, 0.16), track('running-lights'), track('exhaust', 0, 4000, 0.4), track('brake-lights', 10500, 18000)]),
    'parada-tecnica': scene([track('road-dust', 0, null, 0.2), track('running-lights'), track('brake-lights', 4500, 10200), track('hazard-lights', 10000)]),
  }),
  obstacle: Object.freeze({
    'parada-segura': scene([track('sensor-warning', 3000), track('brake-lights', 3000, 7500), track('hazard-lights', 6000), track('road-dust', 0, 6000, 0.15)]),
    'toque-leve': scene([track('sensor-warning', 3000), track('brake-lights', 3000, 6500), track('impact-dust', 5200, 7200, 0.4, 50), track('hazard-lights', 5200)]),
  }),
  inclination: Object.freeze({
    estabiliza: scene([track('shoulder-dust', 0, 8200, 0.35), track('cargo-strain', 0, 8200), track('hazard-lights', 0, 8200), track('running-lights', 8200)]),
    'quase-tomba': scene([track('shoulder-dust', 0, null, 0.5), track('cargo-strain'), track('cargo-shift', 4200, 9800), track('hazard-lights')]),
  }),
  'rough-road': Object.freeze({
    'reduz-e-atravessa': scene([track('road-dust', 0, null, 0.7), track('gravel', 0, 11500), track('exhaust', 0, null, 0.12), track('brake-lights', 2400, 4600)], 'gravel'),
    'parada-inspecao': scene([track('road-dust', 0, 7500, 0.8), track('gravel', 0, 7500), track('impact-dust', 2900, 4400, 0.5, 40), track('brake-lights', 4300, 7500), track('hazard-lights', 7200)], 'gravel'),
  }),
  'hard-braking': Object.freeze({
    'obstaculo-na-pista': scene([track('sensor-warning', 2500), track('tire-smoke', 2500, 8300), track('skid-marks', 2500), track('brake-lights', 2500, 9000), track('hazard-lights', 8500)]),
    derrapagem: scene([track('tire-smoke', 3000, 7600), track('skid-marks', 3000), track('gravel', 3000, 7500), track('brake-lights', 3000, 8000), track('hazard-lights', 7500)], 'gravel'),
  }),
  'steep-climb': Object.freeze({
    'vence-a-rampa': scene([track('exhaust', 0, null, 0.75), track('road-dust', 0, null, 0.25), track('running-lights')]),
    'perda-de-tracao': scene([track('exhaust', 0, 9600, 0.8), track('gravel', 4800, 7000), track('road-dust', 4800, 7000, 0.8), track('brake-lights', 6200, 7800), track('reverse-lights', 7800), track('hazard-lights', 6200)], 'gravel'),
  }),
  'steep-descent': Object.freeze({
    'desce-controlado': scene([track('brake-glow', 2200, 13500, 0.3, 3000), track('brake-lights', 2200, 13500), track('running-lights')]),
    'freio-aquece': scene([track('brake-glow', 3000, 19000, 0.85, 3000), track('brake-smoke', 5200, null, 0.55), track('brake-lights', 2400, 19000), track('hazard-lights', 19000)]),
  }),
  'yard-maneuver': Object.freeze({
    'encosta-na-doca': scene([track('maneuver-guides'), track('sensor-warning', 4600), track('brake-lights', 6800, 8200), track('brake-lights', 10800), track('road-dust', 0, null, 0.12)], 'asphalt', 'yard'),
    'toque-no-portao': scene([track('maneuver-guides'), track('sensor-warning', 3200), track('impact-dust', 5400, 7200, 0.3, 60), track('reverse-lights', 7400), track('brake-lights', 5400, 7400), track('hazard-lights', 5400)], 'asphalt', 'yard'),
  }),
  'shifted-load': Object.freeze({
    reacomoda: scene([track('cargo-strain', 800), track('cargo-shift', 1200, 11500, 1, 1200), track('hazard-lights'), track('brake-lights', 1500, 3200)]),
    'tomba-parado': scene([track('cargo-strain', 800), track('cargo-shift', 1200, null, 1, 3000), track('hazard-lights', 2500), track('impact-dust', 7100, 11000, 0.8, 60), track('debris', 7100, null, 1, 0)]),
  }),
  'hot-weather': Object.freeze({
    'pausa-preventiva': scene([track('heat-haze'), track('exhaust', 0, null, 0.15), track('brake-lights', 7200, 13000), track('hazard-lights', 12500)]),
    superaquecimento: scene([track('heat-haze'), track('engine-steam', 6200, null, 1, 2500), track('hazard-lights', 7500), track('brake-lights', 7500, 10000)]),
  }),
  rollover: Object.freeze({
    recuperacao: scene([track('shoulder-dust', 2300, 7200, 0.8), track('hazard-lights', 4500, 11000), track('running-lights')]),
    'parada-no-acostamento': scene([track('shoulder-dust', 2500, 9500, 0.7), track('brake-lights', 4200, 9000), track('hazard-lights', 5200)]),
  }),
  'tire-blowout': Object.freeze({
    'saida-de-pista': scene([track('tire-damage', 2900, null, 1, 100), track('rubber-shards', 2980, null, 1, 0), track('blowout-dust', 2980, 5400, 1, 25), track('tire-smoke', 3200, 7000, 0.7), track('skid-marks', 3050), track('shoulder-dust', 5800, 10500, 0.9), track('hazard-lights', 4600)]),
    tombamento: scene([track('tire-damage', 2900, null, 1, 100), track('rubber-shards', 2980, null, 1, 0), track('blowout-dust', 2980, 5400, 1, 25), track('tire-smoke', 3200, 6200, 0.8), track('skid-marks', 3050), track('impact-dust', 7000, 11200, 1, 40), track('debris', 7000, null, 1, 0), track('hazard-lights', 8000)]),
  }),
  'animal-crossing': Object.freeze({
    desvio: scene([track('animal', 0, 13000), track('brake-lights', 2500, 6200), track('tire-smoke', 2600, 6000, 0.5), track('skid-marks', 2600)], 'asphalt', 'road', 2.8),
    colisao: scene([track('animal', 0, null), track('brake-lights', 3200), track('tire-smoke', 3200, 6500, 0.6), track('skid-marks', 3200), track('impact-dust', 6500, 9900, 1, 30), track('debris', 6500, null, 1, 0), track('hazard-lights', 6500)], 'asphalt', 'road', 2.8),
  }),
  aquaplaning: Object.freeze({
    'saida-de-pista': scene([track('wheel-spray', 0, 9500), track('rain'), track('hazard-lights', 2600), track('mud-spray', 7200, 11500, 0.6)], 'wet'),
    'parada-preventiva': scene([track('wheel-spray', 0, 11500), track('rain'), track('running-lights'), track('brake-lights', 5000, 11500), track('hazard-lights', 10500)], 'wet'),
  }),
  'brake-failure': Object.freeze({
    'area-de-escape': scene([track('brake-smoke', 3800, 13000, 1, 3000), track('brake-glow', 3800, 13500, 1, 4000), track('brake-lights', 0, 12500), track('hazard-lights', 8000), track('gravel', 12800, 15800), track('shoulder-dust', 12500, 15800, 0.9)]),
    colisao: scene([track('brake-smoke', 3800, null, 1, 3000), track('brake-glow', 3800, null, 1, 4000), track('brake-lights'), track('hazard-lights', 8000), track('impact-dust', 13100, 17000, 1, 30), track('debris', 13100, null, 1, 0)]),
  }),
  'engine-fire': Object.freeze({
    'fogo-contido': scene([track('engine-smoke', 1400, 10800, 1, 4000), track('exhaust', 4400, 7400, 0.8, 700), track('brake-lights', 5000, 7600), track('engine-fire', 7400, 9300, 1, 1800), track('hazard-lights', 4600), track('engine-steam', 8800, null, 0.35, 2000)]),
    'fogo-alastra': scene([track('engine-smoke', 1400, null, 1, 3800), track('engine-steam', 1400, 8200, 0.6, 1200), track('exhaust', 4600, 9000, 0.85, 700), track('brake-lights', 5600, 9400), track('engine-fire', 8600, null, 1, 2200), track('hazard-lights', 4400)]),
  }),
  'tight-reverse': Object.freeze({
    'toque-na-doca': scene([track('reverse-lights', 800), track('maneuver-guides'), track('shoulder-dust', 5200, 7000, 0.45, 60), track('brake-lights', 5200), track('hazard-lights', 5200)], 'asphalt', 'yard'),
    'reinicia-manobra': scene([track('reverse-lights', 800, 5600), track('reverse-lights', 9400), track('maneuver-guides'), track('brake-lights', 4800, 5600), track('brake-lights', 8800, 9400), track('brake-lights', 12800)], 'asphalt', 'yard'),
  }),
  'bogged-down': Object.freeze({
    desatola: scene([track('mud-spray', 2200, 9500), track('mud-ruts', 2200), track('rain', 0, null, 0.2), track('hazard-lights', 4800, 9000), track('reverse-lights', 5600, 7800)], 'mud'),
    'afunda-mais': scene([track('mud-spray', 2200, 11500), track('mud-ruts', 2200), track('rain', 0, null, 0.2), track('hazard-lights', 5000), track('cargo-strain', 9400), track('reverse-lights', 8400, 10400)], 'mud'),
  }),
  'driver-drowsiness': Object.freeze({
    'saida-de-pista': scene([track('running-lights'), track('shoulder-dust', 7400, 12000, 0.9), track('brake-lights', 9500, 12000), track('hazard-lights', 10500)]),
    'parada-descanso': scene([track('running-lights'), track('brake-lights', 5500, 12500), track('shoulder-dust', 9000, 12500, 0.4), track('hazard-lights', 9500)]),
  }),
  'fast-corner': Object.freeze({
    tombamento: scene([track('tire-smoke', 2000, 5400, 0.8), track('skid-marks', 2800), track('impact-dust', 5400, 9500, 1, 40), track('debris', 5400, null, 1, 0), track('hazard-lights', 5400)]),
    'saida-de-frente': scene([track('tire-smoke', 2400, 5200, 0.7), track('skid-marks', 3000), track('shoulder-dust', 4800, 10000, 0.9), track('gravel', 5000, 10000), track('brake-lights', 4800, 10000), track('hazard-lights', 9000)]),
  }),
});

export function getSompoScenarioEffects(scenarioId, elapsedMs = 0, outcomeId) {
  const variants = Object.hasOwn(SOMPO_SCENARIO_OUTCOME_EFFECTS, scenarioId)
    ? SOMPO_SCENARIO_OUTCOME_EFFECTS[scenarioId] : null;
  const definition = typeof outcomeId === 'string' && variants && Object.hasOwn(variants, outcomeId)
    ? variants[outcomeId]
    : Object.hasOwn(SOMPO_SCENARIO_EFFECTS, scenarioId)
      ? SOMPO_SCENARIO_EFFECTS[scenarioId] : SOMPO_SCENARIO_EFFECTS.normal;
  const atMs = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  // O foco lateral no animal recua junto com o fim da trilha "animal" da cena.
  const animalTrack = definition.focusX ? definition.tracks.find((item) => item.effect === 'animal') : null;
  const focusX = animalTrack && animalTrack.endMs !== null
    ? definition.focusX * Math.max(0, Math.min(1, (animalTrack.endMs - atMs) / 3000))
    : definition.focusX;
  return {
    surface: definition.surface,
    setting: definition.setting,
    focusX,
    cues: definition.tracks.filter((cue) => atMs >= cue.startMs && (cue.endMs === null || atMs < cue.endMs)).map((cue) => {
      const ageMs = atMs - cue.startMs;
      const attack = cue.attackMs ? Math.min(1, ageMs / cue.attackMs) : 1;
      const release = cue.endMs === null ? 1 : Math.min(1, (cue.endMs - atMs) / 700);
      return { ...cue, ageMs, intensity: cue.strength * attack * release };
    }),
  };
}

/** Metres, +X along the road and +Z across it. After clearing the shoulder the
 * Nelore turns into the pasture, away from the inspection camera, then exits.
 * This only controls staging; the telemetric script and snapshot remain intact. */
export function getSompoAnimalPose(animalZ, elapsedMs = 0, visibleUntilMs = 13000) {
  const atMs = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const z = Number.isFinite(animalZ) ? animalZ : -6;
  const departure = Math.max(0, Math.min(1, (z - 2.8) / 4.2));
  return {
    x: 7 + 18 * departure * departure,
    z,
    yaw: -Math.atan2(1, 36 * departure / 4.2),
    visible: atMs < (Number.isFinite(visibleUntilMs) ? visibleUntilMs : Infinity),
    length: 2.35,
    height: 1.65,
    width: 0.95,
  };
}
