import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { SessaoTurnos } = await loadFrontendModule('../../src/stand-voz/sessaoTurnos.ts');

// Exercita o receptor real do Scribe; sem abrir microfone, caixa ou rede.
function emFala() {
  const sessao = new SessaoTurnos();
  const entradas = [];
  let cortes = 0;
  sessao.estado = 'falando';
  sessao.fila = { tocando: true };
  sessao.falado = 'O animal na pista é um dos cenários do nosso simulador 3D.';
  sessao.interromper = () => { cortes++; };
  sessao.perguntar = async (entrada) => { entradas.push(entrada); };
  return { sessao, entradas, cortes: () => cortes };
}

test('final Scribe curto não contorna a confirmação exigida da parcial durante TTS', () => {
  const { sessao, entradas, cortes } = emFala();
  sessao.aoScribe({ message_type: 'partial_transcript', text: 'Oi' });
  sessao.aoScribe({ message_type: 'committed_transcript', text: 'Oi' });
  assert.equal(cortes(), 0);
  assert.deepEqual(entradas, []);
});

test('eco exato não corta, mas interrupção humana curta continua funcionando', () => {
  const { sessao, entradas, cortes } = emFala();
  sessao.aoScribe({ message_type: 'committed_transcript', text: 'O animal na pista' });
  assert.deepEqual(entradas, []);
  sessao.aoScribe({ message_type: 'partial_transcript', text: 'Pare!' });
  assert.equal(cortes(), 1);
});

test('sim/não/volta finais são válidos durante TTS e uma palavra fora de TTS também', () => {
  for (const texto of ['Sim', 'Não', 'Volta']) {
    const { sessao, entradas } = emFala();
    sessao.aoScribe({ message_type: 'committed_transcript', text: texto });
    assert.deepEqual(entradas, [{ texto }]);
  }
  const { sessao, entradas } = emFala();
  sessao.estado = 'ouvindo';
  sessao.fila.tocando = false;
  sessao.fimDaFala = -10000;
  sessao.aoScribe({ message_type: 'committed_transcript', text: 'Oi' });
  assert.deepEqual(entradas, [{ texto: 'Oi' }]);
});
