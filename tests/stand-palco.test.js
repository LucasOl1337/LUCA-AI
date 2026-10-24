import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadFrontendModule } from './support/load-frontend-module.js';

// Lucas, 24/10 08:03: "O totem deveria ter o modo de tela cheia também, onde de
// fato vai ter uma experiência onde vai ficar como se ele fosse alguém dentro do
// monitor. Sem texto em volta. Principalmente se ele tiver AFK. Tem que ter como
// deixar ele AFK por tempo ou de propósito."
const { reduzirModo, modoInicial, palcoAfkDaUrl, PALCO_AFK_MS, REPOUSO_MS } = await loadFrontendModule('../../src/components/stand/modoStand.ts');
const { Palco } = await loadFrontendModule('../../src/components/stand/Telas.tsx');

const passo = (e, entrada, agora) => reduzirModo(e, entrada, agora, 3);
const totem = () => modoInicial(0, { palcoAfkMs: PALCO_AFK_MS });

test('palco por tempo: Coruja sem ninguém 45 s entra no palco e fica (não cai na Vitrine)', () => {
  assert.equal(PALCO_AFK_MS, 45_000);
  let e = totem();
  e = passo(e, { tipo: 'relogio' }, PALCO_AFK_MS - 1);
  assert.equal(e.palco, false);
  e = passo(e, { tipo: 'relogio' }, PALCO_AFK_MS);
  assert.deepEqual([e.modo, e.palco], ['coruja', true]);
  e = passo(e, { tipo: 'relogio' }, PALCO_AFK_MS + REPOUSO_MS * 10);
  assert.deepEqual([e.modo, e.palco], ['coruja', true], 'AFK longo segue no palco');
});

test('vizinho: conversa ou vídeo em andamento seguram a Coruja fora do palco', () => {
  const e = passo(totem(), { tipo: 'relogio', corujaOcupada: true }, PALCO_AFK_MS * 3);
  assert.equal(e.palco, false);
});

test('sai do palco com toque, tecla, voz ou rosto (atividade) e o tempo recomeça', () => {
  let e = passo(totem(), { tipo: 'relogio' }, PALCO_AFK_MS);
  e = passo(e, { tipo: 'atividade', toque: true }, 50_000);
  assert.deepEqual([e.modo, e.palco], ['coruja', false]);
  e = passo(e, { tipo: 'relogio' }, 50_000 + PALCO_AFK_MS - 1);
  assert.equal(e.palco, false);
  e = passo(e, { tipo: 'relogio' }, 50_000 + PALCO_AFK_MS);
  assert.equal(e.palco, true);
});

test('palco de propósito fica com conversa e rosto na frente; gesto tira (24/10: a voz derrubava a tela cheia)', () => {
  let e = passo(totem(), { tipo: 'palco', ligado: true }, 1000);
  for (const [i, agora] of [2000, 2500, 9000].entries()) {
    e = passo(e, { tipo: 'atividade', presenca: true }, agora);
    assert.equal(e.palco, true, `passo ${i} da voz/rosto mantém o palco`);
  }
  assert.equal(e.marco, 9000, 'presença segura o tempo');
  e = passo(e, { tipo: 'atividade' }, 10_000);
  assert.equal(e.palco, false, 'controle, tecla ou toque tiram');
  // Palco por tempo: presença (rosto chegando, alguém falando) tira, como antes.
  let afk = passo(totem(), { tipo: 'relogio' }, PALCO_AFK_MS);
  assert.equal(afk.palco, true);
  afk = passo(afk, { tipo: 'atividade', presenca: true }, PALCO_AFK_MS + 1);
  assert.equal(afk.palco, false);
  // De propósito, desligado e depois por tempo: o novo palco não herda o "de propósito".
  let ciclo = passo(passo(totem(), { tipo: 'palco', ligado: true }, 10), { tipo: 'palco', ligado: false }, 20);
  ciclo = passo(ciclo, { tipo: 'relogio' }, 20 + PALCO_AFK_MS);
  ciclo = passo(ciclo, { tipo: 'atividade', presenca: true }, 30 + PALCO_AFK_MS);
  assert.equal(ciclo.palco, false);
});

test('palco de propósito (botão / F): liga na hora, de qualquer modo, e F de novo desliga', () => {
  let e = passo(totem(), { tipo: 'palco', ligado: true }, 1000);
  assert.deepEqual([e.modo, e.palco], ['coruja', true]);
  e = passo(e, { tipo: 'palco' }, 2000);
  assert.equal(e.palco, false);
  let v = passo(totem(), { tipo: 'ir', modo: 'vitrine' }, 10);
  v = passo(v, { tipo: 'palco', ligado: true }, 20);
  assert.deepEqual([v.modo, v.palco], ['coruja', true]);
  let s = passo(totem(), { tipo: 'abrir_pagina', pagina: 'sonolencia' }, 10);
  s = passo(s, { tipo: 'palco', ligado: true }, 20);
  assert.deepEqual([s.modo, s.palco, s.pagina], ['coruja', true, null]);
});

test('vizinho: trocar de modo no palco desliga o palco; Vitrine segue pelo botão', () => {
  let e = passo(totem(), { tipo: 'palco', ligado: true }, 10);
  e = passo(e, { tipo: 'ir', modo: 'vitrine' }, 20);
  assert.deepEqual([e.modo, e.palco], ['vitrine', false]);
  e = passo(e, { tipo: 'ir', modo: 'coruja' }, 30);
  assert.deepEqual([e.modo, e.palco], ['coruja', false]);
});

test('sem palco por tempo (Stand sem login, ?palco=0): repouso antigo na Vitrine', () => {
  const e = passo(modoInicial(0), { tipo: 'relogio' }, REPOUSO_MS);
  assert.deepEqual([e.modo, e.palco], ['vitrine', false]);
  assert.equal(palcoAfkDaUrl('?palco=0'), null);
  assert.equal(palcoAfkDaUrl(''), PALCO_AFK_MS);
  assert.equal(palcoAfkDaUrl('?palco=8'), 8000);
  assert.equal(palcoAfkDaUrl('?palco=abc'), PALCO_AFK_MS);
});

test('Palco desenha só a coruja: sem chamada, marca, painel ou selo', () => {
  const html = renderToStaticMarkup(createElement(Palco, { variante: 'coruja', nivel: { current: 0 }, voz: 'ocioso' }));
  assert.match(html, /class="stand-palco"/);
  assert.match(html, /stand-avatar-palco/);
  assert.doesNotMatch(html, /stand-chamada|stand-marca|stand-comandos|stand-selo|<p[ >]/);
});
