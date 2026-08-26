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

test('bancada analisa o episódio completo e preserva o fluxo sem episódio', () => {
  assert.match(page, /Analisar colisão na bancada/);
  assert.match(page, /episodio-colisao-/);
  assert.match(page, /getSompoTelemetryEpisode/);
  assert.match(page, /buildSompoEpisodeMission/);
  assert.match(page, /buildSompoTelemetryMission/);
  assert.match(page, /onEpisodeRecorded=\{setRecordedEpisode\}/);
  assert.match(page, /O episódio registrado não pôde ser lido no servidor\./);
});
