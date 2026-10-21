import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { lerPulsoMs, ligarPulso, marcarVivo, varrerPulso, WS_PULSO_MS_PADRAO } from './ws-pulso.js';

function socketFalso() {
  const s = new EventEmitter();
  s.pings = 0; s.derrubado = false;
  s.ping = () => { s.pings += 1; };
  s.terminate = () => { s.derrubado = true; };
  return s;
}

test('LUCA_WS_PULSO_MS: inteiro ≥ 50; vazio ou inválido usa 30 s', () => {
  assert.equal(WS_PULSO_MS_PADRAO, 30_000);
  for (const valor of [undefined, '', '0', '49', '2.5', 'abc']) assert.equal(lerPulsoMs(valor), 30_000, `valor ${valor}`);
  assert.equal(lerPulsoMs('300'), 300);
});

test('quem responde pong segue vivo; quem não responde cai no tique seguinte', () => {
  const responde = socketFalso();
  const mudo = socketFalso();
  marcarVivo(responde); marcarVivo(mudo);
  assert.equal(varrerPulso([responde, mudo]), 0, '1º tique só pinga');
  assert.deepEqual([responde.pings, mudo.pings], [1, 1]);
  responde.emit('pong');
  assert.equal(varrerPulso([responde, mudo]), 1);
  assert.equal(mudo.derrubado, true);
  assert.equal(responde.derrubado, false);
  assert.equal(responde.pings, 2);
});

test('ping que lança (socket fechando) não derruba o tique', () => {
  const fechando = socketFalso();
  fechando.ping = () => { throw new Error('WebSocket is not open'); };
  const outro = socketFalso();
  marcarVivo(fechando); marcarVivo(outro);
  assert.equal(varrerPulso([fechando, outro]), 0);
  assert.equal(outro.pings, 1);
});

test('o intervalo é limpo quando o WebSocketServer fecha', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const wss = new EventEmitter();
  const mudo = socketFalso();
  marcarVivo(mudo);
  wss.clients = new Set([mudo]);
  ligarPulso(wss, 1000);
  t.mock.timers.tick(1000);
  assert.equal(mudo.pings, 1);
  wss.emit('close');
  t.mock.timers.tick(5000);
  assert.equal(mudo.derrubado, false, 'sem tique depois do close');
  assert.equal(mudo.pings, 1);
});
