import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDeterministicExecutiveDashboard } from '../shared/executive-dashboard.js';
import { executiveDashboardContractIssues } from '../shared/dashboard-contract.js';

test('buildDeterministicExecutiveDashboard cobre entregaveis agro Sompo no fallback', () => {
  const dashboard = buildDeterministicExecutiveDashboard({
    mission: {
      title: 'Milho safrinha Sompo',
      description: 'Analisar microrregioes com maior risco, validar ZARC, gerar mapa de risco, ranking de apolices por valor segurado, projecao de indenizacoes e cronograma de monitoramento nas proximas 4 a 8 semanas.',
      success: 'Entregar leitura executiva completa para underwriting.',
    },
    finalReport: {
      summary: 'Carteira agro sob pressao climatica com necessidade de priorizacao regional.',
      findings: [
        { title: 'Sudoeste PR', detail: 'Concentracao inicial de risco.', basis: 'evidencia' },
        { title: 'Oeste PR', detail: 'Faixa secundaria de exposicao.', basis: 'evidencia' },
      ],
      designerBrief: {
        mustShow: ['microrregioes prioritarias', 'mapa de risco', 'validacao zarc', 'ranking de apolices', 'projecao de indenizacoes', 'cronograma de monitoramento'],
      },
      successCriteria: ['publicar leitura executiva completa'],
    },
    snapshot: {
      contributions: [
        { agentId: 'pesquisador', content: 'Evidencia: Oeste e Sudoeste concentram o risco. Lacuna critica: valor segurado consolidado pendente. Risco principal: combinacao de clima e ZARC fora da janela.' },
        { agentId: 'planejador', content: 'Prioridade: alta. Acao imediata: validar ZARC e revisar carteira critica. Dono sugerido: underwriting agricola.' },
      ],
    },
  });

  const text = JSON.stringify(dashboard).toLowerCase();
  assert.equal(dashboard.blocks[0].title, 'Dor central');
  assert.match(text, /mapa de risco/);
  assert.match(text, /microrregioes prioritarias|microrregioes/);
  assert.match(text, /validacao zarc|zarc/);
  assert.match(text, /ranking de apolices/);
  assert.match(text, /projecao de indenizacoes/);
  assert.match(text, /cronograma de monitoramento/);
  assert.match(text, /evidencia e premissa/);
  assert.match(text, /criterios de sucesso/);
  assert.match(text, /acao concreta/);
  assert.match(text, /dono responsavel/);
});

test('buildDeterministicExecutiveDashboard infere sinistralidade e alertas mesmo sem mustShow forte no finalReport', () => {
  const dashboard = buildDeterministicExecutiveDashboard({
    mission: {
      title: 'Carteira Sompo milho safrinha',
      description: 'Estimar sinistralidade esperada nas proximas 4 a 8 semanas e gerar alertas para corretores das regioes mais criticas.',
      success: 'Entregar leitura executiva com monitoramento.',
    },
    finalReport: {
      summary: 'Carteira sob pressao climatica.',
      findings: [
        { title: 'Sudoeste PR', detail: 'Maior concentracao inicial de risco.', basis: 'evidencia' },
      ],
      designerBrief: {
        mustShow: ['dor central'],
      },
      successCriteria: ['publicar leitura executiva'],
    },
    snapshot: {
      contributions: [
        { agentId: 'pesquisador', content: 'Evidencia: risco crescente no Sudoeste PR. Lacuna critica: valor segurado consolidado pendente. Risco principal: acionamento de sinistro nas proximas semanas.' },
        { agentId: 'planejador', content: 'Prioridade: alta. Acao imediata: disparar alertas para corretores. Dono sugerido: underwriting agricola.' },
      ],
    },
  });

  const text = JSON.stringify(dashboard).toLowerCase();
  assert.match(text, /sinistralidade esperada/);
  assert.match(text, /alertas operacionais/);
  assert.match(text, /corretores/);
});

