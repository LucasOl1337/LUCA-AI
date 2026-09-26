import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const executable = path.join(root, 'bin/luca.js');

export async function temporary(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'luca-cli-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

export function cli(args, { input = '', env = {}, cwd = root, signal, onStderr } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [executable, ...args], {
      cwd, signal, env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, ...env }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout = [], stderr = [];
    child.stdout.on('data', chunk => stdout.push(chunk));
    child.stderr.on('data', chunk => { stderr.push(chunk); onStderr?.(chunk.toString(), child); });
    child.once('error', reject);
    child.once('close', code => {
      const out = Buffer.concat(stdout), err = Buffer.concat(stderr).toString();
      let json;
      try { json = JSON.parse(out.toString()); } catch { /* binary/NDJSON */ }
      resolve({ code, stdout: out.toString(), bytes: out, stderr: err, json });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

export async function runtime(t, directory) {
  const probe = createServer().listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, ['--import', './scripts/offline-network.mjs', 'server/index.js'], {
    cwd: root,
    env: {
      PATH: process.env.PATH, TMPDIR: process.env.TMPDIR,
      HOST: '127.0.0.1', PORT: String(port), LUCA_DATA_DIR: path.join(directory, 'runtime'),
      LUCA_SOMPO_OFFLINE: 'true', KAMUI_BASE: 'http://127.0.0.1:9', ROUTER_BASE_URL: 'http://127.0.0.1:9/v1',
      KAMUI_TIMEOUT_MS: '100', ROUTER_TIMEOUT_MS: '100', LUCA_ADMIN_EMAILS: 'admin@cli.test',
      LUCA_MACHINE_TOKEN: 'cli-test-machine-token-local-only-123456789',
    }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', chunk => { log += chunk; });
  child.stderr.on('data', chunk => { log += chunk; });
  t.after(async () => { if (child.exitCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); } });
  const url = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 150; attempt++) {
    try { if ((await fetch(`${url}/api/health`)).ok) return url; } catch { /* starting */ }
    if (child.exitCode !== null) throw new Error(`Runtime exited: ${log.slice(-3000)}`);
    await delay(100);
  }
  throw new Error(`Runtime did not start: ${log.slice(-3000)}`);
}
