import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { formatAppUrl, parseAppLocation, mergeAppLocation } from '../shared/app-location.js';
import { loadFrontendModule } from './support/load-frontend-module.js';

// Pergunta 6 (FPS no totem real): o selo só existe com ?fps=1; sem ele o gameplay não muda.
test('/gameplay?fps=1 sobrevive à URL canônica, sozinho ou com ?quiosque=1; fora do gameplay some', () => {
  const canonica = (href) => formatAppUrl(parseAppLocation(href));
  assert.equal(canonica('/gameplay?fps=1'), '/gameplay?fps=1');
  assert.equal(canonica('/gameplay?quiosque=1&fps=1'), '/gameplay?quiosque=1&fps=1');
  assert.equal(canonica('/gameplay?fps=sim'), '/gameplay');
  assert.equal(canonica('/stand?fps=1'), '/stand');
  // Shift+Q sai do quiosque e o selo fica; trocar de página leva o selo embora.
  const atual = parseAppLocation('/gameplay?quiosque=1&fps=1');
  assert.equal(formatAppUrl(mergeAppLocation(atual, { quiosque: '' })), '/gameplay?fps=1');
  assert.equal(formatAppUrl(mergeAppLocation(atual, { page: 'operador' })), '/operador');
});

test('o selo aparece só com o parâmetro', async () => {
  const { default: GameplayKiosk } = await loadFrontendModule('../../src/components/gameplay/GameplayKiosk.tsx');
  const sem = renderToStaticMarkup(createElement(GameplayKiosk));
  const com = renderToStaticMarkup(createElement(GameplayKiosk, { seloFps: true }));
  assert.doesNotMatch(sem, /data-selo-fps|gameplay-selo-fps/);
  assert.match(com, /data-selo-fps/);
  assert.match(com, /… fps.*mín ….*degrau \?\/3/s);
});

test('média e mínimo dos últimos 5 s, com as leituras de 1 s do medidor do palco', async () => {
  const { resumirLeituras, JANELA_SELO_MS } = await loadFrontendModule('../../src/components/gameplay/SeloFps.tsx');
  assert.equal(JANELA_SELO_MS, 5000);
  assert.equal(resumirLeituras([], 10_000), null);
  const leituras = [30, 60, 58, 61, 44, 57].map((fps, i) => ({ em: i * 1000, fps }));
  // Em t=5 s a de t=0 ainda conta (5 s exatos); em t=5,5 s ela sai da janela.
  assert.deepEqual(resumirLeituras(leituras, 5000), { medio: 52, minimo: 30 });
  assert.deepEqual(resumirLeituras(leituras, 5500), { medio: 56, minimo: 44 });
});
