import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { commands } from '../cli/catalog.js';
import { renderReference } from '../cli/reference.js';
import { cli, root, temporary } from './support/cli.js';

async function fixture(t, handler) {
  const server = createServer(handler).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}
function json(res, payload, status = 200) { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(payload)); }

test('offline discovery covers every live Express API route, without phantom endpoints', async () => {
  const registered = new Set();
  for (const entry of await fs.readdir(path.join(root, 'server'), { recursive: true })) {
    if (!entry.endsWith('.js') || entry.endsWith('.test.js')) continue;
    const source = await fs.readFile(path.join(root, 'server', entry), 'utf8');
    for (const match of source.matchAll(/app\.(get|post|put|patch|delete)\(\s*['"](\/api\/[^'"]+)['"]/g)) registered.add(`${match[1].toUpperCase()} ${match[2]}`);
  }
  const covered = new Set(commands.filter(c => c.method).map(c => `${c.method} ${c.path}`));
  assert.deepEqual([...registered].filter(route => !covered.has(route)), [], 'Rotas sem comando CLI');
  assert.deepEqual([...covered].filter(route => !registered.has(route)), [], 'Comandos com rota inexistente');
  assert.equal(new Set(commands.map(c => c.name)).size, commands.length);
  const result = await cli(['commands']);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.json.schema, 'luca.cli.commands.v1');
  assert.equal(result.json.commands.length, commands.length);
  assert.match((await cli(['team', 'run', '--help'])).stdout, /--slugs/);
  assert.equal(await fs.readFile(path.join(root, 'docs/cli-reference.md'), 'utf8'), renderReference(), 'Rode npm run cli:docs');
});

test('arguments and typed bodies fail before network; dry run preserves JSON and escapes IDs/query', async t => {
  const directory = await temporary(t);
  const env = { LUCA_CLI_CONFIG: path.join(directory, 'config.json') };
  const valid = await cli(['chat', 'sessions', 'update', 'id /?', '--data', '-', '--dry-run'], { env, input: '{"folderId":null,"title":"Olá\n"}'.replace('\n', '\\n') });
  assert.equal(valid.code, 0, valid.stderr);
  assert.equal(valid.json.body.folderId, null);
  assert.match(valid.json.url, /id%20%2F%3F$/);
  const bool = await cli(['chat', 'sessions', 'create', '--seed-from-active=false', '--dry-run'], { env });
  assert.equal(bool.json.body.seedFromActive, false);
  const query = await cli(['events', 'list', '--trace-id', 'a&b=c', '--limit', '4', '--dry-run'], { env });
  assert.match(query.json.url, /traceId=a%26b%3Dc/);
  for (const args of [
    ['team', 'run', '--wat'], ['health', 'extra'], ['health', '--wait'], ['state', '--watch', '--count', 'NaN'],
    ['health', '--data', '{}'], ['team', 'run', '--data', '{oops'], ['mission', 'context'],
    ['state', '--watch', '--interval', '-1'], ['api', 'GET', '//evil.test/api/x'], ['api', 'GET', '/api/../not-api'],
  ]) {
    const result = await cli(args, { env });
    assert.equal(result.code, 2, `${args}: ${result.stderr}`);
    assert.equal(result.stdout, '');
    assert.equal(JSON.parse(result.stderr).ok, false);
  }
});

test('profiles persist restrictive files, isolate origins, hide credentials and restrict machine tokens', async t => {
  const directory = await temporary(t);
  const config = path.join(directory, 'private', 'config.json');
  const seen = [];
  const url = await fixture(t, async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    seen.push({ url: req.url, cookie: req.headers.cookie, auth: req.headers.authorization, body: Buffer.concat(chunks).toString() });
    if (req.url === '/api/auth/login') res.setHeader('Set-Cookie', 'luca_session=session-secret; Path=/; HttpOnly');
    json(res, { ok: true });
  });
  const env = { LUCA_CLI_CONFIG: config, LUCA_URL: url };
  const login = await cli(['auth', 'login', '--email', 'user@test.dev', '--password-stdin'], { env, input: 'password-secret\n' });
  assert.equal(login.code, 0, login.stderr);
  assert.equal(JSON.parse(seen[0].body).password, 'password-secret');
  assert.equal((await fs.stat(config)).mode & 0o777, 0o600);
  assert.equal((await fs.stat(path.dirname(config))).mode & 0o777, 0o700);
  const content = await fs.readFile(config, 'utf8');
  assert.ok(content.includes('session-secret'));
  assert.ok(!content.includes('password-secret'));
  await cli(['state'], { env: { ...env, LUCA_MACHINE_TOKEN: 'machine-secret' } });
  assert.equal(seen.at(-1).cookie, 'luca_session=session-secret');
  assert.equal(seen.at(-1).auth, undefined);
  await cli(['deliberations', 'get', 'abc'], { env: { ...env, LUCA_MACHINE_TOKEN: 'machine-secret' } });
  assert.equal(seen.at(-1).auth, 'Bearer machine-secret');
  assert.equal(seen.at(-1).cookie, undefined);
  const other = await fixture(t, (req, res) => { assert.equal(req.headers.cookie, undefined); json(res, { ok: true }); });
  assert.equal((await cli(['state', '--base-url', other], { env })).code, 0);
  const listed = await cli(['profile', 'list'], { env });
  assert.ok(!listed.stdout.includes('session-secret'));
  const preview = await cli(['auth', 'login', '--email', 'user@test.dev', '--dry-run'], { env: { ...env, LUCA_PASSWORD: 'password-secret' } });
  assert.ok(!preview.stdout.includes('password-secret'));
  assert.equal(preview.json.body.password, '[REDACTED]');
  await cli(['profile', 'set', 'local', '--url', other], { env });
  assert.ok(!(await fs.readFile(config, 'utf8')).includes('session-secret'));
});

