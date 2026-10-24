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

test('volante: zona morta 0,12, curva |x|^1,35 e batente', () => {
  assert.equal(volante.curvaEsterco(0.12), 0);
  assert.equal(volante.curvaEsterco(-0.05), 0);
  assert.equal(Object.is(volante.curvaEsterco(-0.05), -0), false);
  assert.equal(volante.curvaEsterco(0.5).toFixed(6), '0.321852');
  assert.equal(volante.curvaEsterco(-0.5).toFixed(6), '-0.321852');
  assert.equal(volante.curvaEsterco(1), 1);
  assert.equal(volante.curvaEsterco(-1), -1);
});

/** Raio da curva em regime a 12 km/h com o analógico em `x`, pela física real (volante + guinada). */
function raioA12(x) {
  const mundo = { obstaculos: [], tetoKph: 12 };
  let estado = { ...fisica.criarTrator(0), velocidade: 12 / 3.6 };
  let comando = volante.COMANDO_PARADO;
  for (let i = 0; i < 180; i += 1) {
    comando = volante.passoVolante(comando, volante.comandoDesejado(pad({ x, r2: 1 })), 1 / 60);
    estado = fisica.passoTrator(estado, comando, 1 / 60, mundo);
  }
  return estado.velocidade / Math.abs(estado.guinada);
}

test('analógico (Lupa D1): 30% e 50% do curso já viram; batente igual', () => {
  // Antes (curva 1,8): 30% → 99,9 m, 50% → 26,1 m, 100% → 5,1 m. Agora: 49,0 / 17,9 / 5,1 m.
  const r30 = raioA12(0.3), r50 = raioA12(0.5), r100 = raioA12(1);
  assert.ok(r30 > 44 && r30 < 50, `30%: ${r30}`);
  assert.ok(r50 > 16 && r50 < 18, `50%: ${r50}`);
  assert.ok(Math.abs(r100 - fisica.TRATOR.entreEixosM / Math.tan(fisica.TRATOR.estercoMaxRad)) < 0.01, `100%: ${r100}`);
});

test('gatilho: L2 com corte de ruído e curva x^1,5; R2 linear acima do corte', () => {
  assert.equal(volante.curvaAcelerador(0.03), 0);
  assert.equal(volante.curvaAcelerador(0.04), 0);
  assert.equal(volante.curvaAcelerador(0.52).toFixed(6), '0.500000');
  assert.equal(volante.curvaAcelerador(1), 1);
  assert.equal(volante.curvaAcelerador(Number.NaN), 0);
  assert.equal(volante.curvaGatilho(0.03), 0);
  assert.equal(volante.curvaGatilho(0.5).toFixed(6), '0.353553');
  assert.equal(volante.curvaGatilho(1), 1);
  assert.equal(volante.curvaGatilho(Number.NaN), 0);
});

/** Velocidade (km/h) depois de `s` segundos com o R2 cru em `r2`, partindo parado, pela física real. */
function velocidadeComR2(r2, s, tetoKph = 12) {
  const mundo = { obstaculos: [], tetoKph };
  let estado = fisica.criarTrator(0), comando = volante.COMANDO_PARADO;
  for (let i = 0; i < Math.round(s * 60); i += 1) {
    comando = volante.passoVolante(comando, volante.comandoDesejado(pad({ r2 })), 1 / 60);
    estado = fisica.passoTrator(estado, comando, 1 / 60, mundo);
  }
  return estado.velocidade * 3.6;
}

