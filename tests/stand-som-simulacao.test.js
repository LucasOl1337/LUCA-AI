import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadFrontendModule } from './support/load-frontend-module.js';

// Lucas, 21/10: "a Simulação do Totem está ficando sem som". Caso exato: a
// Simulação abre pelo controle (gamepad não é gesto para o Chrome) depois de
// trocar de aba, sem microfone aberto (a Escuta fecha na Simulação). O bipe
// criava o AudioContext ali, nascia `suspended` e o primeiro bipe era jogado
// fora; ao sair da Simulação o contexto era fechado e a volta nascia travada de novo.

globalThis.window ??= globalThis;
const { criarSomCompartilhado, GESTOS_DE_SOM } = await loadFrontendModule('../../src/components/gameplay/somCompartilhado.ts');
const { criarMotorBipe } = await loadFrontendModule('../../src/components/gameplay/bipeCabine.ts');
const { GameplayOuClassico } = await loadFrontendModule('../../src/components/gameplay/GameplayOuClassico.tsx');

/** AudioContext do Chrome em miniatura: só toca depois de `liberado` (gesto ou captura ativa). */
function navegador() {
  const politica = { liberado: false };
  const criados = [];
  class ContextoFalso {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; this.tocados = 0; this.fechado = 0; criados.push(this); }
    async resume() { if (politica.liberado && this.state !== 'closed') this.state = 'running'; }
    async close() { this.state = 'closed'; this.fechado += 1; }
    createOscillator() {
      const ctx = this;
      const no = { type: '', frequency: { value: 0 }, connect: (g) => g, start() { if (ctx.state === 'running') ctx.tocados += 1; }, stop() {}, disconnect() {} };
      return no;
    }
    createGain() { return { gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect: (d) => d }; }
  }
  return { politica, criados, ContextoFalso };
}

const tique = () => new Promise((ok) => setImmediate(ok));

test('Simulação aberta pelo controle, sem gesto e sem captura: o bipe fica mudo e toca no primeiro toque, sem perder o alerta', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { politica, criados, ContextoFalso } = navegador();
  const som = criarSomCompartilhado(ContextoFalso);
  const janela = new EventTarget();
  const documento = Object.assign(new EventTarget(), { hidden: false });
  som.ligarDestravas(janela, documento);
  const motor = criarMotorBipe(som);
  motor.tocar(0, 520); // sono: tom contínuo
  await tique();
  assert.equal(criados.length, 1);
  assert.equal(criados[0].state, 'suspended');
  assert.equal(criados[0].tocados, 0, 'sem gesto o Chrome não toca');
  // Um toque na tela (pointerdown) libera e o alarme que já estava pedido toca.
  politica.liberado = true;
  janela.dispatchEvent(new Event(GESTOS_DE_SOM[0]));
  await tique();
  assert.equal(criados[0].state, 'running');
  // O tom contínuo que já estava pedido entra sozinho na retentativa seguinte (sem novo alerta).
  t.mock.timers.tick(500);
  assert.equal(criados[0].tocados, 1);
  t.mock.timers.tick(1500);
  assert.equal(criados[0].tocados, 1, 'liga uma vez só');
  motor.fechar();
});

test('troca de aba do Totem: sair da Simulação não fecha o contexto e a volta toca no mesmo contexto já liberado', async () => {
  const { politica, criados, ContextoFalso } = navegador();
  const som = criarSomCompartilhado(ContextoFalso);
  politica.liberado = true;
  const primeiro = criarMotorBipe(som);
  primeiro.tocar(0, 660);
  await tique();
  assert.equal(criados[0].tocados, 1, 'o primeiro bipe espera o resume em vez de sumir');
  primeiro.fechar(); // Simulação → Vitrine (o PainelCabine desmonta)
  assert.equal(criados[0].fechado, 0, 'o bipe não fecha o contexto da página');
  // Volta pelo controle: sem gesto novo. Antes nascia um contexto novo e travado.
  politica.liberado = false;
  const segundo = criarMotorBipe(som);
  segundo.tocar(0, 660);
  assert.equal(criados.length, 1, 'continua o mesmo contexto');
  assert.equal(criados[0].tocados, 2, 'toca na hora, sem gesto novo');
  segundo.fechar();
});

test('aba do navegador volta a ficar visível: o contexto suspenso é retomado', async () => {
  const { politica, criados, ContextoFalso } = navegador();
  const som = criarSomCompartilhado(ContextoFalso);
  const janela = new EventTarget();
  const documento = Object.assign(new EventTarget(), { hidden: true });
  const soltar = som.ligarDestravas(janela, documento);
  som.obter();
  politica.liberado = true;
  documento.dispatchEvent(new Event('visibilitychange'));
  await tique();
  assert.equal(criados[0].state, 'suspended', 'oculta não mexe');
  documento.hidden = false;
  documento.dispatchEvent(new Event('visibilitychange'));
  await tique();
  assert.equal(criados[0].state, 'running');
  soltar();
});

test('bipe intermitente: o primeiro bipe sai quando o contexto recém-criado destrava', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { politica, criados, ContextoFalso } = navegador();
  politica.liberado = true;
  const motor = criarMotorBipe(criarSomCompartilhado(ContextoFalso));
  motor.tocar(300, 520);
  await tique();
  assert.equal(criados[0].tocados, 1);
  t.mock.timers.tick(300);
  assert.equal(criados[0].tocados, 2);
  motor.parar();
  t.mock.timers.tick(900);
  assert.equal(criados[0].tocados, 2, 'parado não bipa');
});

test('atualizar distância não reinicia o relógio nem emite um bipe por render', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { politica, criados, ContextoFalso } = navegador();
  politica.liberado = true;
  const motor = criarMotorBipe(criarSomCompartilhado(ContextoFalso));
  motor.tocar(800, 1180);
  await tique();
  motor.tocar(600, 1180);
  motor.tocar(400, 1180);
  assert.equal(criados[0].tocados, 1, 'atualização não bipa');
  t.mock.timers.tick(410);
  assert.equal(criados[0].tocados, 2, 'cadência nova passa a valer sem reinício');
  motor.fechar();
});

test('reserva clássica: erro do gameplay (WebGL, chunk) devolve a Simulação ao simulador clássico', () => {
  assert.deepEqual(GameplayOuClassico.getDerivedStateFromError(new Error('WebGL indisponível para o gameplay')), { falhou: true });
  const caixa = new GameplayOuClassico({ classico: createElement('p', null, 'clássico'), children: createElement('p', null, 'gameplay') });
  assert.equal(renderToStaticMarkup(caixa.render()), '<p>gameplay</p>');
  caixa.state = GameplayOuClassico.getDerivedStateFromError();
  assert.equal(renderToStaticMarkup(caixa.render()), '<p>clássico</p>');
});
