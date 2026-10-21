import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import express from 'express';
import { precompressedModels } from './precompressed-models.js';

async function serve() {
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'luca-br-'));
  fs.mkdirSync(path.join(root, 'models'));
  const glb = Buffer.from('glTF'.repeat(4096));
  fs.writeFileSync(path.join(root, 'models', 'tree.glb'), glb);
  fs.writeFileSync(path.join(root, 'models', 'tree.glb.br'), zlib.brotliCompressSync(glb));
  fs.writeFileSync(path.join(root, 'models', 'plain.glb'), glb);
  fs.writeFileSync(path.join(root, 'secret.glb.br'), zlib.brotliCompressSync(Buffer.from('outside')));
  const app = express();
  app.use(precompressedModels(root));
  app.use(express.static(root));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const get = (url, encoding) => new Promise((resolve, reject) => {
    const http = { host: '127.0.0.1', port: server.address().port, path: url, headers: encoding ? { 'accept-encoding': encoding } : {} };
    import('node:http').then(({ get }) => get(http, (res) => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({ res, body: Buffer.concat(chunks) }));
    }).on('error', reject));
  });
  return { glb, get, close: () => { server.close(); fs.rmSync(root, { recursive: true, force: true }); } };
}

test('precompressed GLB is served with Brotli only to clients that accept it', async () => {
  const { glb, get, close } = await serve();
  try {
    const br = await get('/models/tree.glb?geometry=plain-v1', 'gzip, deflate, br');
    assert.equal(br.res.statusCode, 200);
    assert.equal(br.res.headers['content-encoding'], 'br');
    assert.equal(br.res.headers['content-type'], 'model/gltf-binary');
    assert.match(br.res.headers.vary, /Accept-Encoding/);
    assert.ok(br.body.length < glb.length);
    assert.deepEqual(zlib.brotliDecompressSync(br.body), glb);
    const plain = await get('/models/tree.glb', 'gzip');
    assert.equal(plain.res.headers['content-encoding'], undefined);
    assert.deepEqual(plain.body, glb);
    const missing = await get('/models/plain.glb', 'br');
    assert.equal(missing.res.headers['content-encoding'], undefined);
    assert.deepEqual(missing.body, glb);
  } finally { close(); }
});

test('precompressed lookup never leaves the served root', async () => {
  const { get, close } = await serve();
  try {
    const escaped = await get('/models/..%2F..%2Fsecret.glb', 'br');
    assert.notEqual(escaped.res.headers['content-encoding'], 'br');
    const bad = await get('/models/%E0%A4%A.glb', 'br');
    assert.notEqual(bad.res.headers['content-encoding'], 'br');
  } finally { close(); }
});

test('precompress-models comprime o GLB do avatar do stand, fora de models/ (coruja 3D, 1,6 MB → ~1 MB)', async () => {
  const { spawnSync } = await import('node:child_process');
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'luca-br-dist-'));
  try {
    const glb = Buffer.from('glTF'.repeat(8192));
    const textura = (await import('node:crypto')).randomBytes(32768);
    for (const rel of ['models/arvore.glb', 'stand/avatar/coruja-3d/coruja-3d.glb']) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), glb);
    }
    fs.writeFileSync(path.join(root, 'stand/avatar/textura.glb'), textura);
    const script = new URL('../scripts/precompress-models.mjs', import.meta.url).pathname;
    const run = spawnSync(process.execPath, [script, root], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    for (const rel of ['models/arvore.glb', 'stand/avatar/coruja-3d/coruja-3d.glb']) {
      assert.deepEqual(zlib.brotliDecompressSync(fs.readFileSync(path.join(root, `${rel}.br`))), glb, rel);
    }
    assert.equal(fs.existsSync(path.join(root, 'stand/avatar/textura.glb.br')), false, 'quem encolhe menos de 10% fica sem .br');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
