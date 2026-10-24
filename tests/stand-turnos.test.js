import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { valeEnquantoPensa, vaiAoCerebro } = await loadFrontendModule('../../src/stand-voz/turnos.ts');

test('turno em curso: "Oi?" solto do Scribe não atropela a resposta (prova 19/10, 67 s)', () => {
  const falado = 'Posso ligar a câmera agora pra você testar de verdade, ou prefere só ouvir o som do alerta primeiro?';
  assert.equal(vaiAoCerebro('Oi?'), true, 'fora de turno, "Oi?" continua valendo como fala');
  assert.equal(valeEnquantoPensa('Oi?', falado), false);
  assert.equal(valeEnquantoPensa('Sim.', falado), false);
});

test('turno em curso: 2+ palavras novas do visitante ainda refazem a pergunta', () => {
  const falado = 'Vou abrir o laboratório do sensor pra você ver de perto.';
  assert.equal(valeEnquantoPensa('Não, volta pra coruja.', falado), true);
  assert.equal(valeEnquantoPensa('o laboratório do sensor', falado), false, 'eco da própria fala não conta');
});

test('juntarPergunta: emenda o pedaço sem ponto e não duplica reenvio do começo', async () => {
  const { juntarPergunta, mensagemAudioScribe } = await loadFrontendModule('../../src/stand-voz/turnos.ts');
  assert.equal(juntarPergunta('Eu queria saber.', 'Quanto custa pra instalar?'), 'Eu queria saber quanto custa pra instalar?');
  assert.equal(juntarPergunta('Se o trator tombar...', 'Quem fica sabendo?'), 'Se o trator tombar quem fica sabendo?');
  assert.equal(juntarPergunta('Eu queria', 'Eu queria saber o preço'), 'Eu queria saber o preço');
  assert.equal(juntarPergunta('', 'Oi'), 'Oi');
  assert.equal(JSON.parse(mensagemAudioScribe('AA==', 24000, true)).commit, true);
  assert.equal(JSON.parse(mensagemAudioScribe('AA==', 24000)).commit, false);
});
