import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const assets = ['generated-rural-truck', 'generated-nelore', 'tesla-semi',
  'generated-jacaranda', 'generated-eucalyptus', 'generated-cerrado'];
const root = new URL('../public/models/sompo/', import.meta.url);

for (const name of assets) test(`${name}: imagens externas correspondem exatamente ao atlas original do GLB`, () => {
  const bytes = readFileSync(new URL(`${name}.glb`, root));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  const jsonLength = bytes.readUInt32LE(12);
  const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const binary = bytes.subarray(28 + jsonLength);
  const manifest = JSON.parse(readFileSync(new URL(`${name}.textures.json`, root), 'utf8'));
  assert.equal(manifest.images.length, document.images.length);
  for (const [index, image] of document.images.entries()) {
    const view = document.bufferViews[image.bufferView];
    const external = readFileSync(new URL(manifest.images[index], root));
    assert.deepEqual(external, binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength));
    assert.ok(external.length > 100);
    if (image.mimeType === 'image/jpeg') assert.equal(external.readUInt16BE(0), 0xffd8);
    else assert.equal(external.subarray(1, 4).toString(), 'PNG');
  }
  for (const texture of document.textures) assert.ok(manifest.images[texture.source]);
  if (/jacaranda|eucalyptus|cerrado/.test(name)) {
    const triangles = document.meshes.flatMap((mesh) => mesh.primitives).reduce((sum, primitive) => {
      assert.ok(primitive.attributes.TEXCOORD_0 !== undefined, 'Generated mesh preserves UVs after reduction');
      return sum + document.accessors[primitive.indices].count / 3;
    }, 0);
    assert.ok(triangles >= 8000 && triangles <= 20000, `${triangles} triangles must fit the roadside budget`);
    const provenance = JSON.parse(readFileSync(new URL(`${name}.provenance.json`, root), 'utf8'));
    assert.equal(provenance.triangles, triangles);
    assert.equal(provenance.sha256, createHash('sha256').update(bytes).digest('hex'));
  }
});
