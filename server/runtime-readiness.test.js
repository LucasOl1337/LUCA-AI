import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { runRuntimeReadinessChecks } from './runtime-readiness.js';

test('runRuntimeReadinessChecks aprova quando runtimes e arquivos base existem', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'luca-readiness-ok-'));
  await fs.writeFile(path.join(rootDir, 'heartbeat_monitor.py'), 'print("ok")\n', 'utf8');

  const report = await runRuntimeReadinessChecks({
    rootDir,
    probeCommand: async (command, args) => ({
      ok: true,
      stdout: command.includes('node') ? 'v22.0.0' : 'Python 3.12.0',
      stderr: '',
      args,
    }),
  });

  assert.equal(report.ok, true);
  assert.equal(report.checks.every((check) => check.ok), true);
  assert.equal(report.checks.some((check) => check.id === 'runtime:state-write'), true);
});

test('runRuntimeReadinessChecks falha quando python ou heartbeat script estao ausentes', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'luca-readiness-fail-'));

  const report = await runRuntimeReadinessChecks({
    rootDir,
    probeCommand: async (command) => ({
      ok: !String(command).includes('py'),
      stdout: String(command).includes('node') ? 'v22.0.0' : '',
      stderr: String(command).includes('py') ? 'python missing' : '',
      error: String(command).includes('py') ? 'spawn py ENOENT' : '',
    }),
  });

  assert.equal(report.ok, false);
  assert.equal(report.checks.some((check) => check.id === 'runtime:python' && check.ok === false), true);
  assert.equal(report.checks.some((check) => check.id === 'runtime:heartbeat-script' && check.ok === false), true);
});
