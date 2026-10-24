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