test('buildDeterministicExecutiveDashboard explicita top 5 de apolices pendentes e ancora entregaveis agro Sompo', () => {
  const dashboard = buildDeterministicExecutiveDashboard({
    mission: {
      title: 'Milho safrinha Sompo',
      description: 'Identificar microrregioes com maior risco nas regioes Oeste, Sudoeste e Centro-Sul do Parana, estimar sinistralidade esperada, validar ZARC, gerar mapa de risco, ranking de apolices por valor segurado, projecao de indenizacoes, alertas para corretores e cronograma de monitoramento nas proximas 4 a 8 semanas.',
      success: 'Entregar leitura executiva completa com top 5 defensavel para underwriting.',
    },
    finalReport: {
      summary: 'Carteira agro sob pressao climatica com necessidade de triagem por regiao e carteira.',
      findings: [
        { title: 'Sudoeste PR', detail: 'Maior concentracao inicial de risco.', basis: 'evidencia' },
        { title: 'Oeste PR', detail: 'Faixa secundaria de exposicao.', basis: 'evidencia' },
      ],
      designerBrief: {
        mustShow: ['microrregioes prioritarias', 'mapa de risco', 'validacao zarc', 'ranking de apolices', 'sinistralidade esperada', 'projecao de indenizacoes', 'alertas operacionais', 'cronograma de monitoramento'],
      },
      successCriteria: ['publicar leitura executiva completa'],
    },
    snapshot: {
      contributions: [
        { agentId: 'pesquisador', content: 'Evidencia: chuvas 50 a 100 mm abaixo da media e queda de produtividade de 59,9% no Sudoeste PR. Lacuna critica: valor segurado consolidado pendente. Risco principal: acionamento de sinistro e ZARC fora da janela em parte da carteira.' },
        { agentId: 'planejador', content: 'Prioridade: Sudoeste PR, Oeste PR e Centro-Sul PR. Acao imediata: validar ZARC, priorizar carteira critica e disparar alertas para corretores. Dono sugerido: underwriting agricola.' },
      ],
    },
  });

  const rankingBlock = dashboard.blocks.find((block) => block.title === 'Ranking de apolices');
  assert.ok(rankingBlock);
  assert.equal(rankingBlock.items.length, 5);
  assert.match(JSON.stringify(rankingBlock).toLowerCase(), /identificacao pendente|carteira critica/);

  const text = JSON.stringify(dashboard).toLowerCase();
  assert.match(text, /sudoeste pr/);
  assert.match(text, /oeste pr/);
  assert.match(text, /centro-sul pr/);
  assert.match(text, /sinistralidade esperada/);
  assert.match(text, /proxy qualitativo/);
  assert.match(text, /alertas operacionais/);
  assert.match(text, /cronograma de monitoramento/);
});

test('buildDeterministicExecutiveDashboard exibe evidencias agroclimaticas sem inventar indenizacao', () => {
  const dashboard = buildDeterministicExecutiveDashboard({
    mission: {
      title: 'Milho safrinha Sompo',
      description: 'O INMET confirmou deficit hidrico com queda de produtividade de ate 59,9% em Francisco Beltrao (PR), chuvas 50 a 100 mm abaixo da media e janela de 4 a 8 semanas. A CONAB aponta queda de 5,4% na produtividade. Validar ZARC pela Portaria SPA/MAPA no 3 de jan/2026.',
      success: 'Entregar mapa de risco, sinistralidade esperada, projecao de indenizacoes, ranking de apolices e alertas para corretores.',
    },
    finalReport: {
      summary: 'Carteira agro sob pressao climatica; valores segurados pendentes.',
      findings: [
        { title: 'Sudoeste PR', detail: 'Risco elevado por deficit hidrico.', basis: 'evidencia' },
      ],
      designerBrief: {
        mustShow: ['evidencias agroclimaticas', 'sinistralidade esperada', 'projecao de indenizacoes'],
      },
      successCriteria: ['publicar leitura executiva defensavel'],
    },
  });

  const block = dashboard.blocks.find((item) => item.title === 'Evidencias agroclimaticas');
  assert.ok(block);
  const text = JSON.stringify(dashboard).toLowerCase();
  assert.match(text, /inmet/);
  assert.match(text, /conab/);
  assert.match(text, /59,9%/);
  assert.match(text, /50 a 100 mm/);
  assert.match(text, /proxy/);
  assert.doesNotMatch(text, /r\$\s*\d/);
});

