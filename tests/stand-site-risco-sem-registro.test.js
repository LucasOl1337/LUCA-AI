import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

// ADR 0001: no /sompo dentro do iframe do /stand (modo Site) o visitante toca a tela,
// então o painel de risco não oferece "Registrar avaliação" nem chega ao POST.
const require = createRequire(import.meta.url);
const { createElement } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { default: SompoRiskPanel } = await loadFrontendModule('../../src/components/SompoRiskPanel.tsx');
const fonte = await readFile(new URL('../src/components/SompoRiskPanel.tsx', import.meta.url), 'utf8');

const props = (embutido) => ({ telemetry: null, context: {}, onContext() {}, embutido });

test('no totem o painel de risco não tem botão de registrar', () => {
  const html = renderToStaticMarkup(createElement(SompoRiskPanel, props(true)));
  assert.doesNotMatch(html, /Registrar avaliação/);
  assert.match(html, /data-sompo-risk-somente-leitura/);
  assert.match(html, /a avaliação não é registrada/);
});

test('no /sompo normal o botão de registrar continua', () => {
  const html = renderToStaticMarkup(createElement(SompoRiskPanel, props(false)));
  assert.match(html, /Registrar avaliação/);
  assert.doesNotMatch(html, /data-sompo-risk-somente-leitura/);
});

test('o registro para antes do POST quando embutido, e o padrão é EMBUTIDO_NO_STAND', () => {
  assert.match(fonte, /embutido = EMBUTIDO_NO_STAND/);
  assert.match(fonte, /if \(embutido \|\| !telemetry \|\| busy\) return;/);
  assert.equal((fonte.match(/apiPost\(/g) ?? []).length + (fonte.match(/apiPost</g) ?? []).length, 1, 'um só POST, atrás do guarda');
});
