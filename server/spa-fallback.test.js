import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import express from 'express';
import { servirDist } from './servir-dist.js';

const source = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');
const start = source.indexOf('if (fs.existsSync(indexPath)) {');
const end = source.indexOf("\nwss.on('connection'", start);
assert.ok(start >= 0 && end > start, 'official static-serving block exists');
const servingBlock = source.slice(start, end);

for (const variant of ['dist', 'v2-design']) {
  test(`SPA fallback serves deep links from a hidden checkout with ${variant}`, async (t) => {
    const scratch = fs.mkdtempSync(path.join(tmpdir(), 'luca-spa-'));
    t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
    const checkout = path.join(scratch, '.isolated-checkout');
    const distPath = path.join(checkout, 'dist');
    const v2DesignPath = path.join(checkout, 'v2-design');
    const root = variant === 'dist' ? distPath : v2DesignPath;
    fs.mkdirSync(path.join(root, 'sompo'), { recursive: true });
    fs.mkdirSync(path.join(root, 'assets'));
    const shell = '<!doctype html><html><body>LUCA shell</body></html>';
    fs.writeFileSync(path.join(root, 'index.html'), shell);
    fs.writeFileSync(path.join(root, 'assets', 'app.js'), 'window.LUCA = true;');
    const app = express();
    runInNewContext(servingBlock, {
      app, express, fs, distPath, v2DesignPath, servirDist,
      indexPath: path.join(distPath, 'index.html'),
      v2IndexPath: path.join(v2DesignPath, 'index.html'),
    });
    const server = createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;
    // /sompo collides with a real asset directory and must not redirect.
    for (const route of ['/', '/luca-ai', '/sompo', '/sompo/', '/configuracao/equipe']) {
      const response = await fetch(`${base}${route}`, { redirect: 'manual' });
      assert.equal(response.status, 200, `${variant} ${route}`);
      assert.equal(response.headers.get('location'), null, route);
      assert.equal(await response.text(), shell, route);
    }
    const asset = await fetch(`${base}/assets/app.js`);
    assert.equal(asset.status, 200);
    assert.equal(await asset.text(), 'window.LUCA = true;');
  });
}
