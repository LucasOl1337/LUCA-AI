// Source lock: composer must accept typing/paste and stay readable for long missions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(root, '../src/pages/LucaAiPage.tsx'), 'utf8');
const css = readFileSync(join(root, '../src/index.css'), 'utf8');

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > start, `missing ${endMarker} after ${startMarker}`);
  return source.slice(start, end);
}

test('Enter only submits when canRun — otherwise typing/newlines still work', () => {
  const onKey = sliceBetween(page, 'function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>)', 'function onPaste');
  assert.ok(onKey.includes('if (!canRun) return'), 'Enter without ready team must not preventDefault');
  assert.ok(onKey.includes('event.preventDefault()'), 'Enter still submits when ready');
  assert.ok(onKey.includes('if (!canRun) return') && onKey.indexOf('if (!canRun) return') < onKey.indexOf('event.preventDefault()'),
    'guard precedes preventDefault');
});

test('paste never blocks text/plain; only pure image/file paste is intercepted', () => {
  const onPaste = sliceBetween(page, 'function onPaste(event: React.ClipboardEvent<HTMLTextAreaElement>)', 'function onDragEnter');
  assert.ok(onPaste.includes("getData('text/plain')") || onPaste.includes('getData("text/plain")'), 'reads plain text');
  assert.ok(onPaste.includes('if (plain.trim()) return'), 'text paste must not preventDefault');
  assert.ok(onPaste.includes('event.preventDefault()'), 'file-only paste still attaches');
  assert.ok(onPaste.indexOf('if (plain.trim()) return') < onPaste.indexOf('event.preventDefault()'),
    'text short-circuit before preventDefault');
});

test('composer auto-grows for long mission drafts', () => {
  assert.ok(page.includes('el.scrollHeight'), 'auto-resize uses scrollHeight');
  assert.ok(page.includes('inputRef'), 'textarea ref for height sync');
  assert.match(css, /\.luca-ai-composer-input\s*\{[\s\S]*?min-height:\s*44px/, 'taller min height');
  assert.match(css, /\.luca-ai-composer-input\s*\{[\s\S]*?max-height:\s*240px/, 'taller max height');
  assert.match(css, /\.luca-ai-composer-input\s*\{[\s\S]*?font-size:\s*15px/, 'readable font size');
});

test('draft mission is pinned on canvas so long SOMPO text is readable', () => {
  assert.ok(page.includes("data-luca-mission-pin-kind={hasDraftOnlyMission ? 'draft' : 'question'}"),
    'draft vs question pin kinds');
  assert.ok(page.includes('Missão no compositor'), 'draft label');
  // Pin no longer gated on transcript/finalResult only.
  const pinRegion = sliceBetween(page, '/* Missão legível no canvas', 'supportingTranscript.length ?');
  assert.ok(pinRegion.includes('{originalMission && ('), 'shows whenever mission exists');
  assert.equal(pinRegion.includes('supportingTranscript.length > 0 || finalResult'), false,
    'draft pin not gated on responses');
});

test('send without ready team opens configure panel instead of dead disabled control', () => {
  assert.ok(page.includes('onConfigureTeam'), 'configure hook');
  assert.ok(page.includes('setTeamPanelOpen(true)'), 'opens team panel');
  assert.ok(page.includes('data-luca-composer-configure'), 'status is actionable');
  assert.ok(page.includes('is-needs-team'), 'send affordance when incomplete');
  // Play button no longer fully disabled when !canRun (was blocking the only CTA).
  assert.equal(page.includes('disabled={!canRun}'), false, 'must not hard-disable when team incomplete');
  assert.ok(
    /disabled=\{running\}\s*\n\s*className=\{`luca-ai-send-button\$\{canRun \? '' : ' is-needs-team'\}`\}/.test(page),
    'send button only disabled while running and shows needs-team',
  );
  assert.ok(page.includes('onConfigureTeam?.()'), 'submit routes incomplete runs to configure');
});
