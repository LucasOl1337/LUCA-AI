import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const simulator = readFileSync(join(root, '../src/components/SompoTruckSimulator.tsx'), 'utf8');
const page = readFileSync(join(root, '../src/pages/SompoPage.tsx'), 'utf8');

test('simulador grava o episódio do cenário selecionado, com sucesso e erro visíveis', () => {
  assert.match(simulator, /data-sompo-episode-run/);
  assert.match(simulator, /Gravar episódio deste cenário/);
  assert.doesNotMatch(simulator, /Simular colisão/);
  assert.match(simulator, /data-sompo-episode-recording/);
  assert.match(simulator, /Gravando episódio…/);
  assert.match(simulator, /data-sompo-episode-done/);
  assert.match(simulator, /Episódio registrado\./);
  assert.match(simulator, /data-sompo-episode-error/);
  assert.match(simulator, /role="alert"/);
  assert.match(simulator, /postSompoTelemetryEpisodeStart/);
  assert.match(simulator, /postSompoTelemetryEpisodeFinish/);
  // O episódio é o mesmo relógio do cenário: plano rural ou agrícola.
  assert.match(simulator, /getSompoEpisodePlan/);
  assert.match(simulator, /getSompoAgriEpisodePlan/);
  assert.match(simulator, /createSompoSimulationSnapshot/);
  assert.match(simulator, /createSompoAgriSimulationSnapshot/);
  // Desfecho manual não grava: avisa em vez de oferecer botão morto.
  assert.match(simulator, /data-sompo-episode-manual/);
  assert.match(simulator, /disabled=\{episodeActive \|\| !episodePlan\}/);
});

test('durante a gravação os controles manuais ficam travados e o gerador normal pausa', () => {
  const rangeDisables = simulator.match(/type="range"[\s\S]{0,220}?disabled=\{episodeActive(?: \|\| scenarioScripted)?\}/g) || [];
  assert.equal(rangeDisables.length, 5, 'os 5 sliders travam durante o episódio');
  assert.match(simulator, /if \(isFirebase \|\| episodeActive\) return undefined;/);
  assert.match(simulator, /<select[^>]+disabled=\{episodeActive\}[^>]+onChange=\{\(event\) => selectScenario/);
});

test('falha de rede no episódio aborta com aviso e mantém o simulador vivo', () => {
  assert.match(simulator, /Falha de rede ao gravar o episódio — gravação abortada\. O simulador continua ativo\./);
  assert.match(simulator, /'aborted'/);
  assert.match(simulator, /A gravação não começou; o simulador continua ativo\./);
});

test('simulador captura frames nos momentos do plano e sobe 1 por request sem derrubar o episódio', () => {
  assert.match(simulator, /run\.plan\.frameMoments/);
  assert.match(simulator, /postProcessing\.render\(delta\);\s*\n\s*\/\/ Captura síncrona no mesmo rAF do render/);
  assert.match(simulator, /captureDueEpisodeFrames\(renderer\.domElement\)/);
  assert.match(simulator, /onAfterRender: captureDueEpisodeFrames/);
  assert.match(simulator, /toDataURL\('image\/jpeg', EPISODE_FRAME_JPEG_QUALITY\)/);
  assert.match(simulator, /EPISODE_FRAME_LATE_TOLERANCE_MS/);
  assert.match(simulator, /postSompoTelemetryEpisodeFrames\(run\.publicId, \[frame\]\)/);
  assert.match(simulator, /data-sompo-episode-frames-warning/);
  assert.match(simulator, /Falha ao enviar os frames do simulador — o episódio foi gravado, mas a análise seguirá sem evidência visual\./);
  assert.match(simulator, /frames: \{episodeFrameCount\}\/\{episodeFrameTotal\}/);
});

test('bancada baixa os frames do episódio, reenvia como anexos da sessão e falha alto no upload', () => {
  assert.match(page, /selectEpisodeFramesForBench/);
  assert.match(page, /getSompoTelemetryEpisodeFrameBlob/);
  assert.match(page, /uploadChatAttachment\(launchSession\.id, file\)/);
  assert.match(page, /attachments: launchAttachments/);
  assert.match(page, /Falha ao anexar os frames do episódio à bancada\. Nada foi enviado — tente de novo\./);
  const lucaAiPage = readFileSync(join(root, '../src/pages/LucaAiPage.tsx'), 'utf8');
  assert.match(lucaAiPage, /launch\?\.attachments/);
});

test('bancada analisa o episódio completo e preserva o fluxo sem episódio', () => {
  assert.match(page, /Analisar episódio na bancada/);
  assert.match(page, /episodio-\$\{result\.episode\.publicId\}|episodio-\$\{|`episodio-/);
  assert.match(page, /getSompoTelemetryEpisode/);
  assert.match(page, /buildSompoEpisodeMission/);
  assert.match(page, /buildSompoTelemetryMission/);
  assert.match(page, /onEpisodeRecorded=\{setRecordedEpisode\}/);
  assert.match(page, /O episódio registrado não pôde ser lido no servidor\./);
});
