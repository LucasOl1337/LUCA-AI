import test from 'node:test';
import assert from 'node:assert/strict';

import {
  missionBulletItems,
  normalizeSupervisorFinalReport,
  parseSupervisorFinalReportOutput,
} from '../shared/supervisor-final-report.js';

test('missionBulletItems separa criterios em lista util', () => {
  assert.deepEqual(
    missionBulletItems('1. priorizar top 5\n2. explicitar proxy financeiro; 3. recomendar proxima acao'),
    ['priorizar top 5', 'explicitar proxy financeiro', 'recomendar proxima acao'],
  );
});

test('normalizeSupervisorFinalReport completa contrato Sompo com lacuna financeira', () => {
  const mission = {
    title: 'Sompo rural underwriting',
    description: 'Cruzar telemetria da fazenda com CSV de sinistros para ranking de risco rural.',
    success: 'Gerar top 5 de riscos; sinalizar lacuna financeira; definir proxima acao.',
  };
  const snapshot = {
    contributions: [
      { agentId: 'pesquisador', content: 'Evidencia: telemetria mostra anomalia de umidade por talhao. Lacuna critica: sem premio e sem valor segurado. Risco principal: recorrencia de sinistros no CSV.' },
      { agentId: 'planejador', content: 'Prioridade: atacar top 5 talhoes mais recorrentes. Acao imediata: vistoria e coleta financeira minima.' },
    ],
  };
  const report = normalizeSupervisorFinalReport({
    mission,
    snapshot,
    report: {
      summary: 'Ranking preliminar para underwriting rural.',
      findings: [
        { title: 'Talhoes recorrentes', detail: 'CSV de sinistros e telemetria indicam concentracao de eventos.', importance: 'alta', basis: 'evidencia' },
      ],
      designerBrief: {
        mustShow: ['dor central'],
        recommendedBlocks: ['tower'],
      },
      successCriteria: ['publicar ranking defensavel'],
    },
  });

  assert.ok(report.designerBrief.mustShow.includes('telemetria'));
  assert.ok(report.designerBrief.mustShow.includes('csv de sinistros'));
  assert.ok(report.designerBrief.mustShow.includes('impacto ou proxy'));
  assert.ok(report.designerBrief.mustShow.includes('lacuna financeira ou proxy'));
  assert.ok(report.designerBrief.mustShow.includes('top 5'));
  assert.ok(report.successCriteria.includes('lacuna financeira ou proxy explicitado para a decisao'));
  assert.match(report.designerBrief.chartGuidance, /lacuna financeira|proxy/i);
  assert.ok(report.findings.some((finding) => /financeir|proxy|valor segurado|premio/i.test(`${finding.title} ${finding.detail}`)));
  assert.ok(report.findings.some((finding) => /top 5|ranking|prioridade/i.test(`${finding.title} ${finding.detail}`)));
});

test('normalizeSupervisorFinalReport infere impacto ou proxy quando a missao pede valor para seguradora', () => {
  const report = normalizeSupervisorFinalReport({
    mission: {
      title: 'Sompo rural',
      description: 'Cruzar telemetria e CSV de sinistros para priorizacao de risco.',
      success: 'Explicitar valor para seguradora, impacto financeiro e proxima acao defensavel.',
    },
    snapshot: {
      contributions: [
        { agentId: 'pesquisador', content: 'Evidencia: telemetria mostra concentracao de eventos. Lacuna critica: premio e valor segurado ainda pendentes.' },
      ],
    },
    report: {
      summary: 'Leitura executiva pronta para underwriting.',
      findings: [{ title: 'talhao norte', detail: 'Concentracao de eventos recorrentes.', basis: 'evidencia' }],
    },
  });

  assert.ok(report.designerBrief.mustShow.includes('impacto ou proxy'));
  assert.ok(report.findings.some((finding) => /financeir|premio|valor segurado|proxy/i.test(`${finding.title} ${finding.detail}`)));
});

