import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const root = new URL('../public/models/sompo/', import.meta.url);

function moduleUrl(source) {
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
}

for (const name of ['generated-agri-tractor', 'generated-agri-harvester']) {
  test(`${name}: GLB retopologizado, sem Draco e com texturas externas byte-idênticas`, () => {
    const bytes = readFileSync(new URL(`${name}.glb`, root));
    assert.equal(bytes.readUInt32LE(0), 0x46546c67);
    const jsonLength = bytes.readUInt32LE(12);
    const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
    const binary = bytes.subarray(28 + jsonLength);
    assert.ok(!document.extensionsUsed?.includes('KHR_draco_mesh_compression'));
    assert.ok(!document.extensionsRequired?.includes('KHR_draco_mesh_compression'));

    const manifest = JSON.parse(readFileSync(new URL(`${name}.textures.json`, root), 'utf8'));
    assert.equal(manifest.images.length, document.images.length);
    for (const [index, image] of document.images.entries()) {
      const view = document.bufferViews[image.bufferView];
      const external = readFileSync(new URL(manifest.images[index], root));
      assert.deepEqual(external, binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength));
      assert.ok(external.length > 100);
    }

    const triangles = document.meshes.flatMap((mesh) => mesh.primitives).reduce((sum, primitive) => {
      assert.ok(primitive.attributes.TEXCOORD_0 !== undefined, 'PBR atlas has UV coordinates');
      return sum + (document.accessors[primitive.indices].count / 3);
    }, 0);
    assert.ok(triangles >= 15_000 && triangles <= 30_000, `${triangles} triangles fit agricultural budget`);

    const provenance = JSON.parse(readFileSync(new URL(`${name}.provenance.json`, root), 'utf8'));
    assert.equal(provenance.triangles, triangles);
    assert.equal(provenance.sha256, createHash('sha256').update(bytes).digest('hex'));
    const source = readFileSync(new URL(provenance.sourceImage, root));
    assert.equal(provenance.sourceImageSha256, createHash('sha256').update(source).digest('hex'));
    assert.equal(provenance.imageModel, 'cx/gpt-image-2 via local 9Router /v1/images/generations');
    assert.equal(provenance.license, 'SOMPO-AGRI-ASSET-LICENSE.txt');
    assert.match(readFileSync(new URL(provenance.license, root), 'utf8'), /Hunyuan3D-2\.1/);
  });
}

test('loader agrícola recupera PBR externo e ajusta os dois modelos ao chão', async () => {
  const THREE = await import('three');
  const textureSource = readFileSync(new URL('../src/components/sompo/restoreSompoTextures.ts', import.meta.url), 'utf8')
    .replace("'three'", JSON.stringify(import.meta.resolve('three')));
  const textureUrl = moduleUrl(textureSource);
  const catalogUrl = new URL('../shared/sompo-agri-scenarios.js', import.meta.url).href;
  const loaderSource = readFileSync(new URL('../src/components/sompo/loadSompoAgriAsset.ts', import.meta.url), 'utf8')
    .replace("'three'", JSON.stringify(import.meta.resolve('three')))
    .replace("'three/addons/loaders/GLTFLoader.js'", JSON.stringify(import.meta.resolve('three/addons/loaders/GLTFLoader.js')))
    .replace("'../../../shared/sompo-agri-scenarios.js'", JSON.stringify(catalogUrl))
    .replace("'./restoreSompoTextures'", JSON.stringify(textureUrl));
  const { disposeSompoAgriAsset, loadSompoAgriAsset } = await import(moduleUrl(loaderSource));
  const saved = { document: globalThis.document, self: globalThis.self, fetch: globalThis.fetch };
  const imageRequests = [];
  globalThis.document = {
    createElementNS: (_namespace, tag) => {
      assert.equal(tag, 'img');
      const events = new Map();
      return {
        complete: true, naturalWidth: 2048, naturalHeight: 2048, width: 2048, height: 2048,
        addEventListener(type, callback) { events.set(type, callback); },
        removeEventListener(type) { events.delete(type); },
        set src(url) {
          this.currentSrc = url;
          imageRequests.push(url);
          queueMicrotask(() => {
            assert.ok(readFileSync(new URL('../public' + url, import.meta.url)).length > 100);
            events.get('load')?.call(this);
          });
        },
      };
    },
  };
  globalThis.self = globalThis;
  globalThis.fetch = (input) => {
    const url = typeof input === 'string' ? input : input.url;
    if (/^\/models\/sompo\/generated-agri-(tractor|harvester)\.(glb|textures\.json)$/.test(url)) {
      return Promise.resolve(new Response(readFileSync(new URL('../public' + url, import.meta.url))));
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  try {
    for (const equipmentId of ['tractor', 'harvester']) {
      const model = await loadSompoAgriAsset(equipmentId, new AbortController().signal);
      assert.ok(model);
      assert.equal(model.name, `sompo-agri-${equipmentId}-asset`);
      assert.equal(model.userData.equipmentId, equipmentId);
      model.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model);
      assert.ok(Math.abs(bounds.min.y) < 1e-5, `${equipmentId}: ground contact`);
      assert.ok(bounds.max.x - bounds.min.x <= (equipmentId === 'tractor' ? 5.8 : 9.2) + 1e-5);
      const surfaces = [];
      model.traverse((node) => { if (node.isMesh) surfaces.push(node); });
      assert.ok(surfaces.length > 0);
      assert.ok(surfaces.every((mesh) => mesh.material.map && mesh.material.metalnessMap === mesh.material.roughnessMap));
      disposeSompoAgriAsset(model);
    }
    assert.ok(imageRequests.some((url) => /generated-agri-tractor-basecolor\.jpg$/.test(url)));
    assert.ok(imageRequests.some((url) => /generated-agri-harvester-metallicroughness\.png$/.test(url)));
  } finally {
    globalThis.document = saved.document;
    globalThis.self = saved.self;
    globalThis.fetch = saved.fetch;
  }
});
