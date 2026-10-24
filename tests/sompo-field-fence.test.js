import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import * as THREE from 'three';

const result = await build({entryPoints:[new URL('../src/components/sompo/createSompoFieldFence.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'three-singleton',setup(b){b.onResolve({filter:/^three(\/.*)?$/},a=>({path:import.meta.resolve(a.path),external:true}));}}]});
const {createSompoFieldFence, mouroesDaCerca, porteirasDaCerca, CERCA_FIOS_M, CERCA_VAO_M, PORTEIRA_VAO_M, CARREADOR_GRADE_M, CARREADOR_FASE}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);

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
  // O fio de comprimento 1 (eixo +x local) termina no mourão seguinte.
  mouroes.getMatrixAt(1, m); const prox = new THREE.Vector3().setFromMatrixPosition(m);
  fios.getMatrixAt(0, m); const ponta = new THREE.Vector3(1, 0, 0).applyMatrix4(m);
  assert.ok(Math.abs(ponta.x - prox.x) < 1e-4 && Math.abs(ponta.z - prox.z) < 1e-4 && Math.abs(ponta.y - (prox.y + CERCA_FIOS_M[0])) < 1e-4);
  const bb = fios.geometry.boundingBox ?? (fios.geometry.computeBoundingBox(), fios.geometry.boundingBox);
  assert.ok(Math.abs(bb.min.x) < 1e-6 && Math.abs(bb.max.x - 1) < 1e-6 && bb.max.y - bb.min.y < 0.03);
  // Orçamento: cerca real (248 mourões) abaixo de 12k triângulos por passada.
  const tri = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;
  const real = mouroesDaCerca(92.6).length;
  assert.ok(real * (tri(mouroes.geometry) + CERCA_FIOS_M.length * tri(fios.geometry)) < 12000);
  let soltos = 0;
  for (const obj of [mouroes, fios]) { obj.geometry.addEventListener('dispose', () => soltos++); obj.material.addEventListener('dispose', () => soltos++); }
  cerca.dispose();
  assert.equal(parent.children.length, 0);
  assert.equal(soltos, 4);
});

test('porteiras onde os carreadores do shader cruzam a cerca: sem mourão nem fio no vão', () => {
  const meio = 92.6;
  const portas = porteirasDaCerca(meio);
  assert.equal(portas.length, 16);
  for (const p of portas) {
    // Centro numa linha de carreador da grade 46×38 do shader e sobre a cerca.
    const v = p.lado === 'z' ? p.x : p.z, [grade, fase] = p.lado === 'z' ? [CARREADOR_GRADE_M[0], CARREADOR_FASE[0]] : [CARREADOR_GRADE_M[1], CARREADOR_FASE[1]];
    assert.ok(Math.abs(((v / grade + fase) % 1 + 1) % 1) < 1e-9 || Math.abs(((v / grade + fase) % 1 + 1) % 1 - 1) < 1e-9);
    assert.equal(Math.abs(p.lado === 'z' ? p.z : p.x), meio);
    assert.ok(Math.abs(v) < meio - 3, 'longe do canto');
  }
  const parent = new THREE.Group();
  const cerca = createSompoFieldFence(parent, meio, () => 0);
  const [mouroes, fios, porteiras] = cerca.root.children;
  assert.equal(porteiras.name, 'cerca-porteiras');
  assert.equal(porteiras.count, 16);
  const m = new THREE.Matrix4(), a = new THREE.Vector3();
  for (let i = 0; i < mouroes.count; i++) {
    mouroes.getMatrixAt(i, m); a.setFromMatrixPosition(m);
    for (const p of portas) {
      const ao = p.lado === 'z' ? Math.abs(a.x - p.x) : Math.abs(a.z - p.z), fora = p.lado === 'z' ? Math.abs(a.z - p.z) : Math.abs(a.x - p.x);
      assert.ok(!(fora < 0.01 && ao < PORTEIRA_VAO_M / 2), `mourão no vão ${a.x},${a.z}`);
    }
  }
  // Nenhum fio maior que um vão comum: o arame não atravessa a porteira.
  for (let i = 0; i < fios.count; i++) {
    fios.getMatrixAt(i, m); const s = new THREE.Vector3(); m.decompose(new THREE.Vector3(), new THREE.Quaternion(), s);
    assert.ok(s.x <= CERCA_VAO_M * 1.5, `fio de ${s.x} m`);
  }
  assert.equal(fios.count % CERCA_FIOS_M.length, 0);
  // Porteira fica alinhada ao lado da cerca.
  porteiras.getMatrixAt(portas.findIndex((p) => p.lado === 'x'), m);
  const eixo = new THREE.Vector3(1, 0, 0).transformDirection(m);
  assert.ok(Math.abs(Math.abs(eixo.z) - 1) < 1e-6);
  let soltos = 0;
  porteiras.geometry.addEventListener('dispose', () => soltos++);
  cerca.dispose();
  assert.equal(soltos, 1);
});
