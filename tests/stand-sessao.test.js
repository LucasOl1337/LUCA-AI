import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { chamadaDeInicio, avisoParaEquipe } = await loadFrontendModule('../../src/components/stand/avisos.ts');
const { videoDoStand, criarRepasseAcao } = await loadFrontendModule('../../src/components/stand/videosStand.ts');

test('Atração convida a tocar na tela e não mostra erro ao público', () => {
  assert.equal(chamadaDeInicio(false, null), 'Toca na tela pra começar a conversa.');
  assert.equal(chamadaDeInicio(true, null), 'Ligando o microfone…');
  assert.doesNotMatch(chamadaDeInicio(false, { motivo: 'desligado', detalhe: 'sem_chave' }), /deslig|erro|chave/i);
});

test('aviso da equipe só aparece em desligado e erro', () => {
  assert.equal(avisoParaEquipe(null), '');
  assert.equal(avisoParaEquipe({ motivo: 'silencio' }), '');
  assert.equal(avisoParaEquipe({ motivo: 'encerrada' }), '');
  assert.match(avisoParaEquipe({ motivo: 'desligado' }), /stand_desligado/);
  assert.match(avisoParaEquipe({ motivo: 'erro', detalhe: 'websocket_falhou' }), /websocket_falhou/);
});

test('vídeos saem do manifesto da M7; o de teste só no modo stub', () => {
  assert.equal(videoDoStand('painel-sompo', false).arquivo, '/stand/videos/painel-sompo.mp4');
  assert.equal(videoDoStand('pipeline-completo', false).arquivo, '/stand/videos/pipeline-completo.mp4');
  assert.equal(videoDoStand('pipeline-completo', true).arquivo, '/icons/heartbeat.mp4');
  assert.equal(videoDoStand('nao-existe', false), undefined);
  assert.equal(videoDoStand('', true), undefined);
});

test('acao_site vai pro BroadcastChannel luca-stand com id', async () => {
  const ouvinte = new BroadcastChannel('luca-stand');
  const recebido = new Promise((ok) => { ouvinte.onmessage = (ev) => ok(ev.data); });
  const repasse = criarRepasseAcao();
  const enviado = repasse.repassar('abrir_aba', { aba: 'telemetria' });
  const msg = await recebido;
  repasse.fechar();
  ouvinte.close();
  assert.deepEqual(msg, enviado);
  assert.equal(msg.tipo, 'acao_site');
  assert.equal(msg.acao, 'abrir_aba');
  assert.match(msg.id, /^stand-\d+-1$/);
});
