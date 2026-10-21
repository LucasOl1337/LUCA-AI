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

test('no servidor a coruja 3D sai na moldura da Coruja A (halo, ondas, canvas com degradê)', () => {
  const html = renderToStaticMarkup(createElement(AvatarLuca, { variante: 'coruja-3d', voz: 'falando', parado: true }));
  assert.match(html, /^<svg[^>]*viewBox="-90 -60 1204 1104"/);
  assert.match(html, /data-variante="coruja-3d"/);
  assert.match(html, /data-voz="falando"/);
  assert.match(html, /aria-label="Avatar LUCA"/);
  assert.equal((html.match(/data-c3="onda"/g) || []).length, 3);
  assert.match(html, /<mask id="[^"]*busto-m"/);
  assert.match(html, /<mask id="[^"]*lados-m"/);
  assert.match(html, /<g mask="url\(#[^)]*lados-m\)"><g mask="url\(#[^)]*busto-m\)"><foreignObject[^>]*width="1024"[^>]*><canvas/);
});

test('halo e ondas seguem as fórmulas da Coruja A: ondas só com fala', () => {
  assert.ok(rig.haloCoruja3D('ocioso', 0, 700).ondas.every((o) => o.opacidade === 0));
  const fala = rig.haloCoruja3D('falando', 1, 0);
  assert.ok(fala.halo > 0.8);
  assert.deepEqual(fala.ondas.map((o) => Math.round(o.r)), [400, 447, 493]);
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

test('GLB traz o rosto: morphs piscar e bico_abre numa malha 100% na cabeça, malha principal sem morph', () => {
  const rosto = json.meshes.find((m) => (m.extras?.targetNames || []).includes(rig.MORPH_PISCAR));
  assert.ok(rosto, 'malha com morph targets');
  assert.deepEqual(rosto.extras.targetNames, [rig.MORPH_PISCAR, rig.MORPH_BICO]);
  for (const p of rosto.primitives) assert.equal(p.targets.length, 2);
  const principal = json.meshes.find((m) => m !== rosto);
  assert.ok(principal.primitives.every((p) => !p.targets), 'malha da coruja intocada');
  const no = json.nodes.find((n) => n.mesh === json.meshes.indexOf(rosto));
  assert.equal(no.skin, 0, 'mesma skin da coruja');
  // Todos os vértices num osso só (o da cabeça), com peso 1.
  const pesosAcc = json.accessors[rosto.primitives[0].attributes.WEIGHTS_0];
  const juntasAcc = json.accessors[rosto.primitives[0].attributes.JOINTS_0];
  const bin = glb.subarray(28 + glb.readUInt32LE(12));
  const vista = (acc) => json.bufferViews[acc.bufferView];
  const offset = (acc) => (vista(acc).byteOffset || 0) + (acc.byteOffset || 0);
  assert.equal(pesosAcc.componentType, 5126);
  const pesos = new Float32Array(bin.buffer, bin.byteOffset + offset(pesosAcc), pesosAcc.count * 4);
  const tamJunta = juntasAcc.componentType === 5121 ? 1 : 2;
  const juntas = new (tamJunta === 1 ? Uint8Array : Uint16Array)(bin.buffer.slice(bin.byteOffset + offset(juntasAcc), bin.byteOffset + offset(juntasAcc) + juntasAcc.count * 4 * tamJunta));
  const ossos = new Set();
  for (let i = 0; i < pesosAcc.count; i += 1) {
    assert.ok(Math.abs(pesos[i * 4] - 1) < 1e-4, `vértice ${i} com peso ${pesos[i * 4]}`);
    ossos.add(json.skins[0].joints[juntas[i * 4]]);
  }
  assert.deepEqual([...ossos].map((n) => sanear(json.nodes[n].name)), ['tripoHead_2']);
});

function relogioRosto(sorteios = [0.5]) {
  let i = 0;
  const sorteio = () => sorteios[Math.min(i++, sorteios.length - 1)];
  return { m: rig.novaMemoriaRosto(0, sorteio), sorteio };
}

test('pisca a cada 2–6 s por 120 ms, fechando e abrindo', () => {
  const { m, sorteio } = relogioRosto([0]); // intervalo mínimo: 2000 ms
  const quadro = (t) => rig.rostoCoruja3D(m, 'ocioso', 0, t, { sorteio }).piscar;
  assert.equal(quadro(1990), 0);
  assert.equal(quadro(2000), 0);
  assert.ok(quadro(2060) > 0.95, 'fechado no meio da piscada');
  assert.ok(quadro(2100) < 0.4);
  assert.equal(quadro(2130), 0, 'abre ao fim de 120 ms');
  // Próxima: 2000 + 120 + 2000.
  assert.equal(quadro(4100), 0);
  assert.equal(quadro(4120), 0, 'começa');
  assert.ok(quadro(4180) > 0.95);
  const { m: m2 } = relogioRosto([1]);
  assert.equal(m2.proxima, 6000);
});

test('sem piscada no aceno nem com movimento reduzido; pensando deixa a pálpebra meio caída', () => {
  const { m, sorteio } = relogioRosto([0]);
  for (let t = 0; t <= 2600; t += 16) assert.equal(rig.rostoCoruja3D(m, 'ocioso', 0, t, { sorteio, acenando: true }).piscar, 0);
  assert.ok(m.proxima > 2600, 'piscada adiada para depois do aceno');
  const { m: r } = relogioRosto([0]);
  for (let t = 0; t <= 10_000; t += 16) {
    assert.equal(rig.rostoCoruja3D(r, 'ocioso', 0, t, { movimentoReduzido: true }).piscar, 0);
  }
  assert.equal(rig.rostoCoruja3D(r, 'pensando', 0, 10_016, { movimentoReduzido: true }).piscar, rig.PALPEBRA_PENSANDO);
});

test('bico abre com o áudio só falando, suavizado, e fecha fora da fala', () => {
  const { m } = relogioRosto([0.99]);
  let bico = 0;
  for (let t = 16; t <= 320; t += 16) bico = rig.rostoCoruja3D(m, 'falando', 0.8, t).bico;
  assert.ok(bico > 0.75 && bico <= 0.8, `abre até o nível: ${bico}`);
  const primeiro = rig.rostoCoruja3D(m, 'ouvindo', 0.8, 336).bico;
  assert.ok(primeiro < bico && primeiro > 0.5, 'fecha devagar, sem estalo');
  for (let t = 352; t <= 1500; t += 16) bico = rig.rostoCoruja3D(m, 'ouvindo', 0.8, t).bico;
  assert.ok(bico < 0.01, `fechado fora da fala: ${bico}`);
  const { m: q } = relogioRosto([0.99]);
  assert.equal(rig.rostoCoruja3D(q, 'pensando', 1, 16).bico, 0);
});
