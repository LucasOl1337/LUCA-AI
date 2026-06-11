import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCatalogAudit } from './catalog-audit.js';
import { buildEndpointCatalog } from './endpoint-catalog.js';
import { buildToolCatalog } from './tool-catalog.js';

test('buildCatalogAudit aprova contrato real de endpoints e ferramentas locais', () => {
  const audit = buildCatalogAudit({
    endpointCatalog: buildEndpointCatalog(),
    toolCatalog: buildToolCatalog(),
  });

  assert.equal(audit.ok, true);
  assert.equal(audit.status, 'passed');
  assert.equal(audit.grade, 'A');
  assert.equal(audit.counts.errors, 0);
  assert.ok(audit.counts.endpoints >= 20);
  assert.ok(audit.counts.tools >= 12);
  assert.equal(audit.checks.some((check) => check.id === 'catalog:tool-links' && check.ok), true);
  assert.equal(audit.source.includes('kamui-catalog-audit-pattern'), true);
});

test('buildCatalogAudit reporta payload quebrado e invoke sem endpoint catalogado', () => {
  const audit = buildCatalogAudit({
    endpointCatalog: {
      modules: [
        {
          id: 'runtime',
          label: 'Runtime',
          outbound: [
            { id: 'health', method: 'GET', path: '/api/health', summary: 'ok' },
          ],
          inbound: [
            { id: 'broken-payload', method: 'POST', path: '/api/broken', summary: 'payload ruim', examplePayload: '{ nope' },
          ],
        },
      ],
    },
    toolCatalog: {
      tools: [
        {
          id: 'missing_route',
          name: 'Missing route',
          parameters: { type: 'object', properties: {} },
          availability: 'both',
          invoke: { type: 'http', method: 'GET', endpoint: '/api/missing' },
        },
      ],
    },
  });

  assert.equal(audit.ok, false);
  assert.equal(audit.status, 'failed');
  assert.ok(audit.issues.some((entry) => entry.scope === 'endpoint' && /examplePayload/.test(entry.message)));
  assert.ok(audit.issues.some((entry) => entry.scope === 'tool-link' && /sem endpoint/.test(entry.message)));
});
