import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SOMPO_MISSION_DOSSIER_DELIMITER,
  buildSompoEpisodeMission,
  parseSompoEpisodeVisualData,
} from '../shared/sompo-telemetry.js';
import { summarizeSompoEpisodeSamples } from './sompo-telemetry-history.js';

const BASE_MS = Date.parse('2026-08-26T15:00:00.000Z');

function sample(index, { acc = 9.8, distancia, collision = false, velocidade = null, velocidadeRoda = null } = {}) {
  const observedMs = BASE_MS + (index * 500);
  return {
    id: index + 1,
    episodeId: 7,
    tractorId: 'SIM-001',
    sourceKind: 'simulation',
    scenarioLabel: 'Colisão frontal roteirizada',
    deviceTimestamp: index * 500,
    observedAt: new Date(observedMs).toISOString(),
    observedMs,
    distancia: distancia ?? 12,
    temperatura: 27,
    umidade: 48,
    pitch: 1.5,
    roll: 0.5,
    accX: 0,
    accY: 0,
    accZ: acc,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    riscoColisao: collision,
    riscoInclinacao: false,
    velocidade,
    velocidadeRoda,
  };
}

/** 48 amostras a cada 500 ms: aproximação 210→~20 cm, pico |acc|=32 em t+12,5s, pós-evento parado a 12 cm. */
function scriptedEpisodeFixture() {
  const samples = Array.from({ length: 48 }, (_, index) => {
    if (index < 25) {
      return sample(index, { distancia: 210 - (index * 7.9), acc: 9.8, collision: false });
    }
    if (index === 25) return sample(index, { distancia: 14, acc: 32, collision: true });
    return sample(index, { distancia: 12, acc: 9.8, collision: true });
  });
  const episode = {
    id: 7,
    publicId: 'ep-roteiro-teste',
    kind: 'roteiro',
    tractorId: 'SIM-001',
    sourceKind: 'simulation',
    scenarioLabel: 'Animal na pista · Colisão com o animal',
    startedAt: new Date(BASE_MS).toISOString(),
    startedMs: BASE_MS,
    endedAt: new Date(BASE_MS + 24_000).toISOString(),
    endedMs: BASE_MS + 24_000,
    status: 'complete',
    durationMs: 24_000,
  };
  return { episode, samples, summary: summarizeSompoEpisodeSamples(samples) };
}

test('missão de episódio: resumo humano em cima, delimitador e dossiê com fases embaixo', () => {
  const { episode, samples, summary } = scriptedEpisodeFixture();
  const mission = buildSompoEpisodeMission(episode, samples, summary, 'Risco Agro');

  const delimiterAt = mission.indexOf(SOMPO_MISSION_DOSSIER_DELIMITER);
  assert.ok(delimiterAt > 0, 'dossiê vem depois do resumo humano');
  const human = mission.slice(0, delimiterAt);
  const dossier = mission.slice(delimiterAt + SOMPO_MISSION_DOSSIER_DELIMITER.length);

  assert.match(human, /^\[Ensaio no simulador\] Episódio de roteiro de cenário registrado — 24s, 48 amostras\./);
  assert.match(human, /Pico de aceleração em t\+12,5s \(32 m\/s²\)/);
  assert.match(human, /distância caiu de 210 cm para 12 cm/);
  assert.match(human, /risco de colisão ativo desde o pico/);
  assert.match(human, /Avaliem o evento completo: severidade, causa provável, resposta recomendada e o que verificar no equipamento físico\./);
  assert.doesNotMatch(human, /riscoColisao=/);
  assert.doesNotMatch(human, /Identificador do episódio/);

  assert.match(dossier, /\[SIMULAÇÃO\] Episódio SOMPO — roteiro de cenário — caminhão SIM-001/);
  assert.match(dossier, /Equipe selecionada para avaliar: Risco Agro/);
  assert.match(dossier, /Identificador do episódio: ep-roteiro-teste/);
  assert.match(dossier, /Cenário: Animal na pista · Colisão com o animal/);
  assert.match(dossier, /Fases detectadas \(heurística determinística sobre as amostras; "pico" = amostra de maior \|aceleração\|, não necessariamente uma batida\):/);
  assert.match(dossier, /- Antes do pico: t\+0s → /);
  assert.match(dossier, /- Pico: /);
  assert.match(dossier, /- Depois do pico: /);
  assert.match(dossier, /Pico de aceleração: t\+12,5s · \|aceleração\| 32 m\/s²/);
  assert.match(dossier, /Amostras-chave \(decimação adaptativa — mais densas ao redor do pico; primeira, última e transições sempre presentes\):/);
  assert.match(dossier, /avaliar o EVENTO em sua totalidade — dinâmica, sequência causal e severidade/);
  assert.match(dossier, /ensaio sintético de roteiro gravado no simulador/);
  assert.match(dossier, /Nota de leitura: o "impacto" do resumo é o pico de \|aceleração\| por heurística/);
  assert.match(dossier, /riscoColisao false → true/);
});

