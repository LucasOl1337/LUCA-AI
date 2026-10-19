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