test('transport distinguishes HTTP, logical errors, HTML fallbacks, redirects, timeout and binary downloads', async t => {
  const directory = await temporary(t);
  let mutations = 0;
  const url = await fixture(t, (req, res) => {
    if (req.method === 'POST') mutations++;
    if (req.url === '/api/denied') return json(res, { error: 'authentication_required' }, 401);
    if (req.url === '/api/failure') return json(res, { ok: false, error: 'failure' });
    if (req.url === '/api/redirect') { res.writeHead(302, { location: '/api/health' }); return res.end(); }
    if (req.url === '/api/slow') return;
    if (req.url === '/api/binary') { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(Buffer.from([0, 255, 1, 2])); }
    res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html>SPA</html>');
  });
  const env = { LUCA_URL: url, LUCA_CLI_CONFIG: path.join(directory, 'config.json') };
  for (const [route, expected] of [['denied', 3], ['failure', 1], ['redirect', 1], ['html', 1], ['slow', 4]]) {
    const result = await cli(['api', 'POST', `/api/${route}`, '--timeout', '150'], { env });
    assert.equal(result.code, expected, result.stderr);
    assert.equal(result.stdout, '');
  }
  assert.equal(mutations, 5, 'Mutações não são repetidas');
  const file = path.join(directory, 'image.bin');
  const downloaded = await cli(['api', 'GET', '/api/binary', '--output', file], { env });
  assert.equal(downloaded.code, 0, downloaded.stderr);
  assert.deepEqual(await fs.readFile(file), Buffer.from([0, 255, 1, 2]));
  const absent = path.join(directory, 'absent.bin');
  assert.equal((await cli(['api', 'GET', '/api/denied', '--output', absent], { env })).code, 3);
  await assert.rejects(fs.stat(absent), { code: 'ENOENT' });
});

test('jobs resume after transient polling failure, terminate on failure, retain ID on timeout and SIGINT', async t => {
  const directory = await temporary(t);
  let posts = 0, gets = 0, mode = 'complete';
  const url = await fixture(t, (req, res) => {
    if (req.method === 'POST') { posts++; return json(res, { ok: true, runId: 'job-1', status: 'running' }, 202); }
    gets++;
    if (mode === 'complete' && gets === 1) return json(res, { error: 'temporary' }, 503);
    json(res, { ok: mode !== 'failed', runId: 'job-1', status: mode === 'complete' ? 'complete' : mode === 'failed' ? 'failed' : 'running', result: { answer: 'feito' }, error: mode === 'failed' ? { code: 'upstream_error' } : null });
  });
  const env = { LUCA_URL: url, LUCA_CLI_CONFIG: path.join(directory, 'config.json') };
  const finished = await cli(['team', 'run', '--mission', 'Teste', '--slugs', 'arquiteto', '--wait', '--interval', '100'], { env });
  assert.equal(finished.code, 0, finished.stderr);
  assert.equal(finished.json.status, 'complete');
  assert.equal(posts, 1);
  assert.equal(gets, 2);
  mode = 'failed';
  assert.equal((await cli(['team', 'status', 'job-1', '--wait'], { env })).code, 5);
  mode = 'running';
  const expired = await cli(['team', 'status', 'job-1', '--wait', '--wait-timeout', '150', '--interval', '100'], { env });
  assert.equal(expired.code, 4, expired.stderr);
  assert.match(expired.stderr, /team status job-1 --wait/);
  const interrupted = await cli(['team', 'status', 'job-1', '--wait'], { env, onStderr(text, child) { if (text.includes('"event":"job"')) child.kill('SIGINT'); } });
  assert.equal(interrupted.code, 130, interrupted.stderr);
  assert.match(interrupted.stderr, /job-1/);
});

test('watch emits bounded NDJSON; offline simulation, CSV replay and eye state reuse product logic', async t => {
  const directory = await temporary(t);
  let reads = 0;
  const url = await fixture(t, (_req, res) => json(res, { ok: true, sample: ++reads }));
  const env = { LUCA_URL: url, LUCA_CLI_CONFIG: path.join(directory, 'config.json') };
  const watched = await cli(['state', '--watch', '--count', '3', '--interval', '100'], { env });
  assert.equal(watched.code, 0, watched.stderr);
  assert.deepEqual(watched.stdout.trim().split('\n').map(line => JSON.parse(line).sample), [1, 2, 3]);
  const samples = [0, 250, 500, 750, 1000].map(at => ({ at, left: 0.8, right: 0.8 }));
  samples.push({ at: 1100, left: 0, right: 0 });
  const eyes = await cli(['drowsiness', 'evaluate', '--data', '-'], { input: JSON.stringify({ samples }), env });
  assert.equal(eyes.code, 0, eyes.stderr);
  assert.equal(eyes.json.results[4].alarm, true);
  assert.equal(eyes.json.results[5].alarm, false);
  assert.equal(reads, 3, 'Comando local não acessa servidor');
  const sensor = await cli(['sensor', 'sample', '--scenario', 'encosta', '--parameter', '30', '--time', '5']);
  assert.equal(sensor.code, 0, sensor.stderr);
  assert.ok(sensor.json.reading.ratio > 1);
  assert.equal((await cli(['sompo', 'simulate', '--scenario', 'inexistente'])).code, 2);
  const replay = await cli(['lab', 'replay', '--csv', 'datasets/laboratorio-virtual-v1/01-operacao-normal.csv', '--elapsed-ms', '1000']);
  assert.equal(replay.code, 0, replay.stderr);
  assert.ok(replay.json.frame);
});
