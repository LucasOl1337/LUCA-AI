import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { reduzirTela, telaInicial } = await loadFrontendModule('../../src/components/stand/telaStand.ts');
const { nivelDeAmostras, suavizarBoca } = await loadFrontendModule('../../src/components/stand/lipSync.ts');
const { legendaNoTempo } = await loadFrontendModule('../../src/components/stand/canalStub.ts');

function rodar(passos) {
  return passos.reduce((estado, [entrada, agora]) => reduzirTela(estado, entrada, agora), telaInicial());
}

test('começa na Atração e vai para Conversa quando alguém fala', () => {
  assert.equal(telaInicial().tela, 'atracao');
  assert.equal(rodar([[{ tipo: 'estado', valor: 'ouvindo' }, 0]]).tela, 'conversa');
});

test('falando → tocar_video → video_terminou volta para Conversa', () => {
  const fim = rodar([
    [{ tipo: 'estado', valor: 'falando' }, 0],
    [{ tipo: 'tocar_video', id: 'pipeline-completo' }, 100],
    [{ tipo: 'video_terminou' }, 6100],
  ]);
  assert.equal(fim.tela, 'conversa');
  assert.equal(fim.videoId, '');
});

test('durante o vídeo, estado e legenda são guardados sem trocar a tela', () => {
  const estado = rodar([
    [{ tipo: 'tocar_video', id: 'painel-sompo' }, 0],
    [{ tipo: 'estado', valor: 'falando' }, 50],
    [{ tipo: 'legenda', texto: 'Olha só' }, 60],
    [{ tipo: 'relogio' }, 60_000],
  ]);
  assert.equal(estado.tela, 'video');
  assert.equal(estado.voz, 'falando');
  assert.equal(estado.legenda, 'Olha só');
});

test('ocioso por 9 s continua em Conversa; por 10 s volta à Atração', () => {
  const ocioso = rodar([
    [{ tipo: 'estado', valor: 'falando' }, 0],
    [{ tipo: 'estado', valor: 'ocioso' }, 1000],
  ]);
  assert.equal(reduzirTela(ocioso, { tipo: 'relogio' }, 10_000).tela, 'conversa');
  assert.equal(reduzirTela(ocioso, { tipo: 'relogio' }, 11_000).tela, 'atracao');
});

test('voltar a falar zera a contagem do ocioso', () => {
  const estado = rodar([
    [{ tipo: 'estado', valor: 'ocioso' }, 0],
    [{ tipo: 'estado', valor: 'ouvindo' }, 9000],
    [{ tipo: 'estado', valor: 'ocioso' }, 9500],
    [{ tipo: 'relogio' }, 12_000],
  ]);
  assert.equal(estado.tela, 'conversa');
});

test('vídeo terminado com voz ociosa conta 10 s a partir do fim do vídeo', () => {
  const fim = rodar([
    [{ tipo: 'estado', valor: 'falando' }, 0],
    [{ tipo: 'tocar_video', id: 'pipeline-completo' }, 100],
    [{ tipo: 'estado', valor: 'ocioso' }, 200],
    [{ tipo: 'video_terminou' }, 30_000],
  ]);
  assert.equal(reduzirTela(fim, { tipo: 'relogio' }, 35_000).tela, 'conversa');
  assert.equal(reduzirTela(fim, { tipo: 'relogio' }, 40_000).tela, 'atracao');
});

test('encerrar volta à Atração limpa; reiniciar abre Conversa vazia', () => {
  const meio = rodar([[{ tipo: 'estado', valor: 'falando' }, 0], [{ tipo: 'legenda', texto: 'x' }, 1]]);
  assert.deepEqual(reduzirTela(meio, { tipo: 'encerrar' }, 5), telaInicial());
  const novo = reduzirTela(meio, { tipo: 'reiniciar' }, 5);
  assert.equal(novo.tela, 'conversa');
  assert.equal(novo.legenda, '');
});

test('nível de áudio: silêncio é 0, onda forte satura em 1', () => {
  assert.equal(nivelDeAmostras([0, 0, 0, 0]), 0);
  assert.equal(nivelDeAmostras([0.5, -0.5, 0.5, -0.5]), 1);
  assert.ok(Math.abs(nivelDeAmostras([0.1, -0.1]) - 0.4) < 1e-9);
  assert.equal(nivelDeAmostras([]), 0);
});

test('boca abre mais rápido do que fecha', () => {
  const abrindo = suavizarBoca(0, 1, 33);
  const fechando = 1 - suavizarBoca(1, 0, 33);
  assert.ok(abrindo > fechando, `${abrindo} <= ${fechando}`);
  assert.equal(suavizarBoca(0.3, 2, 0), 0.3);
});

test('legenda do stub segue o tempo da fala', () => {
  assert.match(legendaNoTempo(0.2), /^Oi! Eu sou o LUCA/);
  assert.match(legendaNoTempo(6), /^Eu acompanho/);
  assert.match(legendaNoTempo(16), /seguradora/);
});
