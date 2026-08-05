import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const installVm = fs.readFileSync(path.join(root, 'deploy', 'install-vm.sh'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const indexSource = fs.readFileSync(path.join(root, 'server', 'index.js'), 'utf8');

test('install-vm has INSTALL_VM_HEALTH_GATE_V1 after session probe', () => {
  assert.ok(installVm.includes('INSTALL_VM_HEALTH_GATE_V1'));
  assert.ok(installVm.includes("http://127.0.0.1:4242/api/health"));
  assert.ok(installVm.includes("require('./package.json').version"));
  assert.ok(installVm.includes('health.version mismatch'));
  assert.ok(installVm.includes("body.service !== \"luca-ai\""));
  assert.ok(installVm.includes("printf 'HEALTH_VERSION=%s\\n' \"$expected_version\""));

  const sessionIdx = installVm.indexOf('/api/auth/session');
  const healthIdx = installVm.indexOf('/api/health');
  const stateIdx = installVm.indexOf('/api/state');
  assert.ok(sessionIdx >= 0);
  assert.ok(healthIdx > sessionIdx, 'health probe after session readiness');
  assert.ok(stateIdx > healthIdx, 'private state 401 check after health gate');
});

test('install-vm health gate requires package version and Express health field', () => {
  assert.equal(typeof packageJson.version, 'string');
  assert.ok(packageJson.version.trim());
  assert.ok(indexSource.includes('version: PACKAGE_VERSION'));
  assert.ok(installVm.includes('test -n "$expected_version"'));
  assert.equal(installVm.includes('0.9.5'), false);
});
