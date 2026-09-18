import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

test('highway carriageway and shoulders stay flat throughout travel and terrain wrapping', async () => {
  const result = await build({
    entryPoints: [new URL('../src/components/sompo/createSompoTerrain.ts', import.meta.url).pathname],
    bundle: true, write: false, format: 'esm', platform: 'node',
  });
  const { sompoTerrainHeight, SOMPO_TERRAIN_PERIOD_X } = await import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`
  );
  // Pista: z=-6.15..2.05; acostamentos: z=-7.57..3.47.
  // A elevação do campo não pode invadir a superfície de circulação.
  for (const origin of [-2000, -160, 0, 160, 2000]) {
    for (let x = origin; x <= origin + SOMPO_TERRAIN_PERIOD_X; x += 2) {
      for (let z = -7.57; z <= 3.47; z += 0.25) {
        assert.equal(sompoTerrainHeight(x, z), 0, `terrain intrudes on highway at ${x},${z}`);
      }
    }
  }
});
