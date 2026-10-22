import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { ComandosSimulacao } = await loadFrontendModule('../../src/components/gameplay/ComandosSimulacao.tsx');
const { PainelCabine, PainelCabineVista } = await loadFrontendModule('../../src/components/gameplay/PainelCabine.tsx');
const { DesafioCabine } = await loadFrontendModule('../../src/components/gameplay/DesafioCabine.tsx');
const { alertaCabine } = await loadFrontendModule('../../src/components/gameplay/alertaCabine.ts');

const estadoBase = () => ({
  versao: 1,
  fase: 'dirigindo',
  tempoMs: 1000,
  maquina: { x: 0, z: 0, rumoGraus: 0, velocidadeKph: 0, re: false },
  comandos: { esterco: 0, acelerador: 0, freio: 0 },
  sensor: { distanciaCm: 400, eco: false, alerta: false },
  atitude: { rolagemGraus: 0, arfagemGraus: 0 },
  contato: false,
  tetoKph: 6,
});

test('ComandosSimulacao renderiza ícones SVG nítidos de PS5 DualSense e Teclado/Mouse com atalhos discretos', () => {
  const html = renderToStaticMarkup(createElement(ComandosSimulacao));
  assert.match(html, /class="gameplay-comandos"/);
  assert.match(html, /data-comandos-simulacao=""/);
  assert.match(html, /data-dispositivo="ps5"/);
  assert.match(html, /data-icone="ps5"/);
  assert.match(html, /<svg[^>]*data-icone="ps5"/);
  assert.match(html, /<kbd>R2 \/ RT<\/kbd> Acelerar · <kbd>L2 \/ LT<\/kbd> Frear/);
  assert.match(html, /<kbd>Analógico esquerdo<\/kbd> Virar/);
  assert.match(html, /<kbd>PS \/ Home<\/kbd> Coruja/);

  assert.match(html, /data-dispositivo="teclado-mouse"/);
  assert.match(html, /<svg[^>]*data-icone="teclado-mouse"/);
  assert.match(html, /<kbd>W \/ ↑<\/kbd> Acelerar · <kbd>S \/ ↓<\/kbd> Frear/);
  assert.match(html, /<kbd>Espaço<\/kbd> Freio/);
  assert.match(html, /<kbd>Esc<\/kbd> Voltar à Coruja no Totem/);
});

test('PainelCabine e DesafioCabine (usados na Simulação do /stand e em /gameplay) incluem o guia discreto de comandos', () => {
  const e = estadoBase();
  const htmlVista = renderToStaticMarkup(createElement(PainelCabineVista, { painel: alertaCabine(e), estado: e }));
  assert.match(htmlVista, /data-comandos-simulacao=""/);
  assert.match(htmlVista, /data-icone="ps5"/);
  assert.match(htmlVista, /data-icone="teclado-mouse"/);

  const canal = {
    ler: () => e,
    assinar: () => () => {},
    aoEvento: () => () => {},
    reiniciar() {},
    encerrar() {},
  };
  const htmlPainel = renderToStaticMarkup(createElement(PainelCabine, { canal }));
  assert.match(htmlPainel, /data-comandos-simulacao=""/);

  const htmlDesafio = renderToStaticMarkup(createElement(DesafioCabine, { canal, som: false }));
  assert.match(htmlDesafio, /data-comandos-simulacao=""/);
  assert.match(htmlDesafio, /Acelerar/);
  assert.match(htmlDesafio, /Teclado\/Mouse/);
});

test('a legenda mora dentro do painel da cabine: sobe junto com ele em retrato e não cobre os selos', async () => {
  const e = estadoBase();
  const html = renderToStaticMarkup(createElement(PainelCabineVista, { painel: alertaCabine(e), estado: e }));
  const secao = html.match(/<section class="gameplay-painel-cabine"[\s\S]*?<\/section>/)?.[0] ?? '';
  assert.match(secao, /data-comandos-simulacao=""/);
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('../src/components/gameplay/painelCabine.css', import.meta.url), 'utf8');
  assert.match(css, /\.gameplay-painel-cabine > \.gameplay-comandos \{[^}]*bottom: calc\(100% \+ 18px\)/);
});
