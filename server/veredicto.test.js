import assert from 'node:assert/strict';
import test from 'node:test';
import { calcularImpacto, lerVeredicto, PREMISSAS_IMPACTO, resumoVeredicto, textoFaixa, veredictoIndeterminado } from '../shared/veredicto.js';
import { missaoSompo, veredictoDaBancada } from './veredicto-bancada.js';
import { finalEntryFromPersonaRun } from '../shared/persona-run-transcript.js';

test('tabela de premissas: toda linha tem base declarada; trator usa a referência de R$ 400 mil', () => {
  for (const [chave, p] of Object.entries(PREMISSAS_IMPACTO)) {
    assert.ok(p.base && p.item, chave); assert.ok(p.min <= p.max, chave);
  }
  assert.equal(PREMISSAS_IMPACTO.perda_total_trator.max, 400_000);
  assert.match(PREMISSAS_IMPACTO.reparo_frontal_leve.base, /R\$ 400 mil/);
  assert.match(PREMISSAS_IMPACTO.atolamento_resgate.base, /estimativa ilustrativa/);
});

test('impacto: só chaves da tabela, quantidade limitada, sem duplicar, faixa somada', () => {
  const f = calcularImpacto([{ chave: 'fardo_perdido', quantidade: 999 }, { chave: 'fardo_perdido' }, { chave: 'x' }], { sintetico: true });
  assert.equal(f.componentes.length, 1);
  assert.equal(f.faixa_min_brl, 150 * 50); assert.equal(f.faixa_max_brl, 400 * 50);
  assert.match(f.premissas[0], /Corrida simulada/);
  assert.equal(calcularImpacto([]).faixa_min_brl, null);
  assert.equal(textoFaixa(calcularImpacto([{ chave: 'sem_dano' }])), 'sem dano material estimado');
  assert.match(textoFaixa(f), /R\$\s7\.500 – R\$\s20\.000/);
});

test('leitura: culpado fora da lista é inválido; sem evidência com instante vira indeterminado', () => {
  assert.throws(() => lerVeredicto({ culpado: 'motorista', confianca: 0.5, porque: 'x' }), /culpado/);
  const v = lerVeredicto({ culpado: 'maquina', confianca: 0.8, porque: 'Freio.', evidencias: [{ descricao: 'sem tempo' }] });
  assert.equal(v.culpado, 'indeterminado'); assert.ok(v.confianca <= 0.3);
  const ok = lerVeredicto({ culpado: 'manutencao', confianca: 2, porque: 'Pastilha gasta.', evidencias: [{ descricao: 'Pedal no fundo', elapsedMs: 4200, frame: 3 }] }, { frames: new Set([3]) });
  assert.equal(ok.culpado, 'manutencao'); assert.equal(ok.confianca, 0.95);
  assert.deepEqual(ok.evidencias, [{ descricao: 'Pedal no fundo', elapsedMs: 4200, frame: 3 }]);
  assert.deepEqual(resumoVeredicto(ok), { culpado: 'manutencao', rotulo: 'Manutenção', confianca: 0.95, faixaMinBrl: null, faixaMaxBrl: null });
  assert.equal(veredictoIndeterminado('x').impacto_financeiro.faixa_max_brl, null);
});

test('SOMPO: missão reconhecida, veredicto validado, falha do modelo vira indeterminado e o resultado final carrega o veredicto', async () => {
  assert.ok(missaoSompo('Caso SOMPO: Tombamento\n...'));
  assert.ok(missaoSompo('Resumo\n\n--- DOSSIÊ TÉCNICO ---\nx'));
  assert.ok(!missaoSompo('Revise o PR 42'));
  let pedido;
  const chat = async (args) => { pedido = args; return { content: '```json\n' + JSON.stringify({
    culpado: 'ambiente', confianca: 0.6, porque: 'Encosta íngreme.', hipotese: 'Tombou na encosta.',
    evidencias: [{ descricao: 'Rolagem subiu a 32°', elapsedMs: 8000, frame: 2 }],
    prevencao: [{ acao: 'Mapear declives', responsavel: 'gestor da fazenda' }],
    impacto: { itens: [{ chave: 'tombamento_perda_parcial' }] },
  }) + '\n```', finishReason: 'stop' }; };
  const v = await veredictoDaBancada({ mission: 'Caso SOMPO: ensaio do simulador', entrega: 'Veredito: tombamento lateral.', chat, model: 'teste' });
  assert.equal(pedido.agentId, 'luca-ai-verdict'); assert.equal(pedido.tools, null);
  assert.equal(v.culpado, 'ambiente'); assert.equal(v.evidencias[0].frame, undefined);
  assert.equal(v.impacto_financeiro.faixa_min_brl, 100_000); assert.equal(v.impacto_financeiro.faixa_max_brl, 240_000);
  const falha = await veredictoDaBancada({ mission: 'Caso SOMPO: x', entrega: 'y', chat: async () => ({ content: 'oops', finishReason: 'stop' }) });
  assert.equal(falha.status, 'indeterminado_por_falha'); assert.equal(falha.culpado, 'indeterminado');
  const vazio = await veredictoDaBancada({ mission: 'Caso SOMPO: x', entrega: '', chat: async () => { throw new Error('não deveria chamar'); } });
  assert.equal(vazio.culpado, 'indeterminado');
  const final = finalEntryFromPersonaRun({ traceId: 't1', finalDisplay: { slug: 's', content: 'ok' }, verdict: v });
  assert.equal(final.verdict.culpado, 'ambiente');
  assert.equal(finalEntryFromPersonaRun({ traceId: 't1', finalDisplay: { slug: 's', content: 'ok' } }).verdict, undefined);
});

