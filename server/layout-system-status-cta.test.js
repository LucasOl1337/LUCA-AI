// Source lock: Layout shell exposes reconnect CTA when offline (not checking).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(root, '../src/components/Layout.tsx'), 'utf8');

test('layout shell has recovery markers', () => {
  assert.ok(source.includes('data-layout-system-status'), 'status shell');
  assert.ok(source.includes('data-layout-system-retry'), 'retry marker');
  assert.ok(source.includes('needsShellRecovery'), 'needsShellRecovery flag');
  assert.ok(source.includes('retryShellConnection'), 'retry helper');
  assert.ok(source.includes('await refresh()'), 'uses refresh');
  assert.ok(
    source.includes('const { backendReady, connectionState, runtimeMode, state, refresh } = useLuca();'),
    'refresh from useLuca',
  );
});

test('layout recovery only when offline after check', () => {
  assert.ok(
    source.includes('const needsShellRecovery = !checking && !runtimeOnline;'),
    'needsShellRecovery formula',
  );
  assert.ok(source.includes('{needsShellRecovery ? ('), 'conditional recovery chrome');
  assert.ok(source.includes('data-layout-system-status="mobile"'), 'mobile status');
  assert.ok(source.includes('data-layout-system-status="sidebar"'), 'sidebar status');
  assert.ok(source.includes('Tentar reconectar o sistema'), 'aria reconnect label');
  assert.ok(source.includes('tentar novamente'), 'expanded retry hint');

  const footerAt = source.indexOf('data-layout-system-status="sidebar"');
  assert.ok(footerAt >= 0, 'sidebar marker present');
  const footerSlice = source.slice(Math.max(0, footerAt - 120), footerAt + 900);
  assert.ok(footerSlice.includes('data-layout-system-retry'), 'sidebar retry');
  assert.ok(!footerSlice.includes('operationError'), 'no operationError in shell status');

  const mobileAt = source.indexOf('data-layout-system-status="mobile"');
  assert.ok(mobileAt >= 0, 'mobile marker present');
  const mobileSlice = source.slice(mobileAt, mobileAt + 500);
  assert.ok(mobileSlice.includes('data-layout-system-retry'), 'mobile retry nearby');
});
