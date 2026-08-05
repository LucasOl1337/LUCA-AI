import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { stageRelease } from '../deploy/stage-release.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stageSource = fs.readFileSync(path.join(root, 'deploy', 'stage-release.mjs'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const installVm = fs.readFileSync(path.join(root, 'deploy', 'install-vm.sh'), 'utf8');

test('STAGE_RELEASE_V1 marker, scripts, and install-vm contract', () => {
  assert.ok(stageSource.includes('STAGE_RELEASE_V1'));
  assert.ok(stageSource.includes("from './assert-production-deploy.mjs'"));
  assert.ok(stageSource.includes('assertProductionDeployAllowed'));
  assert.ok(stageSource.includes('--force-local'));
  assert.ok(stageSource.includes('source.tar'));
  assert.ok(stageSource.includes('dist.tar'));
  assert.ok(stageSource.includes("tarCreate(outFile, root, ['dist'])"));
  assert.ok(stageSource.includes('state.tar'));
  assert.equal(packageJson.scripts['stage:release'], 'node deploy/stage-release.mjs');
  assert.equal(packageJson.scripts['deploy:stage'], 'node deploy/stage-release.mjs');
  assert.ok(installVm.includes('source.tar'));
  assert.ok(installVm.includes('dist.tar'));
  assert.ok(installVm.includes('state.tar'));
  assert.ok(installVm.includes('--strip-components=1'));
});

test('stageRelease dry-run does not write tarballs and stays open off main', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-stage-dry-'));
  try {
    const result = stageRelease({
      dryRun: true,
      outDir,
      commit: 'testcommit',
      guardOptions: { branch: 'swarm/LUCA-AI/ready-to-ship' },
    });
    assert.equal(result.ok, true);
    assert.equal(result.dryRun, true);
    assert.equal(result.wrote, false);
    assert.equal(result.marker, 'STAGE_RELEASE_V1');
    assert.equal(result.commit, 'testcommit');
    assert.equal(fs.existsSync(result.files.source), false);
    assert.equal(fs.existsSync(result.files.dist), false);
    assert.equal(fs.existsSync(result.files.state), false);
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test('stageRelease fails closed off main without dry-run/override', () => {
  assert.throws(
    () => stageRelease({
      dryRun: false,
      skipBuild: true,
      commit: 'blocked',
      guardOptions: { branch: 'swarm/LUCA-AI/ready-to-ship' },
    }),
    (error) => error?.code === 'DEPLOY_MAIN_ONLY' && /DEPLOY_MAIN_ONLY_V1/.test(error.message),
  );
});

test('CLI dry-run fails closed path still documents marker', () => {
  const script = path.join(root, 'deploy', 'stage-release.mjs');
  const dry = spawnSync(process.execPath, [script, '--dry-run', '--commit', 'cli-dry'], {
    cwd: root,
    env: {
      ...process.env,
      DEPLOY_GIT_BRANCH: 'swarm/LUCA-AI/ready-to-ship',
      ALLOW_NON_MAIN_DEPLOY: '',
      DEPLOY_DRY_RUN: '',
    },
    encoding: 'utf8',
  });
  assert.equal(dry.status, 0);
  assert.match(dry.stdout || '', /STAGE_RELEASE_V1: dry-run ok/);

  const blocked = spawnSync(process.execPath, [script, '--skip-build', '--commit', 'cli-block'], {
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
});