test('normalizeSupervisorFinalReport cria findings e criterios minimos quando modelo falha', () => {
  const mission = {
    description: 'Caso Sompo com telemetria rural e prevencao de sinistros.',
    success: '',
  };
  const snapshot = {
    contributions: [
      { agentId: 'pesquisador', content: 'Evidencia: sensor de umidade em anomalia e historico de sinistros no talhao 7.' },
    ],
  };

  const report = normalizeSupervisorFinalReport({
    mission,
    snapshot,
    report: {},
    fallbackReason: 'json incompleto',
  });

  assert.equal(report.findings.length, 1);
  assert.equal(report.findings[0].basis, 'evidencia');
  assert.ok(report.successCriteria.length >= 1);
  assert.equal(report.fallback, true);
  assert.match(report.summary, /json incompleto|sensor de umidade/i);
});

test('parseSupervisorFinalReportOutput extrai JSON mesmo com ruido do modelo', () => {
  const parsed = parseSupervisorFinalReportOutput(`Texto solto antes
\`\`\`json
{"summary":"ok","findings":[{"title":"A","detail":"B"}]}
\`\`\`
Texto solto depois`);

  assert.equal(parsed?.summary, 'ok');
  assert.equal(parsed?.findings?.[0]?.title, 'A');
});

test('parseSupervisorFinalReportOutput retorna null para JSON invalido', () => {
  const parsed = parseSupervisorFinalReportOutput('summary: sem json valido { titulo: quebrado ');
  assert.equal(parsed, null);
});

test('normalizeSupervisorFinalReport injeta sinais Sompo ausentes no findings do supervisor', () => {
  const mission = {
    title: 'Sompo rural',
    description: 'Cruzar telemetria da fazenda com CSV de sinistros e publicar top 5 de risco.',
    success: 'Explicitar lacuna financeira e definir proxima acao.',
  };
  const snapshot = {
    contributions: [
      { agentId: 'pesquisador', content: 'Evidencia: telemetria mostra anomalia de umidade; CSV de sinistros concentra eventos no talhao norte. Lacuna critica: valor segurado e premio pendentes.' },
    ],
  };

  const report = normalizeSupervisorFinalReport({
    mission,
    snapshot,
    report: {
      summary: 'Relatorio curto.',
      findings: [
        { title: 'Dor central', detail: 'A operacao rural tem recorrencia de eventos.', importance: 'alta', basis: 'evidencia' },
      ],
      successCriteria: ['publicar canvas executivo'],
    },
  });

  assert.ok(report.findings.some((finding) => /telemetria|sensor|umidade/i.test(`${finding.title} ${finding.detail}`)));
  assert.ok(report.findings.some((finding) => /csv|sinistros|talhao|recorrencia/i.test(`${finding.title} ${finding.detail}`)));
  assert.ok(report.findings.some((finding) => /financeir|valor segurado|premio|proxy/i.test(`${finding.title} ${finding.detail}`)));
  assert.ok(report.findings.some((finding) => /top 5|ranking/i.test(`${finding.title} ${finding.detail}`)));
});