test('indeterminado nunca carrega confiança acima de 0.3', () => {
  const v = lerVeredicto({ culpado: 'indeterminado', confianca: 0.6, porque: 'Inconclusivo.', evidencias: [{ descricao: 'x', elapsedMs: 1 }] });
  assert.equal(v.confianca, 0.3);
});

test('texto para leigo: caso "dormiu" real (ms com decimal, horário do relógio, heurística/amostra) sai em segundos', async () => {
  const { paraLeigo, veredictoEmLeigo } = await import('../shared/veredicto.js');
  const inicioMs = Date.parse('2026-10-24T11:40:00.000Z');
  // Trechos literais do veredicto "dormiu" da 1ª prova (prova/v1/analise-dormiu.json).
  const bruto = {
    culpado: 'operador', confianca: 0.9,
    porque: 'O alarme de sono permaneceu ativo antes do desfecho, sem resposta registrada.',
    hipotese: 'A corrida durou 9616,67 ms de tempo ativo, aproximadamente 9,62 segundos, sem pausas registradas, e terminou em colisão declarada pelo simulador.\nForam registrados dois episódios sem resposta reconhecida: sonolência, iniciado em 3033,33 ms, e feno, iniciado em 7616,67 ms.\nA heurística contabilizou zero sinistros evitados.',
    evidencias: [
      { descricao: 'Às 11:40:03.217, durante o episódio de sonolência registrado no circuito, o trator seguia a 7,2 km/h.', sampleIndex: 1 },
      { descricao: 'Aos 9.000 ms da série amostrada, o aviso de colisão estava ativo a 119 cm, com brake_pressed false.', sampleIndex: 2 },
    ],
    fatores_contribuintes: ['Janelas de 6583,33 ms e 2000 ms são durações de exposição.'],
    prevencao: [{ acao: 'Parar ao primeiro alarme (reação esperada < 1500 ms).', responsavel: 'operador' }],
    impacto: { itens: [{ chave: 'reparo_frontal_leve' }], premissas: ['Diferença de 16,67 ms entre as amostras.'] },
  };
  const v = lerVeredicto(bruto, { resolverAmostra: (i) => ({ elapsedMs: [0, 3200, 9000][i] }), inicioMs, sintetico: true });
  const tudo = [v.porque, v.hipotese, ...v.evidencias.map((e) => e.descricao), ...v.fatores_contribuintes, ...v.prevencao.map((p) => p.acao), ...v.impacto_financeiro.premissas].join('\n');
  assert.doesNotMatch(tudo, /\bms\b|milissegundo|\d{2}:\d{2}:\d{2}|heur[íi]stica|amostra|\d+,\d{2}|brake_pressed/i, tudo);
  assert.match(v.hipotese, /durou 9,6 s de tempo ativo/);
  assert.match(v.hipotese, /iniciado em 3 s/);
  assert.match(v.hipotese, /iniciado em 7,6 s/);
  assert.match(v.evidencias[0].descricao, /^Aos 3,2 s, durante/);
  assert.match(v.evidencias[1].descricao, /^Aos 9 s da série registrada.*freio solto/);
  assert.match(v.prevencao[0].acao, /< 1,5 s/);
  // Instantes estruturados continuam em ms (o bloco/laudo pula para eles).
  assert.deepEqual(v.evidencias.map((e) => e.elapsedMs), [3200, 9000]);
  // Idempotente e aplicável a veredicto já gravado.
  assert.deepEqual(veredictoEmLeigo(v, { inicioMs }), v);
  assert.equal(paraLeigo('reação de 766,67 ms'), 'reação de 0,8 s');
  assert.equal(paraLeigo('às 11:40:03.217 sem início conhecido'), 'às 11:40:03 sem início conhecido');
  assert.equal(paraLeigo('Velocidade de 12 km/h a 158 cm.'), 'Velocidade de 12 km/h a 158 cm.');
});
