import { aggregateSompoFleet } from './sompo-fleet.js';
import { createSompoAgriSimulationSnapshot, getSompoAgriEpisodePlan } from './sompo-agri-brief.js';
import { createSompoSimulationSnapshot, getSompoEpisodePlan } from './sompo-telemetry-simulator.js';

export const SOMPO_FLEET_DEMO_LABEL = 'Frota demonstrativa · dados sintéticos';
const MACHINES = [
  { id: 'DEMO-TRATOR', name: 'Trator', scenarioId: 'agri-tractor-rollover', type: 'Inclinação em curva', outcomes: ['side-rollover', 'controlled-stop'] },
  { id: 'DEMO-COLHEITA', name: 'Colheitadeira', scenarioId: 'agri-night-operation', type: 'Visibilidade na colheita', outcomes: ['work-light-failure', 'lit-pass'] },
  { id: 'DEMO-CAMINHAO', name: 'Caminhão', scenarioId: 'shifted-load', type: 'Carga deslocada', outcomes: ['tomba-parado', 'reacomoda'] },
];

/** 30 complete synthetic runs across four months, derived from the actual simulator, never persisted. */
export function buildSompoFleetDemo() {
  const rows = [];
  const episodes = [];
  for (const [machineIndex, machine] of MACHINES.entries()) {
    for (let month = 0; month < 4; month++) {
      for (let run = 0; run < [[4, 3, 2, 1], [1, 2, 3, 4], [2, 3, 3, 2]][machineIndex][month]; run++) {
        const prevented = (month + run + machineIndex) % 3 !== 0;
        const outcomeId = machine.outcomes[Number(prevented)];
        const agri = machine.scenarioId.startsWith('agri-');
        const plan = agri ? getSompoAgriEpisodePlan(machine.scenarioId, outcomeId) : getSompoEpisodePlan(machine.scenarioId, outcomeId);
        if (!plan) throw new Error(`fleet_demo_scenario_missing:${machine.scenarioId}:${outcomeId}`);
        const start = Date.UTC(2026, month, 4 + run * 8 + machineIndex, 10);
        let peak = null, peakOffsetMs = null, firstAlertMs = null;
        for (let elapsedMs = 0; elapsedMs <= plan.totalMs; elapsedMs += plan.sampleIntervalMs) {
          const observedAt = new Date(start + elapsedMs).toISOString();
          const options = { elapsedMs, observedAt, connectedAt: new Date(start).toISOString() };
          const snapshot = agri
            ? createSompoAgriSimulationSnapshot(machine.scenarioId, outcomeId, options)
            : createSompoSimulationSnapshot({ scenarioId: machine.scenarioId, outcomeId }, options);
          const r = snapshot.readings;
          const magnitude = Math.hypot(r.acceleration.x, r.acceleration.y, r.acceleration.z);
          if (peak === null || magnitude > peak) { peak = magnitude; peakOffsetMs = elapsedMs; }
          if (firstAlertMs === null && (snapshot.risks.collision || snapshot.risks.inclination)) firstAlertMs = elapsedMs;
          rows.push({ tractorId: machine.id, sourceKind: 'simulation', observedAt, observedMs: start + elapsedMs, accX: r.acceleration.x, accY: r.acceleration.y, accZ: r.acceleration.z, pitch: r.pitch, roll: r.roll, riscoColisao: snapshot.risks.collision, riscoInclinacao: snapshot.risks.inclination });
        }
        episodes.push({
          id: `${machine.id}-${month + 1}-${run + 1}`, tractorId: machine.id, machineName: machine.name,
          sourceKind: 'simulation', synthetic: true, scenarioId: machine.scenarioId, outcomeId,
          scenarioLabel: plan.scenarioLabel, outcomeLabel: plan.outcomeLabel, eventType: machine.type,
          startedAt: new Date(start).toISOString(), month: new Date(start).toISOString().slice(0, 7),
          durationMs: plan.totalMs, peakAcceleration: peak, peakOffsetMs,
          firstAlertMs, alertDelayMs: firstAlertMs === null ? null : firstAlertMs - peakOffsetMs,
          prevented, preventionBasis: 'Desfecho preventivo escolhido no roteiro; não é efeito causal medido.',
        });
      }
    }
  }
  rows.sort((a, b) => a.tractorId.localeCompare(b.tractorId) || a.observedMs - b.observedMs);
  const machines = aggregateSompoFleet(rows).origins.find(origin => origin.sourceKind === 'simulation').machines;
  return { label: SOMPO_FLEET_DEMO_LABEL, synthetic: true, season: 'Janeiro a abril de 2026', machines, episodes: episodes.sort((a, b) => b.startedAt.localeCompare(a.startedAt)) };
}
