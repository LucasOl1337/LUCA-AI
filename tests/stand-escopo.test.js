import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { idDoStand, idDoStandPai, mensagemDoMeuStand } = await loadFrontendModule('../../src/components/stand/executor/escopo.ts');
const { responderPing } = await loadFrontendModule('../../src/components/stand/executor/prontidao.ts');

const janelaDeStand = () => { const pai = {}; pai.parent = pai; return pai; };
const frameDe = (pai) => { const f = { parent: pai }; return f; };

test('B: duas abas de /stand têm ids diferentes; o iframe lê o do próprio pai', () => {
  const a = janelaDeStand(), b = janelaDeStand();
  assert.notEqual(idDoStand(a), idDoStand(b));
  assert.equal(idDoStand(a), idDoStand(a), 'estável');
  assert.equal(idDoStandPai(frameDe(a)), idDoStand(a));
  assert.equal(idDoStandPai(a), null, 'fora de frame');
});

test('iframe que monta antes do pai pedir qualquer coisa cria o id no pai (mesmo valor dos dois lados)', () => {
  const pai = janelaDeStand();
  const doFrame = idDoStandPai(frameDe(pai));
  assert.ok(doFrame);
  assert.equal(idDoStand(pai), doFrame);
});

test('pai de outra origem: sem escopo, sem exceção', () => {
  const frame = { parent: new Proxy({}, { get() { throw new DOMException('cross-origin', 'SecurityError'); }, set() { throw new DOMException('cross-origin', 'SecurityError'); } }) };
  assert.equal(idDoStandPai(frame), null);
});

test('mensagem de outra aba é ignorada; mensagem sem stand (versão antiga) vale', () => {
  assert.equal(mensagemDoMeuStand({ tipo: 'acao_site', stand: 'x' }, 'x'), true);
  assert.equal(mensagemDoMeuStand({ tipo: 'acao_site', stand: 'y' }, 'x'), false);
  assert.equal(mensagemDoMeuStand({ tipo: 'acao_site' }, 'x'), true);
  assert.equal(mensagemDoMeuStand(null, 'x'), true);
});

test('Executor só responde ao ping do próprio /stand, e marca a resposta com o id', () => {
  const enviados = [];
  const canal = { postMessage: (m) => enviados.push(m) };
  assert.equal(responderPing(canal, { tipo: 'executor_ping', stand: 'outra' }, '/laboratorio', () => 'Página laboratório', 'meu'), true);
  assert.deepEqual(enviados, [], 'ping de outra aba não recebe resposta');
  responderPing(canal, { tipo: 'executor_ping', stand: 'meu' }, '/laboratorio', () => 'Página laboratório', 'meu');
  assert.deepEqual(enviados, [{ tipo: 'executor_pronto', caminho: '/laboratorio', retrato: 'Página laboratório', stand: 'meu' }]);
  enviados.length = 0;
  responderPing(canal, { tipo: 'executor_ping' }, '/sompo', undefined, null);
  assert.deepEqual(enviados, [{ tipo: 'executor_pronto', caminho: '/sompo' }], 'pai antigo sem id continua funcionando');
  assert.equal(responderPing(canal, { tipo: 'acao_site', id: '1' }, '/sompo'), false, 'ação não é ping');
});
