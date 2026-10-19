import assert from 'node:assert/strict';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { loadSompoAgriAsset, urlDoAssetAgri } = await loadFrontendModule('../../src/components/sompo/loadSompoAgriAsset.ts');

const CATALOGO_MAX = '/models/sompo/max-tractor.glb';

async function urlsPedidas(assetUrl) {
  const pedidas = [];
  const original = globalThis.fetch;
  // Falha no primeiro byte: o que importa é qual URL o palco pediria.
  globalThis.fetch = async (url) => { pedidas.push(String(url)); return { ok: false, status: 418 }; };
  try {
    await assert.rejects(loadSompoAgriAsset('max-tractor', new AbortController().signal, assetUrl), /HTTP 418/);
  } finally { globalThis.fetch = original; }
  return pedidas;
}

test('sem gancho, o MAX carrega o GLB do catálogo, igual ao /sompo e à clássica', async () => {
  assert.equal(urlDoAssetAgri('max-tractor'), CATALOGO_MAX);
  assert.equal(urlDoAssetAgri('max-tractor', ''), CATALOGO_MAX);
  assert.deepEqual(await urlsPedidas(undefined), [CATALOGO_MAX]);
});

test('com gancho, o gameplay pede o GLB indicado no lugar do catálogo', async () => {
  const cabine = '/models/sompo/max-tractor-cabine.glb';
  assert.equal(urlDoAssetAgri('max-tractor', cabine), cabine);
  assert.deepEqual(await urlsPedidas(cabine), [cabine]);
});