test('buildDeterministicExecutiveDashboard cria bloco financeiro explicito quando a missao pede valor para seguradora', () => {
  const dashboard = buildDeterministicExecutiveDashboard({
    mission: {
      title: 'Caso Sompo rural',
      description: 'Cruzar telemetria e CSV de sinistros por talhao.',
      success: 'Explicitar valor para seguradora, impacto financeiro, plano preventivo e criterio de sucesso.',
    },
    finalReport: {
      summary: 'Carteira com risco operacional e base financeira parcial.',
      findings: [
        { title: 'Talhao norte', detail: 'Maior frequencia de eventos no ativo exposto.', basis: 'evidencia' },
      ],
      designerBrief: {
        mustShow: ['dor central', 'criterios de sucesso'],
      },
      successCriteria: ['publicar leitura executiva defensavel'],
    },
    snapshot: {
      contributions: [
        { agentId: 'pesquisador', content: 'Evidencia: telemetria e CSV mostram concentracao no talhao norte. Lacuna critica: premio e valor segurado ainda pendentes.' },
      ],
    },
  });

  const financialBlock = dashboard.blocks.find((block) => block.title === 'Impacto ou proxy');
  assert.ok(financialBlock);
  assert.match(JSON.stringify(financialBlock).toLowerCase(), /financeir|proxy|premio|valor segurado/);
});

test('buildDeterministicExecutiveDashboard materializa evidencias, fila e gatilhos de prevencao', () => {
  const dashboard = buildDeterministicExecutiveDashboard({
    mission: {
      title: 'Sompo claims prevention',
      description: 'Montar dashboard operacional com fila por severidade e SLA, consolidar fotos, laudos e documentos e fechar com gatilhos preventivos antes do acionamento de sinistro.',
      success: 'Entregar pacote de evidencias, fila operacional e gatilhos preventivos.',
    },
    finalReport: {
      summary: 'Operacao precisa de triagem e lastro documental.',
      findings: [
        { title: 'Fila severa', detail: 'Backlog acima do SLA em casos prioritarios.', basis: 'evidencia' },
      ],
      designerBrief: {
        mustShow: ['pacote de evidencias', 'fila operacional', 'gatilhos preventivos'],
      },
      successCriteria: ['publicar dashboard operacional defensavel'],
    },
    snapshot: {
      contributions: [
        { agentId: 'pesquisador', content: 'Evidencia: fotos, laudos e telemetria disponiveis; anexos financeiros ainda pendentes.' },
        { agentId: 'planejador', content: 'Prioridade: alta. Acao imediata: priorizar fila severa e definir gatilho preventivo. Dono sugerido: operacao de sinistros.' },
      ],
    },
  });

  const text = JSON.stringify(dashboard).toLowerCase();
  assert.match(text, /pacote de evidencias/);
  assert.match(text, /fila operacional/);
  assert.match(text, /gatilhos preventivos/);
  assert.match(text, /fotos|laudos|document/);
  assert.match(text, /sla|severidade|aging/);
});

test('buildDeterministicExecutiveDashboard remove mensagens tecnicas do fallback visual', () => {
  const dashboard = buildDeterministicExecutiveDashboard({
    mission: {
      title: 'Sompo rural',
      description: 'Gerar canvas executivo com ranking de apolices, plano preventivo e criterio de sucesso.',
      success: 'Entregar resultado executivo sem expor logs tecnicos.',
    },
    finalReport: {
      summary: 'Falhei ao transformar a missao: 9router_unreachable http://127.0.0.1:20128/v1/chat/completions: timeout de 45s',
      findings: [
        {
          title: 'Falha tecnica',
          detail: 'Falhei ao transformar a missao: fetch failed no roteador local.',
          basis: 'premissa',
        },
        {
          title: 'Risco rural',
          detail: 'Carteira exige priorizacao por exposicao e prevencao antes do sinistro.',
          basis: 'premissa',
        },
      ],
      designerBrief: {
        mustShow: ['ranking de apolices', 'plano preventivo', 'criterios de sucesso'],
      },
      successCriteria: ['publicar leitura executiva sem logs tecnicos'],
    },
    snapshot: {
      contributions: [
        { agentId: 'pesquisador', content: 'Falhei ao transformar a missao: 9router_unreachable timeout de 45s' },
      ],
    },
  });

  const text = JSON.stringify(dashboard).toLowerCase();
  assert.doesNotMatch(text, /9router|fetch failed|unreachable|timeout/);
  assert.match(text, /carteira exige priorizacao/);
  assert.match(text, /ranking de apolices/);
});

