import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { alertaCabine, bipeProximidade, ROTULO_ALERTA_CABINE, BIPE_LENTO_MS, BIPE_RAPIDO_MS } =
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
    [201, 'atencao', false], [200, 'atencao', false],
    [199, 'atencao', false], [151, 'atencao', false],
    [150, 'perigo', true], [101, 'perigo', true],
    [100, 'perigo', true], [2, 'perigo', true],
  ];
  for (const [cm, faixa, alerta] of casos) {
    const a = alertaCabine(estado({ cm }));
    assert.equal(a.faixa, faixa, `${cm} cm`);
    assert.equal(a.alerta, alerta, `${cm} cm`);
    assert.equal(a.bipe.intervaloMs, bipeProximidade(cm).intervaloMs, `${cm} cm`);
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
  assert.deepEqual(inclinado.bipe, { intervaloMs: BIPE_RAPIDO_MS, som: 'inclinacao' });
  assert.equal(inclinado.faixa, 'livre', 'a cor segue a distância; a faixa vermelha avisa a inclinação');
  const os2 = alertaCabine(estado({ cm: 140, arfagem: 25 }));
  assert.equal(os2.rotuloAlerta, ROTULO_ALERTA_CABINE);
  assert.equal(os2.bipe.som, 'proximidade');
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

test('vinheta de dano: alerta a 150 cm e na inclinação, crítica a 100 cm e no contato, só dirigindo', () => {
  const casos = [[400, 'nenhuma'], [199, 'nenhuma'], [150, 'alerta'], [101, 'alerta'], [100, 'critica'], [2, 'critica']];
  for (const [cm, nivel] of casos) assert.equal(alertaCabine(estado({ cm })).vinheta, nivel, `${cm} cm`);
  assert.equal(alertaCabine(estado({ rolagem: 22 })).vinheta, 'alerta');
  assert.equal(alertaCabine(estado({ cm: 120, contato: true })).vinheta, 'critica');
  assert.equal(alertaCabine(estado({ cm: 60, fase: 'pronto' })).vinheta, 'nenhuma');
  assert.equal(alertaCabine(estado({ cm: 60, contato: true, fase: 'fim' })).vinheta, 'nenhuma');
});

test('painel desenha a vinheta com o nível do alerta', () => {
  const atual = estado({ cm: 90 });
  const canal = { ler: () => atual, assinar: () => () => {}, aoEvento: () => () => {}, reiniciar() {}, encerrar() {} };
  const html = renderToStaticMarkup(createElement(PainelCabine, { canal }));
  assert.match(html, /class="gameplay-painel-vinheta" data-nivel="critica" aria-hidden="true"/);
});

test('alarme de ré (Lupa fila vazia 2): andando de ré apita lento e agudo; antes mudo; nunca cobre alerta nem toca parado ou fora da corrida', async () => {
  const { BIPE_RE } = await loadFrontendModule('../../src/components/gameplay/alertaCabine.ts');
  assert.deepEqual(alertaCabine(estado({ re: true, kph: 1.5 })).bipe, BIPE_RE);
  assert.deepEqual(BIPE_RE, { intervaloMs: 1000, som: 're' }, 'buzina de ré: meio segundo ligado, meio desligado');
  assert.equal(alertaCabine(estado({ re: false, kph: 1.5 })).bipe.intervaloMs, null, 'de frente sem nada: mudo');
  assert.equal(alertaCabine(estado({ re: true, kph: 0.1 })).bipe.intervaloMs, null, 'parado: mudo');
  assert.equal(alertaCabine(estado({ re: true, kph: 1.5, fase: 'fim' })).bipe.intervaloMs, null);
  assert.notDeepEqual(alertaCabine(estado({ re: true, kph: 1.5, cm: 120 })).bipe, BIPE_RE, 'alerta de obstáculo vence');
  assert.notDeepEqual(alertaCabine(estado({ re: true, kph: 1.5, cm: 300 })).bipe, BIPE_RE, 'eco do sensor vence');
});

test('cerca do talhão (Lupa, obs. da Lixa 05:39): preso de frente na cerca, a faixa diz "dê ré"; antes "Sem obstáculo"; sem bipe nem vinheta', async () => {
  const { ROTULO_CERCA_CABINE } = await loadFrontendModule('../../src/components/gameplay/alertaCabine.ts');
  const { cercaAFrente, TRATOR } = await loadFrontendModule('../../src/components/gameplay/fisicaTrator.ts');
  const { criarMotorGameplay } = await loadFrontendModule('../../src/components/gameplay/motorGameplay.ts');
  // Caso exato da Lixa: dirigir até a cerca e ficar parado encostado.
  const motor = criarMotorGameplay(() => 0);
  motor.reiniciar({ x: TRATOR.cercaM - 15, z: 0, rumoGraus: 0, tetoKph: 12, obstaculos: [] });
  let e;
  for (let i = 0; i < 60 * 10; i += 1) e = motor.quadro(1 / 60, { esterco: 0, acelerador: 1, freio: 0 });
  for (let i = 0; i < 30; i += 1) e = motor.quadro(1 / 60, { esterco: 0, acelerador: 0, freio: 0 });
  assert.equal(e.maquina.x, TRATOR.cercaM); assert.equal(e.sensor.eco, false, 'o sensor continua sem ver a cerca');
  const a = alertaCabine(e);
  assert.equal(a.cerca, true);
  assert.equal(a.rotuloAlerta, ROTULO_CERCA_CABINE);
  assert.equal(a.rotulo, 'Cerca do talhão à frente');
  assert.equal(a.alerta, false, 'não vira FREIE nem alerta');
  assert.equal(a.bipe.intervaloMs, null); assert.equal(a.vinheta, 'nenhuma');
  // De ré afastando, de lado ou longe: sem aviso.
  assert.equal(alertaCabine({ ...e, maquina: { ...e.maquina, re: true, velocidadeKph: 1 } }).cerca, false);
  assert.equal(cercaAFrente({ x: TRATOR.cercaM, z: 0, rumoGraus: 90 }), false, 'paralelo à cerca');
  assert.equal(cercaAFrente({ x: TRATOR.cercaM, z: 0, rumoGraus: 180 }), false, 'de costas');
  assert.equal(cercaAFrente({ x: TRATOR.cercaM - 2, z: 0, rumoGraus: 0 }), false, 'a 2 m');
  assert.equal(cercaAFrente({ x: 0, z: -TRATOR.cercaM + 0.3, rumoGraus: 60 }), true, 'cerca de z, nariz a 60°');
  assert.equal(cercaAFrente({ x: Number.NaN, z: 0, rumoGraus: 0 }), false);
  // Obstáculo real vence a cerca.
  assert.equal(alertaCabine({ ...e, sensor: { distanciaCm: 120, eco: true, alerta: true } }).rotuloAlerta, ROTULO_ALERTA_CABINE);
  assert.equal(alertaCabine({ ...e, fase: 'fim' }).cerca, false);
});

test('aviso da cerca no HUD da corrida usa o comando de ré de quem joga (Lixa): teclado não lê "L2"', async () => {
  const { rotuloCerca, ROTULO_CERCA_CABINE } = await loadFrontendModule('../../src/components/gameplay/alertaCabine.ts');
  assert.equal(rotuloCerca('ps'), ROTULO_CERCA_CABINE);
  assert.equal(rotuloCerca('xbox'), 'Cerca do talhão · dê ré com LT');
  assert.equal(rotuloCerca('teclado'), 'Cerca do talhão · dê ré com S / ↓');
});
