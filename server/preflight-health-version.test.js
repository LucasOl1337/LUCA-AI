import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const preflight = fs.readFileSync(path.join(root, 'shared', 'preflight.js'), 'utf8');
const preflightTest = fs.readFileSync(path.join(root, 'server', 'preflight.test.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'server', 'index.js'), 'utf8');

test('PREFLIGHT_HEALTH_VERSION_V1 requires health.version before live mission', () => {
  assert.ok(preflight.includes('PREFLIGHT_HEALTH_VERSION_V1'));
  assert.ok(preflight.includes('version ausente no /api/health'));
  assert.ok(preflight.includes('body?.version'));
  assert.ok(preflight.includes('• v${version}') || preflight.includes('` • v${version}`') || preflight.includes('v${version}'));
  assert.ok(indexSource.includes('version: PACKAGE_VERSION'));
  assert.ok(preflightTest.includes("version: '0.2.0'"));
  assert.ok(preflightTest.includes('omite version'));
});
