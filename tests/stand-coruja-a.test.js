import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

const require = createRequire(import.meta.url);
const { createElement } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const { OLHOS, geometriaPalpebra, memoriaInicial, passoCorujaA, transformCorpo, POSE_REPOUSO } = await loadFrontendModule('../../src/components/stand/corujaARig.ts');
const { default: AvatarLuca, VARIANTE_PADRAO, VARIANTES_AVATAR } = await loadFrontendModule('../../src/components/stand/AvatarLuca.tsx');

const semSorte = () => 0.5;

test('coruja A é a padrão e as antigas seguem por ?variante=', () => {
  assert.equal(VARIANTE_PADRAO, 'coruja-a');
  assert.deepEqual([...VARIANTES_AVATAR], ['coruja-a', 'coruja-3d', 'coruja', 'operario', 'robo']);
  const svg = renderToStaticMarkup(createElement(AvatarLuca, { parado: true }));
  assert.match(svg, /data-variante="coruja-a"/);
  assert.match(svg, /href="\/stand\/avatar\/coruja-a\/coruja-a\.webp"/);
  assert.equal((svg.match(/data-ca="palpebra"/g) || []).length, 2);
  assert.equal((svg.match(/data-ca="onda"/g) || []).length, 3);
  assert.doesNotMatch(svg, /data-rig="abre"/, 'coruja A não tem boca colada');
});

test('duas cópias na mesma página não repetem id', () => {
  const html = renderToStaticMarkup(createElement('div', null,
    createElement(AvatarLuca, { parado: true }), createElement(AvatarLuca, { parado: true })));
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length > 10);
  assert.equal(new Set(ids).size, ids.length);
});

test('pálpebra aberta fica acima do olho e fechada cobre até embaixo', () => {
  const olho = OLHOS[0];
  const aberta = geometriaPalpebra(olho, 0);
  const fechada = geometriaPalpebra(olho, 1);
  assert.equal(aberta.visivel, false);
  assert.equal(fechada.visivel, true);
  assert.ok(aberta.cy + aberta.ry <= olho.cy - olho.ry, 'aberta não invade o olho');
  assert.ok(fechada.cy + fechada.ry >= olho.cy + olho.ry, 'fechada cobre o olho inteiro');
});

test('pisca entre 3 e 6 s', () => {
  const m = memoriaInicial(0);
  const piscadas = [];
  for (let t = 0; t <= 30000; t += 16) {
    const antes = m.piscadaInicio;
    passoCorujaA(m, 'ocioso', 0, t, semSorte);
    if (m.piscadaInicio !== antes) piscadas.push(t);
  }
  const intervalos = piscadas.slice(1).map((t, i) => t - piscadas[i]);
  assert.ok(intervalos.length >= 4);
  for (const d of intervalos) assert.ok(d >= 3000 && d <= 6016, `intervalo ${d}`);
});

test('estado muda o olhar: ouvindo fixo, pensando para cima e com a pálpebra meio baixa', () => {
  const rodar = (voz) => { const m = memoriaInicial(0); let p; for (let t = 0; t < 1400; t += 16) p = passoCorujaA(m, voz, 0, t, semSorte); return { ...p }; };
  const ouvindo = rodar('ouvindo');
  const pensando = rodar('pensando');
  assert.ok(Math.abs(ouvindo.olharX) < 0.05);
  assert.ok(pensando.olharY < -0.8 && pensando.olharX > 0.6);
  assert.ok(pensando.palpebra > ouvindo.palpebra + 0.2);
  assert.ok(pensando.inclina < -1);
});

test('só a fala acende a voz; ouvir alto não acende', () => {
  const m = memoriaInicial(0);
  for (let t = 0; t < 500; t += 16) passoCorujaA(m, 'falando', 0.8, t, semSorte);
  assert.ok(m.pose.voz > 0.7);
  const n = memoriaInicial(0);
  for (let t = 0; t < 500; t += 16) passoCorujaA(n, 'ouvindo', 0.8, t, semSorte);
  assert.equal(n.pose.voz, 0);
});

test('respiração fica entre 1 e 2% de escala no pico', () => {
  assert.match(transformCorpo({ ...POSE_REPOUSO, respiro: 1 }), /scale\(1\.0060\)/);
  assert.match(transformCorpo({ ...POSE_REPOUSO, respiro: -1 }), /scale\(0\.9940\)/);
});