test('normalizeSupervisorFinalReport deriva entregaveis agro-Sompo especificos da missao', () => {
  const mission = {
    title: 'Milho safrinha Sompo',
    description: 'Analisar microrregioes com maior risco, validar ZARC, gerar mapa de risco, ranking de apolices por valor segurado, projecao de indenizacoes e cronograma de monitoramento.',
    success: 'Entregar leitura executiva defensavel para underwriting.',
  };
  const report = normalizeSupervisorFinalReport({
    mission,
    snapshot: {
      contributions: [
        { agentId: 'pesquisador', content: 'Evidencia: risco regional em carteira agro. Lacuna critica: valores finais dependem do cruzamento de apolices.' },
      ],
    },
    report: {
      summary: 'Carteira agro sob pressao climatica.',
      findings: [{ title: 'risco regional', detail: 'Carteira exposta no corredor sul.', importance: 'alta', basis: 'evidencia' }],
      successCriteria: ['priorizar carteira critica'],
    },
  });

  assert.ok(report.designerBrief.mustShow.includes('microrregioes prioritarias'));
  assert.ok(report.designerBrief.mustShow.includes('mapa de risco'));
  assert.ok(report.designerBrief.mustShow.includes('validacao zarc'));
  assert.ok(report.designerBrief.mustShow.includes('ranking de apolices'));
  assert.ok(report.designerBrief.mustShow.includes('projecao de indenizacoes'));
  assert.ok(report.designerBrief.mustShow.includes('cronograma de monitoramento'));
  assert.match(report.designerBrief.chartGuidance, /mapa de risco|zarc|apolices|indenizacoes|monitoramento/i);
  assert.ok(report.findings.some((finding) => /zarc/i.test(`${finding.title} ${finding.detail}`)));
  assert.ok(report.findings.some((finding) => /apolice|valor segurado/i.test(`${finding.title} ${finding.detail}`)));
});

test('normalizeSupervisorFinalReport deriva sinistralidade esperada e alertas operacionais da missao Sompo', () => {
  const mission = {
    title: 'Milho safrinha Sompo',
    description: 'Identifique microrregioes com maior risco de acionamento de sinistro nas proximas 4 a 8 semanas, estime a sinistralidade esperada e gere alertas para corretores.',
    success: 'Entregar leitura executiva para underwriting com monitoramento.',
  };
  const report = normalizeSupervisorFinalReport({
    mission,
    snapshot: {
      contributions: [
        { agentId: 'pesquisador', content: 'Evidencia: Sudoeste PR concentra o risco. Lacuna critica: valor segurado final ainda depende da carteira consolidada.' },
      ],
    },
    report: {
      summary: 'Carteira exige leitura regional e comunicacao preventiva.',
      findings: [{ title: 'risco regional', detail: 'Sudoeste e Oeste concentram exposicao.', importance: 'alta', basis: 'evidencia' }],
    },
  });

  assert.ok(report.designerBrief.mustShow.includes('sinistralidade esperada'));
  assert.ok(report.designerBrief.mustShow.includes('alertas operacionais'));
  assert.match(report.designerBrief.chartGuidance, /sinistralidade|alertas operacionais|corretores/i);
  assert.ok(report.findings.some((finding) => /sinistralidade/i.test(`${finding.title} ${finding.detail}`)));
  assert.ok(report.findings.some((finding) => /alertas operacionais|corretores|comunicados/i.test(`${finding.title} ${finding.detail}`)));
});

test('normalizeSupervisorFinalReport preserva evidencias agroclimaticas do briefing Sompo', () => {
  const mission = {
    title: 'Milho safrinha Sompo',
    description: 'Analise risco climatico. O INMET confirmou deficit hidrico com queda de produtividade de ate 59,9% em Francisco Beltrao (PR) e chuvas 50 a 100 mm abaixo da media. A CONAB aponta queda de 5,4% na produtividade do milho. Validar ZARC pela Portaria SPA/MAPA no 3 de jan/2026 e monitorar por 4 a 8 semanas.',
    success: 'Entregar mapa de risco, sinistralidade esperada, ranking de apolices, projecao de indenizacoes e alertas para corretores.',
  };
  const report = normalizeSupervisorFinalReport({
    mission,
    snapshot: {
      contributions: [
        { agentId: 'pesquisador', content: 'Evidencia: carteira agro com risco climatico. Lacuna critica: valores segurados consolidados ainda pendentes.' },
      ],
    },
    report: {
      summary: 'Carteira agricola exige priorizacao regional.',
      findings: [{ title: 'risco regional', detail: 'Carteira exposta a estiagem.', importance: 'alta', basis: 'evidencia' }],
    },
  });

  assert.ok(report.designerBrief.mustShow.includes('evidencias agroclimaticas'));
  assert.match(report.designerBrief.chartGuidance, /evidencias agroclimaticas|fonte, metrica, regiao/i);
  const text = JSON.stringify(report).toLowerCase();
  assert.match(text, /inmet/);
  assert.match(text, /conab/);
  assert.match(text, /59,9%/);
  assert.match(text, /50 a 100 mm/);
  assert.match(text, /portaria spa\/mapa/);
  assert.match(text, /4 a 8 semanas/);
});

