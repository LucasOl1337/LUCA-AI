import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

const require = createRequire(import.meta.url);
const { createElement } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const { rigTransform, palpebraNaPiscada, RIG_PARADO } = await loadFrontendModule('../../src/components/stand/avatarRig.ts');
const { default: AvatarLuca, VARIANTE_PADRAO } = await loadFrontendModule('../../src/components/stand/AvatarLuca.tsx');
const { tratarTecla } = await loadFrontendModule('../../src/components/stand/atalhos.ts');

test('boca fechada fica no mínimo e aberta chega à escala 1', () => {
  const p = { cx: 200, cy: 280, min: 0.05 };
  assert.match(rigTransform('abre', p, RIG_PARADO), /scale\(1 0\.050\)/);
  assert.match(rigTransform('abre', p, { ...RIG_PARADO, boca: 1 }), /scale\(1 1\.000\)/);
  assert.equal(rigTransform('desce', { k: 12 }, { ...RIG_PARADO, boca: 0.5 }), 'translate(0 6.00)');
  // Coruja: min 0 some com a boca de vez quando fechada.
  assert.match(rigTransform('abre', { cx: 200, cy: 282, min: 0 }, RIG_PARADO), /scale\(1 0\.000\)/);
});

test('piscada fecha no meio e reabre no fim', () => {
  assert.equal(palpebraNaPiscada(0, 0), 1);
  assert.equal(palpebraNaPiscada(75, 0), 0);
  assert.equal(palpebraNaPiscada(150, 0), 1);
  assert.match(rigTransform('pisca', { cx: 1, cy: 1 }, { ...RIG_PARADO, palpebra: 0 }), /scale\(1 0\.060\)/);
});

test('as 3 variações renderizam SVG com rig e sem ids', () => {
  assert.equal(VARIANTE_PADRAO, 'coruja');
  for (const variante of ['coruja', 'operario', 'robo']) {
    const svg = renderToStaticMarkup(createElement(AvatarLuca, { variante, parado: true }));
    assert.match(svg, /^<svg/);
    assert.match(svg, /data-rig="abre"/, `${variante} sem boca animável`);
    assert.match(svg, /data-rig="pisca"/, `${variante} sem piscada`);
    assert.doesNotMatch(svg, /\sid="/, `${variante} com id fixo`);
  }
});

test('atalhos da equipe do stand', () => {
  const chamadas = [];
  const atalhos = Object.fromEntries(['iniciar', 'encerrar', 'reiniciar', 'pularVideo', 'demonstrar', 'alternarGrade', 'alternarTelaCheia', 'sair']
    .map((nome) => [nome, () => chamadas.push(nome)]));
  const tecla = (key, extra = {}) => tratarTecla({ key, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...extra }, atalhos);
  assert.ok(tecla(' '));
  assert.ok(tecla('Enter'));
  assert.ok(tecla('Escape'));
  assert.ok(tecla('r'));
  assert.ok(tecla('N'));
  assert.ok(tecla('d'));
  assert.ok(tecla('f'));
  assert.ok(tecla('Q', { shiftKey: true }));
  assert.equal(tecla('q'), false);
  assert.equal(tecla('r', { ctrlKey: true }), false);
  assert.deepEqual(chamadas, ['iniciar', 'iniciar', 'encerrar', 'reiniciar', 'pularVideo', 'demonstrar', 'alternarTelaCheia', 'sair']);
});
