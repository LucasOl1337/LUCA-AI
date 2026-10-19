import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { criarMotorGameplay, vibracaoDoEvento, INICIO_LIVRE } = await loadFrontendModule('../../src/components/gameplay/motorGameplay.ts');
const { DESAFIO_FARDO, RASTRO_VAZIO, passoDesafio, eventoDesafio, MOTIVO_FIM } = await loadFrontendModule('../../src/components/gameplay/desafios.ts');
const { anguloAroRad, ARO_RAD_POR_ESTERCO } = await loadFrontendModule('../../src/components/gameplay/volante.ts');
const { varianteSimulacao } = await loadFrontendModule('../../src/components/stand/SimuladorKiosk.tsx').catch(() => ({}));

const DT = 1 / 60;
const ACELERA = { esterco: 0, acelerador: 1, freio: 0 };
const FREIA = { esterco: 0, acelerador: 0, freio: 1 };
const relogio = () => { let t = 0; return { agora: () => t, andar: (ms) => { t += ms; } }; };

test('pronto até a primeira aceleração; tempo só corre dirigindo', () => {
  const r = relogio();
  const motor = criarMotorGameplay(r.agora);
  motor.reiniciar(DESAFIO_FARDO.inicio);
  for (let i = 0; i < 30; i += 1) { motor.quadro(DT, { esterco: 0, acelerador: 0, freio: 0 }); r.andar(16); }
  assert.equal(motor.ler().fase, 'pronto');
  assert.equal(motor.ler().tempoMs, 0);
  motor.quadro(DT, ACELERA);
  assert.equal(motor.ler().fase, 'dirigindo');
  assert.equal(motor.ler().tetoKph, 6);
  assert.ok(motor.trator().x > 0);
});

test('o retrato do ler() já está atualizado quando o evento de borda chega (pedido da Operador)', () => {
  const r = relogio();
  const motor = criarMotorGameplay(r.agora);
  motor.reiniciar(DESAFIO_FARDO.inicio);
  const vistos = [];
  motor.aoEvento((evento) => vistos.push({ evento, estado: motor.ler() }));
  for (let i = 0; i < 60 * 30 && !vistos.some((v) => v.evento.tipo === 'contato'); i += 1) { motor.quadro(DT, ACELERA); r.andar(16); }
  const alerta = vistos.find((v) => v.evento.tipo === 'alerta' && v.evento.ligado);
  assert.ok(alerta, 'alerta não disparou');
  assert.equal(alerta.estado.sensor.alerta, true);
  assert.ok(alerta.estado.sensor.distanciaCm <= 150 && alerta.estado.sensor.distanciaCm > 140, `${alerta.estado.sensor.distanciaCm}`);
  assert.equal(alerta.evento.tempoMs, alerta.estado.tempoMs);
  const contato = vistos.find((v) => v.evento.tipo === 'contato');
  assert.ok(contato, 'contato não disparou');
  assert.equal(contato.estado.contato, true);
  assert.ok(Math.abs(contato.evento.velocidadeKph - 6) < 1e-9);
  assert.equal(vistos.filter((v) => v.evento.tipo === 'alerta' && v.evento.ligado).length, 1);
  assert.equal(vibracaoDoEvento(alerta.evento), 'alerta');
  assert.equal(vibracaoDoEvento(contato.evento), 'contato');
});

test('assinantes recebem a ~15 Hz e na hora de cada borda', () => {
  const r = relogio();
  const motor = criarMotorGameplay(r.agora);
  let avisos = 0;
  motor.assinar(() => { avisos += 1; });
  motor.reiniciar();
  avisos = 0;
  for (let i = 0; i < 60; i += 1) { motor.quadro(DT, ACELERA); r.andar(1000 / 60); }
  assert.ok(avisos >= 14 && avisos <= 16, `${avisos}`);
});

test('reiniciar sem nada volta à condução livre: 12 km/h, campo sem obstáculo', () => {
  const motor = criarMotorGameplay(() => 0);
  motor.reiniciar(DESAFIO_FARDO.inicio);
  motor.reiniciar();
  assert.equal(motor.ler().tetoKph, 12);
  assert.deepEqual(motor.obstaculos(), []);
  assert.deepEqual(INICIO_LIVRE.obstaculos, []);
  const referencia = motor.obstaculos();
  motor.quadro(DT, ACELERA);
  assert.equal(motor.obstaculos(), referencia, 'mesma referência entre reinícios: o palco não reposiciona à toa');
});

