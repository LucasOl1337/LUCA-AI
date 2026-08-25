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
  renderLocalInfographicSvg,
  sendVisualArtifact,
  synthesizeVisualImageSpecs,
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
  assert.equal(plan.images[0].style, 'infographic');
  assert.match(plan.report.markdown, /Prioridade/);
  assert.equal(plan.imageEngine, 'grok-imagine');
});

test('parseVisualPlanOutput aceita style explained-chart', () => {
  const plan = parseVisualPlanOutput(JSON.stringify({
    summary: 'infografico',
    images: [{
      id: 'i1',
      title: 'Ranking',
      prompt: 'Clean infographic bar chart with readable labels and callouts',
      style: 'explained-chart',
    }],
  }));
  assert.equal(plan.images[0].style, 'explained-chart');
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
  const withoutImages = parseVisualPlanOutput(JSON.stringify({
    summary: 'ok',
    report: { title: 'R', markdown: 'texto' },
  }));
  assert.equal(visualPlanNeedsRetry(withoutImages), true);
  const valid = parseVisualPlanOutput(JSON.stringify({
    summary: 'ok',
    report: { title: 'R', markdown: 'texto' },
    images: [{ prompt: 'Clean infographic bar chart with readable labels' }],
  }));
  assert.equal(visualPlanNeedsRetry(valid), false);
  assert.match(buildVisualRetryContext('resposta anterior'), /SOMENTE com o objeto JSON/);
  assert.match(buildVisualRetryContext('resposta anterior'), /images\[\]/);
  assert.match(buildVisualRetryContext('resposta anterior'), /resposta anterior/);
});

test('synthesizeVisualImageSpecs cria prompt quando images vem vazio', () => {
  const specs = synthesizeVisualImageSpecs({
    summary: 'Oeste lidera o risco',
    charts: [{ title: 'Risco', type: 'tower', items: [{ label: 'Oeste', value: 3 }, { label: 'Sul', value: 1 }] }],
    images: [],
  }, { mission: 'Mapear risco' });
  assert.equal(specs.length, 1);
  assert.equal(specs[0].synthesized, true);
  assert.match(specs[0].prompt, /Oeste|infographic|explained chart/i);
});

test('renderLocalInfographicSvg gera svg com barras do chart', () => {
  const buffer = renderLocalInfographicSvg({
    title: 'Risco regional',
    summary: 'Oeste concentra a exposição',
    charts: [{ title: 'Ranking', items: [{ label: 'Oeste', value: 70 }, { label: 'Centro', value: 40 }] }],
  });
  const svg = buffer.toString('utf8');
  assert.match(svg, /<svg/);
  assert.match(svg, /Oeste/);
  assert.match(svg, /70/);
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

test('materializeVisualPack preserva pt-BR no texto visivel da imagem', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-visual-language-'));
  process.env.LUCA_DATA_DIR = dataDir;
  const tinyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const prompts = [];

  const pack = await materializeVisualPack({
    mission: 'Crie um infográfico sobre os riscos da safra',
    personaOutput: JSON.stringify({
      summary: 'Riscos da safra',
      report: { title: 'Riscos', markdown: 'Prioridades' },
      images: [{ id: 'risco', title: 'Riscos', prompt: 'Risk briefing with readable title and labels' }],
    }),
    ownerId: 'user-language',
    traceId: 'trace-language',
    callImage: async ({ prompt }) => {
      prompts.push(prompt);
      return {
        model: 'cx/gpt-5.5-image',
        images: [{ b64Json: tinyPng.toString('base64'), url: null }],
      };
    },
  });

  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /todo texto vis[ií]vel.*portugu[eê]s do Brasil|pt-BR/i);
  assert.match(prompts[0], /n[aã]o traduza.*ingl[eê]s/i);
  assert.match(pack.images[0].prompt, /portugu[eê]s do Brasil.*pt-BR/i);
  assert.doesNotMatch(pack.images[0].prompt, /Risk briefing|readable title|labels/i);
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

test('materializeVisualPack usa infografico local se image gen falhar', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-visual-local-'));
  process.env.LUCA_DATA_DIR = dataDir;
  const pack = await materializeVisualPack({
    mission: 'Mapear risco Oeste 70 Centro 40',
    personaOutput: JSON.stringify({
      summary: 'Oeste lidera',
      report: { title: 'Risco', markdown: '## Oeste' },
      charts: [{ title: 'Ranking', type: 'tower', items: [{ label: 'Oeste', value: 70 }, { label: 'Centro', value: 40 }] }],
      images: [{ id: 'img1', title: 'Infografico', prompt: 'will fail remotely' }],
    }),
    ownerId: 'u-local',
    traceId: 't-local',
    callImage: async () => {
      throw new Error('No credentials for provider: xai');
    },
    generateImages: true,
  });
  assert.equal(pack.images[0].status, 'ok');
  assert.equal(pack.images[0].fallback, 'local-infographic');
  assert.equal(pack.localImageFallback, true);
  assert.match(pack.images[0].url, /visual-artifacts/);
  const artifact = readVisualArtifactFile('u-local', 't-local', 'img1');
  assert.ok(artifact);
  assert.equal(artifact.mimeType, 'image/svg+xml');
  assert.match(artifact.buffer.toString('utf8'), /Oeste/);
});

test('materializeVisualPack sintetiza imagem quando plano vem sem images', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-visual-synth-'));
  process.env.LUCA_DATA_DIR = dataDir;
  const pack = await materializeVisualPack({
    mission: 'Sem images no JSON',
    personaOutput: JSON.stringify({
      summary: 'Só texto',
      report: { title: 'R', markdown: 'conteudo' },
    }),
    ownerId: 'u-synth',
    traceId: 't-synth',
    callImage: null,
    generateImages: true,
  });
  assert.equal(pack.images.length, 1);
  assert.equal(pack.images[0].status, 'ok');
  assert.equal(pack.images[0].synthesized, true);
  assert.equal(pack.images[0].fallback, 'local-infographic');
});

test('sendVisualArtifact uses flattened mimeType so nosniff can render the image', () => {
  const headers = {};
  let body = null;
  const res = {
    setHeader(name, value) { headers[name] = value; },
    send(value) { body = value; },
  };
  const buffer = Buffer.from('fake-png');
  assert.equal(sendVisualArtifact(res, { mimeType: 'image/png', buffer }), true);
  assert.equal(headers['Content-Type'], 'image/png');
  assert.equal(headers['Content-Length'], String(buffer.length));
  assert.equal(body, buffer);

  assert.equal(sendVisualArtifact(res, { meta: { mimeType: 'image/svg+xml' }, buffer }), true);
  assert.equal(headers['Content-Type'], 'image/png', 'nested file.meta.mimeType must not win; that was the share-page bug');

  assert.equal(sendVisualArtifact(res, null), false);
  assert.equal(sendVisualArtifact(res, { mimeType: 'image/png' }), false);
});
