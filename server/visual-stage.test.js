import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildVisualRetryContext,
  materializeVisualPack,
  parseVisualPlanOutput,
  readVisualArtifactFile,
  visualPlanNeedsRetry,
} from './visual-stage.js';

test('parseVisualPlanOutput le JSON com charts e images', () => {
  const plan = parseVisualPlanOutput(`{
    "summary": "Pack de risco regional",
    "report": { "title": "Dossie", "markdown": "## Prioridade\\n- Oeste" },
    "charts": [
      { "id": "c1", "title": "Regioes", "type": "tower", "items": [{ "label": "Oeste", "value": 3 }, { "label": "Sul", "value": 1 }] }
    ],
    "images": [
      { "id": "i1", "title": "Campo", "prompt": "Cinematic rural field at dusk, wide shot", "aspect_ratio": "16:9" }
    ],
    "imageEngine": "grok-imagine"
  }`);

  assert.equal(plan.source, 'json');
  assert.equal(plan.charts.length, 1);
  assert.equal(plan.charts[0].type, 'tower');
  assert.equal(plan.images.length, 1);
  assert.match(plan.report.markdown, /Prioridade/);
  assert.equal(plan.imageEngine, 'grok-imagine');
});

test('parseVisualPlanOutput faz fallback textual sem JSON', () => {
  const plan = parseVisualPlanOutput('Relatorio livre sem estrutura.');
  assert.equal(plan.source, 'text-fallback');
  assert.equal(plan.charts.length, 0);
  assert.match(plan.report.markdown, /Relatorio livre/);
});

test('parseVisualPlanOutput aceita chart line com ate 8 itens', () => {
  const items = Array.from({ length: 10 }, (_, i) => ({ label: `mes ${i + 1}`, value: i + 1 }));
  const plan = parseVisualPlanOutput(JSON.stringify({
    summary: 'serie temporal',
    charts: [{ id: 'c1', title: 'Evolucao', type: 'line', items }],
  }));
  assert.equal(plan.charts[0].type, 'line');
  assert.equal(plan.charts[0].items.length, 8);
});

test('visualPlanNeedsRetry detecta plano inutilizavel e aceita plano valido', () => {
  assert.equal(visualPlanNeedsRetry(null), true);
  assert.equal(visualPlanNeedsRetry(parseVisualPlanOutput('prosa sem json')), true);
  const valid = parseVisualPlanOutput(JSON.stringify({
    summary: 'ok',
    report: { title: 'R', markdown: 'texto' },
  }));
  assert.equal(visualPlanNeedsRetry(valid), false);
  assert.match(buildVisualRetryContext('resposta anterior'), /SOMENTE com o objeto JSON/);
  assert.match(buildVisualRetryContext('resposta anterior'), /resposta anterior/);
});

test('materializeVisualPack gera imagem e persiste artefato por conta/trace', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-visual-'));
  process.env.LUCA_DATA_DIR = dataDir;
  const tinyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  const pack = await materializeVisualPack({
    mission: 'Teste visual',
    personaOutput: JSON.stringify({
      summary: 'ok',
      report: { title: 'R', markdown: '# Hello' },
      charts: [{ title: 'A', type: 'pie', items: [{ label: 'x', value: 2 }] }],
      images: [{ id: 'shot1', title: 'Still', prompt: 'A red origami crane' }],
      imageEngine: 'grok-imagine',
    }),
    ownerId: 'user-1',
    traceId: 'trace-visual-1',
    callImage: async () => ({
      model: 'xai/grok-imagine-image',
      images: [{ b64Json: tinyPng.toString('base64'), url: null }],
    }),
  });

  assert.equal(pack.status, 'complete');
  assert.equal(pack.charts.length, 1);
  assert.equal(pack.images[0].status, 'ok');
  assert.match(pack.images[0].url, /\/api\/luca-ai\/visual-artifacts\//);
  assert.equal(pack.imageEngine, 'xai/grok-imagine-image');

  const stored = readVisualArtifactFile('user-1', 'trace-visual-1', 'shot1');
  assert.ok(stored);
  assert.ok(stored.buffer.length > 50);
});

test('materializeVisualPack gera imagens em paralelo preservando ordem', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-visual-par-'));
  process.env.LUCA_DATA_DIR = dataDir;
  const tinyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  let inFlight = 0;
  let maxInFlight = 0;
  const pack = await materializeVisualPack({
    mission: 'Paralelo',
    personaOutput: JSON.stringify({
      report: { title: 'R', markdown: 'texto' },
      images: [
        { id: 'a1', title: 'A', prompt: 'first cinematic shot' },
        { id: 'b2', title: 'B', prompt: 'second cinematic shot' },
      ],
    }),
    ownerId: 'user-par',
    traceId: 'trace-par',
    callImage: async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 25));
      inFlight -= 1;
      return { model: 'xai/grok-imagine-image', images: [{ b64Json: tinyPng.toString('base64'), url: null }] };
    },
  });
  assert.equal(maxInFlight, 2, 'as duas imagens devem gerar em paralelo');
  assert.deepEqual(pack.images.map((image) => image.id), ['a1', 'b2']);
  assert.equal(pack.status, 'complete');
});

test('materializeVisualPack fica partial se a imagem falhar', async () => {
  const pack = await materializeVisualPack({
    mission: 'Teste',
    personaOutput: JSON.stringify({
      report: { title: 'R', markdown: 'texto' },
      charts: [],
      images: [{ id: 'bad', title: 'X', prompt: 'fail me' }],
    }),
    ownerId: 'user-2',
    traceId: 'trace-visual-2',
    callImage: async () => {
      throw new Error('9router_image 500');
    },
  });

  assert.equal(pack.status, 'partial');
  assert.equal(pack.report.status, 'ok');
  assert.equal(pack.images[0].status, 'failed');
});
