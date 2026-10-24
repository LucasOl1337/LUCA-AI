import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFrontendModule } from './support/load-frontend-module.js';
const impacto = await loadFrontendModule('../../src/components/gameplay/impactoTrator.ts');
const { criarMotorGameplay } = await loadFrontendModule('../../src/components/gameplay/motorGameplay.ts');
const { fardoAFrente } = await loadFrontendModule('../../src/components/gameplay/fisicaTrator.ts');

/** Bate de frente num fardo pelo motor real e devolve o evento `contato`. */
function bater(tetoKph) {
  const motor = criarMotorGameplay(() => 0);
  motor.reiniciar({ x: 0, z: 0, rumoGraus: 0, tetoKph, obstaculos: [fardoAFrente({ x: 0, z: 0, rumoGraus: 0 }, 12)] });
  let contato = null;
  motor.aoEvento((e) => { if (e.tipo === 'contato') contato ??= e; });
  for (let i = 0; i < 60 * 20 && !contato; i += 1) motor.quadro(1 / 60, { esterco: 0, acelerador: 1, freio: 0 });
  return contato;
}

test('batida (Lupa D4): a 12 km/h o nariz desce ~2,6° em 50 ms e volta a zero em 0,45 s; antes a pose não mexia', () => {
  const contato = bater(12);
  assert.ok(contato && contato.velocidadeKph > 11.9, `contato ${JSON.stringify(contato)}`);
  const curva = Array.from({ length: 28 }, (_, i) => impacto.arfagemImpacto(contato.velocidadeKph, i / 60));
  const menor = Math.min(...curva);
  assert.ok(menor < -2.4 && menor >= -impacto.IMPACTO.maxGraus, `pico ${menor}`);
  assert.ok(curva.findIndex((g) => g === menor) <= 4, 'pico nos primeiros ~70 ms');
  assert.equal(impacto.arfagemImpacto(contato.velocidadeKph, 0.45), 0);
  assert.equal(impacto.arfagemImpacto(contato.velocidadeKph, 2), 0);
  assert.ok(impacto.volumeBaque(contato.velocidadeKph) > 0.3);
});

test('batida (Lupa D4): mais lenta, tranco e baque menores; encostar parado não dá tranco', () => {
  const lenta = bater(6);
  const pico = (kph) => Math.min(...Array.from({ length: 28 }, (_, i) => impacto.arfagemImpacto(kph, i / 60)));
  assert.ok(pico(lenta.velocidadeKph) > pico(12) && pico(lenta.velocidadeKph) < 0);
  assert.ok(impacto.volumeBaque(lenta.velocidadeKph) < impacto.volumeBaque(12));
  assert.equal(impacto.arfagemImpacto(0.5, 0.05), 0);
  assert.equal(impacto.volumeBaque(0.5), 0);
  assert.equal(impacto.arfagemImpacto(Number.NaN, 0.05), 0);
});

test('batida (Lupa D4): movimento reduzido desliga o tranco; sem tranco é zero', () => {
  const tranco = { velocidadeKph: 12, inicioMs: 1000 };
  assert.ok(impacto.arfagemDoTranco(tranco, 1050) < 0);
  assert.equal(impacto.arfagemDoTranco(tranco, 1050, true), 0);
  assert.equal(impacto.arfagemDoTranco(null, 1050), 0);
});

