import assert from 'node:assert/strict';
import test from 'node:test';
import { fecharSocketsDasSessoes, WS_SESSAO_ENCERRADA } from './ws-sessao.js';

function socketFalso(sessionId, readyState = 1) {
  return { sessionId, readyState, fechamentos: [], close(codigo, motivo) { this.fechamentos.push([codigo, motivo]); this.readyState = 2; } };
}

test('fecha só os sockets abertos das sessões encerradas, com 4401', () => {
  const a1 = socketFalso('a');
  const a2 = socketFalso('a');
  const b = socketFalso('b');
  const semSessao = socketFalso(null);
  const jaFechando = socketFalso('a', 2);
  assert.equal(fecharSocketsDasSessoes([a1, a2, b, semSessao, jaFechando], new Set(['a'])), 2);
  assert.deepEqual(a1.fechamentos, [[WS_SESSAO_ENCERRADA, 'sessao_encerrada']]);
  assert.deepEqual(a2.fechamentos, [[4401, 'sessao_encerrada']]);
  for (const s of [b, semSessao, jaFechando]) assert.deepEqual(s.fechamentos, []);
});
