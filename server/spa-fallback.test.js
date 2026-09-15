import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';
import express from 'express';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'server/index.js'), 'utf8');
const distPath = join(root, 'dist');

describe('SPA fallback for authenticated app paths', () => {
  it('serves index.html via sendFile root, not an absolute path eaten by *splat', () => {
    assert.match(source, /res\.sendFile\('index\.html', \{ root: distPath \}\)/);
    assert.match(source, /express\.static\(distPath, \{ redirect: false \}\)/);
  });

  it('Express 5 sendFile(absolute) under *splat 404s; { root } returns the shell', async () => {
    const broken = express();
    broken.get('*splat', (_req, res) => {
      res.sendFile(join(distPath, 'index.html'));
    });
    const fixed = express();
    fixed.get('*splat', (_req, res) => {
      res.sendFile('index.html', { root: distPath });
    });
    const a = await listen(broken);
    const b = await listen(fixed);
    after(() => { a.close(); b.close(); });
    const bad = await fetch(`${a.url}/luca-ai`);
    const good = await fetch(`${b.url}/luca-ai`);
    assert.equal(bad.status, 404);
    assert.equal(good.status, 200);
    assert.match(await good.text(), /<!doctype html>/i);
  });
});

function listen(app) {
  return new Promise((resolve) => {
    const server = createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => server.close(),
      });
    });
  });
}
