const VALID_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'WS', 'SSE']);

function arrayOf(value) {
  return Array.isArray(value) ? value : [];
}

function issue(severity, scope, id, message, detail = '') {
  return { severity, scope, id, message, detail };
}

function validJson(value) {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value !== 'string') return true;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

function visibleAvailability(mode) {
  return mode === 'cloud' ? 'cloud' : 'local';
}

function flattenEndpoints(endpointCatalog = {}) {
  const endpoints = [];
  for (const module of arrayOf(endpointCatalog.modules)) {
    for (const direction of ['outbound', 'inbound']) {
      for (const entry of arrayOf(module?.[direction])) {
        endpoints.push({
          ...entry,
          moduleId: module.id,
          moduleLabel: module.label,
          direction,
        });
      }
    }
  }
  return endpoints;
}

function endpointLookup(endpoints) {
  const byPath = new Map();
  const byMethodPath = new Map();
  for (const endpoint of endpoints) {
    const path = String(endpoint.path || '');
    const method = String(endpoint.method || '').toUpperCase();
    if (!byPath.has(path)) byPath.set(path, []);
    byPath.get(path).push(endpoint);
    byMethodPath.set(`${method} ${path}`, endpoint);
  }
  return { byPath, byMethodPath };
}

function gradeFor(metrics) {
  if (!metrics.staticOk) return 'F';
  const score = (metrics.toolLinkAccuracy * 0.55) + (metrics.payloadValid * 0.25) + 0.2;
  if (score >= 0.95) return 'A';
  if (score >= 0.8) return 'B';
  if (score >= 0.6) return 'C';
  if (score >= 0.4) return 'D';
  return 'F';
}

function checkDuplicateIds(items, scope, issues) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of items) {
    const id = String(item?.id || '').trim();
    if (!id) continue;
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  for (const id of duplicates) {
    issues.push(issue('error', scope, id, 'id duplicado'));
  }
}

function auditEndpoints(endpointCatalog = {}, issues) {
  const modules = arrayOf(endpointCatalog.modules);
  checkDuplicateIds(modules, 'endpoint-module', issues);
  const endpoints = flattenEndpoints(endpointCatalog);
  checkDuplicateIds(endpoints, 'endpoint', issues);

  let payloadTotal = 0;
  let payloadOk = 0;
  for (const module of modules) {
    if (!String(module?.id || '').trim()) {
      issues.push(issue('error', 'endpoint-module', 'missing-id', 'modulo sem id'));
    }
    if (!String(module?.label || '').trim()) {
      issues.push(issue('warning', 'endpoint-module', String(module?.id || 'unknown'), 'modulo sem label'));
    }
  }

  for (const endpoint of endpoints) {
    const id = String(endpoint.id || '').trim() || `${endpoint.method || '?'} ${endpoint.path || '?'}`;
    const method = String(endpoint.method || '').toUpperCase();
    if (!String(endpoint.id || '').trim()) {
      issues.push(issue('error', 'endpoint', id, 'endpoint sem id'));
    }
    if (!VALID_METHODS.has(method)) {
      issues.push(issue('error', 'endpoint', id, 'metodo invalido', method));
    }
    if (!String(endpoint.path || '').startsWith('/')) {
      issues.push(issue('error', 'endpoint', id, 'path deve comecar com /', String(endpoint.path || '')));
    }
    if (!String(endpoint.summary || '').trim()) {
      issues.push(issue('warning', 'endpoint', id, 'summary vazio'));
    }
    if (endpoint.examplePayload !== undefined) {
      payloadTotal += 1;
      if (validJson(endpoint.examplePayload)) {
        payloadOk += 1;
      } else {
        issues.push(issue('error', 'endpoint', id, 'examplePayload nao e JSON valido'));
      }
    }
  }

  return {
    endpoints,
    payloadTotal,
    payloadOk,
  };
}

