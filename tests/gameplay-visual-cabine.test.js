import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const gameplay = new URL('../public/models/gameplay/', import.meta.url);
const sompo = new URL('../public/models/sompo/', import.meta.url);

function glb(url) {
  const bytes = readFileSync(url);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  const jsonLength = bytes.readUInt32LE(12);
  const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const binary = bytes.subarray(28 + jsonLength);
  const positions = (accessorIndex) => {
    const accessor = document.accessors[accessorIndex];
    const view = document.bufferViews[accessor.bufferView];
    const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const stride = view.byteStride ?? 12;
    return Array.from({ length: accessor.count }, (_, i) => [0, 1, 2].map(c => binary.readFloatLE(offset + i * stride + c * 4)));
  };
  const meshNode = (prefix) => document.nodes.find(node => node.name?.startsWith(prefix) && node.mesh !== undefined);
  return { bytes, document, positions, meshNode };
}

// Volume do assento + encosto antigos no GLB final (+X frente, +Y cima). Medido no max-tractor.glb:
// 876 vértices em x -0,93..-0,48, y 1,52..2,09; a variante cabine tem 0 ali.
const SEAT = { x: [-1.2, -0.3], y: [1.45, 2.3], z: [-0.3, 0.3] };
const inSeat = ([x, y, z]) => x > SEAT.x[0] && x < SEAT.x[1] && y > SEAT.y[0] && y < SEAT.y[1] && z > SEAT.z[0] && z < SEAT.z[1];
const bodyVertices = ({ document, positions, meshNode }) => document.meshes[meshNode('rig-body--').mesh].primitives
  .flatMap(primitive => positions(primitive.attributes.POSITION));

test('cabine do Gameplay: variante do mesmo gerador, proveniência verificável e volante em nó próprio', () => {
  const cabin = glb(new URL('max-tractor-cabine.glb', gameplay));
  const provenance = JSON.parse(readFileSync(new URL('max-tractor-cabine.provenance.json', gameplay), 'utf8'));
  assert.equal(provenance.sha256, createHash('sha256').update(cabin.bytes).digest('hex'));
  assert.equal(provenance.bytes, cabin.bytes.length);
  assert.equal(provenance.variant, 'cabine');
  assert.equal(provenance.variantOf, 'max-tractor.glb');
  assert.match(provenance.reproducibleCommand, /^MAX_TRACTOR_VARIANT=cabine .*build-max-tractor\.py$/);
  assert.equal(provenance.references.length, 14);
  readFileSync(new URL(provenance.license, gameplay), 'utf8');
  assert.deepEqual(JSON.parse(readFileSync(new URL('max-tractor-cabine.textures.json', gameplay), 'utf8')), { images: [] });

  const primitives = cabin.document.meshes.flatMap(mesh => mesh.primitives);
  const triangles = primitives.reduce((sum, primitive) => sum + cabin.document.accessors[primitive.indices].count / 3, 0);
  assert.equal(provenance.triangles, triangles);
  assert.ok(triangles <= 52_000, `${triangles} triângulos`);
  assert.equal(primitives.length, 7, 'só +1 draw call sobre o max-tractor.glb (o volante)');
  assert.equal(cabin.document.images?.length ?? 0, 0);

  // Volante: um nó com malha, centrado no pivô publicado, do tamanho do aro.
  const wheel = provenance.rig.steeringWheel;
  const node = cabin.meshNode('rig-volante--');
  assert.ok(node, 'nó rig-volante--* existe');
  const accessor = cabin.document.accessors[cabin.document.meshes[node.mesh].primitives[0].attributes.POSITION];
  for (let c = 0; c < 3; c++) {
    const middle = (accessor.min[c] + accessor.max[c]) / 2;
    assert.ok(Math.abs(middle - wheel.center[c]) < 0.06, `centro do aro no eixo ${c}`);
    assert.ok(accessor.max[c] - accessor.min[c] < wheel.rimRadius * 2 + 0.12, `tamanho do aro no eixo ${c}`);
  }
  assert.ok(Math.abs(Math.hypot(...wheel.axis) - 1) < 1e-3);
  assert.ok(wheel.axis[1] > 0.8 && wheel.axis[0] < 0, 'eixo do volante sobe e aponta para o operador');

  // O assento antigo saiu da carroceria; no /sompo ele continua.
  assert.equal(bodyVertices(cabin).filter(inSeat).length, 0);
});

test('o /sompo continua no max-tractor.glb sem variante', () => {
  const base = glb(new URL('max-tractor.glb', sompo));
  const provenance = JSON.parse(readFileSync(new URL('max-tractor.provenance.json', sompo), 'utf8'));
  assert.equal(provenance.variant, undefined);
  assert.equal(provenance.sha256, createHash('sha256').update(base.bytes).digest('hex'));
  assert.equal(base.document.nodes.some(node => node.name?.startsWith('rig-volante')), false);
  assert.ok(bodyVertices(base).filter(inSeat).length > 50, 'assento do /sompo no lugar');
});