test('baque: um oscilador finito na chave dos efeitos; sem contexto tocando não toca', () => {
  const agendados = [];
  const param = { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
  const ganho = { gain: param, connect() { return this; }, disconnect() {} };
  const destino = {};
  const ctx = { state: 'running', currentTime: 0, destination: {}, createGain: () => ganho,
    createOscillator() { const o = { frequency: param, connect: () => ganho, disconnect() {}, start() { agendados.push(o); }, stop(t) { o.ate = t; } }; return o; } };
  const baque = impacto.criarBaque({ obter: () => ctx, destravar: async () => true, ligarDestravas: () => () => {}, destino: () => destino });
  assert.equal(baque.tocar(12), true);
  assert.equal(agendados.length, 1);
  assert.ok(agendados[0].ate > 0 && agendados[0].ate < 0.5);
  assert.equal(baque.tocar(0.2), false);
  const mudo = impacto.criarBaque({ obter: () => ({ ...ctx, state: 'suspended' }), destravar: async () => false, ligarDestravas: () => () => {} });
  assert.equal(mudo.tocar(12), false);
});

test('trepidação da cabine (Lupa D6): parado não treme; a 12 km/h treme pouco e rápido; antes era zero em qualquer velocidade', () => {
  const amostra = (kph) => {
    let pico = 0, cruzamentos = 0, ant = null;
    for (let i = 0; i < 600; i += 1) {
      const t = impacto.trepidacaoCabine(kph, i / 600);
      pico = Math.max(pico, Math.abs(t.arfagemGraus));
      if (ant !== null && Math.sign(t.arfagemGraus) !== Math.sign(ant)) cruzamentos += 1;
      ant = t.arfagemGraus;
    }
    return { pico, hz: cruzamentos / 2 };
  };
  assert.deepEqual(impacto.trepidacaoCabine(0, 1.23), { arfagemGraus: 0, rolagemGraus: 0, alturaM: 0 });
  const cheio = amostra(12), meio = amostra(6);
  assert.ok(cheio.pico > 0.15 && cheio.pico <= impacto.TREPIDACAO.arfagemGraus + 1e-9, `pico ${cheio.pico}`);
  assert.ok(Math.abs(meio.pico - cheio.pico / 2) < 0.02, 'proporcional à velocidade');
  assert.ok(cheio.hz >= 7, `tremor, não balanço: ${cheio.hz} Hz`);
  assert.equal(amostra(30).pico, cheio.pico, 'teto na velocidade cheia');
  assert.ok(Math.abs(impacto.trepidacaoCabine(-4, 0.3).arfagemGraus - impacto.trepidacaoCabine(4, 0.3).arfagemGraus) < 1e-12, 'ré treme igual');
  assert.equal(impacto.trepidacaoCabine(12, 0.3, true).arfagemGraus, 0, 'movimento reduzido');
  assert.equal(impacto.trepidacaoCabine(Number.NaN, 0.3).alturaM, 0);
});

const { vibracaoDoEvento, CERCA_MIN_KPH } = await loadFrontendModule('../../src/components/gameplay/motorGameplay.ts');
const { TRATOR } = await loadFrontendModule('../../src/components/gameplay/fisicaTrator.ts');

test('cerca do talhão (Lupa D8): bater a 12 km/h dá uma borda com vibração; apoiado empurrando não repete; não vira colisão', () => {
  const motor = criarMotorGameplay(() => 0);
  motor.reiniciar({ x: TRATOR.cercaM - 20, z: 0, rumoGraus: 0, tetoKph: 12, obstaculos: [] });
  const eventos = [];
  motor.aoEvento((e) => eventos.push(e));
  let e = motor.ler();
  for (let i = 0; i < 60 * 15; i += 1) e = motor.quadro(1 / 60, { esterco: 0, acelerador: 1, freio: 0 });
  const cercas = eventos.filter((ev) => ev.tipo === 'cerca');
  assert.equal(cercas.length, 1, 'uma batida, não uma por quadro');
  assert.ok(cercas[0].velocidadeKph > 11.9, `entrada ${cercas[0].velocidadeKph}`);
  assert.equal(vibracaoDoEvento(cercas[0]), 'contato');
  assert.ok(impacto.volumeBaque(cercas[0].velocidadeKph) > 0.3);
  assert.equal(eventos.some((ev) => ev.tipo === 'contato'), false, 'cerca não é contato de obstáculo');
  assert.equal(e.contato, false);
  assert.equal(e.maquina.x, TRATOR.cercaM);
  // Recua com L2 e volta a bater: rearma.
  for (let i = 0; i < 60 * 3; i += 1) motor.quadro(1 / 60, { esterco: 0, acelerador: 0, freio: 1 });
  for (let i = 0; i < 60 * 6; i += 1) motor.quadro(1 / 60, { esterco: 0, acelerador: 1, freio: 0 });
  assert.equal(eventos.filter((ev) => ev.tipo === 'cerca').length, 2);
});

test('cerca do talhão (Lupa D8): encostar devagar (abaixo de 0,8 km/h) não dá batida', () => {
  const motor = criarMotorGameplay(() => 0);
  motor.reiniciar({ x: TRATOR.cercaM - 1, z: 0, rumoGraus: 0, tetoKph: 12, obstaculos: [] });
  const eventos = [];
  motor.aoEvento((e) => eventos.push(e));
  // R2 leve = alvo 0,7 km/h (D3): chega à cerca devagar.
  let e = motor.ler();
  for (let i = 0; i < 60 * 10; i += 1) e = motor.quadro(1 / 60, { esterco: 0, acelerador: 0.06, freio: 0 });
  assert.equal(e.maquina.x, TRATOR.cercaM, 'chegou na cerca');
  assert.ok(CERCA_MIN_KPH > 0);
  assert.equal(eventos.filter((ev) => ev.tipo === 'cerca').length, 0);
});

test('arfagem de carga (Lupa fila vazia 1): frear cheio de 12 km/h baixa o nariz ~0,8°; arrancar sobe ~0,3°; cruzeiro 0; antes 0° em tudo', () => {
  const motor = criarMotorGameplay(() => 0);
  motor.reiniciar({ x: 0, z: 0, rumoGraus: 0, tetoKph: 12, obstaculos: [] });
  const carga = impacto.criarArfagemCarga(), dt = 1 / 60;
  let maxSobe = 0, a = 0;
  for (let i = 0; i < 600; i += 1) { motor.quadro(dt, { esterco: 0, acelerador: 1, freio: 0 }); a = carga.passo(motor.trator().velocidade, dt); maxSobe = Math.max(maxSobe, a); }
  assert.ok(maxSobe > 0.25 && maxSobe < 0.35, `arrancada ${maxSobe}`);
  assert.ok(Math.abs(a) < 0.01, `cruzeiro ${a}`);
  let maxDesce = 0;
  for (let i = 0; i < 60; i += 1) { motor.quadro(dt, { esterco: 0, acelerador: 0, freio: 1 }); a = carga.passo(motor.trator().velocidade, dt); maxDesce = Math.min(maxDesce, a); }
  assert.ok(maxDesce < -0.7 && maxDesce >= -impacto.CARGA.maxGraus, `frenagem ${maxDesce}`);
  // Parado: volta ao neutro.
  for (let i = 0; i < 30; i += 1) { motor.quadro(dt, { esterco: 0, acelerador: 0, freio: 0 }); a = carga.passo(motor.trator().velocidade, dt); }
  assert.ok(Math.abs(a) < 0.03, `parado ${a}`);
});

test('arfagem de carga: batida/reinício (salto de velocidade) não vira mergulho; reduced-motion e pausa', () => {
  const c = impacto.criarArfagemCarga();
  c.passo(3.33, 1 / 60);
  assert.equal(c.passo(0, 1 / 60), 0, 'parar seco no fardo é tranco do D4, não carga');
  c.passo(0, 1 / 60); const pausado = c.passo(-1, 0);
  assert.equal(pausado, 0);
  for (let i = 0; i < 30; i += 1) c.passo(3.33 * (1 - i / 30), 1 / 60);
  assert.equal(c.passo(1, 1 / 60, true), 0);
  assert.equal(c.passo(Number.NaN, 1 / 60), 0);
});