function auditTools(toolCatalog = {}, lookup, mode, issues) {
  const runtime = visibleAvailability(mode);
  const tools = arrayOf(toolCatalog.tools);
  checkDuplicateIds(tools, 'tool', issues);

  let linkTotal = 0;
  let linkOk = 0;

  for (const tool of tools) {
    const id = String(tool?.id || '').trim() || 'missing-id';
    if (!String(tool?.id || '').trim()) {
      issues.push(issue('error', 'tool', id, 'tool sem id'));
    }
    if (!String(tool?.name || '').trim()) {
      issues.push(issue('warning', 'tool', id, 'tool sem name'));
    }
    if (!['both', 'local', 'cloud'].includes(String(tool?.availability || 'both'))) {
      issues.push(issue('error', 'tool', id, 'availability invalida', String(tool?.availability || '')));
    }
    if (tool?.availability && tool.availability !== 'both' && tool.availability !== runtime) {
      issues.push(issue('warning', 'tool', id, 'tool visivel fora do runtime esperado', String(tool.availability)));
    }
    if (!tool?.parameters || typeof tool.parameters !== 'object' || Array.isArray(tool.parameters)) {
      issues.push(issue('error', 'tool', id, 'parameters deve ser um schema object'));
    }
    const invoke = tool?.invoke && typeof tool.invoke === 'object' && !Array.isArray(tool.invoke) ? tool.invoke : null;
    if (!invoke) {
      issues.push(issue('error', 'tool', id, 'invoke ausente'));
      continue;
    }

    if (invoke.type === 'http') {
      const endpoint = String(invoke.endpoint || '');
      const method = String(invoke.method || '').toUpperCase();
      linkTotal += 1;
      if (!endpoint.startsWith('/')) {
        issues.push(issue('error', 'tool-link', id, 'invoke.endpoint deve comecar com /', endpoint));
        continue;
      }
      if (!VALID_METHODS.has(method)) {
        issues.push(issue('error', 'tool-link', id, 'invoke.method invalido', method));
        continue;
      }
      if (lookup.byMethodPath.has(`${method} ${endpoint}`)) {
        linkOk += 1;
      } else {
        issues.push(issue('error', 'tool-link', id, 'invoke sem endpoint catalogado', `${method} ${endpoint}`));
      }
      continue;
    }

    if (invoke.type === 'http-multi') {
      const endpoints = invoke.endpoints && typeof invoke.endpoints === 'object' && !Array.isArray(invoke.endpoints)
        ? Object.entries(invoke.endpoints)
        : [];
      if (endpoints.length === 0) {
        issues.push(issue('error', 'tool-link', id, 'http-multi sem endpoints'));
        continue;
      }
      for (const [action, endpoint] of endpoints) {
        linkTotal += 1;
        const path = String(endpoint || '');
        if (path.startsWith('/') && lookup.byPath.has(path)) {
          linkOk += 1;
        } else {
          issues.push(issue('error', 'tool-link', id, 'http-multi aponta para endpoint nao catalogado', `${action}: ${path}`));
        }
      }
    }
  }

  return { tools, linkTotal, linkOk };
}

export function buildCatalogAudit({ endpointCatalog, toolCatalog, mode = 'backend' } = {}) {
  const issues = [];
  const endpointResult = auditEndpoints(endpointCatalog, issues);
  const lookup = endpointLookup(endpointResult.endpoints);
  const toolResult = auditTools(toolCatalog, lookup, mode, issues);

  const payloadTotal = endpointResult.payloadTotal;
  const payloadValid = payloadTotal > 0 ? endpointResult.payloadOk / payloadTotal : 1;
  const toolLinkTotal = toolResult.linkTotal;
  const toolLinkAccuracy = toolLinkTotal > 0 ? toolResult.linkOk / toolLinkTotal : 1;
  const errorCount = issues.filter((entry) => entry.severity === 'error').length;
  const warningCount = issues.filter((entry) => entry.severity === 'warning').length;
  const staticOk = errorCount === 0;
  const metrics = {
    staticOk,
    payloadValid: Number(payloadValid.toFixed(3)),
    toolLinkAccuracy: Number(toolLinkAccuracy.toFixed(3)),
  };
  const grade = gradeFor(metrics);

  return {
    ok: staticOk && grade !== 'F',
    status: staticOk && grade !== 'F' ? 'passed' : 'failed',
    grade,
    generatedAt: new Date().toISOString(),
    mode,
    counts: {
      modules: arrayOf(endpointCatalog?.modules).length,
      endpoints: endpointResult.endpoints.length,
      tools: toolResult.tools.length,
      advisoryTools: arrayOf(toolCatalog?.advisoryTools).length,
      issues: issues.length,
      errors: errorCount,
      warnings: warningCount,
    },
    metrics,
    checks: [
      {
        id: 'catalog:endpoint-static',
        label: 'Endpoint catalog static contract',
        ok: !issues.some((entry) => entry.severity === 'error' && entry.scope.startsWith('endpoint')),
        detail: `${endpointResult.endpoints.length} endpoint(s), ${endpointResult.payloadOk}/${payloadTotal || 0} payload(s) validos`,
        source: 'kamui-catalog-audit-pattern',
      },
      {
        id: 'catalog:tool-static',
        label: 'Tool catalog static contract',
        ok: !issues.some((entry) => entry.severity === 'error' && entry.scope === 'tool'),
        detail: `${toolResult.tools.length} tool(s) visiveis`,
        source: 'kamui-catalog-audit-pattern',
      },
      {
        id: 'catalog:tool-links',
        label: 'Tool invoke endpoint coverage',
        ok: toolResult.linkTotal === toolResult.linkOk,
        detail: `${toolResult.linkOk}/${toolResult.linkTotal} invoke(s) cobertos pelo catalogo de endpoints`,
        source: 'kamui-catalog-audit-pattern',
      },
    ],
    issues,
    source: ['kamui-catalog-audit-pattern'],
  };
}
