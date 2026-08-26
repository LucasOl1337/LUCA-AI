import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const simulator = readFileSync(join(root, '../src/components/SompoTruckSimulator.tsx'), 'utf8');
const page = readFileSync(join(root, '../src/pages/SompoPage.tsx'), 'utf8');

test('simulador tem roteiro de colisão com gravação, sucesso e erro visíveis', () => {
  assert.match(simulator, /data-sompo-collision-run/);
  assert.match(simulator, /Simular colisão/);
  assert.match(simulator, /data-sompo-collision-recording/);
  assert.match(simulator, /Gravando episódio de colisão…/);
  assert.match(simulator, /data-sompo-collision-done/);
  assert.match(simulator, /Episódio registrado\./);
  assert.match(simulator, /data-sompo-collision-error/);
  assert.match(simulator, /role="alert"/);
  assert.match(simulator, /postSompoTelemetryEpisodeStart/);
  assert.match(simulator, /postSompoTelemetryEpisodeFinish/);
  assert.match(simulator, /createSompoCollisionScriptSnapshot/);
});

test('durante o roteiro os controles manuais ficam travados e o gerador normal pausa', () => {
  const rangeDisables = simulator.match(/type="range"[\s\S]{0,220}?disabled=\{collisionActive\}/g) || [];
  assert.equal(rangeDisables.length, 5, 'os 5 sliders travam durante o roteiro');
  assert.match(simulator, /if \(isFirebase \|\| collisionActive\) return undefined;/);
  assert.match(simulator, /disabled=\{collisionActive\}\s*\n\s*onClick=\{\(\) => selectScenario/);
});

test('falha de rede no episódio aborta com aviso e mantém o simulador vivo', () => {
  assert.match(simulator, /Falha de rede ao gravar o episódio — gravação abortada\. O simulador continua ativo\./);
  assert.match(simulator, /'aborted'/);
  assert.match(simulator, /O roteiro não começou; o simulador continua ativo\./);
});

test('simulador captura frames nos momentos do roteiro e sobe 1 por request sem derrubar o episódio', () => {
  assert.match(simulator, /SOMPO_COLLISION_FRAME_MOMENTS/);
  assert.match(simulator, /renderer\.render\(scene, camera\);\s*\n\s*\/\/ Captura síncrona no mesmo rAF do render/);
  assert.match(simulator, /toDataURL\('image\/jpeg', COLLISION_FRAME_JPEG_QUALITY\)/);
  assert.match(simulator, /COLLISION_FRAME_LATE_TOLERANCE_MS/);
  assert.match(simulator, /postSompoTelemetryEpisodeFrames\(run\.publicId, \[frame\]\)/);
  assert.match(simulator, /data-sompo-collision-frames-warning/);
  assert.match(simulator, /Falha ao enviar os frames do simulador — o episódio foi gravado, mas a análise seguirá sem evidência visual\./);
  assert.match(simulator, /frames: \{collisionFrameCount\}\/\{SOMPO_COLLISION_FRAME_MOMENTS\.length\}/);
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
  assert.match(page, /Analisar colisão na bancada/);
  assert.match(page, /episodio-colisao-/);
  assert.match(page, /getSompoTelemetryEpisode/);
  assert.match(page, /buildSompoEpisodeMission/);
  assert.match(page, /buildSompoTelemetryMission/);
  assert.match(page, /onEpisodeRecorded=\{setRecordedEpisode\}/);
  assert.match(page, /O episódio registrado não pôde ser lido no servidor\./);
});
