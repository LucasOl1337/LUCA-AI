import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildToolCatalog, loadToolCatalogFromDir } from './tool-catalog.js';

test('buildToolCatalog expõe ferramentas operacionais locais do LUCA', () => {
  const catalog = buildToolCatalog();
  assert.equal(catalog.source, 'yume-tool-catalog-loader-pattern');
  assert.ok(Array.isArray(catalog.provenance));
  assert.ok(catalog.provenance.includes('tars-tool-catalog-pattern'));
  assert.ok(catalog.provenance.includes('yume-tool-catalog-loader-pattern'));
  assert.ok(catalog.count >= 6);
  assert.ok(catalog.tools.some((tool) => tool.id === 'mission_activate'));
  assert.ok(catalog.tools.some((tool) => tool.id === 'global_chat_message'));
  assert.ok(catalog.tools.some((tool) => tool.id === 'runtime_preflight'));
  assert.ok(catalog.tools.some((tool) => tool.id === 'event_summary' && tool.source === 'tars-event-summary-pattern'));
  assert.ok(catalog.tools.some((tool) => tool.id === 'event_flow_report' && tool.source === 'tars-event-flow-pattern'));
  assert.ok(catalog.tools.some((tool) => tool.id === 'yume_memory_event_preview' && tool.source === 'yume-hybrid-memory-contract'));
  assert.ok(catalog.tools.some((tool) => tool.id === 'catalog_audit' && tool.source === 'kamui-catalog-audit-pattern'));
  assert.ok(catalog.tools.every((tool) => tool.availability === 'both' || tool.availability === 'local'));
  assert.ok(Array.isArray(catalog.relatedCatalogs));
  assert.ok(Array.isArray(catalog.advisoryTools));
  assert.ok(catalog.advisoryCount >= 1);
  assert.ok(catalog.relatedCatalogs.some((entry) => entry.project === 'TARS'));
  assert.ok(catalog.relatedCatalogs.some((entry) => entry.project === 'Yume'));
  assert.ok(catalog.advisoryTools.some((tool) => tool.id === 'tars:mission_log' && tool.canonicalId === 'mission_log'));
  assert.ok(catalog.advisoryTools.some((tool) => tool.id === 'yume:agendar_consulta' && tool.executable === false));
  assert.deepEqual(catalog.errors, []);
});

test('buildToolCatalog cloud filtra entradas locais', () => {
  const catalog = buildToolCatalog({ mode: 'cloud' });
  assert.ok(catalog.tools.every((tool) => tool.availability !== 'local'));
  assert.ok(catalog.tools.some((tool) => tool.id === 'endpoint_catalog'));
  assert.ok(catalog.tools.some((tool) => tool.id === 'catalog_audit'));
  assert.ok(catalog.tools.some((tool) => tool.id === 'event_summary'));
  assert.ok(catalog.tools.some((tool) => tool.id === 'goal_create'));
  assert.equal(catalog.tools.some((tool) => tool.id === 'agent_run'), false);
  assert.deepEqual(catalog.relatedCatalogs, []);
  assert.deepEqual(catalog.advisoryTools, []);
  assert.equal(catalog.advisoryCount, 0);
});

test('loadToolCatalogFromDir reporta manifest inválido sem perder os válidos', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-tool-catalog-'));
  fs.writeFileSync(path.join(tempDir, 'valid.json'), JSON.stringify({
    id: 'ok_tool',
    name: 'OK tool',
    availability: 'both',
    executable: true,
    parameters: { type: 'object', properties: {} },
    invoke: { type: 'http', method: 'GET', endpoint: '/api/ok' },
  }), 'utf8');
  fs.writeFileSync(path.join(tempDir, 'broken.json'), '{ nope', 'utf8');

  const catalog = loadToolCatalogFromDir(tempDir);

  assert.equal(catalog.tools.length, 1);
  assert.equal(catalog.tools[0]?.id, 'ok_tool');
  assert.equal(catalog.errors.length, 1);
  assert.equal(catalog.errors[0]?.file, 'broken.json');
});

test('buildToolCatalog agrega catálogos irmãos em modo advisory', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-related-catalogs-'));
  const tarsDir = path.join(tempRoot, 'TARS', 'ferramentas');
  const yumeDir = path.join(tempRoot, 'Yume', 'ferramentas');
  fs.mkdirSync(tarsDir, { recursive: true });
  fs.mkdirSync(yumeDir, { recursive: true });

  fs.writeFileSync(path.join(tarsDir, 'mission_log.json'), JSON.stringify({
    id: 'mission_log',
    name: 'Mission Log',
    availability: 'both',
    executable: true,
    parameters: { type: 'object', properties: {} },
    invoke: { type: 'builtin', handler: 'mission_log' },
  }), 'utf8');

  fs.writeFileSync(path.join(yumeDir, 'lead_stub.json'), JSON.stringify({
    id: 'lead_stub',
    name: 'Lead Stub',
    description: 'stub externo',
    invoke: {},
  }), 'utf8');

  const catalog = buildToolCatalog({
    relatedCatalogs: [
      { project: 'TARS', catalogPath: tarsDir, source: 'tars-tool-catalog-pattern' },
      { project: 'Yume', catalogPath: yumeDir, source: 'yume-tool-catalog-loader-pattern' },
    ],
  });

  assert.equal(catalog.relatedCatalogs.length, 2);
  assert.equal(catalog.advisoryTools.some((tool) => tool.id === 'tars:mission_log' && tool.advisory), true);
  assert.equal(catalog.advisoryTools.some((tool) => tool.id === 'yume:lead_stub' && tool.executable === false), true);
});