test('normalizeSupervisorFinalReport nao injeta reticencias em evidencias longas', () => {
  const longDetail = [
    'Evidencia: Caso Sompo Sprint 2 - Fazenda Santa Aurora Entrada de sinistros em CSV fornecida pelo briefing: tipo_evento,quantidade alagamento,12 falha_irrigacao,7 pragas,5.',
    'Telemetria atual: Talhao norte com umidade acima do limite operacional; previsao de chuva 42mm nas proximas 24h; sensor de vazao da irrigacao leste oscilando.',
    'Dados financeiros: Valor de apolice, custo de reparo e produtividade financeira ainda nao enviados; marcar valores financeiros como pendentes.',
  ].join(' ');

  const report = normalizeSupervisorFinalReport({
    mission: {
      title: 'Caso Sompo Sprint 2',
      description: 'Gerar canvas executivo Sompo com evidencias, telemetria e lacuna financeira.',
      success: 'Exibir evidencias sem cortes de texto.',
    },
    snapshot: {
      contributions: [
        { agentId: 'pesquisador', content: longDetail },
      ],
    },
    report: {
      summary: longDetail,
      findings: [{ title: 'Evidencia principal', detail: longDetail, importance: 'alta', basis: 'evidencia' }],
    },
  });

  const text = JSON.stringify(report);
  assert.doesNotMatch(text, /\.\.\./);
  assert.match(text, /sensor de vazao da irrigacao leste oscilando/);
  assert.match(text, /Valor de apolice, custo de reparo e produtividade financeira ainda nao enviados/);
});

test('normalizeSupervisorFinalReport deriva evidencias, fila e gatilhos para prevencao operacional', () => {
  const mission = {
    title: 'Sompo claims prevention',
    description: 'Montar dashboard operacional de triagem com fila por severidade e SLA, consolidar fotos, laudos e documentos do caso e fechar com gatilhos preventivos antes do acionamento de sinistro.',
    success: 'Entregar leitura executiva com pacote de evidencias, fila operacional e gatilhos preventivos.',
  };
  const report = normalizeSupervisorFinalReport({
    mission,
    snapshot: {
      contributions: [
        { agentId: 'pesquisador', content: 'Evidencia: fotos de vistoria, laudo preliminar e telemetria ja disponiveis. Lacuna critica: anexos financeiros ainda pendentes.' },
      ],
    },
    report: {
      summary: 'Fila operacional precisa de triagem e lastro documental.',
      findings: [{ title: 'fila severa', detail: 'Backlog com aging acima do SLA em casos prioritarios.', importance: 'alta', basis: 'evidencia' }],
    },
  });

  assert.ok(report.designerBrief.mustShow.includes('pacote de evidencias'));
  assert.ok(report.designerBrief.mustShow.includes('fila operacional'));
  assert.ok(report.designerBrief.mustShow.includes('gatilhos preventivos'));
  assert.match(report.designerBrief.chartGuidance, /checklist de evidencias|fila|gatilhos preventivos/i);
  assert.ok(report.findings.some((finding) => /evidencias|document|foto|laudo/i.test(`${finding.title} ${finding.detail}`)));
  assert.ok(report.findings.some((finding) => /fila operacional|backlog|sla|aging/i.test(`${finding.title} ${finding.detail}`)));
  assert.ok(report.findings.some((finding) => /gatilhos preventivos|acionamento|prazo de resposta/i.test(`${finding.title} ${finding.detail}`)));
});
