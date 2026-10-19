import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { relevoRampaLateral, atitudeNoChao, RAMPA_LATERAL, RAMPA_LINHA_Z } = await loadFrontendModule('../../src/components/gameplay/rampaLateral.ts');
const { criarMotorGameplay } = await loadFrontendModule('../../src/components/gameplay/motorGameplay.ts');
const { DESAFIO_FARDO } = await loadFrontendModule('../../src/components/gameplay/desafios.ts');

const DT = 1 / 60;
const ACELERA = { esterco: 0, acelerador: 1, freio: 0 };
const plano = () => 0;

test('a rampa não toca o percurso do fardo nem o começo da condução livre', () => {
  for (let x = -90; x <= 90; x += 2) {
    assert.equal(relevoRampaLateral(x, 0), 0, `z=0, x=${x}`);
    assert.equal(relevoRampaLateral(x, 6), 0, `z=6, x=${x}`);
  }
  assert.equal(relevoRampaLateral(0, RAMPA_LINHA_Z), 0, 'antes de inicioX a face não existe');
});

test('no meio do trecho pleno, a face tem 22° e a atitude lê 22° de rolagem com o lado esquerdo em cima', () => {
  const x = (RAMPA_LATERAL.plenaX + RAMPA_LATERAL.fimPlenaX) / 2;
  const a = atitudeNoChao(relevoRampaLateral, x, RAMPA_LINHA_Z, 0);
  assert.ok(Math.abs(a.rolagemGraus - RAMPA_LATERAL.graus) < 0.5, `rolagem ${a.rolagemGraus}`);
  assert.ok(Math.abs(a.arfagemGraus) < 0.5, `arfagem ${a.arfagemGraus}`);
  // Subindo a face de frente (rumo -90°: frente = -z), vira arfagem com o nariz para cima.
  const subindo = atitudeNoChao(relevoRampaLateral, x, RAMPA_LINHA_Z, Math.PI / 2);
  assert.ok(subindo.arfagemGraus > 20, `arfagem subindo ${subindo.arfagemGraus}`);
  assert.equal(atitudeNoChao(plano, 10, 10, 1).rolagemGraus, 0);
});

test('a altura não salta: entre amostras de 10 cm a inclinação nunca passa de ~22°', () => {
  const limite = Math.tan((RAMPA_LATERAL.graus + 0.5) * Math.PI / 180) * 0.1;
  for (let x = -10; x <= 80; x += 0.5) {
    for (let z = -50; z <= 2; z += 0.1) {
      const h = relevoRampaLateral(x, z);
      assert.ok(Number.isFinite(h) && h >= 0, `h(${x},${z})=${h}`);
      assert.ok(Math.abs(relevoRampaLateral(x, z + 0.1) - h) <= limite + 1e-9, `degrau em z perto de (${x},${z})`);
      assert.ok(Math.abs(relevoRampaLateral(x + 0.1, z) - h) <= limite + 1e-9, `degrau em x perto de (${x},${z})`);
    }
  }
});

test('motor com chão: dirigir pela face acende a borda de inclinação; sem chão, atitude segue 0', () => {
  const motor = criarMotorGameplay(() => 0);
  const eventos = [];
  motor.aoEvento((e) => eventos.push(e));
  motor.reiniciar({ x: 0, z: RAMPA_LINHA_Z, rumoGraus: 0, obstaculos: [] });
  for (let i = 0; i < 60 * 30 && !eventos.some((e) => e.tipo === 'inclinacao'); i += 1) motor.quadro(DT, ACELERA, relevoRampaLateral);
  const borda = eventos.find((e) => e.tipo === 'inclinacao');
  assert.ok(borda?.ligado, 'inclinação ligou');
  assert.ok(borda.graus >= 20, `graus ${borda.graus}`);
  assert.ok(motor.ler().atitude.rolagemGraus >= 20, 'retrato já atual na borda');
  assert.ok(motor.ler().maquina.x > RAMPA_LATERAL.inicioX, 'acendeu já dentro da face');

  const nivelado = criarMotorGameplay(() => 0);
  nivelado.reiniciar({ x: 0, z: RAMPA_LINHA_Z, rumoGraus: 0, obstaculos: [] });
  for (let i = 0; i < 600; i += 1) nivelado.quadro(DT, ACELERA);
  assert.deepEqual(nivelado.ler().atitude, { rolagemGraus: 0, arfagemGraus: 0 });
});

test('desafio do fardo com a rampa no chão: o trator anda nivelado até o fardo', () => {
  const motor = criarMotorGameplay(() => 0);
  const eventos = [];
  motor.aoEvento((e) => eventos.push(e));
  motor.reiniciar(DESAFIO_FARDO.inicio);
  for (let i = 0; i < 60 * 30 && !eventos.some((e) => e.tipo === 'contato'); i += 1) {
    motor.quadro(DT, ACELERA, relevoRampaLateral);
    assert.deepEqual(motor.ler().atitude, { rolagemGraus: 0, arfagemGraus: 0 });
  }
  assert.ok(eventos.some((e) => e.tipo === 'contato'));
  assert.ok(!eventos.some((e) => e.tipo === 'inclinacao'));
});

test('reiniciar zera a atitude', () => {
  const motor = criarMotorGameplay(() => 0);
  motor.reiniciar({ x: 35, z: RAMPA_LINHA_Z, rumoGraus: 0, obstaculos: [] });
  motor.quadro(DT, ACELERA, relevoRampaLateral);
  assert.ok(motor.ler().atitude.rolagemGraus > 20);
  motor.reiniciar();
  assert.deepEqual(motor.ler().atitude, { rolagemGraus: 0, arfagemGraus: 0 });
});
