import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import * as THREE from 'three';

const result = await build({entryPoints:[new URL('../src/components/sompo/createSompoFloodSheet.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'three-singleton',setup(b){b.onResolve({filter:/^three$/},a=>({path:import.meta.resolve(a.path),external:true}));}}]});
const {createSompoFloodSheets, FLOOD_COLOR_GLSL, FLOOD_RIPPLE_GLSL, FLOOD_SKY_GLSL}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);

const ZONA = {x0:12, x1:42, z0:9, z1:24}; // retângulo 'alagado' do geofenceTalhao

test('lâmina cobre exatamente o retângulo do geofence, rente ao chão', () => {
  const parent = new THREE.Group();
  const flood = createSompoFloodSheets(parent, [ZONA], (x, z) => x * 0.01 + z * 0.02);
  assert.equal(flood.sheets.length, 1);
  const [sheet] = flood.sheets;
  assert.equal(sheet.name, 'area-alagada');
  assert.equal(sheet.parent, parent);
  sheet.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(sheet);
  assert.ok(Math.abs(box.min.x - 12) < 1e-6 && Math.abs(box.max.x - 42) < 1e-6);
  assert.ok(Math.abs(box.min.z - 9) < 1e-6 && Math.abs(box.max.z - 24) < 1e-6);
  assert.ok(Math.abs(sheet.position.y - (27 * 0.01 + 16.5 * 0.02 + 0.04)) < 1e-9);
});

test('shader recebe margem rasa e miolo fundo (injeções não falham em silêncio)', () => {
  const parent = new THREE.Group();
  const [sheet] = createSompoFloodSheets(parent, [ZONA], () => 0).sheets;
  const shader = {uniforms:{}, vertexShader:THREE.ShaderLib.standard.vertexShader, fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  sheet.material.onBeforeCompile(shader, {});
  assert.match(shader.vertexShader, /floodLocal = position\.xy;/);
  assert.ok(shader.fragmentShader.includes(FLOOD_COLOR_GLSL));
  assert.match(shader.fragmentShader, /uniform vec2 floodHalfSize;/);
  assert.deepEqual(shader.uniforms.floodHalfSize.value.toArray(), [15, 7.5]);
  assert.equal(sheet.material.transparent, true);
  assert.equal(sheet.material.depthWrite, false);
  // Ondulação depois da normal pronta e reflexo do céu antes da saída; nenhum chunk-alvo pode sumir.
  assert.ok(shader.fragmentShader.indexOf(FLOOD_RIPPLE_GLSL) > shader.fragmentShader.indexOf('#include <normal_fragment_maps>'));
  assert.ok(shader.fragmentShader.indexOf(FLOOD_SKY_GLSL) < shader.fragmentShader.indexOf('#include <opaque_fragment>'));
  assert.ok(shader.fragmentShader.indexOf(FLOOD_SKY_GLSL) > 0);
});

test('ondulação anda com update(segundos), 0 congela, e todas as zonas compartilham o relógio', () => {
  const flood = createSompoFloodSheets(new THREE.Group(), [ZONA, {x0:-30, x1:-20, z0:-5, z1:5}], () => 0, 0x162436);
  const shaders = flood.sheets.map((sheet) => {
    const shader = {uniforms:{}, vertexShader:THREE.ShaderLib.standard.vertexShader, fragmentShader:THREE.ShaderLib.standard.fragmentShader};
    sheet.material.onBeforeCompile(shader, {}); return shader;
  });
  flood.update(12.5);
  assert.deepEqual(shaders.map((s) => s.uniforms.floodTime.value), [12.5, 12.5]);
  flood.update(0);
  assert.equal(shaders[0].uniforms.floodTime.value, 0);
  flood.update(NaN);
  assert.equal(shaders[1].uniforms.floodTime.value, 0);
  assert.equal(shaders[0].uniforms.floodSky.value.getHex(), 0x162436);
  assert.notEqual(flood.sheets[0].material.customProgramCacheKey(), 'sompo-flood-sheet-v1');
  flood.dispose();
});

test('sem zona não cria nada; dispose solta tudo', () => {
  const vazio = createSompoFloodSheets(new THREE.Group(), [], () => 0);
  assert.equal(vazio.sheets.length, 0);
  vazio.dispose();
  const parent = new THREE.Group();
  const flood = createSompoFloodSheets(parent, [ZONA], () => 0);
  let geometria = 0, material = 0;
  flood.sheets[0].geometry.addEventListener('dispose', () => geometria++);
  flood.sheets[0].material.addEventListener('dispose', () => material++);
  flood.dispose();
  assert.equal(parent.children.length, 0);
  assert.equal(geometria, 1);
  assert.equal(material, 1);
});
