import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { SOMPO_EPISODE_VISUAL_DATA_MARKER } from '../shared/sompo-telemetry.js';
import {
  materializeVisualPack,
  parseVisualPlanOutput,
  readVisualArtifactFile,
  renderSompoEpisodeTimelineSvg,
  sompoEpisodeHeadline,
  visualPlanNeedsRetry,
} from './visual-stage.js';

/** Dados do diagnóstico do regente: impacto t+14,5s, flag t+16,8s → atraso 2,3 s. */
function exampleVisualData() {
  return {
    tipo: 'sompo-episodio-colisao',
    duracaoMs: 22_310,
    impactoMs: 14_500,
    picoAccMs2: 35.97,
    flagMs: 16_800,
    flagDesdeInicio: false,
    serie: [
      [0, 210, 9.8],
      [7_000, 140, 9.8],
      [14_000, 20, 12.4],
      [14_500, 14, 35.97],
      [15_000, 12, 14.1],
      [16_800, 12, 9.8],
      [22_310, 12, 9.8],
    ],
  };
}

function episodeMission(data = exampleVisualData()) {
  return [
    'Missão do episódio de colisão.',
    '',
    `${SOMPO_EPISODE_VISUAL_DATA_MARKER} (bloco de máquina para a etapa visual; não recitar no chat)`,
    JSON.stringify(data),
  ].join('\n');
}

test('sompoEpisodeHeadline responde a pergunta humana direto do dado', () => {
  assert.equal(sompoEpisodeHeadline(exampleVisualData()), 'O alerta chegou 2,3 s depois da batida');
  assert.equal(
    sompoEpisodeHeadline({ ...exampleVisualData(), flagMs: 13_500 }),
    'O alerta disparou 1 s antes da batida',
  );
  assert.equal(
    sompoEpisodeHeadline({ ...exampleVisualData(), flagMs: 14_520 }),
    'O alerta disparou no instante da batida',
  );
  assert.equal(
    sompoEpisodeHeadline({ ...exampleVisualData(), flagMs: null }),
    'A batida aconteceu e o alerta nunca disparou',
  );
  assert.equal(
    sompoEpisodeHeadline({ ...exampleVisualData(), flagMs: null, flagDesdeInicio: true }),
    'A flag de risco já estava ativa antes da batida',
  );
});

test('linha do tempo SVG: curvas reais, marcadores nomeados e atraso visível entre impacto e alerta', () => {
  const svg = renderSompoEpisodeTimelineSvg(exampleVisualData()).toString('utf8');

  // Manchete = achado; subtítulo em português claro.
  assert.match(svg, /O alerta chegou 2,3 s depois da batida/);
  assert.match(svg, /Distância frontal e força do impacto, segundo a segundo/);

  // Eixo X em segundos e duas curvas (polylines de distância e de aceleração).
  assert.match(svg, />0s</);
  assert.match(svg, />5s</);
  const distCurves = svg.match(/<polyline[^>]*stroke="#64d2ff"/g) || [];
  const accCurves = svg.match(/<polyline[^>]*stroke="#ff9f0a"/g) || [];
  assert.ok(distCurves.length >= 1, 'curva de distância presente');
  assert.ok(accCurves.length >= 1, 'curva de aceleração presente');

  // Marcadores nomeados: início, IMPACTO e disparo da flag — mais a faixa do atraso.
  assert.match(svg, /Início da aproximação/);
  assert.match(svg, /IMPACTO t\+14,5s/);
  assert.match(svg, /Alerta disparou t\+16,8s/);
  assert.match(svg, /atraso de 2,3 s/);

  // Unidades humanas: g primário, m/s² exatamente uma vez, sem jargão.
  assert.match(svg, /Distância frontal \(cm\)/);
  assert.match(svg, /Aceleração \(g\) — pico de 3,7 g \(36 m\/s²\)/);
  assert.equal((svg.match(/m\/s²/g) || []).length, 1, 'm/s² aparece uma única vez');
  assert.doesNotMatch(svg, /por fase/i);
  assert.doesNotMatch(svg, /Δv|saturação|pulso único/i);

  // Honestidade em uma linha: severidade física pendente sem velocidade.
  assert.match(svg, /Sem velocidade registrada no episódio: a severidade física exata segue pendente\./);
});

test('linha do tempo sem disparo de flag não inventa marcador de alerta', () => {
  const svg = renderSompoEpisodeTimelineSvg({ ...exampleVisualData(), flagMs: null }).toString('utf8');
  assert.match(svg, /A batida aconteceu e o alerta nunca disparou/);
  assert.match(svg, /IMPACTO t\+14,5s/);
  assert.doesNotMatch(svg, /Alerta disparou t\+/);
  assert.doesNotMatch(svg, /atraso de/);
});

