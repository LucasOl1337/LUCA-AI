import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { ACOES_DO_STAND, ACOES_SITE, IDS_PAGINAS, PAGINAS_SITE, TOUR_STAND, ferramentasAcaoSite, paginaDaAcao, validarAcaoSite } from '../shared/stand/acoes-site.ts';

test('lista fechada: abrir_pagina, voltar_coruja e os controles <pagina>_<verbo> (Totem-Site Q7)', () => {
  assert.deepEqual(ACOES_SITE.map((item) => item.nome), [
    'abrir_pagina', 'voltar_coruja', 'abrir_simulacao',
    'sensor_escolher_veiculo', 'sensor_rodar_ensaio', 'sensor_ajustar', 'sensor_pausar', 'sensor_continuar', 'sensor_mostrar_vista',
    'sonolencia_ligar_camera', 'sonolencia_desligar_camera', 'sonolencia_testar_som', 'sonolencia_sensibilidade',
    'laboratorio_ver_demonstracao', 'laboratorio_pausar', 'laboratorio_continuar', 'laboratorio_camera',
    'sompo_abrir_aba', 'sompo_voltar_inicio', 'sompo_abrir_caso', 'sompo_rodar_cenario',
    'tour_iniciar',
  ]);
  assert.deepEqual(ACOES_DO_STAND, ['abrir_pagina', 'voltar_coruja', 'abrir_simulacao', 'tour_iniciar']);
  for (const def of ACOES_SITE) {
    if (ACOES_DO_STAND.includes(def.nome)) assert.equal(def.pagina, null, def.nome);
    else assert.ok(def.nome.startsWith(`${def.pagina}_`), `${def.nome} pertence a ${def.pagina}`);
  }
});

test('o totem não grava nem gasta: sem episódio, bancada nem exemplo do Laboratório (Q8)', () => {
  const nomes = ACOES_SITE.map((item) => item.nome);
  for (const proibida of ['gravar_episodio', 'analisar_na_bancada', 'sompo_gravar_episodio', 'sompo_analisar_na_bancada', 'laboratorio_abrir_exemplo']) {
    assert.ok(!nomes.includes(proibida), proibida);
    assert.equal(validarAcaoSite(proibida, {}).ok, false, proibida);
  }
  assert.ok(!nomes.some((n) => n.startsWith('luca_ai_') || n.startsWith('inicio_')), 'LUCA-AI e Início só abrem, sem controle');
});

test('o mapa de páginas só leva às 8 públicas: nada de admin, personas, configuração nem /api', () => {
  assert.deepEqual(IDS_PAGINAS, ['inicio', 'luca_ai', 'sompo', 'laboratorio', 'sensor', 'sonolencia', 'gameplay', 'operador']);
  for (const caminho of Object.values(PAGINAS_SITE)) {
    assert.match(caminho, /^\/(?:|luca-ai|sompo|laboratorio|sensor|sonolencia|gameplay|operador)$/, caminho);
  }
  for (const pagina of ['admin', 'personas', 'configuracao', 'stand', '/admin', 'https://evil.example', '../admin']) {
    assert.equal(validarAcaoSite('abrir_pagina', { pagina }).ok, false, pagina);
  }
});

