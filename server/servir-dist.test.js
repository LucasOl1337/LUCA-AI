import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { servirDist, cacheDoArquivo, CACHE_IMUTAVEL, CACHE_REVALIDAR } from './servir-dist.js';

function escreve(root, arquivos) {
  for (const [rel, corpo] of Object.entries(arquivos)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), corpo);
  }
}

async function servidor(t, root) {
  const app = express();
  // Igual ao middleware de segurança do server/index.js.
  app.use((req, res, next) => { if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store'); next(); });
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  servirDist(app, root);
  const s = await new Promise(resolve => { const x = app.listen(0, '127.0.0.1', () => resolve(x)); });
  t.after(() => s.close());
  // node:http e não fetch: o fetch põe `Cache-Control: no-cache` junto do If-None-Match, e aí nunca há 304.
  const porta = s.address().port;
  return (caminho, headers = {}) => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: porta, path: caminho, headers }, res => {
      const partes = []; res.on('data', c => partes.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: new Headers(Object.entries(res.headers).map(([k, v]) => [k, String(v)])), text: async () => Buffer.concat(partes).toString() }));
    }).on('error', reject);
  });
}

function dist(t) {
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'luca-dist-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('cacheDoArquivo: só nome com hash do Vite em assets/ é imutável', () => {
  assert.equal(cacheDoArquivo('assets/OperadorPage-CFDzGDRx.js'), CACHE_IMUTAVEL);
  assert.equal(cacheDoArquivo('assets/OperadorPage-tEoLHFKI.css'), CACHE_IMUTAVEL);
  assert.equal(cacheDoArquivo('assets/index-Dd_Q2r-f.js'), CACHE_IMUTAVEL);
  assert.equal(cacheDoArquivo('index.html'), CACHE_REVALIDAR);
  assert.equal(cacheDoArquivo('stand/sw.js'), CACHE_REVALIDAR);
  for (const semHash of ['assets/vendor.js', 'stand/avatar/coruja-3d/coruja-3d.glb', 'models/a-ABCDEFGH.glb', 'favicon.ico', 'manifest.webmanifest']) {
    assert.equal(cacheDoArquivo(semHash), null, semHash);
  }
});

test('headers por classe: chunk com hash imutável; index, rota SPA e sw no-cache; /api no-store; GLB no padrão', async t => {
  const root = dist(t);
  escreve(root, {
    'index.html': '<script src="/assets/index-AAAAAAAA.js"></script>',
    'assets/index-AAAAAAAA.js': 'console.log(1)',
    'assets/OperadorPage-BBBBBBBB.css': '.x{}',
    'stand/sw.js': 'self',
    'stand/avatar/coruja-3d/coruja-3d.glb': 'glTF',
  });
  const get = await servidor(t, root);
  const cc = async (p) => (await get(p)).headers.get('cache-control');
  assert.equal(await cc('/assets/index-AAAAAAAA.js'), CACHE_IMUTAVEL);
  assert.equal(await cc('/assets/OperadorPage-BBBBBBBB.css'), CACHE_IMUTAVEL);
  for (const p of ['/', '/index.html', '/stand/', '/operador', '/gameplay?quiosque=1', '/stand/sw.js']) assert.equal(await cc(p), CACHE_REVALIDAR, p);
  assert.equal(await cc('/api/health'), 'no-store');
  assert.equal(await cc('/stand/avatar/coruja-3d/coruja-3d.glb'), 'public, max-age=0');
  const index = await get('/stand/');
  assert.ok(index.headers.get('etag'), 'index com ETag revalida com 304');
  assert.equal((await get('/stand/', { 'if-none-match': index.headers.get('etag') })).status, 304);
});

test('deploy novo: o index revalidado aponta para o chunk novo; o chunk velho some sem virar imutável', async t => {
  const root = dist(t);
  escreve(root, { 'index.html': '<script src="/assets/index-VELHO000.js"></script>', 'assets/index-VELHO000.js': 'v1' });
  const get = await servidor(t, root);
  const antes = await get('/');
  const etag = antes.headers.get('etag');
  assert.match(await antes.text(), /index-VELHO000/);
  // Deploy: install-vm troca o dist inteiro.
  fs.rmSync(path.join(root, 'assets'), { recursive: true });
  escreve(root, { 'index.html': '<script src="/assets/index-NOVO0000.js"></script>', 'assets/index-NOVO0000.js': 'v2 maior' });
  // Mesmo tamanho (hash do Vite tem 8 letras): a ETag W/tamanho-mtime muda pelo mtime do build novo.
  const novo = new Date(Date.now() + 60_000);
  fs.utimesSync(path.join(root, 'index.html'), novo, novo);
  const depois = await get('/', { 'if-none-match': etag });
  assert.equal(depois.status, 200, 'index com ETag velha não pode dar 304 depois do deploy');
  assert.equal(depois.headers.get('cache-control'), CACHE_REVALIDAR);
  assert.match(await depois.text(), /index-NOVO0000/);
  assert.equal((await get('/assets/index-NOVO0000.js')).headers.get('cache-control'), CACHE_IMUTAVEL);
  const sumiu = await get('/assets/index-VELHO000.js');
  assert.match(sumiu.headers.get('content-type'), /text\/html/);
  assert.equal(sumiu.headers.get('cache-control'), CACHE_REVALIDAR, 'fallback de chunk sumido nunca fica em cache');
});

