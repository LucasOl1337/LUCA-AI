import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import * as THREE from 'three';

const BASELINE_HASHES = [
  '1263c8850062cc6a03ca7ee3312dd588b03ec3e9aceece7b6e3a6bd67c2210b4',
  'a77cdb280cbb2518cc38e442219a54de570cc7f06d89d171dcee354e2f405e54',
  'd7b7f8c1e041a17d4d4455ace72d98803dc9b95a70f2d9967929d4ecfccaae7b',
  '4d74dca608d9a001062b91343eecb37fb7d34477d4fea99bc5ce4b2cb555cf44',
  '816be80cd3a3e3ebcb35f679c49a061503a10224e5b7d8ae9b7a08d217b58e9f',
  '6b67cd24a128795e3906972e809ec85792486c3f6d633897f1fd913d7998e66d',
  'e35a110c33f60f31893012aca4dedc40e38f4e2fb3e7a9d36afa6a1077ef71ae',
  'f7a5acf20372cd697e33c84c536ae042b1abb0b8a9c2439397931364f8ea1cff',
];
const hash = a => createHash('sha256').update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)).digest('hex');

// Fixed production circuit + four PR81 clearings; not generated/fuzz input.
test('circuit crops and terrain retain every baseline transform byte (61d7321)', async () => {
  const bundle = await build({
    stdin: { contents: `export {createSompoAgriScene} from './src/components/sompo/createSompoAgriScene'; export {ROTA_CIRCUITO} from './src/components/gameplay/circuito'; export {COLISORES_RURAIS} from './src/components/gameplay/propsRurais';`, resolveDir: new URL('..', import.meta.url).pathname, loader: 'ts' },
    bundle: true, write: false, format: 'esm', platform: 'node',
    plugins: [{ name: 'three-singleton', setup(b) { b.onResolve({ filter: /^three(?:\/.*)?$/ }, a => ({ path: import.meta.resolve(a.path), external: true })); } }],
  });
  const {createSompoAgriScene, ROTA_CIRCUITO, COLISORES_RURAIS} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
  const previous = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => null }) };
  let field;
  try {
    field = createSompoAgriScene(new THREE.Group(), 'row-crop-field', false, 'max-tractor', undefined, .32, ROTA_CIRCUITO, COLISORES_RURAIS.map(p => ({ x: p.x, z: p.z, radius: p.raioM + 1.7 })));
    const crops = field.root.getObjectByName('sompo-agri-crop-rows');
    assert.equal(crops.children.length, 8);
    assert.deepEqual(crops.children.map(m => hash(m.instanceMatrix.array)), BASELINE_HASHES);
    assert.equal(crops.children.reduce((n, m) => n + m.count, 0), 19872);
    assert.equal(hash(field.terrain.geometry.attributes.position.array), 'aef09a5e6967d1fd541ce8a915650a6a9bdf7e53d3434b76abf57ceffeb87e1c');
  } finally { field?.dispose(); globalThis.document = previous; }
});
