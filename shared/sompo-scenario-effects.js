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
  'rough-road': scene([track('road-dust', 0, null, 0.8), track('gravel')], 'gravel'),
  'hard-braking': scene([track('tire-smoke', 3000, 5600), track('skid-marks', 3000), track('brake-lights', 3000)]),
  'steep-climb': scene([track('exhaust', 0, null, 0.5), track('road-dust', 0, null, 0.2), track('running-lights')]),
  'steep-descent': scene([track('brake-glow', 1800, null, 0.35, 3000), track('brake-lights'), track('brake-smoke', 5000, null, 0.18)]),
  'yard-maneuver': scene([track('reverse-lights'), track('maneuver-guides'), track('road-dust', 0, null, 0.15)], 'asphalt', 'yard'),
  'shifted-load': scene([track('cargo-strain', 1000), track('cargo-shift', 1800), track('hazard-lights', 1800)]),
  'hot-weather': scene([track('heat-haze'), track('engine-steam', 3000, null, 0.25, 3000)]),
  rollover: scene([track('shoulder-dust', 2400, 7800), track('impact-dust', 7100, 11100, 1, 40), track('debris', 7100, null, 1, 0), track('hazard-lights', 7100)]),
  'tire-blowout': scene([track('tire-damage', 2800, null, 1, 120), track('rubber-shards', 2800, null, 1, 0), track('blowout-dust', 2800, 5100, 1, 25), track('skid-marks', 2900), track('hazard-lights', 3000)]),
  'animal-crossing': scene([track('animal'), track('brake-lights', 2200), track('tire-smoke', 3000, 4900, 0.35)], 'asphalt', 'road', 2.8),
  aquaplaning: scene([track('wheel-spray'), track('rain'), track('running-lights'), track('hazard-lights', 3000, 11000)], 'wet'),
  'brake-failure': scene([track('brake-smoke', 3800, null, 1, 3000), track('brake-glow', 3800, null, 1, 4000), track('brake-lights'), track('hazard-lights', 6000)]),
  'engine-fire': scene([track('engine-smoke', 1800, null, 1, 5000), track('engine-fire', 4300, null, 1, 2300), track('hazard-lights', 4300)]),
  'tight-reverse': scene([track('reverse-lights', 0, 12000), track('maneuver-guides'), track('brake-lights', 10000)], 'asphalt', 'yard'),
  'bogged-down': scene([track('mud-spray', 1400, 13000), track('mud-ruts', 1400), track('rain', 0, null, 0.2), track('hazard-lights', 7000)], 'mud'),
  'driver-drowsiness': scene([track('running-lights'), track('shoulder-dust', 7500, 10500, 0.6), track('hazard-lights', 10500)]),
  'fast-corner': scene([track('tire-smoke', 1600, 9000, 0.6), track('skid-marks', 1600), track('brake-lights', 5000)]),
  'colisao-roteirizada': scene([track('running-lights', 0, 14000), track('impact-dust', 14000, 18500, 1, 20), track('debris', 14000, null, 1, 0), track('hazard-lights', 14000), track('brake-lights', 14000)]),
});

export function getSompoScenarioEffects(scenarioId, elapsedMs = 0) {
  const definition = Object.hasOwn(SOMPO_SCENARIO_EFFECTS, scenarioId)
    ? SOMPO_SCENARIO_EFFECTS[scenarioId] : SOMPO_SCENARIO_EFFECTS.normal;
  const atMs = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  return {
    surface: definition.surface,
    setting: definition.setting,
    focusX: definition.focusX,
    cues: definition.tracks.filter((cue) => atMs >= cue.startMs && (cue.endMs === null || atMs < cue.endMs)).map((cue) => {
      const ageMs = atMs - cue.startMs;
      const attack = cue.attackMs ? Math.min(1, ageMs / cue.attackMs) : 1;
      const release = cue.endMs === null ? 1 : Math.min(1, (cue.endMs - atMs) / 700);
      return { ...cue, ageMs, intensity: cue.strength * attack * release };
    }),
  };
}
