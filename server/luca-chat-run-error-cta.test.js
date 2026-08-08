// Source lock: mid-session LUCA-AI run failure keeps mission draft and re-runs, not personas reload.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(root, '../src/pages/LucaAiPage.tsx'), 'utf8');

test('runMission keeps mission draft until successful completion', () => {
  const start = source.indexOf('async function runMission()');
  assert.ok(start >= 0, 'runMission present');
  // Delimita pela proxima declaracao, nao por contagem de caracteres: a funcao
  // cresce (anexos, etc.) e um slice fixo passa a cortar o bloco catch.
  const end = source.indexOf('const activeTeamPresetId', start);
  assert.ok(end > start, 'runMission end marker present');
  const slice = source.slice(start, end);
  assert.ok(slice.includes("setErrorRetry('run')") || slice.includes('setErrorRetry("run")'), 'run failure marks retry kind');
  assert.ok(slice.includes('if (!data.ok)'), 'errors only when run is not ok');
  // Mission draft must survive success so the original question stays visible in session.
  assert.equal(slice.includes("setMission('')") || slice.includes('setMission("")'), false, 'never clears mission draft in runMission');
  // Early wipe before await must not exist
  const beforeAwait = slice.slice(0, slice.indexOf('await lucaApi.runLucaAi'));
  assert.equal(beforeAwait.includes("setMission('')") || beforeAwait.includes('setMission("")'), false, 'no early mission wipe before API');
});

test('chat notice run failure re-sends mission instead of only reloading personas', () => {
  const start = source.indexOf('data-luca-chat-error');
  assert.ok(start >= 0, 'chat error shell present');
  const slice = source.slice(start, start + 900);
  assert.ok(slice.includes('data-luca-chat-error-kind'), 'error kind marker');
  assert.ok(slice.includes("errorRetry === 'run'") || slice.includes('errorRetry === "run"'), 'branches on run kind');
  assert.ok(slice.includes('void runMission()'), 'retry can re-run mission');
  assert.ok(slice.includes('void loadPersonas()'), 'personas path still available');
  assert.ok(slice.includes('Reenviar missão'), 'run retry label');
  assert.ok(slice.includes('onDismiss='), 'dismiss still present');
  assert.equal(slice.includes('data-luca-activity-empty'), false, 'activity empty not inside error');
  assert.equal(slice.includes('data-luca-canvas-empty'), false, 'canvas empty not inside error');
});

test('Notice supports contextual retry labels', () => {
  const noticeStart = source.indexOf('function Notice(');
  assert.ok(noticeStart >= 0, 'Notice function present');
  const noticeSlice = source.slice(noticeStart, noticeStart + 2400);
  assert.ok(noticeSlice.includes('retryLabel'), 'retryLabel prop');
  assert.ok(noticeSlice.includes('Reenviando'), 'busy label for re-run');
  assert.ok(noticeSlice.includes('data-luca-chat-retry'), 'retry marker kept');
  assert.ok(noticeSlice.includes('data-luca-chat-dismiss'), 'dismiss marker kept');
});
