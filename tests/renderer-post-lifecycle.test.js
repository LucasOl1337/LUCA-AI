import test from 'node:test';
import assert from 'node:assert/strict';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { createSompoPostProcessing } = await loadFrontendModule('../../src/components/sompo/createSompoPostProcessing.ts');

test('post owns every pass resource, including disabled grade and bloom high-pass, and retires once', (t) => {
  const previous = globalThis.window;
  globalThis.window = { devicePixelRatio: 1, matchMedia: () => ({ matches: false }) };
  t.after(() => { globalThis.window = previous; });
  const passes = [], composers = new Set();
  const addPass = EffectComposer.prototype.addPass;
  t.mock.method(EffectComposer.prototype, 'addPass', function (pass) {
    composers.add(this); passes.push(pass); return addPass.call(this, pass);
  });
  const renderer = { getPixelRatio: () => 1, getSize: (out) => out.set(1920, 1080) };
  const post = createSompoPostProcessing(renderer, {}, {});
  assert.equal(passes.length, 5, 'render, AO+sanitize, bloom, output, grade; no redundant fullscreen sanitizer');
  const aoComposite = passes[1].compositeMaterial.fragmentShader;
  assert.match(aoComposite, /color\.rgb \*= mix/);
  assert.match(aoComposite, /isnan\(color\.r\).*isinf\(color\.r\).*65520/);
  assert.match(aoComposite, /gl_FragColor = vec4\(color\.rgb, 1\.\)/);
  post.resize(1920, 1080);
  post.setGrade(false);
  post.setEnabled(false);
  const resources = new Set();
  const collect = (owner) => {
    for (const value of Object.values(owner)) {
      for (const item of Array.isArray(value) ? value : [value]) {
        if (item?.isMaterial || item?.isRenderTarget) resources.add(item);
      }
    }
  };
  passes.forEach(collect);
  for (const composer of composers) { collect(composer); collect(composer.copyPass); }
  assert.ok(resources.size >= 20, 'real Three passes allocated, not stubbed disposables');
  const counts = new Map([...resources].map((r) => [r, 0]));
  for (const resource of resources) resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
  post.dispose(); post.dispose();
  for (const [resource, count] of counts) assert.equal(count, 1, `${resource.constructor.name} ${resource.name || resource.texture?.name || resource.type}`);
});

test('compact path keeps direct renderer and has no composer', (t) => {
  const previous = globalThis.window;
  globalThis.window = { devicePixelRatio: 1, matchMedia: () => ({ matches: true }) };
  t.after(() => { globalThis.window = previous; });
  const scene = {}, camera = {}, draws = [];
  const post = createSompoPostProcessing({ render: (...args) => draws.push(args) }, scene, camera);
  post.resize(1366, 768); post.setPixelRatio(1); post.setGrade(false); post.setEnabled(false);
  post.render(0); post.dispose(); post.dispose();
  assert.deepEqual(draws, [[scene, camera]]);
});
