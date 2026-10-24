import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

// Lucas, 24/10 08:03: "Quando peço pra ir no simulador, ele deveria mostrar os
// controles, mas após uns 5 segundos começar já, pois o sentido todo do totem
// é não precisar ficar clicando."
const { criarContagemGuia, GUIA_AUTOINICIO_MS } = await loadFrontendModule('../../src/components/stand/contagemGuia.ts');

function relogio(t) {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'] });
  // Passo a passo: o relógio da tela anda junto com cada tique.
  return (ms) => { for (let i = 0; i < ms; i += 250) t.mock.timers.tick(250); };
}

test('guia da Simulação: sem toque, conta 5…1 e começa sozinha aos 5 s', (t) => {
  const andar = relogio(t);
  const vistos = [];
  let comecou = 0;
  const c = criarContagemGuia({ aoMudar: (s) => vistos.push(s), aoComecar: () => { comecou += 1; } });
  assert.equal(GUIA_AUTOINICIO_MS, 5000);
  assert.equal(c.restante(), 5);
  andar(4_750);
  assert.equal(comecou, 0, 'ainda mostrando os controles');
  assert.deepEqual(vistos, [4, 3, 2, 1]);
  andar(250);
  assert.equal(comecou, 1);
  andar(10_000);
  assert.equal(comecou, 1, 'começa uma vez só');
});

test('vizinho: botão começa antes e a contagem não dispara de novo', (t) => {
  const andar = relogio(t);
  let comecou = 0;
  const c = criarContagemGuia({ aoComecar: () => { comecou += 1; } });
  andar(1_500);
  c.comecarAgora();
  assert.equal(comecou, 1);
  andar(6_000);
  c.comecarAgora();
  assert.equal(comecou, 1);
});

test('vizinho: voltar durante a contagem (guia desmonta) cancela a corrida', (t) => {
  const andar = relogio(t);
  let comecou = 0;
  const c = criarContagemGuia({ aoComecar: () => { comecou += 1; } });
  andar(3_000);
  c.parar();
  andar(10_000);
  assert.equal(comecou, 0);
});
