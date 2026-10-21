import assert from 'node:assert/strict';
import test from 'node:test';
import net from 'node:net';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import WebSocket from 'ws';
import { runtime, temporary } from './support/cli.js';

// Hotfix: um frame WebSocket inválido (aqui, do cliente sem máscara) faz o `ws`
// fechar com 1002 e emitir 'error' no socket do servidor. Sem ouvinte, o
// EventEmitter joga a exceção e o processo inteiro cai: toda tela perde o /ws.
test('/ws: frame inválido fecha só aquela conexão; o servidor segue de pé', { timeout: 30000 }, async (t) => {
  const url = await runtime(t, await temporary(t));
  const resposta = await fetch(`${url}/api/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: url },
    body: JSON.stringify({ name: 'Frame', email: 'frame@ws.test', password: 'frame-invalido-123' }),
  });
  assert.ok(resposta.ok, `register: ${resposta.status}`);
  const cookie = resposta.headers.get('set-cookie').split(';')[0];

  // Handshake à mão: o cliente `ws` sempre mascara, então o frame ruim sai por TCP cru.
  const { hostname, port } = new URL(url);
  const tcp = net.connect(Number(port), hostname);
  t.after(() => tcp.destroy());
  await once(tcp, 'connect');
  tcp.write([
    'GET /ws HTTP/1.1', `Host: ${hostname}:${port}`, 'Upgrade: websocket', 'Connection: Upgrade',
    `Sec-WebSocket-Key: ${randomBytes(16).toString('base64')}`, 'Sec-WebSocket-Version: 13',
    `Origin: ${url}`, `Cookie: ${cookie}`, '', '',
  ].join('\r\n'));
  let recebido = '';
  while (!recebido.includes('\r\n\r\n')) recebido += (await once(tcp, 'data'))[0].toString('latin1');
  assert.match(recebido, /^HTTP\/1\.1 101/, 'upgrade aceito');
  tcp.on('error', () => {});
  tcp.write(Buffer.from([0x81, 0x02, 0x6f, 0x69])); // texto "oi", FIN, sem o bit MASK
  await once(tcp, 'close');

  const saude = await fetch(`${url}/api/health`).then((r) => r.json(), (erro) => ({ caiu: erro.cause?.code || erro.message }));
  assert.equal(saude.ok, true, `o runtime caiu: ${JSON.stringify(saude)}`);
  const outro = new WebSocket(`${url.replace('http', 'ws')}/ws`, { headers: { cookie, origin: url } });
  t.after(() => outro.close());
  await once(outro, 'open');
});