test('buildDeterministicExecutiveDashboard nao corta evidencias executivas com reticencias', () => {
  const researcherContent = [
    'Evidencia: Caso Sompo Sprint 2 - Fazenda Santa Aurora Entrada de sinistros em CSV fornecida pelo briefing: tipo_evento,quantidade alagamento,12 falha_irrigacao,7 pragas,5 Telemetria atual: Talhao norte com umidade acima do limite operacional; previsao de chuva 42mm nas proximas 24h; sensor de vazao da irrigacao leste oscilando. Dados financeiros: Valor de apolice, custo de reparo e produtividade financeira ainda nao enviados; marcar valores financeiros como pendentes.',
    'Lacuna critica: valor segurado e premio seguem pendentes para calcular impacto financeiro exato.',
    'Risco principal: decisao sem priorizacao explicita atrasaria underwriting, prevencao ou acionamento operacional.',
  ].join(' ');

  const dashboard = buildDeterministicExecutiveDashboard({
    mission: {
      title: 'Caso Sompo Sprint 2',
      description: 'Gerar canvas executivo Sompo com riscos priorizados, premissas explicitas, lacunas de dados, plano preventivo, valor para seguradora e criterio de sucesso.',
      success: 'Canvas executivo sem cortes de texto.',
    },
    finalReport: {
      summary: 'Leitura executiva de contingencia para underwriting rural.',
      findings: [
        { title: 'Dor central', detail: 'Risco operacional concentrado na Fazenda Santa Aurora exige priorizacao defensavel.', basis: 'evidencia' },
        { title: 'Lacuna financeira', detail: 'Valor de apolice, custo de reparo e produtividade financeira ainda nao enviados; marcar valores financeiros como pendentes.', basis: 'proxy' },
      ],
      designerBrief: {
        mustShow: ['dor central', 'ranking de apolices', 'evidencia e premissa', 'impacto ou proxy', 'criterios de sucesso'],
      },
      successCriteria: ['exibir telemetria e lacuna financeira sem truncar'],
    },
    snapshot: {
      contributions: [
        { agentId: 'pesquisador', content: researcherContent },
      ],
    },
  });

  const text = JSON.stringify(dashboard);
  assert.doesNotMatch(text, /Tel\.\.\.|Valor d\.\.\.|\.\.\./);
  assert.match(text, /sensor de vazao da irrigacao leste oscilando/);
  assert.match(text, /Valor de apolice, custo de reparo e produtividade financeira ainda nao enviados/);
});

test('executiveDashboardContractIssues reprova texto visual truncado com reticencias', () => {
  const issues = executiveDashboardContractIssues({
    title: 'Caso Sompo',
    subtitle: 'Leitura executiva completa',
    metrics: [
      { label: 'Evidencias usadas', value: '5 sinais' },
      { label: 'Prioridade executiva', value: 'carteira critica' },
      { label: 'Impacto financeiro', value: 'proxy/pendente' },
      { label: 'Entregaveis cobertos', value: '5 itens' },
    ],
    blocks: [
      { type: 'note', title: 'Dor e evidencias', body: 'Telemetria atual: Talhao norte com umidade acima do limite operacional; Tel...' },
      { type: 'tower', title: 'Ranking de risco', items: [{ label: 'Apolice critica 1', value: 5 }] },
      { type: 'note', title: 'Plano preventivo', body: 'Acao concreta com dono responsavel.' },
      { type: 'metric', title: 'Valor para seguradora', body: 'Proxy financeiro pendente.' },
      { type: 'note', title: 'Criterio de sucesso', body: 'Canvas aprovado sem cortes.' },
    ],
  });

  assert.match(issues.join('\n'), /texto truncado com reticencias/);
});
