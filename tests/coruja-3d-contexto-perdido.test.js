import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

// Revisão A8(2): sem ouvir `webglcontextlost`, GPU reiniciada deixava a coruja 3D
// parada no canvas em vez de cair na Coruja A; e o descarte não soltava o contexto.

// Contexto WebGL2 mínimo (o mesmo de three-renderer-descarte), com WEBGL_lose_context espionável.
function glFalso(perdas) {
  const fixos = { VERSION: 0x1f02, ACTIVE_UNIFORMS: 0x8b86, ACTIVE_ATTRIBUTES: 0x8b89 };
  const loseContext = { loseContext: () => { perdas.n += 1; }, restoreContext() {} };
  return new Proxy({}, {
    get(_, k) {
      if (k in fixos) return fixos[k];
      if (k === 'canvas') return null;
      if (k === 'getExtension') return (nome) => (nome === 'WEBGL_lose_context' ? loseContext : {});
      if (k === 'getParameter') return (p) => (p === 0x1f02 ? 'WebGL 2.0' : p === 0x8b8c ? 'WebGL GLSL ES 3.00' : p === 0x0ba2 || p === 0x0c10 ? new Int32Array([0, 0, 1, 1]) : 16);
      if (k === 'getShaderPrecisionFormat') return () => ({ precision: 23, rangeMin: 127, rangeMax: 127 });
      if (k === 'getContextAttributes') return () => ({ alpha: true, antialias: true, depth: true, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false });
      if (k === 'getSupportedExtensions') return () => [];
      if (k === 'getShaderParameter' || k === 'getProgramParameter') return (_o, p) => (p === 0x8b86 ? 0 : p === 0x8b89 ? 0 : true);
      if (k === 'getShaderInfoLog' || k === 'getProgramInfoLog') return () => '';
      if (k === 'checkFramebufferStatus') return () => 0x8cd5;
      if (k === 'isContextLost') return () => false;
      if (typeof k === 'string' && /^[A-Z_0-9]+$/.test(k)) return 1;
      return () => ({});
    },
  });
}

function canvasFalso(perdas) {
  const ouvintes = new Map();
  const gl = glFalso(perdas);
  return {
    width: 1, height: 1, style: {},
    addEventListener(tipo, f) { if (!ouvintes.has(tipo)) ouvintes.set(tipo, new Set()); ouvintes.get(tipo).add(f); },
    removeEventListener(tipo, f) { ouvintes.get(tipo)?.delete(f); },
    disparar(tipo) {
      const evento = { type: tipo, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
      for (const f of [...(ouvintes.get(tipo) ?? [])]) f(evento);
      return evento;
    },
    ouvindo: (tipo) => ouvintes.get(tipo)?.size ?? 0,
    getContext: (nome) => (nome === 'webgl2' ? gl : null),
    getBoundingClientRect: () => ({ width: 300, height: 300 }),
    closest: () => null,
  };
}

const globais = {
  window: { devicePixelRatio: 1, matchMedia: () => ({ matches: false }) },
  document: { hidden: true },
  ResizeObserver: class { observe() {} disconnect() {} },
  requestAnimationFrame: () => 1,
  cancelAnimationFrame: () => {},
  // O GLB nunca chega: o teste fica antes da carga, onde o contexto também pode cair.
  fetch: (_url, { signal }) => new Promise((_, rejeitar) => signal.addEventListener('abort', () => rejeitar(new Error('abortado')))),
};
for (const [nome, valor] of Object.entries(globais)) Object.defineProperty(globalThis, nome, { value: valor, configurable: true, writable: true });

const { criarCenaCoruja3D } = await loadFrontendModule('../../src/components/stand/criarCenaCoruja3D.ts');

function montar() {
  const perdas = { n: 0 };
  const canvas = canvasFalso(perdas);
  const falhas = [];
  const cena = criarCenaCoruja3D({
    canvas, voz: () => 'ocioso', nivel: { current: 0 }, parado: false,
    aoPronto() {}, aoFalhar: (erro) => falhas.push(erro),
  });
  return { canvas, cena, falhas, perdas };
}

test('contexto WebGL perdido cai na Coruja A pelo aoFalhar', () => {
  const { canvas, cena, falhas } = montar();
  const evento = canvas.disparar('webglcontextlost');
  assert.equal(falhas.length, 1, 'aoFalhar chamado uma vez');
  assert.match(String(falhas[0]?.message), /contexto WebGL perdido/);
  assert.equal(evento.defaultPrevented, true);
  cena.dispose();
});

test('descarte solta o contexto com forceContextLoss e para de ouvir a perda', () => {
  const { canvas, cena, falhas, perdas } = montar();
  cena.dispose();
  assert.equal(perdas.n, 1, 'WEBGL_lose_context.loseContext chamado no dispose');
  canvas.disparar('webglcontextlost');
  assert.equal(falhas.length, 0, 'perda depois do descarte não derruba nada');
});

test('SensorLab também solta o contexto no descarte', () => {
  const fonte = readFileSync(new URL('../src/sensor-lab/scene/mountSensorLab.ts', import.meta.url), 'utf8');
  assert.match(fonte, /renderer\.dispose\(\);\s*renderer\.forceContextLoss\(\);/);
});
