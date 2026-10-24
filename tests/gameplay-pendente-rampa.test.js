import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

// Motor, chão e classificador reais. Nenhuma atitude é injetada pelo teste.
const { criarMotorGameplay } = await loadFrontendModule('../../src/components/gameplay/motorGameplay.ts');
const { relevoRampaLateral, RAMPA_LATERAL, RAMPA_LINHA_Z } = await loadFrontendModule('../../src/components/gameplay/rampaLateral.ts');
const {
  DESAFIOS, DESAFIO_FARDO, DESAFIO_PENDENTE, MOTIVO_FIM, RASTRO_VAZIO, desafioDaRodada, eventoDesafio, passoDesafio, textoResultado,
} = await loadFrontendModule('../../src/components/gameplay/desafios.ts');
const { alertaCabine, BIPE_RAPIDO_MS } = await loadFrontendModule('../../src/components/gameplay/alertaCabine.ts');

const DT = 1 / 60;
const ACELERA = { esterco: 0, acelerador: 1, freio: 0 };
const FREIA = { esterco: 0, acelerador: 0, freio: 1 };

/** Como o DesafioCabine liga: passo a cada aviso, evento na borda, encerrar no resultado; chão = rampa. */
function pendenteNaRampa(reacaoS, chao = relevoRampaLateral) {
  let t = 0;
  const motor = criarMotorGameplay(() => t);
  let rastro = RASTRO_VAZIO;
  motor.assinar(() => {
    rastro = passoDesafio(rastro, motor.ler(), DESAFIO_PENDENTE);
    if (rastro.resultado && motor.ler().fase !== 'fim') motor.encerrar(MOTIVO_FIM[rastro.resultado.desfecho]);
  });
  motor.aoEvento((evento) => { rastro = eventoDesafio(rastro, evento, motor.ler(), DESAFIO_PENDENTE); });
  motor.reiniciar(DESAFIO_PENDENTE.inicio);
  let alertaEm = null;
  let painelNoAlerta = null;
  let estadoNoAlerta = null;
  for (let i = 0; i < 60 * 70 && !rastro.resultado; i += 1) {
    const estado = motor.ler();
    const painel = alertaCabine(estado);
    if (painel.inclinacao.ligada && alertaEm === null) {
      alertaEm = estado.tempoMs;
      painelNoAlerta = painel;
      estadoNoAlerta = estado;
    }
    const freando = alertaEm !== null && estado.tempoMs >= alertaEm + reacaoS * 1000;
    motor.quadro(DT, freando ? FREIA : ACELERA, chao);
    t += 1000 / 60;
  }
  return { resultado: rastro.resultado, painelNoAlerta, estadoNoAlerta, estadoFinal: motor.ler(), fase: motor.ler().fase };
}

test('pendente está na lista do totem e parte nivelado antes da face da rampa', () => {
  assert.deepEqual(DESAFIOS.map((d) => d.id), ['fardo-a-frente', 'pendente-lateral']);
  assert.equal(DESAFIO_PENDENTE.inicio.x, 0);
  assert.equal(DESAFIO_PENDENTE.inicio.z, RAMPA_LINHA_Z);
  assert.equal(DESAFIO_PENDENTE.inicio.rumoGraus, 0);
  assert.equal(relevoRampaLateral(0, RAMPA_LINHA_Z), 0);
  // Os 30 m terminam dentro do trecho pleno da rampa: atravessar é passar pelos 22°.
  const fimX = DESAFIO_PENDENTE.inicio.x + DESAFIO_PENDENTE.atravessarM;
  assert.ok(fimX > RAMPA_LATERAL.plenaX && fimX <= RAMPA_LATERAL.fimPlenaX, `fim em x=${fimX}`);
});

test('rodadas alternam fardo e pendente', () => {
  assert.deepEqual([1, 2, 3, 4].map((n) => desafioDaRodada(n).id), ['fardo-a-frente', 'pendente-lateral', 'fardo-a-frente', 'pendente-lateral']);
  assert.equal(desafioDaRodada(0), DESAFIO_FARDO);
  assert.equal(desafioDaRodada(Number.NaN), DESAFIO_FARDO);
});

test('na rampa: o painel acende faixa vermelha e bipe grave a partir de 20°; freando 0,5 s depois, Parou a tempo', () => {
  const { resultado, painelNoAlerta, estadoNoAlerta, fase } = pendenteNaRampa(0.5);
  assert.equal(fase, 'fim');
  assert.ok(painelNoAlerta, 'inclinação acendeu no painel');
  assert.equal(painelNoAlerta.alerta, true);
  assert.ok(estadoNoAlerta.maquina.x >= 16 && estadoNoAlerta.maquina.x <= 18, `alerta em x=${estadoNoAlerta.maquina.x}`);
  assert.equal(estadoNoAlerta.sensor.alerta, false, 'o aviso não vem de obstáculo');
  assert.ok(estadoNoAlerta.atitude.rolagemGraus >= 20, 'rolagem positiva: lado direito para baixo');
  assert.ok(Math.abs(estadoNoAlerta.atitude.arfagemGraus) < 20, 'o aviso vem da rolagem lateral');
  assert.match(painelNoAlerta.rotuloAlerta, /^Inclinação de 2\d° · freie$/);
  assert.equal(painelNoAlerta.rotulo, 'Risco de tombamento');
  assert.deepEqual(painelNoAlerta.bipe, { intervaloMs: BIPE_RAPIDO_MS, som: 'inclinacao' });
  assert.equal(resultado.desafio, 'pendente-lateral');
  assert.equal(resultado.desfecho, 'parou');
  assert.ok(resultado.alertaGraus >= 20 && resultado.alertaGraus < 21, `alerta ${resultado.alertaGraus}`);
  assert.ok(Math.abs(resultado.reacaoS - 0.5) < 0.05, `reação ${resultado.reacaoS}`);
  assert.ok(resultado.grauMaximo >= 20 && resultado.grauMaximo <= RAMPA_LATERAL.graus + 0.5, `máximo ${resultado.grauMaximo}`);
  assert.equal(textoResultado(resultado).titulo, 'Parou a tempo');
});

test('na rampa sem frear: atravessa os 30 m a ~22°, sem tombar', () => {
  const { resultado, estadoFinal } = pendenteNaRampa(99);
  assert.equal(resultado.desfecho, 'atravessou');
  assert.ok(estadoFinal.maquina.x >= 30 && estadoFinal.maquina.x < 30.1);
  assert.equal(estadoFinal.atitude.rolagemGraus, 22);
  assert.ok(resultado.alertaGraus >= 20, `alerta ${resultado.alertaGraus}`);
  assert.equal(resultado.reacaoS, null);
  assert.ok(Math.abs(resultado.grauMaximo - RAMPA_LATERAL.graus) <= 0.5, `máximo ${resultado.grauMaximo}`);
  const texto = textoResultado(resultado);
  assert.equal(texto.titulo, 'Atravessou a encosta');
  assert.ok(texto.linhas.includes('Você não freou depois do aviso'));
});

test('chão plano: pendente não fabrica inclinação nem aviso', () => {
  const { resultado, painelNoAlerta, estadoFinal } = pendenteNaRampa(0.5, () => 0);
  assert.equal(resultado.desfecho, 'atravessou');
  assert.equal(painelNoAlerta, null);
  assert.equal(resultado.alertaGraus, null);
  assert.equal(resultado.grauMaximo, 0);
  assert.deepEqual(estadoFinal.atitude, { rolagemGraus: 0, arfagemGraus: 0 });
});
