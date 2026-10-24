import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { formatAppUrl, parseAppLocation, mergeAppLocation } from '../shared/app-location.js';
import { loadFrontendModule } from './support/load-frontend-module.js';

// Ensaio da feira (item 7): F5 no /gameplay voltava à landing e o totem ficava parado até alguém tocar.
test('/gameplay?quiosque=1 sobrevive à URL canônica; sem o parâmetro (ou em outra página) nada muda', () => {
  const canonica = (href) => formatAppUrl(parseAppLocation(href));
  assert.equal(canonica('/gameplay?quiosque=1'), '/gameplay?quiosque=1');
  assert.equal(parseAppLocation('/gameplay?quiosque=1').quiosque, '1');
  assert.equal(canonica('/gameplay'), '/gameplay');
  assert.equal(canonica('/gameplay?quiosque=sim'), '/gameplay');
  assert.equal(canonica('/stand?quiosque=1'), '/stand');
  assert.equal(canonica('/operador?quiosque=1'), '/operador');
  assert.equal(formatAppUrl({ page: 'gameplay', quiosque: '1' }), '/gameplay?quiosque=1');
});

test('sair do quiosque (Shift+Q) volta à landing; ir para outra página não leva o parâmetro', () => {
  const atual = parseAppLocation('/gameplay?quiosque=1');
  assert.equal(formatAppUrl(mergeAppLocation(atual, { quiosque: '' })), '/gameplay');
  assert.equal(formatAppUrl(mergeAppLocation(atual, { page: 'operador' })), '/operador');
});

test('quiosque desenha só a cabine, sem landing nem botão Iniciar', async () => {
  const { GameplayQuiosque } = await loadFrontendModule('../../src/pages/GameplayPage.tsx');
  const h = renderToStaticMarkup(createElement(GameplayQuiosque, { aoSair() {} }));
  assert.match(h, /data-quiosque="true"/);
  assert.match(h, /Carregando a cabine do Trator MAX/);
  assert.doesNotMatch(h, /Iniciar Gameplay|Como jogar/);
});
