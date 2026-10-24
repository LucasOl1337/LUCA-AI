import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import * as THREE from 'three';

const result = await build({entryPoints:[new URL('../src/components/sompo/createSompoFieldFence.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'three-singleton',setup(b){b.onResolve({filter:/^three$/},a=>({path:import.meta.resolve(a.path),external:true}));}}]});
const {createSompoFieldFence, mouroesDaCerca, CERCA_FIOS_M}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);

test('mourões fecham o quadrado, um por vão, sem repetir canto', () => {
  const pontos = mouroesDaCerca(92.6);
  assert.equal(pontos.length, 4 * 62);
  assert.equal(new Set(pontos.map((p) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`)).size, pontos.length);
  assert.equal(pontos.filter((p) => p.canto).length, 4);
  for (const p of pontos) assert.ok(Math.abs(Math.max(Math.abs(p.x), Math.abs(p.z)) - 92.6) < 1e-9);
  for (let i = 0; i < pontos.length; i++) {
    const q = pontos[(i + 1) % pontos.length];
    assert.ok(Math.abs(Math.hypot(q.x - pontos[i].x, q.z - pontos[i].z) - 2 * 92.6 / 62) < 1e-9);
  }
});

test('cerca fica fora do limite do trator e de tudo que o circuito usa', () => {
  // TRATOR.cercaM = 90; a rota do circuito vai até x 78 e as estacas até |z| 19.
  for (const p of mouroesDaCerca(92.6)) assert.ok(Math.max(Math.abs(p.x), Math.abs(p.z)) > 90);
});

test('mourões e fios seguem o relevo, 2 draw calls, dispose solta tudo', () => {
  const parent = new THREE.Group();
  const ground = (x, z) => 0.05 * x - 0.02 * z;
  const cerca = createSompoFieldFence(parent, 10, ground);
  const [mouroes, fios] = cerca.root.children;
  assert.equal(cerca.root.children.length, 2);
  assert.ok(mouroes.isInstancedMesh && fios.isInstancedMesh);
  assert.equal(fios.count, mouroes.count * CERCA_FIOS_M.length);
  const m = new THREE.Matrix4(), pos = new THREE.Vector3();
  for (let i = 0; i < mouroes.count; i++) {
    mouroes.getMatrixAt(i, m); pos.setFromMatrixPosition(m);
    assert.ok(Math.abs(pos.y - ground(pos.x, pos.z)) < 1e-5);
  }
  // Fio i liga o mourão i ao seguinte, na altura do fio.
  fios.getMatrixAt(0, m); pos.setFromMatrixPosition(m);
  mouroes.getMatrixAt(0, m); const base = new THREE.Vector3().setFromMatrixPosition(m);
  assert.ok(Math.abs(pos.y - (base.y + CERCA_FIOS_M[0])) < 1e-5);
  let soltos = 0;
  for (const obj of [mouroes, fios]) { obj.geometry.addEventListener('dispose', () => soltos++); obj.material.addEventListener('dispose', () => soltos++); }
  cerca.dispose();
  assert.equal(parent.children.length, 0);
  assert.equal(soltos, 4);
});
