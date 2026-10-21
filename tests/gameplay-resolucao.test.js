import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadFrontendModule } from './support/load-frontend-module.js';

const css = (arquivo) => readFileSync(new URL(`../src/${arquivo}`, import.meta.url), 'utf8');

// 21/10: no /gameplay embutido o HUD media em vh/vw (janela) e o quadro ficava abaixo da dobra.
test('HUD da cabine mede pelo quadro do jogo (cqh/cqw), não pela janela', () => {
  for (const arquivo of ['components/gameplay/painelCabine.css', 'components/gameplay/mapaTalhao.css', 'components/gameplay/webcamSonoCabine.css', 'components/gameplay/visual/cabineVisual.css']) {
    assert.doesNotMatch(css(arquivo).replace(/\/\*[\s\S]*?\*\//g, ''), /[\d.]v[hw]\b/, arquivo);
  }
  assert.match(css('components/gameplay/gameplayKiosk.css'), /\.gameplay-kiosk \{[^}]*container-type: size/);
  assert.match(css('experience-pages.css'), /\.experience-game-viewport \{[^}]*container-type: size/);
});

test('com o jogo aberto, o quadro ocupa a altura que sobra na página', () => {
  const pagina = css('experience-pages.css');
  assert.match(pagina, /\.experience-page \{[^}]*height: 100%;[^}]*overflow-y: auto/);
  assert.match(pagina, /\.gameplay-page\[data-jogando\] \.experience-game-viewport \{[^}]*flex: 1 1 auto;[^}]*height: auto/);
});

test('landing do /gameplay mostra instruções e Iniciar; o quadro só monta depois', async () => {
  const { AppLocationProvider, GameplayPage } = await loadFrontendModule('./gameplay-pagina-entry.tsx');
  const antes = globalThis.window;
  globalThis.window = { location: { pathname: '/gameplay', search: '', hash: '' }, history: { replaceState() {}, pushState() {} }, addEventListener() {}, removeEventListener() {} };
  let h;
  try { h = renderToStaticMarkup(createElement(AppLocationProvider, null, createElement(GameplayPage))); } finally { globalThis.window = antes; }
  assert.match(h, /Como testar/);
  assert.match(h, /Iniciar Gameplay/);
  assert.doesNotMatch(h, /experience-game-viewport|Encerrar teste/);
});
