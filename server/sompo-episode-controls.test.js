import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createSompoSimulationSnapshot } from '../shared/sompo-telemetry-simulator.js';

test('episódio preserva os controles congelados no início da gravação', () => {
  const source = readFileSync(new URL('../src/components/SompoTruckSimulator.tsx', import.meta.url), 'utf8');
  assert.match(source, /controls:\s*\{[\s\S]*?\.\.\.controls,[\s\S]*?scenarioId: plan\.scenarioId/);
  assert.equal((source.match(/createSompoSimulationSnapshot\(\s*run\.controls/g) || []).length, 2);
  assert.match(source, /createSompoSimulationSnapshot\(\s*episodeRunRef\.current\.controls/);

  const recorded = createSompoSimulationSnapshot(
    { scenarioId: 'hard-braking', outcomeId: 'sem-impacto', speedKph: 120 },
    { elapsedMs: 6_000, observedAt: '2026-09-13T12:00:06.000Z' },
  );
  const defaulted = createSompoSimulationSnapshot(
    { scenarioId: 'hard-braking', outcomeId: 'sem-impacto' },
    { elapsedMs: 6_000, observedAt: '2026-09-13T12:00:06.000Z' },
  );
  assert.notEqual(recorded.readings.speedKph, defaulted.readings.speedKph);
});