test('missão de episódio falha alto com entradas inválidas e sinaliza episódio abortado', () => {
  const { episode, samples, summary } = scriptedEpisodeFixture();
  assert.throws(() => buildSompoEpisodeMission(null, samples, summary), /sompo_telemetry_episode_required/);
  assert.throws(() => buildSompoEpisodeMission(episode, null, summary), /sompo_telemetry_samples_required/);
  assert.throws(() => buildSompoEpisodeMission(episode, samples, null), /sompo_telemetry_summary_required/);

  const aborted = buildSompoEpisodeMission({ ...episode, status: 'aborted' }, samples, summary, 'Risco Agro');
  assert.match(aborted, /\(status aborted: gravação incompleta\)/);
});

test('missão de episódio com frames: seção "Evidência visual", anexos numerados e frame fora do orçamento declarado', () => {
  const { episode, samples, summary } = scriptedEpisodeFixture();
  const frames = [
    { seq: 1, fase: 'aproximacao', label: 'Início da aproximação', offsetMs: 0, attached: true },
    { seq: 2, fase: 'aproximacao', label: 'Meia aproximação', offsetMs: 7_000, attached: false },
    { seq: 3, fase: 'impacto', label: 'Impacto — pico de aceleração', offsetMs: 14_750, attached: true },
    { seq: 4, fase: 'pos-impacto', label: 'Pós-impacto imediato', offsetMs: 16_500, attached: true },
    { seq: 5, fase: 'pos-impacto', label: 'Final do episódio', offsetMs: 21_500, attached: true },
  ];
  const mission = buildSompoEpisodeMission(episode, samples, summary, 'Risco Agro', frames);

  assert.match(mission, /4 frames do simulador anexados como evidência visual\./);
  assert.match(mission, /Evidência visual \(frames do canvas Three\.js capturados durante o roteiro e anexados a esta missão como imagens\):/);
  assert.match(mission, /- Anexo 1 — Início da aproximação \(fase aproximacao, t\+0s\)/);
  assert.match(mission, /- Anexo 2 — Impacto — pico de aceleração \(fase impacto, t\+14,75s\)/);
  assert.match(mission, /- Anexo 4 — Final do episódio \(fase pos-impacto, t\+21,5s\)/);
  assert.match(mission, /- Registrado no episódio mas NÃO anexado \(orçamento de anexos da bancada\): Meia aproximação \(fase aproximacao, t\+7s\)/);
  assert.match(mission, /cruzem cada imagem com a telemetria do mesmo instante e digam explicitamente se batem ou divergem/);
  assert.match(mission, /a distância registrada no dado confere com a posição do caminhão no Anexo 3\?/);
  assert.match(mission, /Concluam com a severidade do evento para a seguradora e a ação de prevenção no momento exato/);
  assert.doesNotMatch(mission, /Sem evidência visual/);
});

/** Variante com alerta atrasado: pico em t+12,5s (índice 25), flag só liga em t+15s (índice 30). */
function delayedAlertEpisodeFixture() {
  const samples = Array.from({ length: 48 }, (_, index) => {
    if (index < 25) {
      return sample(index, { distancia: 210 - (index * 7.9), acc: 9.8, collision: false });
    }
    if (index === 25) return sample(index, { distancia: 14, acc: 32, collision: false });
    return sample(index, { distancia: 12, acc: 9.8, collision: index >= 30 });
  });
  const episode = {
    id: 8,
    publicId: 'ep-alerta-atrasado',
    kind: 'roteiro',
    tractorId: 'SIM-001',
    sourceKind: 'simulation',
    scenarioLabel: 'Colisão frontal roteirizada',
    startedAt: new Date(BASE_MS).toISOString(),
    startedMs: BASE_MS,
    endedAt: new Date(BASE_MS + 24_000).toISOString(),
    endedMs: BASE_MS + 24_000,
    status: 'complete',
    durationMs: 24_000,
  };
  return { episode, samples, summary: summarizeSompoEpisodeSamples(samples) };
}

test('missão de episódio: contrato da peça visual pede série temporal e proíbe barra de média por fase', () => {
  const { episode, samples, summary } = delayedAlertEpisodeFixture();
  const mission = buildSompoEpisodeMission(episode, samples, summary, 'Risco Agro');

  assert.match(mission, /Contrato da peça visual \(etapa de artefatos da bancada\):/);
  assert.match(mission, /linha do tempo do episódio — série temporal desenhada pelo runtime com os dados reais/);
  assert.match(mission, /marcadores nomeados no início do episódio, no PICO e no instante em que a flag de risco disparou/);
  assert.match(mission, /PROIBIDO: gráfico de barras com média por fase/);
  assert.match(mission, /A manchete da peça é o ACHADO acionável/);
  assert.match(mission, /cartão de decisão curto — veredito, severidade para a seguradora e o que fazer agora, em frases, SEM repetir números que já estão na linha do tempo/);
  assert.match(mission, /aceleração em g \(m\/s² no máximo uma vez, entre parênteses\)/);
  assert.match(mission, /nada de "Δv", "piso\/saturação do sensor" ou "pulso único de contato"/);
});