test('R2 (Lupa D3): pressão é velocidade-alvo; meio R2 estabiliza na metade do teto', () => {
  // Antes: R2 50% segurado 10 s → 12,0 km/h (o teto); R2 25% após 3 s → 1,6 km/h.
  assert.ok(Math.abs(velocidadeComR2(0.52, 10) - 6) < 0.01, 'meio R2 → 6 km/h');
  assert.ok(Math.abs(velocidadeComR2(1, 10) - 12) < 1e-9, 'R2 cheio → teto');
  assert.ok(velocidadeComR2(0.28, 3) > 2.9, 'um quarto do R2 já anda a ~3 km/h em 3 s');
  // Mesma rampa de 1,2 m/s² até o alvo: R2 cheio chega a 12 km/h em ~2,8 s, como antes.
  assert.ok(velocidadeComR2(1, 2.7) < 12 && velocidadeComR2(1, 2.9) > 11.99);
  // No desafio (teto 6), meio R2 → 3 km/h.
  assert.ok(Math.abs(velocidadeComR2(0.52, 10, 6) - 3) < 0.01);
});

test('R2 (Lupa D3): aliviar o pedal desacelera pelo arrasto até o novo alvo, sem passar dele', () => {
  const mundo = { obstaculos: [], tetoKph: 12 };
  let estado = { ...fisica.criarTrator(0), velocidade: 12 / 3.6 };
  const meio = { esterco: 0, acelerador: 0.5, freio: 0 };
  estado = fisica.passoTrator(estado, meio, 1, mundo);
  assert.ok(Math.abs(estado.velocidade - (12 / 3.6 - fisica.TRATOR.arrasto * 0.1)) < 1e-9, 'rola, não freia');
  for (let i = 0; i < 600; i += 1) estado = fisica.passoTrator(estado, meio, 1 / 60, mundo);
  assert.ok(Math.abs(estado.velocidade * 3.6 - 6) < 1e-9);
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
  assert.ok(imediata.distanciaCm > 150 && imediata.distanciaCm <= 225, `${imediata.distanciaCm}`);
  const atrasada = corrida(6, 0.5);
  assert.equal(atrasada.contato, false);
  // Alerta a 225 cm (24/10): mesmo com 0,5 s de reação sobra mais de 80 cm.
  assert.ok(atrasada.distanciaCm > 80 && atrasada.distanciaCm < 135, `${atrasada.distanciaCm}`);
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

test('ré (Lupa D2): L2 cheio de 12 km/h mantido 2 s recua ≤ 0,7 m e não recua nos primeiros 0,5 s parado', () => {
  const mundo = { obstaculos: [], tetoKph: 12 };
  const freio = { esterco: 0, acelerador: 0, freio: 1 };
  let estado = { ...fisica.criarTrator(0), velocidade: 12 / 3.6 };
  let t = 0, xParou = null, paradoEm = null, maiorX = 0;
  while (t < 2 - 1e-9) {
    estado = fisica.passoTrator(estado, freio, 1 / 60, mundo); t += 1 / 60;
    maiorX = Math.max(maiorX, estado.x);
    if (xParou === null && estado.velocidade === 0) { xParou = estado.x; paradoEm = t; }
    if (paradoEm !== null && t - paradoEm < 0.5 - 1e-9) assert.equal(estado.velocidade, 0, `ré aos ${(t - paradoEm).toFixed(3)} s parado`);
  }
  // Antes: ré 0,02 s depois de parar; mantido 2 s desde 12 km/h recuava 0,50 m. Agora: ré aos 0,52 s, recuo 0,16 m.
  const recuo = maiorX - estado.x;
  assert.ok(recuo > 0 && recuo <= 0.7, `recuo ${recuo}`);
});

test('ré (Lupa D2): parado, soltar e apertar o L2 de novo engata na hora', () => {
  const mundo = { obstaculos: [], tetoKph: 12 };
  let estado = { ...fisica.criarTrator(0), velocidade: 1 };
  for (let i = 0; i < 30; i += 1) estado = fisica.passoTrator(estado, { esterco: 0, acelerador: 0, freio: 1 }, 1 / 60, mundo);
  assert.equal(estado.velocidade, 0);
  estado = fisica.passoTrator(estado, volante.COMANDO_PARADO, 1 / 60, mundo);
  estado = fisica.passoTrator(estado, { esterco: 0, acelerador: 0, freio: 1 }, 1 / 60, mundo);
  assert.ok(estado.velocidade < 0, 'nova pressão engata a ré');
  // Estado sem os campos novos (pose antiga ou montada à mão) segue como antes: L2 parado engata.
  const cru = fisica.passoTrator({ x: 0, z: 0, rumo: 0, velocidade: 0, percurso: 0, guinada: 0, contato: false }, { esterco: 0, acelerador: 0, freio: 1 }, 1 / 60, mundo);
  assert.ok(cru.velocidade < 0);
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

test('sensor: só enxerga o que está na linha da frente e até 600 cm', () => {
  const pose = fisica.criarTrator(0);
  const longe = fisica.fardoAFrente({ x: 0, z: 0, rumoGraus: 0 }, 6.5);
  assert.deepEqual(fisica.leituraSensor(pose, [longe]), { distanciaCm: 600, eco: false, alerta: false });
  const perto = fisica.fardoAFrente({ x: 0, z: 0, rumoGraus: 0 }, 1.2);
  assert.deepEqual(fisica.leituraSensor(pose, [perto]), { distanciaCm: 120, eco: true, alerta: true });
  const deLado = { ...perto, z: 2 };
  assert.equal(fisica.leituraSensor(pose, [deLado]).eco, false);
});

// Reto a 6 km/h contra obstáculo deslocado `desvio` do eixo; batida = contato frontal ou corpo do circuito (raio + 1,05 m, circuito.ts).
function rasparDeLado(raioM, desvio, tipo) {
  const obstaculos = [{ x: 12, z: desvio, raioM, ...(tipo ? { tipo } : {}) }];
  let estado = fisica.criarTrator(0), avisouEmM = null;
  for (let i = 0; i < 2000; i++) {
    estado = fisica.passoTrator(estado, { esterco: 0, acelerador: 0.5, freio: 0 }, 1 / 60, { obstaculos, tetoKph: 6 });
    if (avisouEmM === null && fisica.leituraSensor(estado, obstaculos).alerta) avisouEmM = estado.x;
    if (estado.contato || Math.hypot(estado.x - 12, estado.z - desvio) < raioM + 1.05) return { bateu: true, avisouAntes: avisouEmM !== null };
    if (estado.x > 16) return { bateu: false, avisou: avisouEmM !== null };
  }
  throw new Error('não terminou');
}

test('sensor: corredor da largura do trator avisa antes de raspar a lateral (sonda do Verniz, 24/10)', () => {
  for (const [nome, raioM, tipo] of [['fardo', fisica.RAIO_FARDO_M], ['estaca', 0.33, 'estaca'], ['barril', 0.54, 'cenario']]) {
    for (const desvio of [0.8, 1.3]) {
      assert.deepEqual(rasparDeLado(raioM, desvio, tipo), { bateu: true, avisouAntes: true }, `${nome} a ${desvio} m do eixo`);
    }
    assert.deepEqual(rasparDeLado(raioM, 2.5, tipo), { bateu: false, avisou: false }, `${nome} a 2,5 m passa sem aviso falso`);
  }
});

test('sensor: corredor não muda o contato frontal da física nem o formato da leitura', () => {
  const pose = fisica.criarTrator(0);
  const fardo = { ...fisica.fardoAFrente({ x: 0, z: 0, rumoGraus: 0 }, 1.2), z: 0.9 };
  assert.equal(fisica.distanciaSensorM(pose, [fardo]), null);
  const leitura = fisica.leituraSensor(pose, [fardo]);
  assert.deepEqual(Object.keys(leitura), ['distanciaCm', 'eco', 'alerta']);
  assert.equal(leitura.eco, true);
  assert.ok(leitura.distanciaCm >= 2 && leitura.distanciaCm <= 225 && leitura.alerta);
  assert.equal(fisica.leituraSensor(pose, [{ ...fardo, x: -4 }]).eco, false, 'atrás não ecoa');
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
