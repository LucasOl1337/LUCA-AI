import assert from 'node:assert/strict';
import test from 'node:test';
import { lerMaxPorConta, recusarAcimaDoLimite, WS_LIMITE_CODIGO } from './ws-limites.js';

function socketFalso(userId, readyState = 1) {
  return { userId, readyState, fechamentos: [], close(codigo, motivo) { this.fechamentos.push([codigo, motivo]); this.readyState = 2; } };
}

test('LUCA_WS_MAX_POR_CONTA: inteiro ≥ 1; vazio ou inválido usa 8', () => {
  for (const valor of [undefined, '', '0', '-3', '2.5', 'abc']) assert.equal(lerMaxPorConta(valor), 8, `valor ${valor}`);
  assert.equal(lerMaxPorConta('3'), 3);
  assert.equal(lerMaxPorConta('20'), 20);
});

test('conta só sockets abertos da mesma conta; o excedente fecha com 1013 e motivo legível', () => {
  const abertos = [socketFalso('a'), socketFalso('a')];
  const fechando = socketFalso('a', 2);
  const outraConta = socketFalso('b');
  const novo = socketFalso('a', 1);
  const clientes = [...abertos, fechando, outraConta, novo];
  assert.equal(recusarAcimaDoLimite(novo, clientes, 3), false, '2 abertos + o novo = 3, cabe');
  assert.equal(recusarAcimaDoLimite(novo, clientes, 2), true);
  assert.deepEqual(novo.fechamentos, [[WS_LIMITE_CODIGO, 'limite de 2 conexoes por conta']]);
  for (const s of [...abertos, outraConta]) assert.deepEqual(s.fechamentos, []);
});
