import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { chamadaDeInicio, avisoParaEquipe } = await loadFrontendModule('../../src/components/stand/avisos.ts');
const { videoDoStand } = await loadFrontendModule('../../src/components/stand/videosStand.ts');
const { enviarAcaoSite } = await loadFrontendModule('../../src/components/stand/executor/ponte.ts');

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
  assert.match(avisoParaEquipe({ motivo: 'desligado', detalhe: 'teto_diario' }), /teto diário/);
  assert.doesNotMatch(chamadaDeInicio(false, { motivo: 'desligado', detalhe: 'teto_diario' }), /teto|crédito/i);
});

test('vídeos saem do manifesto da M7; o de teste só no modo stub', () => {
  assert.equal(videoDoStand('painel-sompo', false).arquivo, '/stand/videos/painel-sompo.mp4');
  assert.equal(videoDoStand('pipeline-completo', false).arquivo, '/stand/videos/pipeline-completo.mp4');
  assert.equal(videoDoStand('pipeline-completo', true).arquivo, '/icons/heartbeat.mp4');
  assert.equal(videoDoStand('nao-existe', false), undefined);
  assert.equal(videoDoStand('', true), undefined);
});

test('acao_site da página chega ao executor (M3) e o resultado volta pelo id', async () => {
  globalThis.window ??= globalThis;
  const executor = new BroadcastChannel('luca-stand');
  executor.onmessage = ({ data }) => {
    if (data.tipo === 'acao_site') executor.postMessage({ tipo: 'acao_site_resultado', id: data.id, ok: true, mensagem: `fiz ${data.acao}` });
  };
  const resultado = await enviarAcaoSite('abrir_aba', { aba: 'telemetria' });
  executor.close();
  assert.equal(resultado.ok, true);
  assert.equal(resultado.mensagem, 'fiz abrir_aba');
});
