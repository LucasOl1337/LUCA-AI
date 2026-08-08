// Source lock: depth selector, REST payload and phase labels must stay wired end to end.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../src/pages/LucaAiPage.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/lib/api.ts', import.meta.url), 'utf8');
const types = readFileSync(new URL('../src/lib/types.ts', import.meta.url), 'utf8');
const serverIndex = readFileSync(new URL('./index.js', import.meta.url), 'utf8');

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `${startMarker} present`);
  assert.ok(end > start, `${endMarker} follows ${startMarker}`);
  return source.slice(start, end);
}

test('individual REST client accepts and sends depth', () => {
  const client = between(api, 'runLucaAiIndividualResolution:', 'listEvents:');
  assert.match(client, /depth\??:\s*LucaAiIndividualDepth/);
  assert.match(client, /mode:\s*'individual'[\s\S]*depth/);
});

test('depth and reply phases are typed as closed unions', () => {
  assert.match(types, /LucaAiIndividualDepth\s*=\s*1\s*\|\s*2\s*\|\s*3/);
  assert.match(types, /LucaAiPersonaTeamPhase\s*=\s*'blind'\s*\|\s*'revision'\s*\|\s*'judge'/);
  const reply = between(types, 'export interface LucaAiPersonaTeamReply', 'export interface LucaAiWorkflowAssignment');
  const step = between(types, 'export interface LucaAiPersonaTeamStep', 'export interface LucaAiChatAttachment');
  assert.match(reply, /phase\?:\s*LucaAiPersonaTeamPhase/);
  assert.match(step, /phase\?:\s*LucaAiPersonaTeamPhase/);
});

test('individual panel keeps judge then participants then presets and exposes three depth options', () => {
  const panel = between(page, 'function LucaIndividualPanel(', 'function LucaWorkflowPanel(');
  const judge = panel.indexOf('INDIVIDUAL_PICKER_CONFIGS.judge');
  const participants = panel.indexOf('INDIVIDUAL_PICKER_CONFIGS.participants');
  const presets = panel.indexOf('<PresetGallery');
  assert.ok(judge >= 0 && participants > judge && presets > participants, 'judge → participants → presets');
  assert.match(panel, /data-luca-individual-depth/);
  assert.match(page, /value:\s*1,\s*label:\s*'1 Padrão'/);
  assert.match(page, /value:\s*2,\s*label:\s*'2 Deliberação'/);
  assert.match(page, /value:\s*3,\s*label:\s*'3 Máx\.'/);
});

test('selected depth reaches the individual run and phases render as short labels', () => {
  const runMission = between(page, 'async function runMission()', 'const activeTeamPresetId');
  assert.match(page, /useState<LucaAiIndividualDepth>\(1\)/);
  assert.match(runMission, /runLucaAiIndividualResolution\([\s\S]*individualDepth/);
  assert.match(page, /blind:\s*'Cega'/);
  assert.match(page, /revision:\s*'Revisão'/);
  assert.match(page, /judge:\s*'Juiz'/);
});

test('individual runtime applies the shared depth budgets to participants, revisions and judge', () => {
  const individual = between(serverIndex, "} else if (input.mode === 'individual')", '} else {');
  assert.match(individual, /DEPTH_BUDGETS\[input\.depth\]\s*\|\|\s*DEPTH_BUDGETS\[1\]/);
  assert.ok((individual.match(/maxTokens:\s*budgets\.participant/g) || []).length >= 2, 'participant and revision budgets');
  assert.match(individual, /maxTokens:\s*budgets\.judge/);
});
