import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import v8 from 'node:v8';
import vm from 'node:vm';
import { loadFrontendModule } from './support/load-frontend-module.js';

// Soak de 20/10: no /stand cada troca coruja-3d/Simulação deixava um WebGLRenderer
// preso pelo ouvinte `dispose` que o three pendura na DFG_LUT compartilhada.
const require = createRequire(import.meta.url);
const THREE = require('three');
const { soltarLutCompartilhada } = await loadFrontendModule('../../src/components/sompo/soltarLutCompartilhada.ts');

v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc');
const coletar = async () => { for (let i = 0; i < 3; i++) { await new Promise((r) => setImmediate(r)); gc(); } };

// Contexto WebGL2 mínimo: o bastante para o three compilar um programa e ligar uniforms.
function glFalso() {
  const fixos = { VERSION: 0x1f02, ACTIVE_UNIFORMS: 0x8b86, ACTIVE_ATTRIBUTES: 0x8b89 };
  return new Proxy({}, {
    get(_, k) {
      if (k in fixos) return fixos[k];
      if (k === 'canvas') return null;
      if (k === 'getParameter') return (p) => (p === 0x1f02 ? 'WebGL 2.0' : p === 0x8b8c ? 'WebGL GLSL ES 3.00' : p === 0x0ba2 || p === 0x0c10 ? new Int32Array([0, 0, 1, 1]) : 16);
      if (k === 'getShaderPrecisionFormat') return () => ({ precision: 23, rangeMin: 127, rangeMax: 127 });
      if (k === 'getContextAttributes') return () => ({ alpha: true, antialias: true, depth: true, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false });
      if (k === 'getSupportedExtensions') return () => [];
      if (k === 'getShaderParameter' || k === 'getProgramParameter') return (_o, p) => (p === 0x8b86 ? 1 : p === 0x8b89 ? 0 : true);
      if (k === 'getActiveUniform') return () => ({ name: 'dfgLUT', type: 0x8b5e, size: 1 });
      if (k === 'getShaderInfoLog' || k === 'getProgramInfoLog') return () => '';
      if (k === 'isContextLost') return () => false;
      if (typeof k === 'string' && /^[A-Z_0-9]+$/.test(k)) return 1;
      return () => ({});
    },
  });
}

function palco() {
  const canvas = { width: 1, height: 1, style: {}, addEventListener() {}, removeEventListener() {}, getContext: () => null };
  const renderer = new THREE.WebGLRenderer({ canvas, context: glFalso() });
  const cena = new THREE.Scene();
  const material = new THREE.MeshStandardMaterial();
  cena.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  const camera = new THREE.PerspectiveCamera();
  renderer.render(cena, camera);
  const lut = renderer.properties.get(material).uniforms.dfgLUT.value;
  return { renderer, cena, camera, lut };
}

const ouvintesDaLut = (lut) => lut._listeners?.dispose?.length ?? 0;

test('premissa: a DFG_LUT é única e prende o renderer descartado só com renderer.dispose()', async () => {
  const vivo = palco();
  const ref = (() => { const p = palco(); assert.equal(p.lut, vivo.lut); p.renderer.dispose(); return new WeakRef(p.renderer); })();
  await coletar();
  assert.equal(vivo.lut.name, 'DFG_LUT');
  assert.ok(ref.deref(), 'se o three passar a soltar sozinho, o soltarLutCompartilhada pode sair');
  soltarLutCompartilhada(vivo.renderer, vivo.cena);
});

test('soltarLutCompartilhada libera o renderer descartado e o vivo segue desenhando', async () => {
  const vivo = palco();
  const ref = (() => {
    const p = palco();
    soltarLutCompartilhada(p.renderer, p.cena);
    p.renderer.dispose();
    return new WeakRef(p.renderer);
  })();
  await coletar();
  assert.equal(ref.deref(), undefined, 'renderer descartado foi coletado');
  assert.equal(ouvintesDaLut(vivo.lut), 0);
  vivo.renderer.render(vivo.cena, vivo.camera);
  assert.equal(ouvintesDaLut(vivo.lut), 1, 'o renderer vivo reenvia a LUT e volta a ouvir');
});

test('dez montagens e desmontagens não acumulam renderers nem ouvintes', async () => {
  const montarEDesmontar = () => {
    const p = palco();
    soltarLutCompartilhada(p.renderer, p.cena);
    p.renderer.dispose();
    return new WeakRef(p.renderer);
  };
  const refs = Array.from({ length: 10 }, montarEDesmontar);
  await coletar();
  assert.equal(refs.filter((r) => r.deref()).length, 0);
});

test('todo dono de WebGLRenderer em src/ solta a LUT no dispose', () => {
  const raiz = new URL('../src/', import.meta.url);
  const arquivos = [];
  const andar = (dir) => {
    for (const nome of readdirSync(dir)) {
      const caminho = new URL(nome, dir);
      if (statSync(caminho).isDirectory()) andar(new URL(`${nome}/`, dir));
      else if (/\.(ts|tsx)$/.test(nome) && !/\.test\./.test(nome)) arquivos.push(caminho);
    }
  };
  andar(raiz);
  const donos = arquivos.filter((f) => /new THREE\.WebGLRenderer\(|createSompoRenderer\(mount\)/.test(readFileSync(f, 'utf8')));
  assert.ok(donos.length >= 6, `achou ${donos.length} donos`);
  for (const f of donos) {
    const fonte = readFileSync(f, 'utf8');
    if (f.pathname.endsWith('/sompoStage.ts')) continue; // fábrica; quem chama é que descarta
    assert.match(fonte, /soltarLutCompartilhada\(renderer, /, f.pathname.replace(raiz.pathname, 'src/'));
  }
});
