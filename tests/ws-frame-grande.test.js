import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import WebSocket from 'ws';
import { runtime, temporary } from './support/cli.js';

// Revisão do trem (item 9): frame acima do `maxPayload` do /ws. O `ws` fecha com
// 1009 e emite 'error' no socket do servidor; sem ouvinte, o EventEmitter joga a
// exceção e o processo inteiro cai. Um tablet com bug derrubava a feira.
test('/ws: frame grande demais fecha só aquela conexão; o servidor segue de pé', { timeout: 30000 }, async (t) => {
  const url = await runtime(t, await temporary(t));
  const resposta = await fetch(`${url}/api/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Grande', email: 'grande@ws.test', password: 'frame-grande-123' }),
  });
  assert.ok(resposta.ok, `register: ${resposta.status}`);
  const cookie = resposta.headers.get('set-cookie').split(';')[0];

  const ws = new WebSocket(`${url.replace('http', 'ws')}/ws`, { headers: { cookie, origin: url } });
  ws.on('error', () => {});
  await once(ws, 'open');
  ws.send('x'.repeat(64 * 1024));
  const [codigo] = await once(ws, 'close');
  assert.equal(codigo, 1009, 'mensagem grande demais');

  const saude = await fetch(`${url}/api/health`).then((r) => r.json(), (erro) => ({ caiu: erro.cause?.code || erro.message }));
  assert.equal(saude.ok, true, `o runtime caiu: ${JSON.stringify(saude)}`);
  const outro = new WebSocket(`${url.replace('http', 'ws')}/ws`, { headers: { cookie, origin: url } });
  t.after(() => outro.close());
  await once(outro, 'open');
});
