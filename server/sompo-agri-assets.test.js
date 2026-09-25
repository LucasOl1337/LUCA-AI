import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { build } from 'esbuild';
import { getSompoAgriFrame, getSompoAgriKeyframes } from '../shared/sompo-agri-scenarios.js';
import { integrateSompoMotion } from '../shared/sompo-motion.js';

const root = new URL('../public/models/sompo/', import.meta.url);

function moduleUrl(source) {
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
}

for (const name of ['generated-agri-tractor', 'generated-agri-harvester']) {
  test(`${name}: GLB dentro do orçamento, sem Draco e com manifesto CSP válido`, () => {
    const procedural = name === 'generated-agri-tractor';
    const bytes = readFileSync(new URL(`${name}.glb`, root));
    assert.equal(bytes.readUInt32LE(0), 0x46546c67);
    const jsonLength = bytes.readUInt32LE(12);
    const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
    const binary = bytes.subarray(28 + jsonLength);
    assert.ok(!document.extensionsUsed?.includes('KHR_draco_mesh_compression'));
    assert.ok(!document.extensionsRequired?.includes('KHR_draco_mesh_compression'));

    const manifest = JSON.parse(readFileSync(new URL(`${name}.textures.json`, root), 'utf8'));
    assert.equal(manifest.images.length, document.images?.length ?? 0);
    for (const [index, image] of (document.images ?? []).entries()) {
      const view = document.bufferViews[image.bufferView];
      const external = readFileSync(new URL(manifest.images[index], root));
      assert.deepEqual(external, binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength));
      assert.ok(external.length > 100);
    }

    const triangles = document.meshes.flatMap((mesh) => mesh.primitives).reduce((sum, primitive) => {
      if (!procedural) assert.ok(primitive.attributes.TEXCOORD_0 !== undefined, 'PBR atlas has UV coordinates');
      return sum + (document.accessors[primitive.indices].count / 3);
    }, 0);
    assert.ok(triangles >= 15_000 && triangles <= (procedural ? 120_000 : 30_000), `${triangles} triangles fit agricultural budget`);
    assert.ok((document.materials?.length ?? 0) <= 12, 'material budget');

    const provenance = JSON.parse(readFileSync(new URL(`${name}.provenance.json`, root), 'utf8'));
    assert.equal(provenance.triangles, triangles);
    assert.equal(provenance.sha256, createHash('sha256').update(bytes).digest('hex'));
    const source = readFileSync(new URL(provenance.sourceImage, root));
    assert.equal(provenance.sourceImageSha256, createHash('sha256').update(source).digest('hex'));
    if (procedural) {
      assert.equal(provenance.method, 'Procedural Blender modeling from dimensioned primitives and custom meshes');
      assert.match(provenance.reproducibleCommand, /build-agri-tractor\.py/);
      assert.equal(manifest.images.length, 0);
    } else {
      assert.equal(provenance.imageModel, 'cx/gpt-image-2 via local 9Router /v1/images/generations');
    }
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
  const compiled = await build({ entryPoints: [new URL('../src/components/sompo/rigSompoAgriAsset.ts', import.meta.url).pathname], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'shared-three', setup(build) {
    build.onResolve({ filter: /^three(?:\/|$)/ }, args => ({ path: import.meta.resolve(args.path), external: true }));
  } }] });
  const { rigSompoAgriAsset } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);
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
      // Landmarks inspected in the actual generated meshes: tractor hood +Y,
      // harvester header -X, before the authored node's quarter turn around X.
      const authored = model.getObjectByName(equipmentId === 'tractor' ? 'tractor-textured' : 'harvester-textured');
      if (authored) {
        const front = equipmentId === 'tractor' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(-1, 0, 0);
        const heading = authored.localToWorld(front).sub(authored.localToWorld(new THREE.Vector3())).normalize();
        assert.ok(heading.x > 0.999, `${equipmentId}: front must follow +X travel, got ${heading.toArray()}`);
      }
      const bounds = new THREE.Box3().setFromObject(model);
      assert.ok(Math.abs(bounds.min.y) < 1e-5, `${equipmentId}: ground contact`);
      assert.ok(bounds.max.x - bounds.min.x <= (equipmentId === 'tractor' ? 5.8 : 9.2) + 1e-5);
      const surfaces = [];
      model.traverse((node) => { if (node.isMesh) surfaces.push(node); });
      assert.ok(surfaces.length > 0);
      if (equipmentId === 'tractor') assert.ok(surfaces.every((mesh) => !mesh.material.map), 'procedural tractor stays texture-free');
      else assert.ok(surfaces.every((mesh) => mesh.material.map && mesh.material.metalnessMap === mesh.material.roughnessMap));
      const sourceTriangles = surfaces.reduce((sum, mesh) => sum + (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3, 0);
      const rig = rigSompoAgriAsset(model, equipmentId);
      assert.equal(rig.root.userData.sourceTriangles, sourceTriangles);
      let partitionTriangles = 0;
      rig.root.traverse(node => { if (node.isMesh && node.name.endsWith('-surface')) {
        partitionTriangles += node.geometry.index.count / 3;
        if (equipmentId === 'harvester') assert.ok(node.material.map && node.geometry.attributes.uv, 'partition preserves authored atlas and UVs');
      } });
      assert.equal(partitionTriangles, sourceTriangles, 'every source triangle assigned exactly once');
      assert.equal(rig.wheels.length, 4);
      assert.ok(rig.wheels.every(wheel => wheel.spin.children[0]?.geometry.attributes.position.count > 200));
      const scenarioId = equipmentId === 'tractor' ? 'agri-hydraulic-failure' : 'agri-harvest-dust';
      const frames = getSompoAgriKeyframes(scenarioId);
      const update = t => rig.update(getSompoAgriFrame(scenarioId, t), integrateSompoMotion(frames, t) / 3.6, integrateSompoMotion(frames, t, 'headerSpeed', false) * .8, false);
      update(4000); const wheelPose = rig.wheels[0].spin.rotation.z, implementPose = rig.implement.rotation.toArray(), reelPose = rig.rotor.rotation.z;
      update(4500); assert.notEqual(rig.wheels[0].spin.rotation.z, wheelPose);
      if (equipmentId === 'harvester') assert.notEqual(rig.rotor.rotation.z, reelPose);
      else assert.notDeepEqual(rig.implement.rotation.toArray(), implementPose);
      update(4000); assert.equal(rig.wheels[0].spin.rotation.z, wheelPose); assert.deepEqual(rig.implement.rotation.toArray(), implementPose);
      const parent = new THREE.Group(); parent.add(rig.root);
      for (const roll of [0, 17, 45, 88]) {
        parent.rotation.set(roll * Math.PI / 180, .35, .04, 'YZX');
        parent.position.y = rig.supportHeight(parent.rotation, 0, 0, () => 0);
        parent.updateMatrixWorld(true);
        let minimum = Infinity; const vertex = new THREE.Vector3();
        rig.root.traverse(node => {
          if (!node.isMesh || !node.name.endsWith('-surface')) return;
          const p = node.geometry.attributes.position;
          for (let i = 0; i < p.count; i++) minimum = Math.min(minimum, vertex.fromBufferAttribute(p, i).applyMatrix4(node.matrixWorld).y);
        });
        assert.ok(minimum >= -.00001 && minimum < .016, `${equipmentId}: contact at roll ${roll}: ${minimum}`);
      }
      disposeSompoAgriAsset(rig.root);
    }
    assert.ok(!imageRequests.some((url) => /generated-agri-tractor-/.test(url)), 'procedural tractor makes no image request');
    assert.ok(imageRequests.some((url) => /generated-agri-harvester-metallicroughness\.png$/.test(url)));
  } finally {
    globalThis.document = saved.document;
    globalThis.self = saved.self;
    globalThis.fetch = saved.fetch;
  }
});
