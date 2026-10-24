import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import * as THREE from 'three';

const result = await build({entryPoints:[new URL('../src/components/sompo/createSompoTireTracks.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'three-singleton',setup(b){b.onResolve({filter:/^three$/},a=>({path:import.meta.resolve(a.path),external:true}));}}]});
const {createSompoTireTracks, RASTRO_MARCAS, RASTRO_PASSO_M, RASTRO_MEIA_BITOLA, RASTRO_EIXO_X, RASTRO_GLSL, RASTRO_ALTURA_M}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);

function trator(parent) { const m = new THREE.Group(); m.rotation.order = 'YZX'; parent.add(m); return m; }
const ground = (x, z) => 0.03 * x + 0.01 * z;

test('andando reto em +x, duas trilhas na bitola traseira, uma marca por passo, no relevo', () => {
  const root = new THREE.Group(); const m = trator(root);
  const rastro = createSompoTireTracks(root, ground);
  for (let x = 0; x <= 10.0001; x += 0.1) { m.position.set(x, 0, 0); rastro.update(m); }
  const esperado = 2 * Math.floor(10 / RASTRO_PASSO_M + 1e-6);
  assert.ok(Math.abs(rastro.marcas - esperado) <= 2, `${rastro.marcas} ~ ${esperado}`);
  const mat = new THREE.Matrix4(), p = new THREE.Vector3(), lados = new Set();
  for (let i = 0; i < rastro.marcas; i++) {
    rastro.mesh.getMatrixAt(i, mat); p.setFromMatrixPosition(mat);
    assert.ok(Math.abs(Math.abs(p.z) - RASTRO_MEIA_BITOLA) < 1e-4, `z ${p.z}`);
    assert.ok(Math.abs(p.y - (ground(p.x, p.z) + RASTRO_ALTURA_M)) < 1e-4);
    assert.ok(p.x >= RASTRO_EIXO_X - 1e-6 && p.x <= 10 + RASTRO_EIXO_X + 1e-6);
    lados.add(Math.sign(p.z));
  }
  assert.equal(lados.size, 2);
  // Eixo longo da marca segue o rumo (+x): o z local vira o x do mundo.
  rastro.mesh.getMatrixAt(0, mat); const eixo = new THREE.Vector3(0, 0, 1).transformDirection(mat);
  assert.ok(Math.abs(Math.abs(eixo.x) - 1) < 1e-6);
});

test('parado não carimba; o anel recicla sem passar do limite; salto (recomeço) limpa', () => {
  const root = new THREE.Group(); const m = trator(root);
  const rastro = createSompoTireTracks(root, () => 0);
  for (let i = 0; i < 50; i++) rastro.update(m);
  assert.equal(rastro.marcas, 0);
  for (let x = 0; x < 200; x += 0.2) { m.position.set(x, 0, 0); rastro.update(m); }
  assert.equal(rastro.marcas, RASTRO_MARCAS);
  m.position.set(-12, 0, 0); rastro.update(m);
  assert.equal(rastro.marcas, 0);
  m.position.set(-11, 0, 0); rastro.update(m);
  assert.equal(rastro.marcas, 2 * Math.floor(1 / RASTRO_PASSO_M), 'retoma da nova posição sem riscar o salto');
});

test('quadro lento (passo grande) preenche o caminho sem buraco; só visual e 1 draw call', () => {
  const root = new THREE.Group(); const m = trator(root);
  const rastro = createSompoTireTracks(root, () => 0);
  m.position.set(0, 0, 0); rastro.update(m);
  m.position.set(2, 0, 0); rastro.update(m);
  assert.equal(rastro.marcas, 2 * Math.floor(2 / RASTRO_PASSO_M));
  assert.equal(root.children.filter((c) => c.isInstancedMesh).length, 1);
  assert.equal(rastro.mesh.material.depthWrite, false);
  assert.equal(rastro.mesh.castShadow, false);
  const shader = {uniforms:{}, vertexShader:THREE.ShaderLib.basic.vertexShader, fragmentShader:THREE.ShaderLib.basic.fragmentShader};
  rastro.mesh.material.onBeforeCompile(shader, {});
  assert.ok(shader.fragmentShader.includes(RASTRO_GLSL));
  assert.match(shader.vertexShader, /trackUv = uv;/);
  let soltos = 0;
  rastro.mesh.geometry.addEventListener('dispose', () => soltos++); rastro.mesh.material.addEventListener('dispose', () => soltos++);
  rastro.dispose();
  assert.equal(soltos, 2);
  assert.equal(root.children.includes(rastro.mesh), false);
});