test('os passos do Executor não miram rota de admin, bancada nem gravação', () => {
  const fonte = fs.readFileSync(new URL('../src/components/stand/executor/passos.ts', import.meta.url), 'utf8');
  for (const proibido of [/\/admin/, /\/personas/, /\/configuracao/, /\/api\//, /fetch\(/, /data-sompo-episode-run/, /data-sompo-telemetry-run/, /data-lab-example/, /\/luca-ai/, /menu-/]) {
    assert.doesNotMatch(fonte, proibido, String(proibido));
  }
});

test('ação válida passa com os argumentos limpos', () => {
  assert.deepEqual(validarAcaoSite('abrir_pagina', { pagina: 'sensor' }), { ok: true, acao: 'abrir_pagina', args: { pagina: 'sensor' } });
  assert.deepEqual(validarAcaoSite('voltar_coruja'), { ok: true, acao: 'voltar_coruja', args: {} });
  assert.equal(validarAcaoSite('sensor_rodar_ensaio', { ensaio: 'encosta' }).ok, true);
  assert.equal(validarAcaoSite('sensor_mostrar_vista', { vista: 'chip' }).ok, true);
  assert.equal(validarAcaoSite('sonolencia_sensibilidade', { nivel: 'alta' }).ok, true);
  assert.equal(validarAcaoSite('laboratorio_camera', { modo: 'superior' }).ok, true);
  assert.equal(validarAcaoSite('sompo_abrir_aba', { aba: 'telemetria' }).ok, true);
  assert.equal(validarAcaoSite('sompo_abrir_caso', { id: 'granizo-soja-rs' }).ok, true);
  assert.equal(validarAcaoSite('sompo_rodar_cenario', { id: 'stand-reacao-atrasada' }).ok, true);
  assert.equal(paginaDaAcao('sonolencia_ligar_camera'), 'sonolencia');
  assert.equal(paginaDaAcao('abrir_pagina'), null);
});

test('ação desconhecida, nome antigo sem prefixo ou argumento fora da lista são recusados', () => {
  const result = validarAcaoSite('apagar_tudo', {});
  assert.equal(result.ok, false);
  assert.match(result.motivo, /Não posso fazer "apagar_tudo"/);
  assert.match(result.motivo, /abrir_pagina, voltar_coruja/);
  for (const antigo of ['abrir_aba', 'voltar_inicio', 'abrir_caso', 'rodar_cenario']) assert.equal(validarAcaoSite(antigo, {}).ok, false, antigo);
  assert.match(validarAcaoSite('sompo_abrir_aba', { aba: 'carteira' }).motivo, /Não existe aba "carteira".*telemetria, casos, safra, veiculos/);
  assert.equal(validarAcaoSite('sompo_rodar_cenario', { id: 'max-front-obstacle' }).ok, false, 'id do catálogo cru não é Cenário do stand');
  assert.equal(validarAcaoSite('sensor_ajustar', { nivel: 30 }).ok, false);
  assert.equal(validarAcaoSite('sensor_rodar_ensaio', { ensaio: 'capotar' }).ok, false);
});

test('argumento faltando, extra ou fora de objeto é recusado', () => {
  assert.match(validarAcaoSite('abrir_pagina', {}).motivo, /precisa de "pagina"/);
  assert.match(validarAcaoSite('voltar_coruja', { pagina: 'sensor' }).motivo, /não aceita "pagina"/);
  assert.match(validarAcaoSite('abrir_pagina', { pagina: 'sensor', url: '/admin' }).motivo, /não aceita "url"/);
  assert.equal(validarAcaoSite('abrir_pagina', ['sensor']).ok, false);
  assert.equal(validarAcaoSite('abrir_pagina', null).ok, false);
});

test('ferramentas saem uma por ação, com enum fechado', () => {
  const realtime = ferramentasAcaoSite();
  assert.equal(realtime.length, ACOES_SITE.length);
  const abrir = realtime.find((item) => item.name === 'abrir_pagina');
  assert.deepEqual(abrir.parameters.properties.pagina.enum, IDS_PAGINAS);
  assert.deepEqual(abrir.parameters.required, ['pagina']);
  assert.equal(abrir.parameters.additionalProperties, false);
  const chat = ferramentasAcaoSite('chat').find((item) => item.function.name === 'sompo_rodar_cenario');
  assert.deepEqual(chat.function.parameters.properties.id.enum, ['stand-obstaculo-a-tempo', 'stand-inclinacao', 'stand-reacao-atrasada']);
});

test('descrições não prometem número que a tela não garante (regente, Q7)', () => {
  for (const def of ACOES_SITE) {
    assert.doesNotMatch(def.descricao, /\d+\s*(km\/h|°|graus|g\b|cm)/, def.nome);
  }
});

test('tour_iniciar: roteiro fixo coruja → sonolência → sensor na curva → coruja, só ações válidas que mostram, < 60 s de fala', () => {
  assert.deepEqual(validarAcaoSite('tour_iniciar', {}), { ok: true, acao: 'tour_iniciar', args: {} });
  assert.equal(validarAcaoSite('tour_iniciar', { pagina: 'sensor' }).ok, false);
  const acoes = TOUR_STAND.filter((p) => 'acao' in p);
  assert.deepEqual(acoes.map((p) => p.acao), ['abrir_pagina', 'sensor_escolher_veiculo', 'sensor_rodar_ensaio', 'voltar_coruja']);
  assert.deepEqual(acoes[0].args, { pagina: 'sonolencia' });
  assert.deepEqual(acoes[2].args, { ensaio: 'curva' });
  for (const passo of acoes) assert.equal(validarAcaoSite(passo.acao, passo.args).ok, true, passo.acao);
  assert.ok(!acoes.some((p) => p.acao === 'sonolencia_ligar_camera'), 'o tour não liga a câmera');
  const falas = TOUR_STAND.filter((p) => 'fala' in p);
  assert.equal(new Set(falas.map((p) => p.fala)).size, falas.length, 'chaves de fala únicas');
  assert.ok('fala' in TOUR_STAND[0] && 'fala' in TOUR_STAND.at(-1), 'abre e fecha falando');
  // ~15 caracteres por segundo na voz do stand: 900 caracteres ≈ 60 s.
  assert.ok(falas.reduce((n, p) => n + p.texto.length, 0) < 900);
});