test('materializeVisualPack em missão de episódio: linha do tempo + cartão, charts do plano descartados', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-visual-episode-'));
  process.env.LUCA_DATA_DIR = dataDir;
  let imageCalls = 0;

  const pack = await materializeVisualPack({
    mission: episodeMission(),
    personaOutput: JSON.stringify({
      summary: 'Alerta atrasado no ensaio',
      report: {
        title: 'Cartão de decisão',
        markdown: 'Veredito: o alerta chegou depois da batida. Severidade alta para a seguradora. Ação: antecipar o gatilho do alarme no firmware antes de campo.',
      },
      charts: [
        { id: 'c1', title: 'Aceleração por fase (m/s²)', type: 'tower', items: [{ label: 'Aproximação', value: 10.32 }, { label: 'Impacto', value: 35.97 }] },
      ],
      images: [{ id: 'i1', title: 'Infográfico', prompt: 'sequência causal do impacto' }],
    }),
    ownerId: 'u-episode',
    traceId: 't-episode',
    callImage: async () => {
      imageCalls += 1;
      throw new Error('não deve gerar imagem por IA para episódio');
    },
  });

  // Redundância morta: sem barras por fase, sem infográfico de IA — só a curva e o cartão.
  assert.equal(imageCalls, 0, 'geração de imagem por IA não é chamada');
  assert.deepEqual(pack.charts, []);
  assert.equal(pack.images.length, 1);
  assert.equal(pack.status, 'complete');
  assert.equal(pack.imageEngine, 'episode-timeline');
  assert.equal(pack.sompoEpisodeTimeline, true);
  assert.equal(pack.images[0].style, 'episode-timeline');
  assert.equal(pack.images[0].title, 'O alerta chegou 2,3 s depois da batida');
  assert.match(pack.images[0].url, /\/api\/luca-ai\/visual-artifacts\//);
  assert.match(pack.report.markdown, /Veredito/);

  const artifact = readVisualArtifactFile('u-episode', 't-episode', pack.images[0].id);
  assert.ok(artifact);
  assert.equal(artifact.mimeType, 'image/svg+xml');
  const svg = artifact.buffer.toString('utf8');
  assert.match(svg, /IMPACTO t\+14,5s/);
  assert.match(svg, /Alerta disparou t\+16,8s/);
});

test('materializeVisualPack de episódio entrega a linha do tempo mesmo sem plano da persona', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-visual-episode-bare-'));
  process.env.LUCA_DATA_DIR = dataDir;
  const pack = await materializeVisualPack({
    mission: episodeMission(),
    personaOutput: '',
    ownerId: 'u-bare',
    traceId: 't-bare',
    callImage: null,
  });
  assert.equal(pack.images.length, 1);
  assert.equal(pack.images[0].status, 'ok');
  assert.equal(pack.report, null);
  assert.equal(pack.charts.length, 0);
  assert.equal(pack.status, 'complete');
  assert.equal(pack.summary, 'O alerta chegou 2,3 s depois da batida');
});

test('visualPlanNeedsRetry não exige images[] quando a missão é de episódio', () => {
  const withoutImages = parseVisualPlanOutput(JSON.stringify({
    summary: 'ok',
    report: { title: 'Cartão', markdown: 'frases' },
  }));
  assert.equal(visualPlanNeedsRetry(withoutImages, { mission: episodeMission() }), false);
  assert.equal(visualPlanNeedsRetry(withoutImages, { mission: 'missão comum' }), true);
  assert.equal(visualPlanNeedsRetry(null, { mission: episodeMission() }), true);
});

test('escala do eixo mantem o pico dentro do grafico e usa marcas redondas', () => {
  // Decimacao que perde o topo: o pico real (71,8 m/s² ≈ 7,3 g) e maior que
  // qualquer amostra da serie. Sem entrar na escala, o marcador do impacto era
  // desenhado acima da area do grafico, em cima do titulo.
  const data = {
    ...exampleVisualData(),
    picoAccMs2: 71.8,
    serie: [[0, 120, 9.8], [12_000, 20, 9.8], [14_500, 4, 49], [22_310, 40, 9.8]],
  };
  const svg = renderSompoEpisodeTimelineSvg(data).toString('utf8');

  const plotTop = 216;
  const plotBottom = 566;
  const impactDot = svg.match(/<circle cx="[\d.]+" cy="([\d.]+)"/);
  assert.ok(impactDot, 'marcador do pico presente');
  const dotY = Number(impactDot[1]);
  assert.ok(dotY >= plotTop && dotY <= plotBottom, `pico dentro do grafico (cy=${dotY})`);

  // Marcas de eixo redondas: 0/40/80/120/160 na distancia, 0/2/4/6/8 em g.
  assert.match(svg, />160</);
  assert.match(svg, /font-family="[^"]*">8<\/text>/);
  assert.doesNotMatch(svg, />37,5</);
  assert.doesNotMatch(svg, />112,5</);
});
