import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadFrontendModule } from './support/load-frontend-module.js';

const { criarAquecedorDePalco, CAMADA_AQUECENDO, AQUECIMENTO_MAX_MS } = await loadFrontendModule('../../src/components/sompo/aquecerPalco.ts');

// Renderer falso: `compile` dá um programa por material; `isReady` fica falso até o teste liberar.
function rendererFalso({ paralelo = true } = {}) {
  const props = new WeakMap(), prontos = new Set(), subidas = [], alvos = [];
  let alvo = null;
  const r = {
    extensions: { has: (n) => paralelo && n === 'KHR_parallel_shader_compile' },
    properties: { get: (m) => { if (!props.has(m)) props.set(m, {}); return props.get(m); } },
    getContext: () => ({ LINK_STATUS: 1, getProgramParameter: () => true, getProgramInfoLog: () => '' }),
    getRenderTarget: () => alvo,
    setRenderTarget: (t) => { alvo = t; },
    compile(scene) {
      alvos.push(alvo);
      scene.traverse((o) => { if (o.material) { const p = r.properties.get(o.material); p.currentProgram ??= { name: o.material.name, program: {}, isReady: () => prontos.has(o.material) }; } });
    },
    initTexture: (t) => subidas.push(t.name),
  };
  return { r, prontos, subidas, alvos };
}
const malha = (nome, mapa) => { const m = new THREE.MeshStandardMaterial({ name: nome }); if (mapa) { m.map = new THREE.Texture({ width: 4, height: 4 }); m.map.name = mapa; m.map.needsUpdate = true; } return new THREE.Mesh(new THREE.BufferGeometry(), m); };

test('o que é novo fica fora da câmera até o programa ficar pronto e a textura subir; o que já apareceu não some', () => {
  const { r, prontos, subidas, alvos } = rendererFalso();
  const cena = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const chao = malha('chao', 'terra'); cena.add(chao);
  const alvoDoPos = { isRenderTarget: true };
  const vistos = [];
  const aq = criarAquecedorDePalco(r, cena, camera, { alvoDaCena: () => alvoDoPos, aoMudar: (n) => vistos.push(n) });
  aq.quadro();
  assert.equal(chao.layers.mask, (1 << CAMADA_AQUECENDO) >>> 0, 'chão novo sai da camada da câmera');
  assert.equal(alvos[0], alvoDoPos, 'compila para o alvo do pós (tone mapping do programa)');
  assert.equal(r.getRenderTarget(), null, 'devolve o alvo anterior');
  aq.quadro();
  assert.equal(chao.layers.mask, (1 << CAMADA_AQUECENDO) >>> 0, 'programa ainda ligando: segue fora');
  prontos.add(chao.material);
  aq.quadro();
  assert.equal(chao.layers.mask, 1, 'pronto: volta à camada 0');
  assert.deepEqual(subidas, ['terra'], 'textura subiu antes de aparecer');
  assert.deepEqual(vistos, [1, 0]);
  // Já visto: troca de material/programa depois não esconde de novo.
  const liberado = chao.material;
  chao.material = new THREE.MeshStandardMaterial({ name: 'outro' });
  aq.quadro();
  assert.equal(chao.layers.mask, 1);
  // Clone novo de um material já liberado (fardo vestido) entra direto.
  const fardo = new THREE.Mesh(new THREE.BufferGeometry(), liberado); cena.add(fardo);
  const caixa = malha('caixa'); cena.add(caixa);
  aq.quadro();
  assert.equal(caixa.layers.mask, (1 << CAMADA_AQUECENDO) >>> 0, 'material inédito espera');
  assert.equal(fardo.layers.mask, 1, 'clone com material já liberado entra direto');
  assert.equal(aq.aquecendo, 1);
  aq.dispose();
  assert.equal(caixa.layers.mask, 1, 'dispose devolve tudo');
});

test('sem KHR_parallel_shader_compile não esconde nada (custo cai no primeiro uso, como antes)', () => {
  const { r } = rendererFalso({ paralelo: false });
  const cena = new THREE.Scene(); const m = malha('m'); cena.add(m);
  const aq = criarAquecedorDePalco(r, cena, new THREE.PerspectiveCamera());
  aq.quadro();
  assert.equal(m.layers.mask, 1);
});

test('driver que nunca responde: o lote aparece depois do teto, com um aviso só', (t) => {
  const { r } = rendererFalso();
  let agora = 0;
  const avisos = t.mock.method(console, 'warn', () => {});
  const cena = new THREE.Scene(); const m = malha('m'); cena.add(m);
  const aq = criarAquecedorDePalco(r, cena, new THREE.PerspectiveCamera(), { agora: () => agora });
  aq.quadro();
  agora = AQUECIMENTO_MAX_MS - 1; aq.quadro();
  assert.equal(m.layers.mask, (1 << CAMADA_AQUECENDO) >>> 0);
  agora = AQUECIMENTO_MAX_MS + 1; aq.quadro(); aq.quadro();
  assert.equal(m.layers.mask, 1);
  assert.equal(avisos.mock.callCount(), 1);
});

test('link que falhou vira erro no console com o nome do material', (t) => {
  const { r, prontos } = rendererFalso();
  r.getContext = () => ({ LINK_STATUS: 1, getProgramParameter: () => false, getProgramInfoLog: () => 'ERROR: 0:1' });
  const erros = t.mock.method(console, 'error', () => {});
  const cena = new THREE.Scene(); const m = malha('cabine-console-pbr'); cena.add(m);
  const aq = criarAquecedorDePalco(r, cena, new THREE.PerspectiveCamera());
  aq.quadro(); prontos.add(m.material); aq.quadro();
  assert.equal(erros.mock.callCount(), 1);
  assert.match(erros.mock.calls[0].arguments[0], /cabine-console-pbr/);
});
