import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { criarCabineMax, extrairAssetCabineMax, MATERIAL_CORPO_MAX } =
  await loadFrontendModule('../../src/components/gameplay/visual/cabineMax.ts');
const { anguloAroRad } = await loadFrontendModule('../../src/components/gameplay/volante.ts');

const root = new URL('../public/models/gameplay/', import.meta.url);
const provenance = JSON.parse(readFileSync(new URL('max-tractor-cabine.provenance.json', root), 'utf8'));
const rig = provenance.rig.steeringWheel;

/** Máquina como o rigSompoAgriAsset entrega: agri-body com a superfície do corpo no material do MAX. */
function maquinaFalsa() {
  const maquina = new THREE.Group();
  const corpo = new THREE.Group(); corpo.name = 'agri-body'; maquina.add(corpo);
  const material = new THREE.MeshStandardMaterial(); material.name = MATERIAL_CORPO_MAX;
  const original = new THREE.BoxGeometry(1, 1, 1);
  const superficie = new THREE.Mesh(original, material); superficie.name = 'agri-body-surface'; corpo.add(superficie);
  return { maquina, corpo, superficie, original };
}

/** Asset sintético: um ponto no topo do aro (direção "para a frente e para cima" no plano do volante). */
function assetFalso() {
  const n = new THREE.Vector3(...rig.axis).normalize();
  const topo = new THREE.Vector3(0, 0, 1).cross(n).normalize().negate(); // u = w × n invertido: para a frente e para cima
  const centro = new THREE.Vector3(...rig.center);
  const ponto = centro.clone().addScaledVector(topo, rig.rimRadius);
  const volante = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([...ponto.toArray(), ...centro.toArray(), ...centro.toArray()], 3));
  return { corpo: new THREE.BoxGeometry(2, 2, 2), volante, rig, topo };
}

const camera = new THREE.PerspectiveCamera();
const quadro = (anguloAroRad = 0) => ({ estado: {}, anguloAroRad, dt: 1 / 60 });

test('cabine troca o corpo pela variante, põe volante e banco, e desmontar devolve o original', async () => {
  const { maquina, corpo, superficie, original } = maquinaFalsa();
  const asset = assetFalso();
  const cabine = criarCabineMax({ carregar: async () => asset });
  cabine.montar(maquina, camera);
  await new Promise((r) => setImmediate(r));
  cabine.quadro(quadro());
  assert.equal(superficie.geometry, asset.corpo);
  const pivo = corpo.getObjectByName('cabine-volante-pivo');
  assert.ok(pivo, 'volante num pivô próprio');
  assert.deepEqual(pivo.position.toArray(), rig.center);
  assert.equal(pivo.getObjectByName('cabine-volante').material, superficie.material, 'volante usa o acabamento do corpo (sem draw extra de material)');
  const banco = corpo.getObjectByName('cabine-banco-provisorio');
  assert.ok(banco, 'banco provisório sob o olho');
  banco.geometry.computeBoundingBox();
  const caixa = banco.geometry.boundingBox;
  assert.ok(caixa.min.y >= 1.34 && caixa.max.y < 2.3, 'banco entre o piso e o olho');
  assert.ok(caixa.min.x > -1.29 && caixa.max.x < -0.45, 'banco atrás do volante e à frente da parede traseira');
  cabine.desmontar();
  assert.equal(superficie.geometry, original);
  assert.equal(corpo.getObjectByName('cabine-volante-pivo'), undefined);
  assert.equal(corpo.getObjectByName('cabine-banco-provisorio'), undefined);
});

test('quadro gira o aro por anguloAroRad no eixo da coluna, + horário visto do banco', async () => {
  const { maquina, corpo } = maquinaFalsa();
  const asset = assetFalso();
  const cabine = criarCabineMax({ carregar: async () => asset });
  cabine.montar(maquina, camera);
  await new Promise((r) => setImmediate(r));
  const topoNoMundo = (angulo) => {
    cabine.quadro(quadro(angulo));
    maquina.updateMatrixWorld(true);
    const aro = corpo.getObjectByName('cabine-volante');
    const p = new THREE.Vector3().fromBufferAttribute(aro.geometry.attributes.position, 0);
    return aro.localToWorld(p).sub(new THREE.Vector3(...rig.center));
  };
  const parado = topoNoMundo(0);
  assert.ok(parado.distanceTo(asset.topo.clone().multiplyScalar(rig.rimRadius)) < 1e-6, 'esterço 0: aro no lugar do GLB');
  // Operador olha +X com +Y em cima: a direita dele é +Z. Horário = topo do aro vai para a direita.
  const quarto = topoNoMundo(Math.PI / 2);
  assert.ok(quarto.z > rig.rimRadius * 0.99, `quarto de volta horário leva o topo para +Z (z=${quarto.z})`);
  const esquerda = topoNoMundo(-Math.PI / 2);
  assert.ok(esquerda.z < -rig.rimRadius * 0.99);
  // Esterço máximo = uma volta (ARO_RAD_POR_ESTERCO = 2π): o topo volta ao lugar.
  assert.ok(topoNoMundo(anguloAroRad(1)).distanceTo(parado) < 1e-6);
  // O giro fica no plano do volante: distância ao eixo constante.
  const n = new THREE.Vector3(...rig.axis).normalize();
  for (const a of [0.3, 1.2, -2.5]) {
    const v = topoNoMundo(a);
    assert.ok(Math.abs(v.dot(n)) < 1e-6);
    assert.ok(Math.abs(v.length() - rig.rimRadius) < 1e-6);
  }
  cabine.desmontar();
});

test('sem o corpo do MAX (fallback) a cabine espera e não quebra; desmontar antes do asset não vaza', async () => {
  const maquina = new THREE.Group();
  let liberar;
  const asset = assetFalso();
  const cabine = criarCabineMax({ carregar: () => new Promise((r) => { liberar = () => r(asset); }) });
  cabine.montar(maquina, camera);
  cabine.quadro(quadro(1));
  liberar();
  await new Promise((r) => setImmediate(r));
  cabine.quadro(quadro(1));
  assert.equal(maquina.getObjectByName('cabine-volante-pivo'), undefined);
  cabine.desmontar();
  const tardia = criarCabineMax({ carregar: async () => assetFalso() });
  tardia.montar(maquinaFalsa().maquina, camera);
  tardia.desmontar();
  await new Promise((r) => setImmediate(r));
});

test('GLB real da variante: corpo sem assento antigo e volante no centro do rig da provenance', async () => {
  const bytes = readFileSync(new URL('max-tractor-cabine.glb', root));
  const asset = await extrairAssetCabineMax(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), rig);
  asset.volante.computeBoundingBox();
  const centro = asset.volante.boundingBox.getCenter(new THREE.Vector3());
  assert.ok(centro.distanceTo(new THREE.Vector3(...rig.center)) < 0.08, `volante centrado no rig (${centro.toArray()})`);
  const p = asset.corpo.attributes.position;
  let assento = 0;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (x > -0.9 && x < -0.55 && y > 1.45 && y < 1.85 && Math.abs(z) < 0.15) assento++;
  }
  assert.equal(assento, 0, 'corpo da variante não traz o assento antigo');
  assert.ok(asset.corpo.attributes.normal && asset.corpo.attributes.uv && asset.corpo.attributes.color, 'mesmos atributos do corpo do /sompo');
});