test('missão de episódio: achado do alerta calculado e bloco de máquina parseável', () => {
  const { episode, samples, summary } = delayedAlertEpisodeFixture();
  const mission = buildSompoEpisodeMission(episode, samples, summary, 'Risco Agro');

  // Pico em t+12,5s, flag em t+15s: o atraso de 2,5 s vira achado explícito.
  assert.match(mission, /Achado do alerta: a flag riscoColisao disparou 2,5 s DEPOIS do pico de aceleração \(pico em t\+12,5s, alerta em t\+15s\) — o equipamento avisou tarde\./);

  const data = parseSompoEpisodeVisualData(mission);
  assert.ok(data, 'bloco de máquina presente e parseável');
  assert.equal(data.tipo, 'sompo-episodio-roteiro');
  assert.equal(data.impactoMs, 12_500);
  assert.equal(data.flagMs, 15_000);
  assert.equal(data.picoAccMs2, 32);
  assert.equal(data.flagDesdeInicio, false);
  assert.ok(data.serie.length >= 2 && data.serie.length <= 30);
  assert.deepEqual(data.serie[0], [0, 210, 9.8]);
  assert.ok(data.serie.some(([t, , acc]) => t === 12_500 && acc === 32), 'pico presente na série');

  // Fixture original: flag liga no mesmo tick do pico.
  const sameInstant = scriptedEpisodeFixture();
  const sameMission = buildSompoEpisodeMission(sameInstant.episode, sameInstant.samples, sameInstant.summary, 'Risco Agro');
  assert.match(sameMission, /Achado do alerta: a flag riscoColisao disparou no mesmo instante do pico de aceleração \(t\+12,5s\)\./);

  // Kind legado continua parseável e rotulado como colisão.
  const legacy = scriptedEpisodeFixture();
  legacy.episode = { ...legacy.episode, kind: 'colisao', scenarioLabel: 'Colisão frontal roteirizada' };
  const legacyMission = buildSompoEpisodeMission(legacy.episode, legacy.samples, legacy.summary, 'Risco Agro');
  assert.match(legacyMission, /Episódio de colisão registrado/);
  assert.match(legacyMission, /Episódio SOMPO — colisão — caminhão/);

  // Missão sem bloco não é episódio para a etapa visual.
  assert.equal(parseSompoEpisodeVisualData('missão comum sem bloco'), null);
});

test('missão de episódio: divergência roda x solo vira achado de tração no dossiê', () => {
  // Aquaplanagem sintética: rodas a 30 km/h com o solo a 80 km/h entre t+5s e t+7s.
  const samples = Array.from({ length: 40 }, (_, index) => sample(index, {
    velocidade: 80,
    velocidadeRoda: index >= 10 && index <= 14 ? 30 : 80,
    acc: index === 25 ? 32 : 9.8,
  }));
  const episode = {
    id: 9,
    publicId: 'ep-aquaplaning-teste',
    kind: 'roteiro',
    tractorId: 'SIM-001',
    sourceKind: 'simulation',
    scenarioLabel: 'Aquaplanagem · Recupera o controle',
    startedAt: new Date(BASE_MS).toISOString(),
    startedMs: BASE_MS,
    endedAt: new Date(BASE_MS + 20_000).toISOString(),
    endedMs: BASE_MS + 20_000,
    status: 'complete',
    durationMs: 20_000,
  };
  const summary = summarizeSompoEpisodeSamples(samples);
  assert.equal(summary.wheelDivergence.wheelKph, 30);
  assert.equal(summary.wheelDivergence.groundKph, 80);

  const mission = buildSompoEpisodeMission(episode, samples, summary, 'Risco Agro');
  assert.match(mission, /Achado de tração: rodas a 30 km\/h com o solo a 80 km\/h \(t\+5s, diferença de 50 km\/h\) — a divergência roda×solo indica pneus sem contato efetivo \(aquaplanagem ou patinação\)/);

  // Sem divergência: a linha não aparece (não há prova de desacoplamento).
  const coupled = Array.from({ length: 40 }, (_, index) => sample(index, {
    velocidade: 80,
    velocidadeRoda: 79,
    acc: index === 25 ? 32 : 9.8,
  }));
  const coupledMission = buildSompoEpisodeMission(
    episode, coupled, summarizeSompoEpisodeSamples(coupled), 'Risco Agro',
  );
  assert.doesNotMatch(coupledMission, /Achado de tração/);
});

test('missão de episódio sem frames diz explicitamente que não há evidência visual', () => {
  const { episode, samples, summary } = scriptedEpisodeFixture();
  const mission = buildSompoEpisodeMission(episode, samples, summary, 'Risco Agro');
  assert.match(mission, /Sem evidência visual: nenhum frame do simulador foi registrado neste episódio; a análise segue apenas com os dados de telemetria\./);
  assert.doesNotMatch(mission, /Anexo 1/);
  assert.doesNotMatch(mission, /frames? do simulador anexado/);
});
