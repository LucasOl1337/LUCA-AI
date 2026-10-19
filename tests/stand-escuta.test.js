import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { criarDespertador, pausaAposFalsos, PRE_ROLAGEM_BLOCOS, SEM_FALA_MS } = await loadFrontendModule('../../src/stand-voz/escuta.ts');
const { chamadaDeInicio, linhaDaEscuta } = await loadFrontendModule('../../src/components/stand/avisos.ts');

/** Alimenta `blocos` blocos de 50 ms no mesmo nível; devolve quantas vezes despertou. */
function alimentar(despertador, nivel, blocos) {
  let despertou = 0;
  for (let i = 0; i < blocos; i += 1) if (despertador.alimentar(nivel, 50)) despertou += 1;
  return despertou;
}

test('despertador: voz próxima por 250 ms desperta; um estalo de 100 ms não', () => {
  const d = criarDespertador();
  assert.equal(alimentar(d, 0.005, 40), 0, 'sala silenciosa');
  assert.equal(alimentar(d, 0.2, 2), 0, 'estalo curto');
  assert.equal(alimentar(d, 0.005, 4), 0);
  assert.equal(alimentar(d, 0.2, 5), 1, 'fala de 250 ms');
});

test('despertador: sala silenciosa ainda exige o mínimo absoluto', () => {
  const d = criarDespertador();
  assert.equal(alimentar(d, 0.0001, 40), 0);
  assert.equal(alimentar(d, 0.02, 20), 0, 'abaixo de 0,03 não desperta nem com piso quase zero');
});

test('despertador: barulho constante da feira sobe o piso e não abre sessão', () => {
  const d = criarDespertador();
  assert.equal(alimentar(d, 0.04, 400), 0, 'feira em 0,04 por 20 s');
  assert.ok(d.piso > 0.035, `piso seguiu o ruído (${d.piso})`);
  assert.equal(alimentar(d, 0.06, 20), 0, 'conversa ao lado, 1,5× o ruído');
  assert.equal(alimentar(d, 0.2, 5), 1, 'alguém falando no microfone, 5× o ruído');
});

test('despertador: feira que enche de repente para de despertar depois de um tempo', () => {
  const d = criarDespertador();
  alimentar(d, 0.005, 40);
  const despertares = alimentar(d, 0.1, 1200);
  // Cada despertar acontece com a conversa fechada: o que importa é o piso alcançar o barulho.
  assert.ok(despertares >= 1);
  assert.ok(d.piso > 0.033, `piso subiu com o barulho que ficou (${d.piso})`);
  assert.equal(alimentar(d, 0.1, 20), 0, 'mesmo barulho, já é fundo');
});

test('pausa após despertares falsos: 1º de graça, depois dobra até 2 min', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 10].map(pausaAposFalsos), [0, 0, 10_000, 20_000, 40_000, 80_000, 120_000]);
});

test('constantes: pré-rolagem de 600 ms e 6 s para provar fala', () => {
  assert.equal(PRE_ROLAGEM_BLOCOS * 50, 600);
  assert.equal(SEM_FALA_MS, 6000);
});

test('chamada da Atração com a escuta aberta convida a falar', () => {
  assert.equal(chamadaDeInicio(false, null, 'ouvindo'), 'É só falar que eu escuto.');
  assert.equal(chamadaDeInicio(true, null, 'conversa'), 'Pode falar, tô ouvindo.');
  assert.equal(chamadaDeInicio(false, null), 'Toca na tela pra começar a conversa.');
  assert.equal(chamadaDeInicio(true, null), 'Ligando o microfone…');
});

test('abertura automática não pede toque; bloqueio de autoplay pede', () => {
  assert.equal(chamadaDeInicio(false, null, 'abrindo'), 'Ligando o microfone…');
  assert.equal(chamadaDeInicio(false, null, 'ajuda_microfone'), 'Permita o microfone pra conversar com o LUCA.');
  assert.equal(chamadaDeInicio(false, null, 'precisa_toque'), 'Toca na tela pra começar a conversa.');
});

test('linha fixa do rodapé: só com o microfone aberto e fora da Conversa', () => {
  const linha = 'O LUCA só ouve quando você fala com ele.';
  for (const estado of ['ouvindo', 'pausada', 'conversa']) assert.equal(linhaDaEscuta(estado, 'atracao'), linha, estado);
  for (const estado of ['desligada', 'abrindo', 'ajuda_microfone', 'precisa_toque', 'erro']) assert.equal(linhaDaEscuta(estado, 'atracao'), '', estado);
  assert.equal(linhaDaEscuta('conversa', 'conversa'), '');
  assert.equal(linhaDaEscuta('ouvindo', 'video'), '');
});
