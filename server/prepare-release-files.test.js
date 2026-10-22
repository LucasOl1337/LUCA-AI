import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('extracted private dist becomes readable to service without widening private files', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-release-permissions-'));
  try {
    fs.chmodSync(tmp, 0o755);
    const build = path.join(tmp, 'build');
    const release = path.join(tmp, 'release');
    fs.mkdirSync(path.join(build, 'dist', 'assets'), { recursive: true });
    fs.mkdirSync(release);
    fs.chmodSync(release, 0o755);
    const content = '<html>release probe</html>';
    fs.writeFileSync(path.join(build, 'dist', 'index.html'), content, { mode: 0o600 });
    fs.writeFileSync(path.join(build, 'dist', 'assets', 'voice.js'), 'export {};', { mode: 0o600 });
    fs.chmodSync(path.join(build, 'dist'), 0o700);
    fs.chmodSync(path.join(build, 'dist', 'assets'), 0o700);
    const tar = path.join(tmp, 'dist.tar');
    assert.equal(spawnSync('tar', ['-cf', tar, '-C', build, 'dist']).status, 0);
    assert.equal(spawnSync('tar', ['-xf', tar, '-C', release]).status, 0);
    const mode = (rel) => fs.statSync(path.join(release, rel)).mode & 0o777;
    assert.equal(mode('dist'), 0o700, 'reproduces the failed deployment archive');
    assert.equal(mode('dist/index.html'), 0o600);
    const distinctUser = process.env.LUCA_TESTE_USUARIO_DISTINTO;
    const asDistinct = (file) => spawnSync('sudo', ['-n', '-u', distinctUser, '/usr/bin/test', '-r', file]);
    if (distinctUser) {
      const identity = spawnSync('sudo', ['-n', '-u', distinctUser, 'id', '-u'], { encoding: 'utf8' });
      assert.equal(identity.status, 0, identity.stderr);
      assert.notEqual(Number(identity.stdout.trim()), process.getuid());
      assert.equal(asDistinct(path.join(release, 'dist', 'index.html')).status, 1);
    }
    fs.writeFileSync(path.join(release, '.env'), 'private fixture', { mode: 0o600 });
    fs.mkdirSync(path.join(release, 'server'), { mode: 0o700 });
    fs.writeFileSync(path.join(release, 'server', 'index.js'), 'export {};', { mode: 0o600 });
    fs.mkdirSync(path.join(release, 'bin'), { mode: 0o700 });
    fs.writeFileSync(path.join(release, 'bin', 'probe.sh'), '#!/bin/sh\nexit 0\n', { mode: 0o700 });
    const result = spawnSync('bash', [path.join(root, 'deploy', 'prepare-release-files.sh'), release], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(mode('dist'), 0o755);
    assert.equal(mode('dist/assets'), 0o755);
    assert.equal(mode('dist/index.html'), 0o644);
    assert.equal(mode('dist/assets/voice.js'), 0o644);
    assert.equal(mode('server'), 0o755);
    assert.equal(mode('server/index.js'), 0o644);
    assert.equal(mode('bin/probe.sh'), 0o755, 'preserves executable code');
    assert.equal(fs.readFileSync(path.join(release, 'dist', 'index.html'), 'utf8'), content);
    assert.equal(mode('.env'), 0o600);
    if (distinctUser) {
      for (const file of ['dist/index.html', 'dist/assets/voice.js', 'server/index.js']) {
        assert.equal(asDistinct(path.join(release, file)).status, 0, file);
      }
      assert.equal(asDistinct(path.join(release, '.env')).status, 1);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

function runHealth(url, version, seconds) {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [path.join(root, 'deploy', 'wait-runtime-health.sh'), url, version, String(seconds)]);
    let stdout = '', stderr = '';
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

test('health wait tolerates initial connection refusal then requires matching version', async () => {
  const server = http.createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true, service: 'luca-ai', version: 'fixture-1' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  const waiting = runHealth(`http://127.0.0.1:${port}/api/health`, 'fixture-1', 5);
  await new Promise((resolve) => setTimeout(resolve, 300));
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  try {
    const result = await waiting;
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).version, 'fixture-1');
    const mismatch = await runHealth(`http://127.0.0.1:${port}/api/health`, 'wrong-version', 1);
    assert.equal(mismatch.status, 1);
    assert.match(mismatch.stderr, /após 1s/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('installer tests runtime entry files as service user before replacing current', () => {
  const installer = fs.readFileSync(path.join(root, 'deploy', 'install-vm.sh'), 'utf8');
  const normalize = installer.indexOf('bash "$release/deploy/prepare-release-files.sh" "$release"');
  const preflight = installer.indexOf('runuser -u luca-ai -- /usr/bin/test -r "$release/$entry"');
  const swap = installer.indexOf('mv -Tf "$release_root/current.next" "$release_root/current"');
  assert.ok(normalize > installer.indexOf('tar -xf "$staging/dist.tar"'));
  assert.ok(preflight > normalize && preflight < swap);
  assert.ok(installer.includes('for entry in dist/index.html server/index.js package.json; do'));
});
