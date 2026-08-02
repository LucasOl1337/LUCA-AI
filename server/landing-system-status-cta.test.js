// Source lock: landing system status exposes recovery CTA when offline/error.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(root, '../src/pages/LandingPage.tsx'), 'utf8');

test('landing system status has recovery markers', () => {
  assert.ok(source.includes('data-landing-system-status'), 'status shell');
  assert.ok(source.includes('data-landing-system-error'), 'error shell marker');
  assert.ok(source.includes('data-landing-system-retry'), 'retry marker');
  assert.ok(source.includes('Tentar novamente'), 'retry label');
  assert.ok(source.includes("role={needsRecovery ? 'alert' : undefined}"), 'alert role when recovery');
  assert.ok(source.includes('data-tone={statusTone}'), 'tone on status');
  assert.ok(source.includes('refresh'), 'uses refresh');
  assert.ok(source.includes('clearOperationError'), 'can clear operation error');
});

test('landing recovery CTA only when offline or operationError', () => {
  assert.ok(
    source.includes('const needsRecovery = Boolean(operationError) || (!checking && !runtimeOnline);'),
    'needsRecovery formula',
  );
  assert.ok(source.includes('{needsRecovery && ('), 'conditional actions');
  const actionsAt = source.indexOf('data-landing-system-actions');
  assert.ok(actionsAt >= 0, 'actions container');
  const slice = source.slice(actionsAt - 120, actionsAt + 700);
  assert.ok(slice.includes('data-landing-system-retry'), 'retry in actions');
  assert.ok(slice.includes('btn-primary'), 'retry is primary');
  assert.ok(slice.includes('data-landing-system-dismiss'), 'dismiss for operationError');
  assert.ok(slice.includes('Dispensar'), 'dismiss label');
  assert.ok(slice.includes('{operationError && ('), 'dismiss gated by operationError');
});