test('encerrar: fase fim, evento uma vez, trator freia até parar e não engata ré', () => {
  const r = relogio();
  const motor = criarMotorGameplay(r.agora);
  const fins = [];
  motor.aoEvento((e) => { if (e.tipo === 'fim') fins.push(e); });
  motor.reiniciar();
  for (let i = 0; i < 120; i += 1) motor.quadro(DT, ACELERA);
  motor.encerrar('teste');
  motor.encerrar('de novo');
  assert.equal(fins.length, 1);
  assert.equal(fins[0].motivo, 'teste');
  for (let i = 0; i < 600; i += 1) motor.quadro(DT, ACELERA);
  assert.equal(motor.ler().fase, 'fim');
  assert.equal(motor.ler().maquina.velocidadeKph, 0);
  assert.equal(motor.ler().maquina.re, false);
});

/** Desafio inteiro, como o DesafioCabine liga: passo a cada aviso, evento na borda, encerrar no resultado. */
function desafioCompleto(reacaoS) {
  const r = relogio();
  const motor = criarMotorGameplay(r.agora);
  let rastro = RASTRO_VAZIO;
  motor.assinar(() => { rastro = passoDesafio(rastro, motor.ler(), DESAFIO_FARDO); if (rastro.resultado && motor.ler().fase !== 'fim') motor.encerrar(MOTIVO_FIM[rastro.resultado.desfecho]); });
  motor.aoEvento((evento) => { rastro = eventoDesafio(rastro, evento, motor.ler()); });
  motor.reiniciar(DESAFIO_FARDO.inicio);
  let alertaEm = null;
  for (let i = 0; i < 60 * 70 && !rastro.resultado; i += 1) {
    const estado = motor.ler();
    if (estado.sensor.alerta && alertaEm === null) alertaEm = estado.tempoMs;
    const freando = alertaEm !== null && estado.tempoMs >= alertaEm + reacaoS * 1000;
    motor.quadro(DT, freando ? FREIA : ACELERA);
    r.andar(1000 / 60);
  }
  return { resultado: rastro.resultado, fase: motor.ler().fase };
}

test('abertura → alerta → resultado com o desafio da Operador: freando 0,5 s depois para; sem frear encosta', () => {
  const freou = desafioCompleto(0.5);
  assert.equal(freou.fase, 'fim');
  assert.equal(freou.resultado.desfecho, 'parou');
  assert.ok(freou.resultado.alertaCm <= 150 && freou.resultado.alertaCm > 140, `${freou.resultado.alertaCm}`);
  assert.ok(Math.abs(freou.resultado.reacaoS - 0.5) < 0.05, `${freou.resultado.reacaoS}`);
  assert.ok(freou.resultado.paradaCm > 20 && freou.resultado.paradaCm < 60, `${freou.resultado.paradaCm}`);
  const bateu = desafioCompleto(99);
  assert.equal(bateu.resultado.desfecho, 'encostou');
  assert.ok(Math.abs(bateu.resultado.contatoKph - 6) < 1e-9);
});

test('aro do volante: esterço ±1 = ±1 volta, sem -0', () => {
  assert.equal(ARO_RAD_POR_ESTERCO, 2 * Math.PI);
  assert.equal(anguloAroRad(1), 2 * Math.PI);
  assert.equal(anguloAroRad(-0.5), -Math.PI);
  assert.equal(Object.is(anguloAroRad(-0), -0), false);
  assert.equal(anguloAroRad(Number.NaN), 0);
});

test('?simulacao: só "gameplay" liga o gameplay; padrão é a clássica', { skip: !varianteSimulacao }, () => {
  assert.equal(varianteSimulacao(''), 'classica');
  assert.equal(varianteSimulacao('?simulacao=classica'), 'classica');
  assert.equal(varianteSimulacao('?simulacao=gameplay'), 'gameplay');
  assert.equal(varianteSimulacao('?simulacao=GAMEPLAY'), 'classica');
});
