import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { geofenceTalhao, ZONAS_TALHAO, GEOFENCE_MIN_KPH } = await loadFrontendModule('../../src/components/gameplay/geofenceTalhao.ts');
const { alertaCabine, ROTULO_ALERTA_CABINE } = await loadFrontendModule('../../src/components/gameplay/alertaCabine.ts');
const { PainelCabineVista } = await loadFrontendModule('../../src/components/gameplay/PainelCabine.tsx');

// Zona "alagado": x 12..42, z 9..24 (à direita de quem sai da partida em +X).
const maq = (o = {}) => ({ x: 0, z: 0, rumoGraus: 0, velocidadeKph: 8, re: false, ...o });
const estado = ({ cm = 400, contato = false, rolagem = 0, fase = 'dirigindo', ...m } = {}) => ({
  versao: 1, fase, tempoMs: 1000, maquina: maq(m),
  comandos: { esterco: 0, acelerador: 0, freio: 0 },
  sensor: { distanciaCm: cm, eco: cm < 400, alerta: cm <= 150 },
  atitude: { rolagemGraus: rolagem, arfagemGraus: 0 }, contato, tetoKph: 12,
});

test('fora da zona e longe dela: nada', () => {
  assert.equal(ZONAS_TALHAO[0].id, 'alagado');
  assert.deepEqual(geofenceTalhao(maq()), { nivel: 'fora', zona: null });
  assert.equal(geofenceTalhao(maq({ x: 20, z: 0 })).nivel, 'fora', 'seguindo reto ao lado da zona');
});

test('rumo à zona só com a projeção de 3 s entrando e acima de 2 km/h', () => {
  // Rumo -90 = frente em +Z (direita da partida). A 8 km/h anda 6,7 m em 3 s.
  assert.equal(geofenceTalhao(maq({ x: 20, z: 3, rumoGraus: -90 })).nivel, 'rumo');
  assert.equal(geofenceTalhao(maq({ x: 20, z: 3, rumoGraus: -90 })).zona.id, 'alagado');
  assert.equal(geofenceTalhao(maq({ x: 20, z: -2, rumoGraus: -90 })).nivel, 'fora', '11 m: além de 3 s');
  assert.equal(geofenceTalhao(maq({ x: 20, z: 3, rumoGraus: -90, velocidadeKph: GEOFENCE_MIN_KPH - 0.1 })).nivel, 'fora');
  assert.equal(geofenceTalhao(maq({ x: 20, z: 3, rumoGraus: 90 })).nivel, 'fora', 'afastando');
});

test('ré projeta para trás', () => {
  assert.equal(geofenceTalhao(maq({ x: 20, z: 3, rumoGraus: 90, re: true })).nivel, 'rumo');
  assert.equal(geofenceTalhao(maq({ x: 20, z: 3, rumoGraus: -90, re: true })).nivel, 'fora');
});

test('dentro vale parado e na borda', () => {
  assert.equal(geofenceTalhao(maq({ x: 30, z: 15, velocidadeKph: 0 })).nivel, 'dentro');
  assert.equal(geofenceTalhao(maq({ x: 12, z: 9, velocidadeKph: 0 })).nivel, 'dentro');
});

test('painel: zona acende faixa, bipe e vinheta; contato e obstáculo vêm antes, inclinação depois', () => {
  const rumo = alertaCabine(estado({ x: 20, z: 3, rumoGraus: -90 }));
  assert.equal(rumo.alerta, true);
  assert.equal(rumo.rotuloAlerta, 'Rumo à área alagada · desvie');
  assert.equal(rumo.vinheta, 'alerta');
  assert.equal(rumo.bipe.som, 'zona');
  const dentro = alertaCabine(estado({ x: 30, z: 15 }));
  assert.equal(dentro.rotuloAlerta, 'Dentro da área alagada · saia');
  assert.equal(dentro.vinheta, 'critica');
  assert.equal(dentro.rotulo, 'Zona de risco: Área alagada');
  const comObstaculo = alertaCabine(estado({ x: 30, z: 15, cm: 140 }));
  assert.equal(comObstaculo.rotuloAlerta, ROTULO_ALERTA_CABINE);
  assert.equal(comObstaculo.bipe.som, 'proximidade');
  assert.equal(alertaCabine(estado({ x: 30, z: 15, contato: true, cm: 120 })).rotulo, 'Contato com o obstáculo');
  const comInclinacao = alertaCabine(estado({ x: 30, z: 15, rolagem: 22 }));
  assert.equal(comInclinacao.rotuloAlerta, 'Dentro da área alagada · saia');
  assert.equal(comInclinacao.inclinacao.ligada, true);
  assert.equal(alertaCabine(estado({ x: 30, z: 15, fase: 'fim' })).bipe.intervaloMs, null);
});

test('minimapa mostra a zona ativa e o nível', () => {
  const e = estado({ x: 30, z: 15 });
  const html = renderToStaticMarkup(createElement(PainelCabineVista, { painel: alertaCabine(e), estado: e }));
  assert.match(html, /class="gameplay-mapa" data-geofence="dentro"/);
  assert.match(html, /gameplay-mapa-zona" data-ativa="true"/);
  assert.match(html, /<figcaption>Área alagada<\/figcaption>/);
  const livre = estado();
  assert.match(renderToStaticMarkup(createElement(PainelCabineVista, { painel: alertaCabine(livre), estado: livre })), /data-geofence="fora"/);
});
