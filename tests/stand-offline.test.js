import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../public/stand/sw.js', import.meta.url), 'utf8');
const config = { version: 'release-a', shell: ['/stand/', '/assets/app.js'], videos: ['/stand/videos/demo.mp4'] };
function worker() {
  const listeners = {};
  const stores = new Map([['luca-stand-old', new Map()], ['other-app', new Map()]]);
  let unregistered = false;
  let network = async (url) => {
    const pathname = typeof url === 'string' ? url : new URL(url.url).pathname;
    const type = pathname.endsWith('.js') ? 'application/javascript' : pathname.endsWith('.mp4') ? 'video/mp4' : 'text/html';
    return new Response(pathname.endsWith('.mp4') ? '0123456789' : 'network', { headers: { 'content-type': type } });
  };
  const caches = {
    async keys() { return [...stores.keys()]; },
    async delete(key) { return stores.delete(key); },
    async match(url, { cacheName }) { return stores.get(cacheName)?.get(url)?.clone(); },
    async open(key) {
      if (!stores.has(key)) stores.set(key, new Map());
      return {
        async put(url, response) { stores.get(key).set(url, response.clone()); },
        async match(url) { return stores.get(key).get(url)?.clone(); },
      };
    },
  };
  vm.runInNewContext(source.replace('__STAND_OFFLINE_CONFIG__', JSON.stringify(config)), {
    caches, fetch: (...args) => network(...args), URL, Response, Headers, AbortSignal,
    self: { location: { origin: 'https://local.test' }, registration: { async unregister() { unregistered = true; } },
      clients: { async claim() {} }, async skipWaiting() {}, addEventListener: (name, callback) => { listeners[name] = callback; } },
  });
  return {
    stores, get unregistered() { return unregistered; }, setNetwork(fn) { network = fn; },
    async lifecycle(name) { let promise; listeners[name]({ waitUntil: (p) => { promise = p; } }); await promise; },
    fetch(pathname, { mode = 'cors', method = 'GET', range } = {}) {
      let response;
      listeners.fetch({ request: { url: 'https://local.test' + pathname, mode, method, headers: new Headers(range ? { range } : {}) }, respondWith: (p) => { response = p; } });
      return response;
    },
  };
}

test('instala só estáticos e activate limpa só releases antigas deste stand', async () => {
  const w = worker();
  await w.lifecycle('install');
  assert.deepEqual([...w.stores.get('luca-stand-release-a').keys()], [...config.shell, ...config.videos]);
  await w.lifecycle('activate');
  assert.deepEqual([...w.stores.keys()], ['other-app', 'luca-stand-release-a']);
  assert.equal(w.fetch('/api/auth/session'), undefined);
  assert.equal(w.fetch('/ws'), undefined);
  assert.equal(w.fetch('/sompo', { mode: 'navigate' }), undefined);
  assert.equal(w.fetch('/assets/private.json'), undefined);
  assert.equal(w.fetch('/stand/', { method: 'POST' }), undefined);
});

test('casca usa rede primeiro e cache só em falha, inclusive fallback HTML de asset', async () => {
  const w = worker();
  await w.lifecycle('install');
  w.setNetwork(async () => new Response('new', { headers: { 'content-type': 'application/javascript' } }));
  assert.equal(await (await w.fetch('/assets/app.js')).text(), 'new');
  w.setNetwork(async () => { throw new Error('offline'); });
  assert.equal(await (await w.fetch('/assets/app.js')).text(), 'network');
  assert.equal(await (await w.fetch('/stand/', { mode: 'navigate' })).text(), 'network');
  w.setNetwork(async () => new Response('SPA fallback', { headers: { 'content-type': 'text/html' } }));
  assert.equal(await (await w.fetch('/assets/app.js')).text(), 'network');
});

test('vídeo cache-first atende Range, suffix e rejeita faixa inválida sem rede', async () => {
  const w = worker();
  await w.lifecycle('install');
  w.setNetwork(async () => { throw new Error('offline'); });
  const response = await w.fetch('/stand/videos/demo.mp4', { range: 'bytes=2-5' });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(await response.text(), '2345');
  assert.equal(await (await w.fetch('/stand/videos/demo.mp4', { range: 'bytes=-3' })).text(), '789');
  assert.equal((await w.fetch('/stand/videos/demo.mp4', { range: 'bytes=99-' })).status, 416);
});

test('kill-switch por 404 ou HTML desregistra e apaga cache sem afetar outros apps', async () => {
  for (const status of [404, 200]) {
    const w = worker();
    await w.lifecycle('install');
    w.setNetwork(async () => new Response('removed', { status, headers: { 'content-type': 'text/html' } }));
    await w.fetch('/stand/', { mode: 'navigate' });
    assert.equal(w.unregistered, true);
    assert.equal(w.fetch('/assets/app.js'), undefined);
    assert.deepEqual([...w.stores.keys()], ['other-app']);
  }
});

test('instalação rejeita JS servido como fallback HTML', async () => {
  const w = worker();
  w.setNetwork(async () => new Response('SPA fallback', { headers: { 'content-type': 'text/html' } }));
  await assert.rejects(w.lifecycle('install'), /Invalid offline shell/);
});

test('provider preserva /stand/ para permanecer dentro do escopo, inclusive na navegação SPA', async () => {
  const provider = await readFile(new URL('../src/hooks/useAppLocation.tsx', import.meta.url), 'utf8');
  assert.match(provider, /window\.location\.pathname === '\/stand\/'/);
  assert.match(provider, /next\.page === 'stand'[^]*formatted\.replace\(/);
});

test('pedido atendido pelo worker antigo não recria cache removido pelo novo activate', async () => {
  const w = worker();
  await w.lifecycle('install');
  w.stores.delete('luca-stand-release-a');
  await w.fetch('/assets/app.js');
  assert.equal(w.stores.has('luca-stand-release-a'), false);
});
