import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  assertProductionDeployAllowed,
  resolveGitBranch,
} from '../deploy/assert-production-deploy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const guardSource = fs.readFileSync(path.join(root, 'deploy', 'assert-production-deploy.mjs'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('DEPLOY_MAIN_ONLY_V1 marker and package script exist', () => {
  assert.ok(guardSource.includes('DEPLOY_MAIN_ONLY_V1'));
  assert.ok(guardSource.includes('ALLOW_NON_MAIN_DEPLOY'));
  assert.ok(guardSource.includes('DEPLOY_DRY_RUN'));
  assert.equal(packageJson.scripts['deploy:guard'], 'node deploy/assert-production-deploy.mjs');
  assert.equal(packageJson.scripts['deploy:check'], 'node deploy/assert-production-deploy.mjs');
});

test('assertProductionDeployAllowed allows main', () => {
  const result = assertProductionDeployAllowed({}, { branch: 'main' });
  assert.equal(result.ok, true);
  assert.equal(result.branch, 'main');
  assert.equal(result.dryRun, false);
  assert.equal(result.marker, 'DEPLOY_MAIN_ONLY_V1');
});

test('assertProductionDeployAllowed blocks non-main without override', () => {
  assert.throws(
    () => assertProductionDeployAllowed({}, { branch: 'swarm/LUCA-AI/ready-to-ship' }),
    (error) => error?.code === 'DEPLOY_MAIN_ONLY' && /DEPLOY_MAIN_ONLY_V1/.test(error.message),
  );
});

test('assertProductionDeployAllowed allows override and dry-run off main', () => {
  const allowed = assertProductionDeployAllowed(
    { ALLOW_NON_MAIN_DEPLOY: '1' },
    { branch: 'feature/x' },
  );
  assert.equal(allowed.ok, true);
  assert.equal(allowed.allow, true);

  const dry = assertProductionDeployAllowed(
    { DEPLOY_DRY_RUN: '1' },
    { branch: 'feature/x' },
  );
  assert.equal(dry.ok, true);
  assert.equal(dry.dryRun, true);
});

test('resolveGitBranch prefers DEPLOY_GIT_BRANCH', () => {
  assert.equal(resolveGitBranch({ DEPLOY_GIT_BRANCH: 'main' }), 'main');
});

test('CLI fails closed off main', () => {
  const script = path.join(root, 'deploy', 'assert-production-deploy.mjs');
  const blocked = spawnSync(process.execPath, [script], {
    cwd: root,
    env: {
      ...process.env,
      DEPLOY_GIT_BRANCH: 'swarm/LUCA-AI/ready-to-ship',
      ALLOW_NON_MAIN_DEPLOY: '',
      DEPLOY_DRY_RUN: '',
    },
    encoding: 'utf8',
  });
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr || blocked.stdout || '', /DEPLOY_MAIN_ONLY_V1/);

  const ok = spawnSync(process.execPath, [script], {
    cwd: root,
    env: { ...process.env, DEPLOY_GIT_BRANCH: 'main' },
    encoding: 'utf8',
  });
  assert.equal(ok.status, 0);
  assert.match(ok.stdout || '', /DEPLOY_MAIN_ONLY_V1: ok/);
});
