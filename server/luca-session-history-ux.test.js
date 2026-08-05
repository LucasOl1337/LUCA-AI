// Source lock: session keeps original question after verdict; mode switch does not wipe transcript.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(root, '../src/pages/LucaAiPage.tsx'), 'utf8');

function sliceFn(name) {
  const start = source.indexOf(name);
  assert.ok(start >= 0, `${name} present`);
  return source.slice(start, start + 7000);
}

test('runMission keeps mission draft after successful completion', () => {
  const slice = sliceFn('async function runMission()');
  assert.ok(slice.includes('if (!data.ok)'), 'errors only on !data.ok');
  assert.ok(slice.includes("role: 'operator'") || slice.includes('role: "operator"'), 'operator transcript entry kept');
  // Success path must not wipe the draft (composer + missionDraft persist).
  const successRegion = slice.slice(
    slice.indexOf('if (!data.ok)'),
    slice.indexOf('} catch (err)'),
  );
  assert.equal(
    successRegion.includes("setMission('')") || successRegion.includes('setMission("")'),
    false,
    'no setMission clear on success path',
  );
});

test('mode switch does not call clearTranscript', () => {
  assert.ok(source.includes('function switchOperationMode'), 'switchOperationMode helper');
  const switchSlice = source.slice(
    source.indexOf('function switchOperationMode'),
    source.indexOf('async function runMission()'),
  );
  assert.equal(switchSlice.includes('clearTranscript()'), false, 'switch must not clear transcript');
  assert.ok(switchSlice.includes('setProcessEvents([])'), 'only clears live process events');
  assert.ok(
    source.includes("onClick={() => switchOperationMode('team')}")
    || source.includes('onClick={() => switchOperationMode("team")}'),
    'team tab uses switchOperationMode',
  );
  assert.ok(
    source.includes("onClick={() => switchOperationMode('individual')}")
    || source.includes('onClick={() => switchOperationMode("individual")}'),
    'individual tab uses switchOperationMode',
  );
  // Toolbar mode buttons must not inline clearTranscript.
  const toolbar = source.slice(
    source.indexOf('aria-label="Modo de operação"'),
    source.indexOf('aria-label="Visualização da bancada"'),
  );
  assert.equal(toolbar.includes('clearTranscript()'), false, 'toolbar mode buttons do not wipe chat');
});

test('canvas pins original mission question after responses', () => {
  assert.ok(source.includes('data-luca-mission-pin'), 'mission pin marker');
  assert.ok(source.includes('Pergunta original'), 'pin label');
  assert.ok(source.includes('function lastOperatorMission'), 'reads operator transcript entry');
  assert.ok(source.includes('missionDraft={mission}'), 'passes draft into canvas');
  assert.ok(source.includes('missionDraft?: string'), 'canvas accepts missionDraft prop');
});

test('session history is API-backed and survives F5 paths', () => {
  // Must flush immediately on run, not only after debounce when !running.
  assert.ok(source.includes('flushSessionNow'), 'immediate flush helper');
  assert.ok(source.includes('flushSessionNow(ownerSessionId'), 'runMission flushes to API');
  assert.ok(source.includes('keepalive: true'), 'unload flush uses keepalive');
  // Persist must not be gated on running (that blocked mid-run F5).
  const persistSlice = source.slice(
    source.indexOf('// Debounce while typing/configuring'),
    source.indexOf('// Debounce while typing/configuring') + 900,
  );
  assert.ok(persistSlice.includes('Do NOT gate on `running`'), 'documents no running gate');
  assert.equal(persistSlice.includes('|| running'), false, 'debounce path not blocked by running');
  // Loading path must not wipe canvas while session body is in flight.
  const applyEffect = source.slice(
    source.indexOf('// Wait for full session body without wiping the canvas'),
    source.indexOf('// Wait for full session body without wiping the canvas') + 500,
  );
  assert.equal(applyEffect.includes("setTranscript([])"), false, 'no wipe while waiting for session body');
  // Legacy localStorage cleanup must not clear React transcript on mount.
  const cleanSlice = source.slice(
    source.indexOf('// Only purge legacy localStorage keys'),
    source.indexOf('// Only purge legacy localStorage keys') + 350,
  );
  assert.equal(cleanSlice.includes('setTranscript([])'), false, 'clean-ui effect does not wipe transcript');
});
