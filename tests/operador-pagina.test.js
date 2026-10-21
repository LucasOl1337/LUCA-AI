import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { OperadorVista } = await loadFrontendModule('../../src/pages/OperadorPage.tsx');

const estado = ({ x = 0, z = 0, cm = 400 } = {}) => ({
  versao: 1, fase: 'dirigindo', tempoMs: 65_000,
  maquina: { x, z, rumoGraus: 0, velocidadeKph: 8, re: false },
  comandos: { esterco: 0, acelerador: 0.5, freio: 0 },
  sensor: { distanciaCm: cm, eco: cm < 400, alerta: cm <= 150 },
  atitude: { rolagemGraus: 0, arfagemGraus: 0 }, contato: false, tetoKph: 12,
});
const html = (retrato, agora = 10_000) => renderToStaticMarkup(createElement(OperadorVista, { retrato, agora, som: false }));

test('sem retrato: aguardando o totem, sem mapa', () => {
  const h = html(null);
  assert.match(h, /data-sinal="aguardando"/);
  assert.match(h, /Aguardando o totem/);
  assert.match(h, /SIMULADO/);
  assert.doesNotMatch(h, /gameplay-mapa/);
});

test('ao vivo: mapa, sensor, velocidade, fase e som mudo por padrão', () => {
  const h = html({ estado: estado({ cm: 240 }), recebidoEm: 9_500 });
  assert.match(h, /data-sinal="ao-vivo"/);
  assert.match(h, />Ao vivo</);
  assert.match(h, /class="gameplay-mapa"/);
  assert.match(h, /2,4 m/);
  assert.match(h, /8 km\/h/);
  assert.match(h, /1:05/);
  assert.match(h, /aria-pressed="false"[^>]*>Som mudo/);
});

test('dentro da zona alagada: faixa de alerta e card de zona acesos', () => {
  const h = html({ estado: estado({ x: 25, z: 15 }), recebidoEm: 10_000 });
  assert.match(h, /Dentro da área alagada · saia/);
  assert.match(h, /data-alerta="true"><span>Zona de risco<\/span><strong>Área alagada/);
});

test('retrato velho: sem sinal há N s, mantendo o último mapa', () => {
  const h = html({ estado: estado(), recebidoEm: 1_000 }, 10_000);
  assert.match(h, /data-sinal="sem-sinal"/);
  assert.match(h, /Sem sinal há 9 s/);
  assert.match(h, /gameplay-mapa/);
});

/**
 * Todo CSS que a página do operador carrega: segue os imports locais (`@/`, `./`)
 * a partir do OperadorPage.tsx, inclusive os de componentes importados, porque o
 * Vite junta o CSS de toda a árvore no chunk da página. `import type` não conta.
 */
function cssDoOperador() {
  const src = fileURLToPath(new URL('../src/', import.meta.url));
  const vistos = new Set();
  const css = new Map();
  const resolver = (de, alvo) => {
    const base = alvo.startsWith('@/') ? path.join(src, alvo.slice(2)) : path.resolve(path.dirname(de), alvo);
    for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) if (existsSync(c) && statSync(c).isFile()) return c;
    return null;
  };
  const visitar = (arquivo) => {
    if (vistos.has(arquivo)) return;
    vistos.add(arquivo);
    const fonte = readFileSync(arquivo, 'utf8');
    for (const [, tipo, alvo] of fonte.matchAll(/^import\s+(type\s+)?(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)) {
      if (tipo || !(alvo.startsWith('@/') || alvo.startsWith('.'))) continue;
      const destino = resolver(arquivo, alvo);
      assert.ok(destino, `import não resolvido: ${alvo} em ${arquivo}`);
      if (destino.endsWith('.css')) css.set(path.relative(src, destino), readFileSync(destino, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''));
      else if (/\.tsx?$/.test(destino)) visitar(destino);
    }
  };
  visitar(path.join(src, 'pages/OperadorPage.tsx'));
  return css;
}

// Com o /gameplay no mesmo navegador, animação infinita aqui derrubou o jogo de 42 para 23 fps.
test('CSS do operador (todos os imports): nada infinito, keyframes só com opacity/transform, sem filter', () => {
  const todos = cssDoOperador();
  assert.ok(todos.has('pages/operadorPage.css'), `achou: ${[...todos.keys()]}`);
  assert.ok(todos.size >= 2, `o mapa traz o próprio CSS; achou: ${[...todos.keys()]}`);
  for (const [nome, css] of todos) {
    assert.doesNotMatch(css, /infinite/, nome);
    assert.doesNotMatch(css, /filter\s*:/, nome);
    for (const [, corpo] of css.matchAll(/@keyframes[^{]+\{((?:[^{}]*\{[^}]*\})*)\s*\}/g)) {
      for (const [, prop] of corpo.matchAll(/([a-z-]+)\s*:/g)) assert.ok(['opacity', 'transform'].includes(prop), `${nome}: keyframe anima ${prop}`);
    }
  }
  assert.match(todos.get('pages/operadorPage.css'), /\.operador\[data-oculto\] \* \{ animation-play-state: paused/);
});

test('aba oculta: marca data-oculto para pausar as animações', () => {
  const h = renderToStaticMarkup(createElement(OperadorVista, { retrato: null, agora: 0, som: false, oculto: true }));
  assert.match(h, /data-oculto="true"/);
});

test('totem com a aba oculta: selo "Jogo pausado no totem", mapa mantido', () => {
  const h = html({ estado: estado(), recebidoEm: 1_000, oculto: true }, 10_000);
  assert.match(h, /data-sinal="pausado"/);
  assert.match(h, /Jogo pausado no totem/);
  assert.match(h, /gameplay-mapa/);
});
