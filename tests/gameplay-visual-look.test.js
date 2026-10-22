import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadFrontendModule } from './support/load-frontend-module.js';
// O módulo carregado pelo esbuild (CJS) usa o three do require: o mesmo ShaderChunk.
const THREE = createRequire(import.meta.url)('three');
const { criarLookGameplay, instalarGradeToneMapping, LOOK_GAMEPLAY, MUNDO_GAMEPLAY } = await loadFrontendModule('../../src/components/gameplay/visual/lookGameplay.ts');

function contexto({ night = false } = {}) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xc8c9bd, 18, 470);
  scene.environmentIntensity = 0.38;
  const sun = new THREE.DirectionalLight(0xffd49e, 4.2);
  const renderer = { toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 };
  const grade = [];
  const filhos = [];
  const mount = { appendChild(no) { filhos.push(no); } };
  return { ctx: { mount, scene, renderer, sun, night, setPostGrade: (on) => grade.push(on) }, grade, filhos };
}

test('grade entra no CustomToneMapping uma vez, sem mexer no ACES', () => {
  const antes = THREE.ShaderChunk.tonemapping_pars_fragment;
  assert.equal(instalarGradeToneMapping(), true);
  const depois = THREE.ShaderChunk.tonemapping_pars_fragment;
  assert.equal(instalarGradeToneMapping(), true);
  assert.equal(THREE.ShaderChunk.tonemapping_pars_fragment, depois, 'idempotente');
  assert.match(depois, /gameplay-look-v1/);
  assert.match(depois, /vec3 c = ACESFilmicToneMapping\( color \);/);
  assert.ok(!depois.includes('vec3 CustomToneMapping( vec3 color ) { return color; }'));
  // A função ACES continua a mesma: o /sompo e o clássico (ACES) não mudam.
  const aces = (chunk) => chunk.slice(chunk.indexOf('vec3 ACESFilmicToneMapping'), chunk.indexOf('vec3 ACESFilmicToneMapping') + 900);
  assert.equal(aces(depois), aces(antes.includes('gameplay-look-v1') ? depois : antes));
});

test('look troca o tone mapping, desliga o grade do pós e ajusta luz e névoa por quadro', () => {
  const { ctx, grade } = contexto();
  const look = criarLookGameplay(ctx);
  assert.equal(ctx.renderer.toneMapping, THREE.CustomToneMapping);
  assert.deepEqual(grade, [false]);
  look.quadro();
  assert.equal(ctx.sun.intensity, LOOK_GAMEPLAY.forcaSol);
  assert.equal(ctx.sun.color.getHexString(), LOOK_GAMEPLAY.sol.slice(1));
  assert.equal(ctx.scene.environmentIntensity, LOOK_GAMEPLAY.ambiente);
  assert.equal(ctx.scene.fog.near, LOOK_GAMEPLAY.nevoaPerto);
  assert.equal(ctx.scene.fog.far, LOOK_GAMEPLAY.nevoaLonge);
  assert.ok(Math.abs(ctx.renderer.toneMappingExposure - 1.05 * LOOK_GAMEPLAY.exposicao) < 1e-9);
  look.dispose();
  assert.equal(ctx.renderer.toneMapping, THREE.ACESFilmicToneMapping);
  assert.deepEqual(grade, [false, true]);
});

test('à noite o look não sobrescreve a luz de luar do palco', () => {
  const { ctx } = contexto({ night: true });
  const look = criarLookGameplay(ctx);
  ctx.sun.intensity = 0.32; ctx.scene.environmentIntensity = 0.1;
  look.quadro();
  assert.equal(ctx.sun.intensity, 0.32);
  assert.equal(ctx.scene.environmentIntensity, 0.1);
  look.dispose();
});

test('mundo do gameplay leva o look e um milho mais alto que a muda do case', () => {
  assert.equal(MUNDO_GAMEPLAY.look, criarLookGameplay);
  assert.ok(MUNDO_GAMEPLAY.alturaLavoura > 0.32 && MUNDO_GAMEPLAY.alturaLavoura < 1);
});
