function endpoint(id, method, path, summary, availability = 'both', examplePayload) {
  const spec = { id, method, path, summary, availability };
  if (examplePayload) spec.examplePayload = examplePayload;
  return spec;
}

export function buildEndpointCatalog({ mode = 'backend' } = {}) {
  const runtime = mode === 'cloud' ? 'cloud' : 'local';
  const isVisible = (entry) => entry.availability === 'both' || entry.availability === runtime;
  const modules = [
      {
        id: 'runtime',
        label: runtime === 'cloud' ? 'Runtime Cloudflare' : 'Runtime local',
        description: runtime === 'cloud'
          ? 'estado vivo do worker publicado e do heartbeat cloud'
          : 'estado vivo do backend local, websocket e supervisor',
        featured: true,
        outbound: [
          endpoint('health', 'GET', '/api/health', 'health do runtime LUCA-AI', 'both'),
          endpoint('state', 'GET', '/api/state', 'snapshot completo do estado sincronizado no dashboard', 'both'),
          endpoint('events', 'GET', '/api/events', 'feed persistido de eventos operacionais do runtime, com filtros por type, missionId, goalId, traceId e limit', 'both'),
          endpoint('events-summary', 'GET', '/api/events/summary', 'resumo operacional do feed persistido, com contagem por type/source e suporte aos mesmos filtros do feed', 'both'),
          endpoint('events-flows', 'GET', '/api/events/flows', 'agrupa eventos por traceId ou janela temporal para reconstruir trilhas operacionais e evidencias', 'both'),
          endpoint('preflight', 'GET', '/api/preflight', 'readiness operacional antes de missão live, validando health/state/events e lock de concorrência', 'local'),
          endpoint('governance', 'GET', '/api/governance', 'resumo de governanca operacional adaptado do TARS', 'cloud'),
          endpoint('goals', 'GET', '/api/goals', 'fila persistida de goals inspirada no TARS, com status e budgets', 'cloud'),
        ],
        inbound: [
          endpoint(
            'supervisor-start',
            'POST',
            '/api/supervisor/start',
            'liga o supervisor e executa um ciclo imediato',
            'local',
            '{\n  "reason": "manual operator trigger"\n}',
          ),
          endpoint('supervisor-pause', 'POST', '/api/supervisor/pause', 'pausa o supervisor e interrompe ciclos automáticos', 'local'),
        ],
      },
      {
        id: 'mission',
        label: 'Missões',
        description: 'ativação, contexto, sinais operacionais e fechamento',
        featured: true,
        outbound: [],
        inbound: [
          endpoint(
            'mission-activate',
            'POST',
            '/api/mission/activate',
            'ativa uma nova missão operacional',
            'both',
            '{\n  "title": "Auditoria Sompo rural",\n  "description": "Cruzar telemetria, briefing e sinais operacionais.",\n  "success": "Entregar veredito com riscos, lacunas e proxima acao."\n}',
          ),
          endpoint(
            'mission-context',
            'POST',
            '/api/mission/context',
            'mescla contexto estruturado na missão ativa',
            'local',
            '{\n  "context": {\n    "historicalData": ["CSV de sinistros por talhao"],\n    "predictiveData": ["chuva prevista 42mm"]\n  }\n}',
          ),
          endpoint(
            'mission-signal',
            'POST',
            '/api/mission/signal',
            'injeta sinal em tempo real para a missão ativa',
            'local',
            '{\n  "source": "sensor-irrigacao-leste",\n  "severity": "warning",\n  "message": "Vazao oscilando acima do esperado."\n}',
          ),
          endpoint('mission-complete', 'POST', '/api/mission/complete', 'solicita encerramento manual da missão', 'local'),
          endpoint('mission-reset', 'POST', '/api/mission/reset', 'reseta a missão ativa e limpa o escopo atual', 'both'),
        ],
      },
      {
        id: 'agents',
        label: 'Agentes',
        description: 'configuração, execução manual e personas importadas do Yume',
        outbound: [
          endpoint('personas-available', 'GET', '/api/personas/available', 'lista personas disponíveis para importar do Yume', 'local'),
        ],
        inbound: [
          endpoint(
            'agent-config',
            'POST',
            '/api/agent/config',
            'altera modelo e habilitação de um agente',
            'local',
            '{\n  "agentId": "pesquisador",\n  "enabled": true,\n  "model": "glm-5.1"\n}',
          ),
          endpoint(
            'agent-run',
            'POST',
            '/api/agent/run',
            'executa manualmente um agente ou persona',
            'local',
            '{\n  "agentId": "supervisor",\n  "instruction": "Revise o ultimo veredito com foco em risco operacional."\n}',
          ),
          endpoint(
            'persona-add',
            'POST',
            '/api/agent/persona/add',
            'importa uma persona do Yume como agente especialista',
            'local',
            '{\n  "slug": "marina-clinica-santamarina"\n}',
          ),
          endpoint(
            'persona-remove',
            'POST',
            '/api/agent/persona/remove',
            'remove uma persona importada do runtime',
            'local',
            '{\n  "slug": "marina-clinica-santamarina"\n}',
          ),
          endpoint('agents-clear', 'POST', '/api/agents/clear', 'limpa contexto, heartbeat e terminais dos agentes', 'local'),
        ],
      },
      {
        id: 'heartbeat',
        label: 'Heartbeat',
        description: runtime === 'cloud'
          ? 'controle do pulso do runtime publicado e smoke do worker'
          : 'controle do pulso do sistema e do monitor local',
        featured: true,
        outbound: [],
        inbound: [
          endpoint('heartbeat-start', 'POST', '/api/heartbeat/start', 'inicia o heartbeat do runtime atual', 'both'),
          endpoint('heartbeat-pause', 'POST', '/api/heartbeat/pause', 'pausa o heartbeat do runtime atual', 'both'),
          endpoint('harness-smoke', 'POST', '/api/harness/smoke', 'executa smoke diagnostic do runtime atual', 'both'),
        ],
      },
      {
        id: 'goals',
        label: 'Goals',
        description: 'registro operacional de objetivos autônomos inspirado no TARS',
        outbound: [
          endpoint('goals-list', 'GET', '/api/goals', 'lista goals persistidos, com filtro opcional por status', 'cloud'),
        ],
        inbound: [
          endpoint(
            'goals-create',
            'POST',
            '/api/goals',
            'cria um goal persistido com definition of done e budgets operacionais',
            'cloud',
            '{\n  "title": "Auditar regressao no runtime cloud",\n  "description": "Checar evento mission.failed apos deploy",\n  "definitionOfDone": "Resumo reproduzivel e proxima acao clara",\n  "priority": 3,\n  "maxIterations": 8,\n  "maxSeconds": 240,\n  "maxToolCalls": 20\n}',
          ),
        ],
      },
      {
        id: 'scheduling',
        label: 'Agendamento',
        description: 'fila recorrente de missões operacionais',
        outbound: [],
        inbound: [
          endpoint(
            'mission-schedule',
            'POST',
            '/api/mission/schedule',
            'cria um agendamento recorrente de missão',
            'local',
            '{\n  "description": "Revisar sinais da Aurora",\n  "intervalValue": 1,\n  "intervalUnit": "days",\n  "totalRuns": 5,\n  "startImmediately": true\n}',
          ),
          endpoint('schedule-cancel', 'POST', '/api/schedule/cancel', 'cancela um agendamento e esvazia a fila pendente', 'local', '{\n  "scheduleId": "sched_123"\n}'),
          endpoint('schedule-pause', 'POST', '/api/schedule/pause', 'pausa um agendamento ativo', 'local', '{\n  "scheduleId": "sched_123"\n}'),
          endpoint('schedule-resume', 'POST', '/api/schedule/resume', 'retoma um agendamento pausado', 'local', '{\n  "scheduleId": "sched_123"\n}'),
        ],
      },
      {
        id: 'comms',
        label: 'Comms',
        description: 'mensagens operacionais e catálogo do contrato',
        outbound: [
          endpoint('endpoint-catalog', 'GET', '/api/catalog/endpoints', 'catálogo operacional de endpoints expostos pelo LUCA', 'both'),
          endpoint('tool-catalog', 'GET', '/api/catalog/tools', 'catálogo operacional de ferramentas expostas pelo LUCA', 'both'),
          endpoint('catalog-audit', 'GET', '/api/catalog/audit', 'auditoria estática do contrato entre endpoints e ferramentas', 'both'),
          endpoint('mission-report', 'GET', '/api/report/mission', 'relatorio operacional consolidado da missao ativa ou arquivada, com evidencias e trilha', 'both'),
          endpoint('yume-memory-event', 'GET', '/api/integrations/yume/memory-event', 'preview local do payload MemoryEventIn para arquivar relatorio/evidencias no Yume sem sincronizacao automatica', 'local'),
        ],
        inbound: [
          endpoint(
            'chat-message',
            'POST',
            '/api/tools/global-chat/message',
            'publica mensagem manual no chat global',
            'local',
            '{\n  "content": "Supervisor, revisar a lacuna financeira antes do fechamento."\n}',
          ),
        ],
      },
    ]
    .map((module) => ({
      ...module,
      outbound: module.outbound.filter(isVisible),
      inbound: module.inbound.filter(isVisible),
    }))
    .filter((module) => module.outbound.length > 0 || module.inbound.length > 0);

  return {
    generatedAt: new Date().toISOString(),
    mode,
    modules,
  };
}
