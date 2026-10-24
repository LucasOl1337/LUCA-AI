import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as THREE from 'three';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

async function carregar(entry) {
  const out = await esbuild.build({
    entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', write: false,
    plugins: [{ name: 'three-singleton', setup(b) { b.onResolve({ filter: /^three(\/.*)?$/ }, (a) => ({ path: import.meta.resolve(a.path), external: true })); } }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
}

const { createUltrasonicBeam } = await carregar('src/components/sompo/createSompoUltrasonicBeam.ts');
const { TRATOR, distanciaSensorM } = await carregar('src/components/gameplay/fisicaTrator.ts');

const bbox = (obj) => { obj.updateMatrixWorld(true); return new THREE.Box3().setFromObject(obj); };

test('gameplay: o feixe desenha o corredor que o sensor mede (largura da bitola, alcance lido)', () => {
  const meia = TRATOR.bitolaM / 2;
  const feixe = createUltrasonicBeam([2.2461, .7363, 0], meia);
  assert.equal(feixe.corredor, true);
  const area = feixe.group.getObjectByName('ultrasonic-corridor');
  assert.ok(area, 'faixa do corredor');
  assert.equal(feixe.group.getObjectByName('ultrasonic-cone'), undefined);
  feixe.update(250, false, 0);
  const caixa = bbox(area);
  assert.ok(Math.abs((caixa.max.z - caixa.min.z) - TRATOR.bitolaM) < 1e-6, 'largura = bitola');
  assert.ok(Math.abs((caixa.max.x - caixa.min.x) - 2.5) < 1e-6, 'comprimento = leitura');
  // As bordas correm paralelas na meia bitola, sem abrir.
  for (const nome of ['ultrasonic-ray-left', 'ultrasonic-ray-right']) {
    const p = feixe.group.getObjectByName(nome).geometry.attributes.position;
    assert.equal(p.getZ(0), p.getZ(1));
    assert.ok(Math.abs(Math.abs(p.getZ(0)) - meia) < 1e-6); // float32
  }
});

test('gameplay: um fardo na borda do corredor que acende o alerta fica dentro do feixe desenhado', () => {
  const meia = TRATOR.bitolaM / 2;
  const estado = { x: 0, z: 0, rumo: 0 };
  // Fardo 1,3 m ao lado do eixo e 1,2 m à frente: o caso da sonda que antes não avisava.
  const fardo = { x: TRATOR.sensorFrenteM + 1.2 + .72, z: 1.3, raioM: .72 };
  const d = distanciaSensorM(estado, [fardo], meia);
  assert.ok(Number.isFinite(d) && d * 100 <= 150, `alerta (${d})`);
  const feixe = createUltrasonicBeam([0, 0, 0], meia);
  feixe.update(d * 100, true, 0);
  const caixa = bbox(feixe.group.getObjectByName('ultrasonic-corridor'));
  // O ponto mais próximo do fardo no lado do trator cai dentro da faixa.
  const zBorda = fardo.z - fardo.raioM;
  assert.ok(zBorda <= caixa.max.z && zBorda >= caixa.min.z, `borda do fardo ${zBorda} dentro de ±${caixa.max.z}`);
  // No cone de 30° antigo, à mesma distância, a meia largura era bem menor que essa borda.
  assert.ok(Math.tan(THREE.MathUtils.degToRad(15)) * d < zBorda);
  // Alerta pinta a faixa de vermelho.
  assert.equal(feixe.group.getObjectByName('ultrasonic-corridor').material.color.getHex(), 0xff5d52);
});

test('vitrine sem largura mantém o cone de 30° do HC-SR04', () => {
  const feixe = createUltrasonicBeam([0, 0, 0]);
  assert.equal(feixe.corredor, false);
  assert.ok(feixe.group.getObjectByName('ultrasonic-cone'));
  feixe.update(400, false, 0, true);
  assert.equal(feixe.group.getObjectByName('ultrasonic-cone').material.color.getHex(), 0xc9ad74);
});
