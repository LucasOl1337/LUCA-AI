import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import * as THREE from 'three';

async function compiled(file) {
  const result = await build({ entryPoints: [new URL(file, import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm',
    plugins: [{ name: 'shared-three', setup(b) { b.onResolve({ filter: /^three(?:\/.*)?$/ }, args => ({ path: import.meta.resolve(args.path), external: true })); } }] });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
}

test('roadside furniture stays off the carriageway, recycles with travel and clears the crossing animal', async () => {
  const { createSompoRoadsideLife } = await compiled('../src/components/sompo/createSompoRoadsideLife.ts');
  const root = new THREE.Group();
  const life = createSompoRoadsideLife(root, new THREE.MeshStandardMaterial());
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3();
  const instanced = () => { const list = []; root.traverse(node => { if (node.isInstancedMesh) list.push(node); }); return list; };
  try {
    for (const truckX of [0, 333, 2000, -700]) {
      life.update(truckX, new THREE.Vector3(truckX, 0, 0), 1, null);
      let furniture = 0;
      for (const mesh of instanced()) {
        for (let i = 0; i < mesh.count; i++) {
          mesh.getMatrixAt(i, matrix); position.setFromMatrixPosition(matrix);
          assert.ok(Number.isFinite(position.x + position.y + position.z), `${mesh.name} non-finite`);
          assert.ok(Math.abs(position.x - truckX) <= 240.001, `${mesh.name} outside the wrapping period`);
          // Only the centre-line studs may sit on the paved lanes.
          if (mesh.name !== 'road-center-studs') assert.ok(position.z > 3.4 || position.z < -7.5, `${mesh.name} on the highway at z=${position.z}`);
          if (/sign|delineator/.test(mesh.name)) furniture++;
        }
      }
      assert.ok(furniture > 4, 'signs and delineators are placed');
    }
    // Animal crossing window: nothing of the roadside furniture remains inside it.
    const clear = [95, 130];
    for (const truckX of [100, 118]) {
      life.update(truckX, new THREE.Vector3(truckX, 0, 0), 1, clear);
      for (const mesh of instanced()) if (/sign|delineator/.test(mesh.name)) for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix); position.setFromMatrixPosition(matrix);
        assert.ok(position.x <= clear[0] || position.x >= clear[1], `${mesh.name} left in the animal path at ${position.x}`);
      }
    }
    // Truck invades the far fence: posts beside it fall to the ground.
    life.update(50, new THREE.Vector3(50, 0, -9.5), 1, null);
    const posts = root.getObjectByName('roadside-fence-posts');
    let fallen = 0;
    for (let i = 0; i < posts.count; i++) { posts.getMatrixAt(i, matrix); position.setFromMatrixPosition(matrix); if (position.y < 0.2 && Math.abs(position.x - 50) < 6) fallen++; }
    assert.ok(fallen >= 1, 'fence posts beside the truck fall when it crosses the far fence');
  } finally {
    life.dispose();
  }
});
