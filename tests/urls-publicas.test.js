import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadFrontendModule } from './support/load-frontend-module.js';
import { mapearUrlsPublicas, gravarNomesComHash, hashDoConteudo, PASTAS_COM_HASH } from '../scripts/urls-publicas-plugin.mjs';
import { cacheDoArquivo, CACHE_IMUTAVEL } from '../server/servir-dist.js';

const publico = new URL('../public/', import.meta.url).pathname;
const MAPA = mapearUrlsPublicas(publico);

test('mapa: todo GLB, textura, HDR e manifesto do gameplay ganha nome com hash do conteúdo, imutável no servidor', () => {
  const gameplay = fs.readdirSync(path.join(publico, 'models/gameplay')).filter(n => /\.(glb|jpg|json)$/.test(n));
  assert.ok(gameplay.length >= 20, `${gameplay.length} arquivos do gameplay`);
  for (const nome of gameplay) {
    const comHash = MAPA[`/models/gameplay/${nome}`];
    assert.ok(comHash, nome);
    const hash = hashDoConteudo(fs.readFileSync(path.join(publico, 'models/gameplay', nome)));
    assert.equal(comHash, `/assets/${nome.replace(/(\.[a-z]+)$/, `-${hash}$1`)}`);
  }
  for (const pasta of PASTAS_COM_HASH) assert.ok(Object.keys(MAPA).some(k => k.startsWith(`/${pasta}/`)), pasta);
  assert.ok(MAPA['/environments/sompo/kloofendal_48d_partly_cloudy_puresky_2k.hdr'], 'HDR do céu');
  assert.ok(MAPA['/sompo/gen/pasto-albedo.webp'], 'textura do pasto');
  // Coruja 3D fica com o ?url do #44; licenças e .md ficam fora.
  assert.ok(!Object.keys(MAPA).some(k => k.includes('/stand/') || /\.(txt|md)$/.test(k)));
  for (const comHash of Object.values(MAPA)) assert.equal(cacheDoArquivo(comHash.slice(1)), CACHE_IMUTAVEL, comHash);
});

test('dist: nome com hash é hardlink da cópia fixa, que continua lá para a release anterior', t => {
  const dist = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'luca-urls-'));
  t.after(() => fs.rmSync(dist, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dist, 'models/gameplay'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'models/gameplay/a.glb'), 'glTF-a');
  const mapa = { '/models/gameplay/a.glb': '/assets/a-AAAAAAAA.glb' };
  assert.equal(gravarNomesComHash(dist, mapa), 1);
  assert.equal(gravarNomesComHash(dist, mapa), 1, 'rodar de novo não falha');
  const fixo = fs.statSync(path.join(dist, 'models/gameplay/a.glb'));
  const comHash = fs.statSync(path.join(dist, 'assets/a-AAAAAAAA.glb'));
  assert.equal(comHash.ino, fixo.ino, 'mesmo inode: sem dobrar o dist');
  assert.throws(() => gravarNomesComHash(dist, { '/models/gameplay/sumiu.glb': '/assets/sumiu-BBBBBBBB.glb' }), /não no dist/);
});

test('precompress: o .br do nome com hash é o mesmo arquivo do .br fixo (um brotli só, sem dobrar o dist)', async t => {
  const { execFileSync } = await import('node:child_process');
  const dist = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'luca-urls-br-'));
  t.after(() => fs.rmSync(dist, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dist, 'models/gameplay'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'models/gameplay/a.glb'), Buffer.from('glTF'.repeat(4096)));
  gravarNomesComHash(dist, { '/models/gameplay/a.glb': '/assets/a-AAAAAAAA.glb' });
  execFileSync(process.execPath, [new URL('../scripts/precompress-models.mjs', import.meta.url).pathname, dist]);
  const fixo = fs.statSync(path.join(dist, 'models/gameplay/a.glb.br'));
  const comHash = fs.statSync(path.join(dist, 'assets/a-AAAAAAAA.glb.br'));
  assert.equal(comHash.ino, fixo.ino);
  assert.ok(comHash.size < 4096 * 4 / 10);
});

const define = { __URLS_PUBLICAS__: JSON.stringify(MAPA) };

async function pedidosDe(fn) {
  const pedidas = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => { pedidas.push(String(url)); return { ok: false, status: 418 }; };
  try { await fn(); } catch { /* só interessa a URL pedida */ } finally { globalThis.fetch = original; }
  return pedidas;
}

test('gameplay pede GLB, manifesto e provenance pelo nome com hash (build); sem o mapa, o caminho fixo de antes', async () => {
  const comMapa = await loadFrontendModule('../../src/components/gameplay/visual/cabineMax.ts', { define });
  const semMapa = await loadFrontendModule('../../src/components/gameplay/visual/cabineMax.ts');
  const sinal = new AbortController().signal;
  assert.deepEqual(await pedidosDe(() => comMapa.carregarPropTripo('/models/gameplay/cabine-banco.glb', sinal)), [MAPA['/models/gameplay/cabine-banco.glb']]);
  assert.deepEqual(await pedidosDe(() => semMapa.carregarPropTripo('/models/gameplay/cabine-banco.glb', sinal)), ['/models/gameplay/cabine-banco.glb']);

  const { restoreSompoTextures } = await loadFrontendModule('../../src/components/sompo/restoreSompoTextures.ts', { define });
  assert.deepEqual(await pedidosDe(() => restoreSompoTextures({}, '/models/gameplay/fardo-feno.glb', sinal)), [MAPA['/models/gameplay/fardo-feno.textures.json']]);

  const { loadSompoAgriAsset } = await loadFrontendModule('../../src/components/sompo/loadSompoAgriAsset.ts', { define });
  assert.deepEqual(await pedidosDe(() => loadSompoAgriAsset('max-tractor', sinal, '/models/gameplay/max-tractor-cabine.glb')), [MAPA['/models/gameplay/max-tractor-cabine.glb']]);
});

test('TextureLoader, HDRLoader e GLTFLoader (LoadingManager do three) trocam o caminho fixo pelo nome com hash', async () => {
  const { urlPublica } = await loadFrontendModule('../../src/components/sompo/urlsPublicas.ts', { define });
  const THREE = createRequire(import.meta.url)('three');
  const jpg = '/models/gameplay/cabine-banco-basecolor.jpg';
  assert.equal(urlPublica(jpg), MAPA[jpg]);
  assert.equal(THREE.DefaultLoadingManager.resolveURL(jpg), MAPA[jpg]);
  assert.equal(THREE.DefaultLoadingManager.resolveURL('/environments/sompo/dirt-color-2k.jpg'), MAPA['/environments/sompo/dirt-color-2k.jpg']);
  assert.equal(urlPublica('/models/sompo/max-tractor.glb?v=2'), `${MAPA['/models/sompo/max-tractor.glb']}?v=2`, 'query preservada');
  assert.equal(urlPublica('/api/state'), '/api/state', 'fora do mapa não muda');
  assert.equal(urlPublica('/stand/avatar/coruja-3d/coruja-3d.glb'), '/stand/avatar/coruja-3d/coruja-3d.glb');
  THREE.DefaultLoadingManager.setURLModifier(undefined);
});
