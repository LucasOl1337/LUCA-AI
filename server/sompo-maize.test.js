import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as THREE from 'three';

const asset = new URL('../public/models/sompo/maize-curved.glb', import.meta.url);

test('maize: external atlas is byte-identical and geometry stays within the instancing budget', () => {
  const bytes = readFileSync(asset);
  const length = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + length));
  const binary = bytes.subarray(28 + length);
  const manifest = JSON.parse(readFileSync(new URL('maize-curved.textures.json', asset)));
  assert.equal(manifest.images.length, json.images.length);
  assert.equal(json.images.length, 1);
  json.images.forEach((image, index) => {
    const view = json.bufferViews[image.bufferView];
    const start = view.byteOffset ?? 0;
    assert.deepEqual(readFileSync(new URL(manifest.images[index], asset)), binary.subarray(start, start + view.byteLength));
  });
  const triangles = json.meshes.flatMap(mesh => mesh.primitives).reduce((sum, p) => sum + json.accessors[p.indices].count / 3, 0);
  assert.ok(triangles > 500 && triangles < 1200, `${triangles} triangles per plant`);
  assert.equal(json.meshes.length, 3, 'one draw per material, independent of plant count');
});

test('maize: production CSP path loads the leaf atlas without any blob fetch', async () => {
  const compiled = await build({
    entryPoints: [new URL('../src/components/sompo/restoreSompoTextures.ts', import.meta.url).pathname],
    bundle: true, write: false, platform: 'node', format: 'esm',
    plugins: [{ name: 'shared-three', setup(b) {
      b.onResolve({ filter: /^three$/ }, args => ({ path: import.meta.resolve(args.path), external: true }));
    } }],
  });
  const { useSompoExternalTextures, restoreSompoTextures } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);
  const saved = { document: globalThis.document, self: globalThis.self, fetch: globalThis.fetch };
  const requests = [];
  globalThis.self = globalThis;
  globalThis.document = { createElementNS(_ns, tag) {
    assert.equal(tag, 'img');
    const listeners = new Map();
    return {
      complete: true, naturalWidth: 1254, naturalHeight: 1254,
      addEventListener(type, fn) { listeners.set(type, fn); },
      removeEventListener(type) { listeners.delete(type); },
      set src(url) {
        assert.match(url, /^\/models\/sompo\/maize-curved-image-0\.png$/);
        requests.push(url);
        queueMicrotask(() => listeners.get('load')?.call(this));
      },
    };
  } };
  globalThis.fetch = async input => {
    assert.equal(input, '/models/sompo/maize-curved.textures.json', 'no blob fetch permitted');
    return new Response(readFileSync(new URL('maize-curved.textures.json', asset)));
  };
  let gltf;
  try {
    const bytes = readFileSync(asset);
    gltf = await useSompoExternalTextures(new GLTFLoader()).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '/models/sompo/');
    await restoreSompoTextures(gltf, '/models/sompo/maize-curved.glb', new AbortController().signal);
    const leaf = gltf.scene.getObjectByName('Maize_leaf');
    assert.ok(leaf?.isMesh, 'named authored leaf mesh');
    assert.ok(leaf.material.map.image.naturalWidth > 0);
    assert.equal(leaf.material.map.flipY, false);
    assert.equal(leaf.material.map.colorSpace, THREE.SRGBColorSpace);
    assert.equal(requests.length, 1);
    gltf.scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(gltf.scene);
    assert.ok(bounds.min.y >= -.01 && bounds.max.y <= 1.01, 'unit-height plant cannot be scaled twice');
  } finally {
    gltf?.scene.traverse(node => { if (node.isMesh) { node.geometry.dispose(); node.material.map?.dispose(); node.material.dispose(); } });
    Object.assign(globalThis, saved);
  }
});
