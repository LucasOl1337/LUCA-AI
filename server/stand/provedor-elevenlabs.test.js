import test from 'node:test';
import assert from 'node:assert/strict';
import { credencialElevenlabs, fatorCreditosTts, modeloTtsStand, provedorElevenlabs, resolverVoz, sintetizarElevenlabs } from './provedor-elevenlabs.js';

const respostaEmPedacos = (pedacos) => new Response(new ReadableStream({
  start(c) { for (const p of pedacos) c.enqueue(new Uint8Array(p)); c.close(); },
}));

test('PCM16 sai sempre em bytes pares, mesmo com pedaços ímpares da rede', async () => {
  let pedido;
  const fetchImpl = async (url, init) => { pedido = { url, corpo: JSON.parse(init.body) }; return respostaEmPedacos([[1, 2, 3], [4], [5, 6, 7]]); };
  const saida = [];
  for await (const b of sintetizarElevenlabs({ chave: 'k', vozId: 'v', texto: 'Oi.', anterior: 'Antes.', fetchImpl })) saida.push(b);
  assert.ok(saida.every((b) => b.length % 2 === 0));
  assert.deepEqual([...Buffer.concat(saida)], [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(pedido.corpo, { text: 'Oi.', model_id: 'eleven_turbo_v2_5', language_code: 'pt', previous_text: 'Antes.' });
  assert.match(pedido.url, /output_format=pcm_24000$/);
});

test('voz pelo nome: exato, sem diferença de caixa, com cache; ambígua ou ausente falha', async () => {
  let chamadas = 0;
  const vozes = [{ name: 'Lucas Oliveira', voice_id: 'id1' }, { name: 'Lucas Oliveira 2', voice_id: 'id2' }];
  const fetchImpl = async () => { chamadas++; return new Response(JSON.stringify({ voices: vozes })); };
  const cache = new Map();
  assert.equal(await resolverVoz({ chave: 'k', voz: 'lucas oliveira', fetchImpl, cache }), 'id1');
  assert.equal(await resolverVoz({ chave: 'k', voz: 'lucas oliveira', fetchImpl, cache }), 'id1');
  assert.equal(chamadas, 1);
  assert.equal(await resolverVoz({ chave: 'k', voz: 'AbCdEfGhIjKlMnOpQrSt', fetchImpl, cache }), 'AbCdEfGhIjKlMnOpQrSt');
  await assert.rejects(resolverVoz({ chave: 'k', voz: 'Ninguém', fetchImpl, cache }), /voz_nao_encontrada/);
  vozes.push({ name: 'LUCAS OLIVEIRA', voice_id: 'id3' });
  await assert.rejects(resolverVoz({ chave: 'k', voz: 'Lucas Oliveira', fetchImpl, cache: new Map() }), /voz_ambigua/);
});

test('env: chave, modelo de TTS permitido e fator de créditos', () => {
  assert.deepEqual(credencialElevenlabs({}), { motivo: 'sem_credencial' });
  assert.deepEqual(credencialElevenlabs({ ELEVENLABS_API_KEY: ' k ' }), { chave: 'k', origem: 'api_key' });
  assert.equal(modeloTtsStand({}), 'eleven_turbo_v2_5');
  assert.equal(modeloTtsStand({ STAND_TTS_MODELO: 'eleven_multilingual_v2' }), 'eleven_multilingual_v2');
  assert.equal(modeloTtsStand({ STAND_TTS_MODELO: 'qualquer' }), 'eleven_turbo_v2_5');
  assert.equal(fatorCreditosTts('eleven_turbo_v2_5'), 0.5);
  assert.equal(fatorCreditosTts('eleven_multilingual_v2'), 1);
});

test('token Scribe de uso único; recusa vira ok:false com status', async () => {
  const ok = await provedorElevenlabs.pedirToken({ chave: 'k', fetchImpl: async () => new Response(JSON.stringify({ token: 't' })) });
  assert.equal(ok.ok, true);
  assert.equal(ok.token, 't');
  const recusa = await provedorElevenlabs.pedirToken({ chave: 'k', fetchImpl: async () => new Response('{}', { status: 401 }) });
  assert.deepEqual({ ok: recusa.ok, status: recusa.status }, { ok: false, status: 401 });
});
