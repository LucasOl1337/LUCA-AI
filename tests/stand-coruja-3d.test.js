import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

const require = createRequire(import.meta.url);
const { createElement } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const { default: AvatarLuca, VARIANTE_PADRAO, VARIANTES_AVATAR } = await loadFrontendModule('../../src/components/stand/AvatarLuca.tsx');
const rig = await loadFrontendModule('../../src/components/stand/coruja3dRig.ts');

const pasta = new URL('../public/stand/avatar/coruja-3d/', import.meta.url);
const glb = readFileSync(new URL('coruja-3d.glb', pasta));
const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8'));
// Mesmo saneamento do GLTFLoader (PropertyBinding.sanitizeNodeName).
const sanear = (nome) => nome.replace(/\s/g, '_').replace(/[[\].:/]/g, '');

test('coruja-3d entra como variante opcional; a padrão segue coruja A', () => {
  assert.equal(VARIANTE_PADRAO, 'coruja-a');
  assert.ok(VARIANTES_AVATAR.includes('coruja-3d'));
});

test('no servidor a coruja 3D sai como canvas marcado, sem quebrar o SSR', () => {
  const html = renderToStaticMarkup(createElement(AvatarLuca, { variante: 'coruja-3d', voz: 'falando', parado: true }));
  assert.match(html, /^<canvas/);
  assert.match(html, /data-variante="coruja-3d"/);
  assert.match(html, /data-voz="falando"/);
  assert.match(html, /aria-label="Avatar LUCA"/);
});

test('cada estado de voz tem um clipe no GLB, mais o aceno de entrada', () => {
  const clipes = json.animations.map((a) => a.name);
  for (const voz of ['ocioso', 'ouvindo', 'pensando', 'falando']) {
    assert.equal(rig.CLIPE_POR_VOZ[voz], voz);
    assert.ok(clipes.includes(rig.CLIPE_POR_VOZ[voz]), `clipe ${voz}`);
  }
  assert.ok(clipes.includes(rig.CLIPE_ENTRADA));
  assert.ok(json.nodes.some((n) => sanear(n.name) === rig.OSSO_PESCOCO), 'osso do pescoço existe com o nome saneado');
});

test('manifesto de texturas externas cobre cada imagem do GLB e os arquivos existem', () => {
  const manifesto = JSON.parse(readFileSync(new URL('coruja-3d.textures.json', pasta), 'utf8'));
  assert.equal(manifesto.images.length, json.images.length);
  for (const arquivo of manifesto.images) assert.ok(existsSync(new URL(arquivo, pasta)), arquivo);
  const material = json.materials[0];
  assert.ok(material.emissiveTexture, 'emissivo do visor e frisos');
  assert.match(manifesto.images[json.textures[material.emissiveTexture.index].source], /emissive/);
  assert.match(manifesto.images[json.textures[material.pbrMetallicRoughness.baseColorTexture.index].source], /basecolor/);
  assert.match(manifesto.images[json.textures[material.normalTexture.index].source], /normal/);
  assert.ok(!(json.extensionsUsed || []).includes('EXT_meshopt_compression'), 'sem decoder extra no cliente');
  assert.ok(glb.length < 2_500_000, `GLB de ${glb.length} bytes`);
});

test('proveniência aponta o GLB publicado', () => {
  const prov = JSON.parse(readFileSync(new URL('coruja-3d.provenance.json', pasta), 'utf8'));
  assert.equal(prov.asset, 'coruja-3d.glb');
  assert.equal(prov.sha256, createHash('sha256').update(glb).digest('hex'));
  assert.equal(prov.bytes, glb.length);
});

test('brilho segue o áudio na fala e fica estável fora dela', () => {
  const m = { nivel: 0 };
  const baixo = rig.brilhoCoruja3D(m, 'falando', 0, 0);
  for (let i = 0; i < 12; i += 1) rig.brilhoCoruja3D(m, 'falando', 1, i * 16);
  const alto = rig.brilhoCoruja3D(m, 'falando', 1, 200);
  assert.ok(alto > baixo + 1.5, `${baixo} -> ${alto}`);
  assert.ok(rig.acenoFala(m, 'falando') > 0.1 && rig.acenoFala(m, 'ouvindo') === 0);
  const ouvindo = [0, 500, 1000, 1500].map((t) => rig.brilhoCoruja3D({ nivel: 0 }, 'ouvindo', 1, t));
  assert.ok(Math.max(...ouvindo) - Math.min(...ouvindo) < 0.2, 'ouvindo fica aceso e firme');
});
