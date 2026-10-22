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

test('coruja-3d é a variante padrão; a coruja A segue por ?variante=coruja-a', () => {
  assert.equal(VARIANTE_PADRAO, 'coruja-3d');
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
  assert.ok(clipes.includes(rig.CLIPE_FELIZ), 'feliz depois da fala');
  assert.ok(json.nodes.some((n) => sanear(n.name) === rig.OSSO_PESCOCO), 'osso do pescoço existe com o nome saneado');
  assert.ok(json.nodes.some((n) => sanear(n.name) === rig.OSSO_CABECA), 'osso da cabeça existe com o nome saneado');
});

test('manifesto de texturas externas cobre cada imagem do GLB e os arquivos existem', () => {
  const manifesto = JSON.parse(readFileSync(new URL('coruja-3d.textures.json', pasta), 'utf8'));
  assert.equal(manifesto.images.length, json.images.length);
  for (const arquivo of manifesto.images) assert.ok(existsSync(new URL(arquivo, pasta)), arquivo);
  // Imagens fora do GLB (uri ao lado): o binário só leva geometria, pesos e clipes.
  json.images.forEach((imagem, i) => {
    assert.equal(imagem.bufferView, undefined, `imagem ${i} embutida`);
    assert.equal(imagem.uri, manifesto.images[i]);
  });
  const material = json.materials[0];
  assert.ok(material.emissiveTexture, 'emissivo do visor e frisos');
  assert.match(manifesto.images[json.textures[material.emissiveTexture.index].source], /emissive/);
  assert.match(manifesto.images[json.textures[material.pbrMetallicRoughness.baseColorTexture.index].source], /basecolor/);
  assert.match(manifesto.images[json.textures[material.normalTexture.index].source], /normal/);
  assert.ok(!(json.extensionsUsed || []).includes('EXT_meshopt_compression'), 'sem decoder extra no cliente');
  assert.ok(glb.length < 2_000_000, `GLB de ${glb.length} bytes`);
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

/** Lê os pesos (float ou byte normalizado) e as juntas de um primitivo. */
function pesosEJuntas(prim) {
  const bin = glb.subarray(28 + glb.readUInt32LE(12));
  const ler = (acc, Tipo, tam) => {
    const vista = json.bufferViews[acc.bufferView];
    const inicio = bin.byteOffset + (vista.byteOffset || 0) + (acc.byteOffset || 0);
    return new Tipo(bin.buffer.slice(inicio, inicio + acc.count * 4 * tam));
  };
  const pa = json.accessors[prim.attributes.WEIGHTS_0];
  const ja = json.accessors[prim.attributes.JOINTS_0];
  const pesos = pa.componentType === 5126 ? ler(pa, Float32Array, 4) : Float32Array.from(ler(pa, Uint8Array, 1), (v) => v / 255);
  const juntas = ja.componentType === 5121 ? ler(ja, Uint8Array, 1) : ler(ja, Uint16Array, 2);
  return { pesos, juntas, count: pa.count, acc: pa };
}

function soCabeca(prim, nome) {
  const { pesos, juntas, count, acc } = pesosEJuntas(prim);
  assert.equal(acc.componentType, 5126, `${nome}: peso inteiro em float`);
  const ossos = new Set();
  for (let i = 0; i < count; i += 1) {
    assert.ok(Math.abs(pesos[i * 4] - 1) < 1e-4, `${nome}: vértice ${i} com peso ${pesos[i * 4]}`);
    ossos.add(json.skins[0].joints[juntas[i * 4]]);
  }
  assert.deepEqual([...ossos].map((n) => sanear(json.nodes[n].name)), ['tripoHead_2'], nome);
}

test('GLB traz o rosto: bico_abre na principal (bico de cima) e no rosto (boca + bico de baixo), 100% na cabeça', () => {
  const porNome = Object.fromEntries(json.meshes.map((m) => [m.name, m]));
  const principal = porNome.Coruja;
  const rosto = porNome.CorujaRosto;
  assert.ok(principal && rosto, 'malhas Coruja e CorujaRosto');
  assert.deepEqual(principal.extras?.targetNames, [rig.MORPH_BICO], 'malha da coruja só com o bico de cima');
  assert.deepEqual(rosto.extras?.targetNames, [rig.MORPH_BICO]);
  assert.ok(!json.meshes.some((m) => (m.extras?.targetNames || []).includes('piscar')), 'piscada é da tela dos olhos, não morph');
  for (const p of principal.primitives) {
    assert.equal(p.targets.length, 1);
    // Esparso e pequeno: só os vértices do bico se movem, penas vizinhas ficam paradas.
    const alvo = json.accessors[p.targets[0].POSITION];
    assert.ok(alvo.sparse && alvo.sparse.count > 10 && alvo.sparse.count < 400, `bico de cima com peso suave: com ${alvo.sparse?.count} vértices`);
    assert.ok(Math.max(...alvo.max.map(Math.abs), ...alvo.min.map(Math.abs)) < 0.05, 'desloca menos de 5 cm (bico sobe 8°)');
  }
  // Interior da boca: material próprio quase preto, sem textura (fora do manifesto externo).
  const materiais = rosto.primitives.map((p) => json.materials[p.material]);
  const boca = materiais.find((m) => m.name === 'coruja-3d-boca');
  assert.ok(boca, 'rosto com o material escuro da boca');
  assert.ok(Math.max(...boca.pbrMetallicRoughness.baseColorFactor.slice(0, 3)) < 0.1, 'boca quase preta');
  assert.ok(!boca.emissiveTexture && !boca.normalTexture && !boca.pbrMetallicRoughness.baseColorTexture);
  const no = json.nodes.find((n) => n.mesh === json.meshes.indexOf(rosto));
  assert.equal(no.skin, 0, 'mesma skin da coruja');
  for (const p of rosto.primitives) soCabeca(p, 'rosto');
});

test('GLB traz a tela dos olhos no visor: malha CorujaOlhos sem textura, presa à cabeça', () => {
  const olhos = json.meshes.find((m) => m.name === rig.MALHA_OLHOS);
  assert.ok(olhos, 'malha da tela');
  assert.equal(olhos.primitives.length, 1);
  const p = olhos.primitives[0];
  assert.ok(!p.targets, 'sem morph: a textura em canvas desenha piscada e olhar');
  assert.ok(p.attributes.TEXCOORD_0 !== undefined, 'UV plano por olho');
  const mat = json.materials[p.material];
  assert.ok(!mat.pbrMetallicRoughness?.baseColorTexture, 'textura vem do canvas no cliente');
  assert.equal(json.nodes.find((n) => n.mesh === json.meshes.indexOf(olhos)).skin, 0);
  soCabeca(p, 'olhos');
  // Malha principal: pesos de 4 ossos somando 1 (byte normalizado ou float).
  const { pesos, count } = pesosEJuntas(json.meshes.find((m) => m.name === 'Coruja').primitives[0]);
  for (let i = 0; i < count; i += 97) {
    const soma = pesos[i * 4] + pesos[i * 4 + 1] + pesos[i * 4 + 2] + pesos[i * 4 + 3];
    assert.ok(Math.abs(soma - 1) < 1e-3, `vértice ${i} soma ${soma}`);
  }
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
  for (let t = 16; t <= 320; t += 16) bico = rig.rostoCoruja3D(m, 'falando', 0.4, t).bico;
  const alvo = rig.curvaBico(0.4 * rig.GANHO_BICO);
  assert.ok(alvo > 0.7, 'fala típica abre bem o bico (o gancho esconde o começo)');
  assert.ok(bico > alvo - 0.03 && bico <= alvo, `abre até o nível com ganho e curva (fala típica ~0,4): ${bico}`);
  const primeiro = rig.rostoCoruja3D(m, 'ouvindo', 0.4, 336).bico;
  assert.ok(primeiro < bico && primeiro > 0.35, 'fecha devagar, sem estalo');
  for (let t = 352; t <= 1500; t += 16) bico = rig.rostoCoruja3D(m, 'ouvindo', 0.4, t).bico;
  assert.ok(bico < 0.01, `fechado fora da fala: ${bico}`);
  const { m: alto } = relogioRosto([0.99]);
  for (let t = 16; t <= 320; t += 16) bico = rig.rostoCoruja3D(alto, 'falando', 1, t).bico;
  assert.equal(bico, 1, 'satura em 1 (morph nunca passa de 100%)');
  const { m: q } = relogioRosto([0.99]);
  assert.equal(rig.rostoCoruja3D(q, 'pensando', 1, 16).bico, 0);
});