test('GLB com hash do Vite em assets/ (coruja 3D pelo ?url) é imutável, cru e em .br; sumido cai no fallback sem cache', async t => {
  const zlib = await import('node:zlib');
  assert.equal(cacheDoArquivo('assets/coruja-3d-JoByCbdS.glb'), CACHE_IMUTAVEL);
  const root = dist(t);
  const glb = Buffer.from('glTF'.repeat(4096));
  escreve(root, {
    'index.html': '<html></html>',
    'assets/coruja-3d-JoByCbdS.glb': glb,
    'assets/coruja-3d-JoByCbdS.glb.br': zlib.brotliCompressSync(glb),
    'stand/avatar/coruja-3d/coruja-3d.glb': glb,
    'stand/avatar/coruja-3d/coruja-3d.glb.br': zlib.brotliCompressSync(glb),
  });
  const get = await servidor(t, root);
  const br = await get('/assets/coruja-3d-JoByCbdS.glb', { 'accept-encoding': 'gzip, br' });
  assert.equal(br.status, 200);
  assert.equal(br.headers.get('content-encoding'), 'br');
  assert.equal(br.headers.get('cache-control'), CACHE_IMUTAVEL, '.br do nome com hash também imutável');
  const cru = await get('/assets/coruja-3d-JoByCbdS.glb');
  assert.equal(cru.headers.get('content-encoding'), null);
  assert.equal(cru.headers.get('cache-control'), CACHE_IMUTAVEL);
  assert.equal(Number(cru.headers.get('content-length')), glb.length);
  // Nome fixo segue revalidando (cópia do public/ que o Vite mantém no dist).
  assert.equal((await get('/stand/avatar/coruja-3d/coruja-3d.glb', { 'accept-encoding': 'br' })).headers.get('cache-control'), 'public, max-age=0');
  const sumiu = await get('/assets/coruja-3d-VELHO000.glb', { 'accept-encoding': 'br' });
  assert.match(sumiu.headers.get('content-type'), /text\/html/);
  assert.equal(sumiu.headers.get('cache-control'), CACHE_REVALIDAR, 'GLB de release velha nunca vira imutável no fallback');
});

test('palco 3D com hash em assets/ (GLB, JPG, HDR, manifesto) é imutável, inclusive o .br; o nome fixo antigo segue servido', async t => {
  const zlib = await import('node:zlib');
  const root = dist(t);
  const glb = Buffer.from('glTF'.repeat(4096));
  escreve(root, {
    'index.html': '<html></html>',
    'assets/max-tractor-cabine-XpBAIuWb.glb': glb,
    'assets/max-tractor-cabine-XpBAIuWb.glb.br': zlib.brotliCompressSync(glb),
    'assets/cabine-banco-basecolor-c2XTo2iX.jpg': 'jpg',
    'assets/kloofendal_48d_partly_cloudy_puresky_2k-AbCdEf12.hdr': 'hdr',
    'assets/kloofendal_48d_partly_cloudy_puresky_2k-AbCdEf12.hdr.br': zlib.brotliCompressSync(Buffer.from('hdr')),
    'assets/cabine-banco.textures-W3_T4qpd.json': '{"images":[]}',
    'models/gameplay/max-tractor-cabine.glb': glb,
    'models/gameplay/cabine-banco.textures.json': '{"images":[]}',
  });
  const get = await servidor(t, root);
  const br = await get('/assets/max-tractor-cabine-XpBAIuWb.glb', { 'accept-encoding': 'br' });
  assert.equal(br.headers.get('content-encoding'), 'br');
  assert.equal(br.headers.get('cache-control'), CACHE_IMUTAVEL);
  const ceu = await get('/assets/kloofendal_48d_partly_cloudy_puresky_2k-AbCdEf12.hdr', { 'accept-encoding': 'br' });
  assert.equal(ceu.headers.get('content-encoding'), 'br');
  assert.equal(ceu.headers.get('cache-control'), CACHE_IMUTAVEL, 'o .br do HDR com hash também é imutável');
  for (const caminho of ['/assets/cabine-banco-basecolor-c2XTo2iX.jpg', '/assets/kloofendal_48d_partly_cloudy_puresky_2k-AbCdEf12.hdr', '/assets/cabine-banco.textures-W3_T4qpd.json']) {
    const r = await get(caminho);
    assert.equal(r.status, 200, caminho);
    assert.equal(r.headers.get('cache-control'), CACHE_IMUTAVEL, caminho);
  }
  // Aba aberta da release anterior ainda pede o nome fixo: 200 com o corpo real, revalidando.
  const antigo = await get('/models/gameplay/max-tractor-cabine.glb');
  assert.equal(antigo.status, 200);
  assert.match(antigo.headers.get('content-type'), /model\/gltf-binary/);
  assert.equal(antigo.headers.get('cache-control'), 'public, max-age=0');
  assert.equal((await get('/models/gameplay/cabine-banco.textures.json')).headers.get('cache-control'), 'public, max-age=0');
  // JSON fora de assets/ ou sem hash nunca vira imutável.
  assert.equal(cacheDoArquivo('models/gameplay/cabine-banco.textures.json'), null);
  assert.equal(cacheDoArquivo('assets/manifest.json'), null);
});
