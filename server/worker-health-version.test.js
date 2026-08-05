import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RELEASE_VERSION } from '../shared/release-version.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const worker = fs.readFileSync(path.join(rootDir, 'worker', 'src', 'index.js'), 'utf8');
const preflight = fs.readFileSync(path.join(rootDir, 'shared', 'preflight.js'), 'utf8');
const releaseVersionSource = fs.readFileSync(path.join(rootDir, 'shared', 'release-version.js'), 'utf8');

test('RELEASE_VERSION_SINGLE_SOURCE_V1 matches package.json', () => {
  assert.equal(typeof packageJson.version, 'string');
  assert.ok(packageJson.version.trim());
  assert.equal(RELEASE_VERSION, packageJson.version);
  assert.ok(releaseVersionSource.includes('RELEASE_VERSION_SINGLE_SOURCE_V1'));
  assert.ok(releaseVersionSource.includes(`'${packageJson.version}'`) || releaseVersionSource.includes(`"${packageJson.version}"`));
});

test('WORKER_HEALTH_VERSION_V1 exposes RELEASE_VERSION on cloud /api/health', () => {
  assert.ok(worker.includes('WORKER_HEALTH_VERSION_V1'));
  assert.ok(worker.includes("from '../../shared/release-version.js'"));
  assert.ok(worker.includes('version: RELEASE_VERSION'));
  assert.ok(worker.includes("pathname === '/api/health'"));
  const probeIdx = worker.indexOf('runCloudPreflight');
  assert.ok(probeIdx >= 0);
  const slice = worker.slice(probeIdx, probeIdx + 2800);
  assert.ok(slice.includes('version: RELEASE_VERSION'));
});

test('PREFLIGHT_HEALTH_VERSION_ALWAYS_V1 ignores custom detail bypass', () => {
  assert.ok(preflight.includes('PREFLIGHT_HEALTH_VERSION_ALWAYS_V1'));
  assert.ok(preflight.includes('PREFLIGHT_HEALTH_VERSION_V1'));
  assert.ok(preflight.includes('version ausente no /api/health'));
  const alwaysIdx = preflight.indexOf('PREFLIGHT_HEALTH_VERSION_ALWAYS_V1');
  const detailGateIdx = preflight.indexOf('if (!detail)', alwaysIdx);
  assert.ok(alwaysIdx >= 0);
  assert.ok(detailGateIdx > alwaysIdx, 'always-version gate before detail branch');
});
