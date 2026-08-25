// Source lock: team and individual persona replies share one presentation module.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../src/pages/LucaAiPage.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `${startMarker} present`);
  assert.ok(end > start, `${endMarker} follows ${startMarker}`);
  return source.slice(start, end);
}

test('canvas routes every persona reply through the same response card', () => {
  const canvas = between(page, 'export function LucaMissionCanvas(', 'function VisualArtifactLightbox(');
  assert.match(canvas, /entry\.role === 'persona'[\s\S]*<PersonaResponseCard/);
  assert.doesNotMatch(canvas, /entry\.phase === 'blind'|entry\.phase === 'revision'|entry\.phase === 'consensus'/);
  assert.match(canvas, /<PersonaResponseCard[\s\S]*final/);
  assert.doesNotMatch(canvas, /<IndividualResponseCard|<FinalDisplayCard/);
});

test('shared response module owns collapsed replies and expanded final delivery', () => {
  const card = between(page, 'function PersonaResponseCard(', 'function TranscriptEntry(');
  assert.match(card, /if \(final\)/);
  assert.match(card, /<motion\.article/);
  assert.match(card, /<motion\.details/);
  assert.match(card, /<RichMessageBody content=\{entry\.content\}/);
  assert.match(card, /entry\.phase \? <PhaseBadge[\s\S]*entry\.stage \? <StageBadge/);
  assert.match(styles, /\.luca-ai-response\[open\] \.luca-ai-response-chevron/);
  assert.doesNotMatch(styles, /luca-ai-individual-response|luca-ai-individual-chevron/);
});

test('running persona jobs merge progress into the visible transcript', () => {
  assert.match(page, /function mergeTranscriptEntries/);
  assert.match(page, /const applyRunProgress = useCallback/);
  assert.ok((page.match(/applyRunProgress\(progress\)/g) || []).length >= 3);
});

test('duration label distinguishes operator send time from persona response time', () => {
  const duration = between(page, 'function MessageDuration(', 'function PersonaResponseCard(');
  assert.match(duration, /entry\.role === 'operator' \? 'Tempo de envio' : 'Tempo de resposta'/);
  assert.match(duration, /aria-label=\{measured \? `\$\{metricLabel\}: \$\{duration\}`/);
});
