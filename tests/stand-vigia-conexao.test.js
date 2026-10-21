import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { criarVigiaConexao, FALHAS_PARA_OFFLINE, TIMEOUT_SAUDE_MS } = await loadFrontendModule('../../src/components/stand/vigiaConexao.ts');

test('B1: uma saúde lenta durante a cena 3D não derruba o stand nem recarrega', () => {
  // Reprodução em produção 21/10: health 200 levou 4422 ms com a thread presa pelo WebGL;
  // o timeout de 4 s virou offline e a saúde seguinte chamou location.reload().
  const vigia = criarVigiaConexao(true);
  assert.equal(vigia.saudeOk(), 'nada');
  assert.equal(vigia.falhaSaude(true), 'nada');
  assert.equal(vigia.offline, false);
  assert.equal(vigia.saudeOk(), 'nada');
  assert.ok(TIMEOUT_SAUDE_MS > 4422);
});

test('falhas seguidas com o navegador online acabam em offline; volta sem recarregar', () => {
  const vigia = criarVigiaConexao(true);
  vigia.saudeOk();
  for (let i = 1; i < FALHAS_PARA_OFFLINE; i += 1) assert.equal(vigia.falhaSaude(true), 'nada');
  assert.equal(vigia.falhaSaude(true), 'offline');
  assert.equal(vigia.falhaSaude(true), 'nada');
  assert.equal(vigia.saudeOk(), 'online');
  assert.equal(vigia.offline, false);
});

test('falha intercalada com sucesso zera a contagem', () => {
  const vigia = criarVigiaConexao(true);
  vigia.saudeOk();
  for (let rodada = 0; rodada < 5; rodada += 1) {
    for (let i = 1; i < FALHAS_PARA_OFFLINE; i += 1) assert.equal(vigia.falhaSaude(true), 'nada');
    assert.equal(vigia.saudeOk(), 'nada');
  }
});

test('evento offline do navegador e falha com navigator.onLine=false derrubam na hora', () => {
  const a = criarVigiaConexao(true);
  a.saudeOk();
  assert.equal(a.eventoOffline(), 'offline');
  assert.equal(a.eventoOffline(), 'nada');
  const b = criarVigiaConexao(true);
  b.saudeOk();
  assert.equal(b.falhaSaude(false), 'offline');
});

test('retomada legítima: aba que abriu offline (casca do SW) recarrega ao ver o servidor', () => {
  const vigia = criarVigiaConexao(false);
  assert.equal(vigia.offline, true);
  assert.equal(vigia.falhaSaude(false), 'nada');
  assert.equal(vigia.saudeOk(), 'recarregar');
});

test('boot online sem saúde ainda e queda real: primeira volta recarrega (nunca viu o app de pé)', () => {
  const vigia = criarVigiaConexao(true);
  assert.equal(vigia.eventoOffline(), 'offline');
  assert.equal(vigia.saudeOk(), 'recarregar');
});
