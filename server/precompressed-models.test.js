import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import express from 'express';
import { precompressedModels } from './precompressed-models.js';

async function serve(pai = process.env.TMPDIR || os.tmpdir()) {
  const root = fs.mkdtempSync(path.join(pai, 'luca-br-'));
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
  return { root, glb, get, close: () => { server.close(); fs.rmSync(root, { recursive: true, force: true }); } };
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

// Antes desta prova a suíte falhava só para quem tinha TMPDIR dentro de pasta com
// ponto (~/.jcode/scratch): o send recusava o caminho absoluto como dotfile (404).
test('dist dentro de pasta com ponto (~/.algo/dist) ainda serve o .br', async () => {
  const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'luca-br-ponto-'));
  const comPonto = path.join(pai, '.oculta');
  fs.mkdirSync(comPonto);
  const { glb, get, close } = await serve(comPonto);
  try {
    const br = await get('/models/tree.glb', 'br');
    assert.equal(br.res.statusCode, 200);
    assert.equal(br.res.headers['content-encoding'], 'br');
    assert.deepEqual(zlib.brotliDecompressSync(br.body), glb);
  } finally { close(); fs.rmSync(pai, { recursive: true, force: true }); }
});

test('se o .br não pode ser enviado, o original sai sem Content-Encoding: br', async () => {
  const { root, glb, get, close } = await serve();
  try {
    // Existe, mas não é arquivo: o sendFile falha e o middleware cai no estático.
    fs.mkdirSync(path.join(root, 'models', 'plain.glb.br'));
    const res = await get('/models/plain.glb', 'br');
    assert.equal(res.res.statusCode, 200);
    assert.equal(res.res.headers['content-encoding'], undefined);
    assert.deepEqual(res.body, glb);
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

// Largada (24/10): o céu HDR do palco (5,3 MB de RGBE) saía cru; br tira ~42 % sem perda.
test('HDR com .br sai em Brotli com o tipo do HDR; sem br no Accept-Encoding, o original', async () => {
  const { root, get, close } = await serve();
  try {
    const hdr = Buffer.from('#?RADIANCE\n'.repeat(2048));
    fs.writeFileSync(path.join(root, 'models', 'ceu.hdr'), hdr);
    fs.writeFileSync(path.join(root, 'models', 'ceu.hdr.br'), zlib.brotliCompressSync(hdr));
    const br = await get('/models/ceu.hdr', 'gzip, br');
    assert.equal(br.res.statusCode, 200);
    assert.equal(br.res.headers['content-encoding'], 'br');
    assert.equal(br.res.headers['content-type'], 'image/vnd.radiance');
    assert.match(br.res.headers.vary, /Accept-Encoding/);
    assert.deepEqual(zlib.brotliDecompressSync(br.body), hdr);
    const cru = await get('/models/ceu.hdr', 'gzip');
    assert.equal(cru.res.headers['content-encoding'], undefined);
    assert.deepEqual(cru.body, hdr);
    // Outras extensões nunca passam pelo middleware.
    fs.writeFileSync(path.join(root, 'models', 'x.jpg.br'), zlib.brotliCompressSync(Buffer.from('x')));
    fs.writeFileSync(path.join(root, 'models', 'x.jpg'), 'x');
    assert.equal((await get('/models/x.jpg', 'br')).res.headers['content-encoding'], undefined);
  } finally { close(); }
});
