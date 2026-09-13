import assert from 'node:assert/strict';
import test from 'node:test';
import { Vector3 } from 'three';
import { createSompoCropRows } from '../../src/components/sompo/createSompoCropRows.ts';

test('plantio da operação: corte cronológico nas duas direções e cobertura das três passadas', () => {
  const crop = createSompoCropRows(() => 0, true, 1, true);
  try {
    const first = crop.root.children[0];
    // Primeiro pé em (-80,-50); a plataforma fica 4,28 m à frente, conforme o modelo existente.
    for (const [x, yaw] of [[-84.28, 0], [-75.72, -180]]) {
      crop.setHarvestPath([
        { x, z: -50, yaw, atMs: 500, harvesting: false },
        { x, z: -50, yaw, atMs: 1000, harvesting: true },
        { x, z: -50, yaw, atMs: 2000, harvesting: true },
      ]);
      assert.equal(first.geometry.getAttribute('harvestAt').getX(0), 1);
      assert.equal(crop.root.children.at(-1).geometry.getAttribute('harvestAt').getX(0), 1e9);
    }
    crop.update(2000, new Vector3(0, 400, 100), false);
    assert.equal(crop.root.children.every(mesh => mesh.visible), true, 'visão geral mantém plantio visível');
    const zs = crop.root.children.flatMap(mesh => Array.from({ length: mesh.count }, (_, i) => mesh.instanceMatrix.array[i * 16 + 14]));
    assert.ok(Math.min(...zs) < -45 && Math.max(...zs) > 40);
  } finally {
    for (const mesh of crop.root.children) mesh.geometry.dispose();
    crop.dispose();
  }
});
