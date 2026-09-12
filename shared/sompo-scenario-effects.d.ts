import type { SompoSimulationScenarioId } from './sompo-telemetry-simulator.js';
export type SompoVisualEffect = 'road-dust' | 'running-lights' | 'hazard-lights' | 'brake-lights' | 'sensor-warning' | 'shoulder-dust' | 'cargo-strain' | 'gravel' | 'tire-smoke' | 'skid-marks' | 'exhaust' | 'brake-glow' | 'brake-smoke' | 'reverse-lights' | 'maneuver-guides' | 'cargo-shift' | 'heat-haze' | 'engine-steam' | 'impact-dust' | 'debris' | 'tire-damage' | 'rubber-shards' | 'blowout-dust' | 'animal' | 'wheel-spray' | 'rain' | 'engine-smoke' | 'engine-fire' | 'mud-spray' | 'mud-ruts';
export interface SompoEffectTrack {
  readonly effect: SompoVisualEffect;
  readonly startMs: number;
  readonly endMs: number | null;
  readonly strength: number;
  readonly attackMs: number;
}
export interface SompoEffectScene {
  readonly surface: 'asphalt' | 'gravel' | 'wet' | 'mud';
  readonly setting: 'road' | 'yard';
  readonly focusX: number;
  readonly tracks: readonly SompoEffectTrack[];
}
export interface SompoEffectCue extends SompoEffectTrack { ageMs: number; intensity: number }
export interface SompoEffectFrame {
  surface: SompoEffectScene['surface'];
  setting: SompoEffectScene['setting'];
  focusX: number;
  cues: SompoEffectCue[];
}
export const SOMPO_SCENARIO_EFFECTS: Readonly<Record<SompoSimulationScenarioId, SompoEffectScene>>;
export const SOMPO_SCENARIO_OUTCOME_EFFECTS: Readonly<Partial<Record<SompoSimulationScenarioId, Readonly<Record<string, SompoEffectScene>>>>>;
export function getSompoScenarioEffects(scenarioId: string, elapsedMs?: number, outcomeId?: string): SompoEffectFrame;
export function getSompoAnimalPose(animalZ: number, elapsedMs?: number, visibleUntilMs?: number | null): {
  x: number; z: number; yaw: number; visible: boolean; length: number; height: number; width: number;
};
