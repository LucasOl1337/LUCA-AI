// Source lock: SOMPO mission pin shows the human summary; workflow stages collapse.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(root, '../src/pages/LucaAiPage.tsx'), 'utf8');
const styles = readFileSync(join(root, '../src/index.css'), 'utf8');

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `${startMarker} present`);
  assert.ok(end > start, `${endMarker} follows ${startMarker}`);
  return source.slice(start, end);
}

test('pin da missão renderiza o resumo e esconde o dossiê técnico', () => {
  assert.match(page, /SOMPO_MISSION_DOSSIER_DELIMITER/);
  assert.match(page, /function splitSompoMissionLayers/);
  assert.match(page, /function SompoMissionReadable/);

  const pin = between(page, 'data-luca-mission-pin', 'data-luca-mission-ledger');
  assert.match(pin, /<SompoMissionReadable text=\{originalMission\}/);
  assert.doesNotMatch(pin, /\{originalMission\}<\/p>/);

  const readable = between(page, 'function SompoMissionReadable(', 'type TranscriptCluster');
  assert.match(readable, /Dossiê técnico completo/);
  assert.match(readable, /<details className="luca-ai-mission-dossier"/);
  assert.doesNotMatch(readable, /defaultOpen|open=\{true\}/);
  assert.match(readable, /<pre className="luca-ai-mission-dossier-body luca-pre">\{dossier\}<\/pre>/);
  assert.match(readable, /if \(!dossier\)/);

  const operator = between(page, 'function TranscriptEntry(', 'function StageBadge(');
  assert.match(operator, /<SompoMissionReadable text=\{entry.content\} compact \/>/);

  assert.match(styles, /\.luca-ai-mission-dossier\s*\{/);
  assert.match(styles, /\.luca-ai-mission-dossier-body\s*\{[\s\S]*?font-size:\s*11px/);
});

test('etapas do workflow agrupam no canvas com cabeçalho colapsado', () => {
  const canvas = between(page, 'export function LucaMissionCanvas(', 'function VisualArtifactLightbox(');
  assert.match(canvas, /data-luca-stage-group/);
  assert.match(canvas, /clusterTranscriptByStage/);
  assert.match(canvas, /useState<Record<string, boolean>>\(\{\}\)/);
  assert.match(canvas, /operationMode === 'team'/);
  assert.match(canvas, /isRunningStage \|\| Boolean\(expandedStages\[groupId\]\)/);
  assert.match(canvas, /<details[\s\S]*className="luca-ai-stage-group"/);
  assert.match(canvas, /personaCount === 1 \? 'persona' : 'personas'/);
  assert.match(canvas, /formatPersonaRunDuration\(durationMs\)/);
  assert.match(styles, /\.luca-ai-stage-group\s*\{/);
  assert.match(styles, /\.luca-ai-stage-group-summary\s*\{/);
});
