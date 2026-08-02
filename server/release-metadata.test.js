import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PACKAGE_VERSION, readProjectVersion } from './config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const indexSource = fs.readFileSync(path.join(root, 'server', 'index.js'), 'utf8');
const configSource = fs.readFileSync(path.join(root, 'server', 'config.js'), 'utf8');

test('PACKAGE_VERSION le package.json sem hardcode', () => {
  assert.equal(typeof packageJson.version, 'string');
  assert.ok(packageJson.version.trim());
  assert.equal(PACKAGE_VERSION, packageJson.version);
  assert.equal(readProjectVersion(root), packageJson.version);
  assert.equal(configSource.includes(`version: "${packageJson.version}"`), false);
  assert.equal(indexSource.includes(`version: "${packageJson.version}"`), false);
});

test('/api/health expoe version a partir de PACKAGE_VERSION', () => {
  assert.ok(indexSource.includes('PACKAGE_VERSION'));
  assert.ok(indexSource.includes("app.get('/api/health'"));
  assert.ok(indexSource.includes('version: PACKAGE_VERSION'));
  assert.match(indexSource, /version:\s*PACKAGE_VERSION/);
});
