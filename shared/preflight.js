function summarizeDetail(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `${value.length} item(s)`;
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    return keys.length ? `campos: ${keys.slice(0, 6).join(', ')}` : 'objeto vazio';
  }
  return String(value);
}

function buildEndpointCheck(path, response = {}) {
  const ok = Boolean(response.ok);
  const body = response.body;
  let detail = response.detail || '';

  if (!detail) {
    if (!ok) {
      detail = response.error || `falha ao validar ${path}`;
    } else if (path === '/api/health') {
      detail = body?.service ? `${body.service}${body.supervisorMode ? ` • ${body.supervisorMode}` : ''}` : 'health respondeu';
    } else if (path === '/api/state') {
      const agents = Array.isArray(body?.agents) ? body.agents.length : 0;
      detail = `${agents} agentes • missão ativa: ${body?.activeMission ? 'sim' : 'não'}`;
    } else if (path === '/api/events') {
      const total = Array.isArray(body?.events) ? body.events.length : 0;
      detail = `${total} evento(s) lidos`;
    } else {
      detail = summarizeDetail(body);
    }
  }

  return {
    id: `endpoint:${path}`,
    label: `GET ${path}`,
    ok,
    detail,
    source: 'kamui-service-health-pattern',
  };
}

export async function runOperationalPreflight({
  probeEndpoint,
  governance = null,
  state = null,
  mode = 'local',
} = {}) {
  if (typeof probeEndpoint !== 'function') throw new Error('probe_endpoint_required');

  const requiredEndpoints = Array.isArray(governance?.requiredPreflightEndpoints)
    ? governance.requiredPreflightEndpoints
    : ['/api/health', '/api/state', '/api/events'];

  const endpointChecks = [];
  for (const path of requiredEndpoints) {
    const result = await probeEndpoint(path);
    endpointChecks.push(buildEndpointCheck(path, result));
  }

  const missionConcurrency = governance?.missionConcurrency ?? null;
  const activeMission = state?.activeMission ?? null;
  const roster = Array.isArray(state?.agents) ? state.agents : [];
  const governanceChecks = [
    {
      id: 'governance:mission-concurrency',
      label: 'Mission concurrency lock',
      ok: !missionConcurrency?.blocked,
      detail: missionConcurrency?.blocked
        ? `${missionConcurrency.unmatchedCount ?? 0} missão(ões) aberta(s)`
        : 'nenhuma missão concorrente recente',
      source: 'tars-governance-pattern',
    },
    {
      id: 'runtime:active-mission',
      label: 'Active mission overlap',
      ok: !activeMission,
      detail: activeMission?.title
        ? `missão ativa: ${activeMission.title}`
        : 'nenhuma missão ativa no estado atual',
      source: 'luca-runtime-pattern',
    },
    {
      id: 'runtime:agent-roster',
      label: 'Agent roster',
      ok: roster.length >= 5,
      detail: `${roster.length} agente(s) carregados`,
      source: 'luca-runtime-pattern',
    },
  ];

  const checks = [...endpointChecks, ...governanceChecks];
  const ok = checks.every((check) => check.ok);
  return {
    ok,
    status: ok ? 'passed' : 'failed',
    mode,
    readyForLiveMission: ok,
    requiredEndpoints,
    checks,
    source: ['tars-governance-pattern', 'kamui-service-health-pattern'],
  };
}
