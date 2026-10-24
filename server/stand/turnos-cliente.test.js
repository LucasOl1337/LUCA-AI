import test from 'node:test';
import assert from 'node:assert/strict';
import { eventoScribe, interrompeFala, lerNdjson, mensagemAudioScribe, pareceEco, vaiAoCerebro } from '../../src/stand-voz/turnos.ts';
import { TOUR_STAND } from '../../shared/stand/acoes-site.ts';

const pedacos = (...textos) => (async function* () { for (const t of textos) yield new TextEncoder().encode(t); })();

test('NDJSON do turno: junta linhas quebradas entre pedaços e ignora lixo', async () => {
  const linhas = [];
  for await (const l of lerNdjson(pedacos('{"t":"frase","texto":"O', 'i."}\n{"t":"au', 'dio","pcm":"AAA="}\nlixo\n', '{"t":"fim","motivo":"ok"}'))) linhas.push(l);
  assert.deepEqual(linhas, [{ t: 'frase', texto: 'Oi.' }, { t: 'audio', pcm: 'AAA=' }, { t: 'fim', motivo: 'ok' }]);
});

test('NDJSON também lê ReadableStream (corpo do fetch)', async () => {
  const corpo = new Response('{"t":"fim","motivo":"ok"}\n').body;
  const linhas = [];
  for await (const l of lerNdjson(corpo)) linhas.push(l);
  assert.equal(linhas[0].motivo, 'ok');
});

test('mensagens do Scribe: áudio de entrada e eventos de saída', () => {
  assert.deepEqual(JSON.parse(mensagemAudioScribe('QUJD', 24000)), { message_type: 'input_audio_chunk', audio_base_64: 'QUJD', commit: false, sample_rate: 24000 });
  assert.deepEqual(eventoScribe({ message_type: 'partial_transcript', text: ' o que ' }), { tipo: 'parcial', texto: 'o que' });
  assert.deepEqual(eventoScribe({ message_type: 'committed_transcript', text: 'o que é o LUCA?' }), { tipo: 'fechada', texto: 'o que é o LUCA?' });
  assert.equal(eventoScribe({ message_type: 'session_started' }).tipo, 'outro');
  assert.equal(eventoScribe({ message_type: 'auth_error', error: 'x' }).fatal, true);
  assert.equal(eventoScribe({ message_type: 'transcriber_error' }).fatal, false);
});

test('ruído e "hã" não gastam turno; pergunta curta gasta', () => {
  assert.equal(vaiAoCerebro(''), false);
  assert.equal(vaiAoCerebro('.'), false);
  assert.equal(vaiAoCerebro('Hã?'), false);
  assert.equal(vaiAoCerebro('hum'), false);
  assert.equal(vaiAoCerebro('oi'), true);
  assert.equal(vaiAoCerebro('Quanto custa?'), true);
});

test('eco: a voz do LUCA voltando pelo microfone não vira pergunta nem interrupção', () => {
  const falado = 'O LUCA mede a inclinação do trator e avisa antes do tombamento.';
  assert.equal(pareceEco('mede a inclinação do trator', falado), true);
  assert.equal(pareceEco('quanto custa o sensor?', falado), false);
  assert.equal(pareceEco('o LUCA', falado), false, 'fora da fala, trecho curto é pergunta legítima');
  assert.equal(pareceEco('o LUCA', falado, { durante: true }), true);
  assert.equal(interrompeFala('o trator', falado), false);
  assert.equal(interrompeFala('espera aí', falado), true);
  assert.equal(interrompeFala('hã', falado), false);
});

test('eco do tour: "o que é o sensor?" após a narração é pergunta, não palavras soltas do roteiro', () => {
  const falado = TOUR_STAND.filter((passo) => 'texto' in passo).map((passo) => passo.texto).join(' ');
  assert.equal(pareceEco('o que é o sensor?', falado, { durante: true }), false);
  assert.equal(pareceEco('o que é o sensor?', falado), false);
  // Durante a narração do sensor, a pergunta só com palavras que ele está
  // dizendo não corta a fala (23/10: frase completa vale mais que barge-in);
  // feita depois que ele termina, é pergunta normal (pareceEco fora da fala = false).
  assert.equal(interrompeFala('o que é o sensor?', falado), false);
  assert.equal(interrompeFala('quanto custa o sensor?', falado), true);
  assert.equal(pareceEco('o sensor mede a inclinação', falado, { durante: true }), true);
  assert.equal(pareceEco('Esse foi o tour. Agora você pode dirigir o trator.', falado), true);
});
