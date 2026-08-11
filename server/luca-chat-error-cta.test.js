// Source lock: mid-session LUCA-AI chat error notice exposes retry/dismiss CTAs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(root, '../src/pages/LucaAiPage.tsx'), 'utf8');

test('chat notice error shell has recoverable CTAs', () => {
  assert.ok(source.includes('data-luca-chat-error'), 'error shell marker');
  // Tone é dinâmico: 'error' quando há retry acionável, 'warning' para aviso solto.
  assert.ok(
    source.includes('data-tone="error"')
    || source.includes("data-tone='error'")
    || /data-tone=\{[^}]*'error'/.test(source),
    'error tone',
  );
  assert.ok(source.includes('role="alert"') || source.includes("role='alert'"), 'alert role');
  assert.ok(source.includes('data-luca-chat-retry'), 'retry button marker');
  assert.ok(source.includes('data-luca-chat-dismiss'), 'dismiss button marker');
  assert.ok(source.includes('Tentar novamente'), 'retry label');
  assert.ok(source.includes('Dispensar'), 'dismiss label');
  assert.ok(
    source.includes('onRetry={() => void loadPersonas()}') || source.includes('void loadPersonas()'),
    'retry reloads personas',
  );
  assert.ok(
    source.includes('onDismiss={() => setError(null)}') || source.includes('setError(null)'),
    'dismiss clears error',
  );
});

test('Notice recovery block is not bare warning text', () => {
  const start = source.indexOf('data-luca-chat-error');
  assert.ok(start >= 0, 'chat error shell present');
  // Call-site is short: props only; CTAs live in Notice body.
  // 1100 chars cobre o handler de retry com os tres ramos (run/personas/edge).
  const slice = source.slice(start, start + 1100);
  assert.ok(slice.includes('onRetry='), 'retry prop on Notice');
  assert.ok(slice.includes('onDismiss='), 'dismiss prop on Notice');
  assert.ok(slice.includes('role="alert"') || slice.includes("role='alert'"), 'alert on shell');
  assert.equal(slice.includes('data-luca-canvas-empty'), false, 'canvas empty not inside error');
  assert.equal(slice.includes('data-luca-picker-empty'), false, 'picker empty not inside error');

  const noticeStart = source.indexOf('function Notice(');
  assert.ok(noticeStart >= 0, 'Notice function present');
  const noticeSlice = source.slice(noticeStart, noticeStart + 2200);
  assert.ok(noticeSlice.includes('data-luca-chat-error-actions'), 'actions row in Notice');
  assert.ok(noticeSlice.includes('data-luca-chat-retry'), 'retry inside Notice');
  assert.ok(noticeSlice.includes('data-luca-chat-dismiss'), 'dismiss inside Notice');
  assert.ok(noticeSlice.includes('theme.errorBg'), 'error chrome when recoverable');
  assert.ok(noticeSlice.includes('btn-primary'), 'primary chrome');
});
