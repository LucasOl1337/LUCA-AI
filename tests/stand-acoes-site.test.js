import assert from 'node:assert/strict';
import test from 'node:test';
import { ACOES_SITE, ferramentasAcaoSite, validarAcaoSite } from '../shared/stand/acoes-site.ts';

test('a lista fechada tem exatamente as 6 ações combinadas', () => {
  assert.deepEqual(ACOES_SITE.map((item) => item.nome), [
    'abrir_aba', 'voltar_inicio', 'abrir_caso', 'rodar_cenario', 'gravar_episodio', 'analisar_na_bancada',
  ]);
});

test('ação válida passa com os argumentos limpos', () => {
  assert.deepEqual(validarAcaoSite('abrir_aba', { aba: 'telemetria' }), { ok: true, acao: 'abrir_aba', args: { aba: 'telemetria' } });
  assert.deepEqual(validarAcaoSite('voltar_inicio', {}), { ok: true, acao: 'voltar_inicio', args: {} });
  assert.deepEqual(validarAcaoSite('voltar_inicio'), { ok: true, acao: 'voltar_inicio', args: {} });
  assert.equal(validarAcaoSite('abrir_caso', { id: 'granizo-soja-rs' }).ok, true);
  assert.equal(validarAcaoSite('rodar_cenario', { id: 'stand-reacao-atrasada' }).ok, true);
  assert.equal(validarAcaoSite('gravar_episodio', {}).ok, true);
  assert.equal(validarAcaoSite('analisar_na_bancada', {}).ok, true);
});

test('ação desconhecida é recusada com a lista do que a IA consegue', () => {
  const result = validarAcaoSite('apagar_tudo', {});
  assert.equal(result.ok, false);
  assert.match(result.motivo, /Não posso fazer "apagar_tudo"/);
  assert.match(result.motivo, /abrir_aba, voltar_inicio/);
  assert.equal(validarAcaoSite('abrir_perfil_segurado', { id: '1' }).ok, false);
});

test('argumento inválido é recusado', () => {
  const aba = validarAcaoSite('abrir_aba', { aba: 'carteira' });
  assert.equal(aba.ok, false);
  assert.match(aba.motivo, /Não existe aba "carteira".*telemetria, casos, safra, veiculos/);
  assert.equal(validarAcaoSite('abrir_caso', { id: 'caso-inventado' }).ok, false);
  assert.equal(validarAcaoSite('rodar_cenario', { id: 'max-front-obstacle' }).ok, false, 'id do catálogo cru não é Cenário do stand');
  assert.equal(validarAcaoSite('abrir_aba', { aba: 7 }).ok, false);
});

test('argumento faltando, extra ou fora de objeto é recusado', () => {
  assert.match(validarAcaoSite('abrir_aba', {}).motivo, /precisa de "aba"/);
  assert.match(validarAcaoSite('voltar_inicio', { aba: 'safra' }).motivo, /não aceita "aba"/);
  assert.equal(validarAcaoSite('abrir_aba', ['telemetria']).ok, false);
  assert.equal(validarAcaoSite('abrir_aba', null).ok, false);
});

test('ferramentas saem uma por ação, com enum fechado', () => {
  const realtime = ferramentasAcaoSite();
  assert.equal(realtime.length, 6);
  const aba = realtime.find((item) => item.name === 'abrir_aba');
  assert.deepEqual(aba.parameters.properties.aba.enum, ['telemetria', 'casos', 'safra', 'veiculos']);
  assert.deepEqual(aba.parameters.required, ['aba']);
  assert.equal(aba.parameters.additionalProperties, false);
  const chat = ferramentasAcaoSite('chat').find((item) => item.function.name === 'rodar_cenario');
  assert.deepEqual(chat.function.parameters.properties.id.enum, ['stand-obstaculo-a-tempo', 'stand-inclinacao', 'stand-reacao-atrasada']);
});
