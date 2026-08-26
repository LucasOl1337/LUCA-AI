import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SOMPO_MISSION_DOSSIER_DELIMITER,
  buildSompoEpisodeMission,
} from '../shared/sompo-telemetry.js';
import { summarizeSompoEpisodeSamples } from './sompo-telemetry-history.js';

const BASE_MS = Date.parse('2026-08-26T15:00:00.000Z');

function sample(index, { acc = 9.8, distancia, collision = false } = {}) {
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
  };
}

/** 48 amostras a cada 500 ms: aproximação 210→~20 cm, pico |acc|=32 em t+12,5s, pós-impacto parado a 12 cm. */
function collisionEpisodeFixture() {
  const samples = Array.from({ length: 48 }, (_, index) => {
    if (index < 25) {
      return sample(index, { distancia: 210 - (index * 7.9), acc: 9.8, collision: false });
    }
    if (index === 25) return sample(index, { distancia: 14, acc: 32, collision: true });
    return sample(index, { distancia: 12, acc: 9.8, collision: true });
  });
  const episode = {
    id: 7,
    publicId: 'ep-colisao-teste',
    kind: 'colisao',
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

test('missão de episódio: resumo humano em cima, delimitador e dossiê com fases embaixo', () => {
  const { episode, samples, summary } = collisionEpisodeFixture();
  const mission = buildSompoEpisodeMission(episode, samples, summary, 'Risco Agro');

  const delimiterAt = mission.indexOf(SOMPO_MISSION_DOSSIER_DELIMITER);
  assert.ok(delimiterAt > 0, 'dossiê vem depois do resumo humano');
  const human = mission.slice(0, delimiterAt);
  const dossier = mission.slice(delimiterAt + SOMPO_MISSION_DOSSIER_DELIMITER.length);

  assert.match(human, /^\[Ensaio no simulador\] Episódio de colisão registrado — 24s, 48 amostras\./);
  assert.match(human, /Impacto em t\+12,5s com pico de 32 m\/s²/);
  assert.match(human, /distância caiu de 210 cm para 12 cm/);
  assert.match(human, /risco de colisão ativo desde o impacto/);
  assert.match(human, /Avaliem o evento completo: severidade, causa provável, resposta recomendada e o que verificar no equipamento físico\./);
  assert.doesNotMatch(human, /riscoColisao=/);
  assert.doesNotMatch(human, /Identificador do episódio/);

  assert.match(dossier, /\[SIMULAÇÃO\] Episódio SOMPO — colisão — caminhão SIM-001/);
  assert.match(dossier, /Equipe selecionada para avaliar: Risco Agro/);
  assert.match(dossier, /Identificador do episódio: ep-colisao-teste/);
  assert.match(dossier, /Cenário: Colisão frontal roteirizada/);
  assert.match(dossier, /Fases detectadas \(heurística determinística; impacto = amostra de pico de \|aceleração\|\):/);
  assert.match(dossier, /- Aproximação: t\+0s → /);
  assert.match(dossier, /- Impacto: /);
  assert.match(dossier, /- Pós-impacto: /);
  assert.match(dossier, /Pico de impacto: t\+12,5s · \|aceleração\| 32 m\/s²/);
  assert.match(dossier, /Amostras-chave \(decimação adaptativa — mais densas ao redor do pico; primeira, última e transições sempre presentes\):/);
  assert.match(dossier, /avaliar o EVENTO em sua totalidade — dinâmica, sequência causal e severidade/);
  assert.match(dossier, /ensaio sintético do roteiro de colisão/);
  assert.match(dossier, /riscoColisao false → true/);
});

test('missão de episódio falha alto com entradas inválidas e sinaliza episódio abortado', () => {
  const { episode, samples, summary } = collisionEpisodeFixture();
  assert.throws(() => buildSompoEpisodeMission(null, samples, summary), /sompo_telemetry_episode_required/);
  assert.throws(() => buildSompoEpisodeMission(episode, null, summary), /sompo_telemetry_samples_required/);
  assert.throws(() => buildSompoEpisodeMission(episode, samples, null), /sompo_telemetry_summary_required/);

  const aborted = buildSompoEpisodeMission({ ...episode, status: 'aborted' }, samples, summary, 'Risco Agro');
  assert.match(aborted, /\(status aborted: gravação incompleta\)/);
});
