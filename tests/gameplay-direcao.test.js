import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function carregar(caminho) {
  const result = await build({
    entryPoints: [new URL(caminho, import.meta.url).pathname],
    bundle: true, write: false, format: 'esm', platform: 'node',
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`);
}

const volante = await carregar('../src/components/gameplay/volante.ts');
const fisica = await carregar('../src/components/gameplay/fisicaTrator.ts');

const pad = ({ x = 0, r2 = 0, l2 = 0, options = false } = {}) => {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  buttons[7] = { pressed: r2 > 0.5, value: r2 };
  buttons[6] = { pressed: l2 > 0.5, value: l2 };
  buttons[9] = { pressed: options, value: options ? 1 : 0 };
  return { connected: true, mapping: 'standard', axes: [x, 0, 0, 0], buttons };
};

test('volante: zona morta 0,12, curva |x|^1,8 e batente', () => {
  assert.equal(volante.curvaEsterco(0.12), 0);
  assert.equal(volante.curvaEsterco(-0.05), 0);
  assert.equal(Object.is(volante.curvaEsterco(-0.05), -0), false);
  assert.equal(volante.curvaEsterco(0.5).toFixed(6), '0.220568');
  assert.equal(volante.curvaEsterco(-0.5).toFixed(6), '-0.220568');
  assert.equal(volante.curvaEsterco(1), 1);
  assert.equal(volante.curvaEsterco(-1), -1);
});

test('gatilho: corte de ruído e curva x^1,5', () => {
  assert.equal(volante.curvaGatilho(0.03), 0);
  assert.equal(volante.curvaGatilho(0.5).toFixed(6), '0.353553');
  assert.equal(volante.curvaGatilho(1), 1);
  assert.equal(volante.curvaGatilho(Number.NaN), 0);
});

test('volante gira a no máximo 2,5/s: do centro ao batente em 0,4 s', () => {
  const desejado = volante.comandoDesejado(pad({ x: 1 }));
  let atual = volante.COMANDO_PARADO;
  const caminho = [];
  for (let i = 0; i < 5; i += 1) caminho.push((atual = volante.passoVolante(atual, desejado, 0.1)).esterco);
  assert.deepEqual(caminho, [0.25, 0.5, 0.75, 1, 1]);
  // Quadro travado de 1 s conta como 0,1 s, sem pulo.
  assert.equal(volante.passoVolante(volante.COMANDO_PARADO, desejado, 1).esterco, 0.25);
});

test('setas e pad: vence o maior módulo; sem pad standard é parado', () => {
  const setas = { cima: true, baixo: false, esquerda: true, direita: false };
  assert.deepEqual(volante.comandoDesejado(pad({ x: 0.5, r2: 0.5 }), setas), { esterco: -1, acelerador: 1, freio: 0 });
  assert.deepEqual(volante.comandoDesejado({ ...pad({ x: 1 }), mapping: '' }), volante.COMANDO_PARADO);
  assert.equal(volante.setaDaTecla('ArrowLeft'), 'esquerda');
  assert.equal(volante.setaDaTecla('a'), 'esquerda');
  assert.equal(volante.setaDaTecla('q'), null);
});

test('Options reinicia só na borda de descida', () => {
  const primeiro = volante.bordaReiniciar(pad({ options: true }), false);
  assert.deepEqual(primeiro, { reiniciar: true, segurado: true });
  assert.deepEqual(volante.bordaReiniciar(pad({ options: true }), true), { reiniciar: false, segurado: true });
});

/** Acelera reto até o alerta; freia `reacaoS` depois dele. */
function corrida(tetoKph, reacaoS) {
  const obstaculos = [fisica.fardoAFrente({ x: 0, z: 0, rumoGraus: 0 }, 20)];
  let estado = fisica.criarTrator(0, 0, 0);
  let t = 0, alertaEm = null;
  const dt = 1 / 60;
  for (let i = 0; i < 60 * 40; i += 1) {
    if (fisica.leituraSensor(estado, obstaculos).alerta && alertaEm === null) alertaEm = t;
    const freando = alertaEm !== null && t >= alertaEm + reacaoS;
    estado = fisica.passoTrator(estado, { esterco: 0, acelerador: freando ? 0 : 1, freio: freando ? 1 : 0 }, dt, { obstaculos, tetoKph });
    t += dt;
    if (estado.contato || (freando && estado.velocidade <= 0.05)) break;
  }
  return { ...fisica.leituraSensor(estado, obstaculos), contato: estado.contato };
}

test('fardo a 20 m: a 6 km/h dá para parar mesmo com 0,5 s de reação; a 12 km/h, não', () => {
  const imediata = corrida(6, 0);
  assert.equal(imediata.contato, false);
  assert.ok(imediata.distanciaCm > 100 && imediata.distanciaCm <= 150, `${imediata.distanciaCm}`);
  const atrasada = corrida(6, 0.5);
  assert.equal(atrasada.contato, false);
  assert.ok(atrasada.distanciaCm > 20 && atrasada.distanciaCm < 60, `${atrasada.distanciaCm}`);
  const rapida = corrida(12, 0.5);
  assert.equal(rapida.contato, true);
  assert.equal(rapida.distanciaCm, 2);
});

test('teto de 6 km/h nunca é ultrapassado e, ao baixar, desacelera sem teleporte', () => {
  const mundo = { obstaculos: [], tetoKph: 6 };
  let estado = fisica.criarTrator(0);
  for (let i = 0; i < 600; i += 1) estado = fisica.passoTrator(estado, { esterco: 0, acelerador: 1, freio: 0 }, 1 / 60, mundo);
  assert.ok(Math.abs(estado.velocidade * 3.6 - 6) < 1e-9);
  const rapido = { ...fisica.criarTrator(0), velocidade: 12 / 3.6 };
  const depois = fisica.passoTrator(rapido, { esterco: 0, acelerador: 1, freio: 0 }, 0.1, mundo);
  assert.ok(depois.velocidade < rapido.velocidade && depois.velocidade > 6 / 3.6);
});

test('referencial: rumo 0 anda em +X; esterço à direita (+) gira o rumo para negativo e puxa para +Z', () => {
  const mundo = { obstaculos: [], tetoKph: 12 };
  let estado = { ...fisica.criarTrator(0), velocidade: 2 };
  for (let i = 0; i < 60; i += 1) estado = fisica.passoTrator(estado, { esterco: 1, acelerador: 0.5, freio: 0 }, 1 / 60, mundo);
  assert.ok(estado.x > 0);
  assert.ok(estado.rumo < 0);
  assert.ok(estado.z > 0);
});

test('L2 parado engata ré até 4 km/h; cerca de ±90 m segura o trator', () => {
  let estado = fisica.criarTrator(0);
  for (let i = 0; i < 600; i += 1) estado = fisica.passoTrator(estado, { esterco: 0, acelerador: 0, freio: 1 }, 1 / 60, { obstaculos: [], tetoKph: 12 });
  assert.ok(Math.abs(estado.velocidade * 3.6 + 4) < 1e-9);
  let cerca = { ...fisica.criarTrator(89.99), velocidade: 3 };
  cerca = fisica.passoTrator(cerca, { esterco: 0, acelerador: 1, freio: 0 }, 0.1, { obstaculos: [], tetoKph: 12 });
  assert.equal(cerca.x, 90);
  assert.equal(cerca.velocidade, 0);
});

test('sensor: só enxerga o que está na linha da frente e até 400 cm', () => {
  const pose = fisica.criarTrator(0);
  const longe = fisica.fardoAFrente({ x: 0, z: 0, rumoGraus: 0 }, 4.5);
  assert.deepEqual(fisica.leituraSensor(pose, [longe]), { distanciaCm: 400, eco: false, alerta: false });
  const perto = fisica.fardoAFrente({ x: 0, z: 0, rumoGraus: 0 }, 1.2);
  assert.deepEqual(fisica.leituraSensor(pose, [perto]), { distanciaCm: 120, eco: true, alerta: true });
  const deLado = { ...perto, z: 2 };
  assert.equal(fisica.leituraSensor(pose, [deLado]).eco, false);
});

test('guinada: entra progressivamente e conserva brevemente o giro ao centralizar o volante', () => {
  const mundo = { obstaculos: [], tetoKph: 6 };
  const comando = { esterco: 1, acelerador: 1, freio: 0 };
  const inicial = { ...fisica.criarTrator(0), velocidade: 6 / 3.6 };
  const alvo = -(inicial.velocidade / fisica.TRATOR.entreEixosM) * Math.tan(fisica.TRATOR.estercoMaxRad);
  const primeiro = fisica.passoTrator(inicial, comando, 0.1, mundo);
  assert(primeiro.guinada < 0 && primeiro.guinada > alvo);
  const esperado = alvo * (1 - Math.exp(-0.1 / fisica.TRATOR.guinadaTauS));
  assert(Math.abs(primeiro.guinada - esperado) < 1e-12);
  const centralizou = fisica.passoTrator(primeiro, { ...comando, esterco: 0 }, 0.1, mundo);
  assert(centralizou.guinada < 0 && centralizou.guinada > primeiro.guinada);
  assert(centralizou.rumo < primeiro.rumo, 'a carroceria não interrompe o giro instantaneamente');
  const inverteu = fisica.passoTrator(primeiro, { ...comando, esterco: -1 }, 1 / 60, mundo);
  assert(inverteu.guinada < 0 && inverteu.guinada > primeiro.guinada, 'não salta para o lado oposto');
});

test('guinada: mesmo rumo e taxa em um passo de 100 ms ou dois de 50 ms a velocidade constante', () => {
  const mundo = { obstaculos: [], tetoKph: 6 };
  const comando = { esterco: 1, acelerador: 1, freio: 0 };
  const inicial = { ...fisica.criarTrator(0), velocidade: 6 / 3.6 };
  const inteiro = fisica.passoTrator(inicial, comando, 0.1, mundo);
  const metade = fisica.passoTrator(inicial, comando, 0.05, mundo);
  const dividido = fisica.passoTrator(metade, comando, 0.05, mundo);
  assert(Math.abs(inteiro.rumo - dividido.rumo) < 1e-12);
  assert(Math.abs(inteiro.guinada - dividido.guinada) < 1e-12);
});

test('guinada: parado não gira, contato zera a taxa, ré inverte o sentido', () => {
  const mundo = { obstaculos: [], tetoKph: 6 };
  const parado = { ...fisica.criarTrator(0), guinada: -0.2 };
  const fim = fisica.passoTrator(parado, { esterco: 1, acelerador: 0, freio: 0 }, 0.1, mundo);
  assert.equal(fim.rumo, parado.rumo);
  assert.equal(fim.guinada, 0);
  const re = fisica.passoTrator({ ...fisica.criarTrator(0), velocidade: -1 }, { esterco: 1, acelerador: 0, freio: 1 }, 0.1, mundo);
  assert(re.guinada > 0 && re.rumo > 0);
  const obstaculos = [fisica.fardoAFrente({ x: 0, z: 0, rumoGraus: 0 }, 0.01)];
  const contato = fisica.passoTrator({ ...fisica.criarTrator(0), velocidade: 1, guinada: -0.1 }, { esterco: 0, acelerador: 1, freio: 0 }, 0.1, { ...mundo, obstaculos });
  assert.equal(contato.contato, true);
  assert.equal(contato.guinada, 0);
});

test('volante: soltar pad retorna ao centro em 0,4 s sem ultrapassar zero; pedais não esperam o aro', () => {
  let comando = { esterco: 1, acelerador: 1, freio: 0 };
  const caminho = [];
  for (let i = 0; i < 5; i += 1) caminho.push((comando = volante.passoVolante(comando, { esterco: 0, acelerador: 0, freio: 1 }, 0.1)).esterco);
  assert.deepEqual(caminho, [0.75, 0.5, 0.25, 0, 0]);
  assert.deepEqual([comando.acelerador, comando.freio], [0, 1]);
  const semTempo = volante.passoVolante({ esterco: -1, acelerador: 0, freio: 0 }, volante.COMANDO_PARADO, 0);
  assert.equal(semTempo.esterco, -1);
});
