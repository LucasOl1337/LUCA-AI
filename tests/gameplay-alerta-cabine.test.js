import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { alertaCabine, ROTULO_ALERTA_CABINE, BIPE_LENTO_MS, BIPE_RAPIDO_MS } =
  await loadFrontendModule('../../src/components/gameplay/alertaCabine.ts');

/** Estado da Direção com o sensor como a física entrega: eco até 400 cm, alerta a 150 cm. */
const estado = ({ cm = 400, eco = cm < 400, fase = 'dirigindo', contato = false, kph = 6, re = false, rolagem = 0, arfagem = 0 } = {}) => ({
  versao: 1, fase, tempoMs: 1000,
  maquina: { x: 0, z: 0, rumoGraus: 0, velocidadeKph: kph, re },
  comandos: { esterco: 0, acelerador: 0, freio: 0 },
  sensor: { distanciaCm: cm, eco, alerta: eco && cm <= 150 },
  atitude: { rolagemGraus: rolagem, arfagemGraus: arfagem },
  contato, tetoKph: 6,
});

test('faixa de cor segue o /sompo e o alerta segue o flag de 150 cm', () => {
  const casos = [
    [201, 'livre', false, null], [200, 'livre', false, null],
    [199, 'atencao', false, BIPE_LENTO_MS], [151, 'atencao', false, BIPE_LENTO_MS],
    [150, 'perigo', true, BIPE_RAPIDO_MS], [101, 'perigo', true, BIPE_RAPIDO_MS],
    [100, 'perigo', true, 0], [2, 'perigo', true, 0],
  ];
  for (const [cm, faixa, alerta, intervalo] of casos) {
    const a = alertaCabine(estado({ cm }));
    assert.equal(a.faixa, faixa, `${cm} cm`);
    assert.equal(a.alerta, alerta, `${cm} cm`);
    assert.equal(a.bipe.intervaloMs, intervalo, `${cm} cm`);
    assert.equal(a.rotuloAlerta, alerta ? ROTULO_ALERTA_CABINE : '');
  }
});

test('sem eco: verde, "+4 m", mudo, sem inventar obstáculo', () => {
  const a = alertaCabine(estado({ cm: 400 }));
  assert.equal(a.faixa, 'livre');
  assert.equal(a.distanciaTexto, '+4 m');
  assert.equal(a.rotulo, 'Sem obstáculo no alcance');
  assert.equal(a.bipe.intervaloMs, null);
});

test('distância em metros com vírgula e velocidade arredondada com ré', () => {
  assert.equal(alertaCabine(estado({ cm: 243 })).distanciaTexto, '2,4 m');
  assert.equal(alertaCabine(estado({ cm: 150 })).distanciaTexto, '1,5 m');
  assert.equal(alertaCabine(estado({ kph: 5.6 })).velocidadeTexto, '6 km/h');
  assert.equal(alertaCabine(estado({ kph: 2.2, re: true })).velocidadeTexto, '2 km/h · ré');
});

test('contato vira perigo com tom contínuo', () => {
  const a = alertaCabine(estado({ cm: 120, contato: true }));
  assert.equal(a.faixa, 'perigo');
  assert.equal(a.rotulo, 'Contato com o obstáculo');
  assert.equal(a.bipe.intervaloMs, 0);
});

test('bipe só toca dirigindo: pronto e fim ficam mudos mesmo perto', () => {
  for (const fase of ['pronto', 'fim']) {
    const a = alertaCabine(estado({ cm: 90, fase }));
    assert.equal(a.bipe.intervaloMs, null, fase);
    assert.equal(a.faixa, 'perigo', fase);
  }
});

test('inclinação liga a partir de 20° na rolagem ou arfagem', () => {
  assert.deepEqual(alertaCabine(estado({ rolagem: 19.9 })).inclinacao, { ligada: false, graus: 20 });
  assert.equal(alertaCabine(estado({ rolagem: -20 })).inclinacao.ligada, true);
  assert.equal(alertaCabine(estado({ arfagem: 22 })).inclinacao.ligada, true);
});

test('risco de tombamento acende a faixa vermelha e bipa mais grave; obstáculo tem prioridade', () => {
  const calmo = alertaCabine(estado({ rolagem: -19.4 }));
  assert.equal(calmo.alerta, false);
  assert.equal(calmo.rotuloAlerta, '');
  const inclinado = alertaCabine(estado({ rolagem: -21.2 }));
  assert.equal(inclinado.alerta, true);
  assert.equal(inclinado.rotuloAlerta, 'Inclinação de 21° · freie');
  assert.equal(inclinado.rotulo, 'Risco de tombamento');
  assert.deepEqual(inclinado.bipe, { intervaloMs: BIPE_RAPIDO_MS, frequenciaHz: 660 });
  assert.equal(inclinado.faixa, 'livre', 'a cor segue a distância; a faixa vermelha avisa a inclinação');
  const os2 = alertaCabine(estado({ cm: 140, arfagem: 25 }));
  assert.equal(os2.rotuloAlerta, ROTULO_ALERTA_CABINE);
  assert.equal(os2.bipe.frequenciaHz, 1180);
  assert.equal(alertaCabine(estado({ rolagem: -25, fase: 'fim' })).bipe.intervaloMs, null);
});

const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const { createElement } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { PainelCabine, PainelCabineVista } = await loadFrontendModule('../../src/components/gameplay/PainelCabine.tsx');

test('painel mostra distância, cor e selo SIMULADO; faixa vermelha só com alerta', () => {
  const longe = estado({ cm: 180 });
  const html = renderToStaticMarkup(createElement(PainelCabineVista, { painel: alertaCabine(longe), estado: longe }));
  assert.match(html, /data-faixa="atencao"/);
  assert.match(html, /SIMULADO/);
  assert.match(html, /1,8 m/);
  assert.match(html, /role="alert" hidden=""/);
  const perto = estado({ cm: 140 });
  const alerta = renderToStaticMarkup(createElement(PainelCabineVista, { painel: alertaCabine(perto), estado: perto }));
  assert.match(alerta, /data-alerta="true"/);
  assert.match(alerta, /Obstáculo a 1,5 m · freie/);
  assert.doesNotMatch(alerta, /role="alert" hidden/);
});

test('PainelCabine lê o canal da Direção e renderiza sem áudio no servidor', () => {
  const atual = estado({ cm: 90 });
  const canal = { ler: () => atual, assinar: () => () => {}, aoEvento: () => () => {}, reiniciar() {}, encerrar() {} };
  const html = renderToStaticMarkup(createElement(PainelCabine, { canal }));
  assert.match(html, /data-faixa="perigo"/);
  assert.match(html, /0,9 m/);
});
