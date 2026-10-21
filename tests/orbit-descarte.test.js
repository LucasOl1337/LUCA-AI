import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { loadFrontendModule } from './support/load-frontend-module.js';

// Soak do item 5 (21/10): cada Iniciar/Encerrar do /gameplay deixava +1 `document:keydown`
// do OrbitControls, porque o `dispose()` tira o ouvinte de `getRootNode()` depois que o
// React já soltou o canvas do documento.
const require = createRequire(import.meta.url);
const THREE = require('three');
const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
const { soltarOrbit } = await loadFrontendModule('../../src/components/sompo/soltarOrbit.ts');

// Documento falso que conta os ouvintes vivos por tipo (a mesma regra do DOM: tipo+função+captura).
function documentoFalso() {
  const doc = new EventTarget();
  const vivos = new Set();
  const chave = (tipo, fn, op) => `${tipo}|${typeof op === 'boolean' ? op : !!op?.capture}|${fnId(fn)}`;
  const ids = new WeakMap(); let prox = 0;
  const fnId = (fn) => { if (!ids.has(fn)) ids.set(fn, ++prox); return ids.get(fn); };
  const add = doc.addEventListener.bind(doc); const rem = doc.removeEventListener.bind(doc);
  doc.addEventListener = (t, fn, op) => { vivos.add(chave(t, fn, op)); add(t, fn, op); };
  doc.removeEventListener = (t, fn, op) => { vivos.delete(chave(t, fn, op)); rem(t, fn, op); };
  doc.contar = (tipo) => [...vivos].filter((k) => k.startsWith(`${tipo}|`)).length;
  return doc;
}

// Canvas falso: dentro do documento ao montar; fora dele na limpeza do useEffect.
function canvasFalso(doc) {
  const canvas = new EventTarget();
  const raizSolta = new EventTarget();
  canvas.style = {};
  canvas.ownerDocument = doc;
  canvas.noDocumento = true;
  canvas.getRootNode = () => (canvas.noDocumento ? doc : raizSolta);
  canvas.setPointerCapture = () => {}; canvas.releasePointerCapture = () => {};
  return canvas;
}

function montarEDesmontar(doc, descartar) {
  const canvas = canvasFalso(doc);
  const antes = doc.contar('keydown');
  const orbit = new OrbitControls(new THREE.PerspectiveCamera(), canvas);
  assert.equal(doc.contar('keydown'), antes + 1, 'ao montar o OrbitControls ouve keydown no documento');
  canvas.noDocumento = false; // React já tirou a árvore quando a limpeza roda
  descartar(orbit);
}

test('premissa: orbit.dispose() com o canvas fora do documento deixa o keydown no document', () => {
  const doc = documentoFalso();
  for (let i = 0; i < 3; i++) montarEDesmontar(doc, (o) => o.dispose());
  assert.equal(doc.contar('keydown'), 3);
});

test('soltarOrbit tira o keydown do documento mesmo com o canvas já solto', () => {
  const doc = documentoFalso();
  for (let i = 0; i < 5; i++) {
    montarEDesmontar(doc, soltarOrbit);
    assert.equal(doc.contar('keydown'), 0, `ciclo ${i + 1}`);
  }
});

test('soltarOrbit também tira o keyup pendente de um Ctrl segurado na hora de sair', () => {
  const doc = documentoFalso();
  const canvas = canvasFalso(doc);
  const orbit = new OrbitControls(new THREE.PerspectiveCamera(), canvas);
  const ctrl = new Event('keydown'); ctrl.key = 'Control';
  doc.dispatchEvent(ctrl);
  assert.equal(doc.contar('keyup'), 1);
  canvas.noDocumento = false;
  soltarOrbit(orbit);
  assert.equal(doc.contar('keyup'), 0);
  assert.equal(doc.contar('keydown'), 0);
});

test('soltarOrbit com o canvas ainda no documento segue igual ao dispose', () => {
  const doc = documentoFalso();
  const orbit = new OrbitControls(new THREE.PerspectiveCamera(), canvasFalso(doc));
  soltarOrbit(orbit);
  assert.equal(doc.contar('keydown'), 0);
});

test('todo dono de OrbitControls em src/ descarta por soltarOrbit', () => {
  const arquivos = [];
  const andar = (dir) => {
    for (const nome of readdirSync(dir)) {
      const caminho = `${dir}/${nome}`;
      if (statSync(caminho).isDirectory()) andar(caminho);
      else if (/\.(ts|tsx)$/.test(nome) && !/\.test\./.test(nome)) arquivos.push(caminho);
    }
  };
  andar(new URL('../src', import.meta.url).pathname);
  const donos = arquivos.filter((f) => /new OrbitControls\(/.test(readFileSync(f, 'utf8')));
  assert.ok(donos.length >= 5, `donos achados: ${donos.length}`);
  const semSoltar = donos.filter((f) => !/soltarOrbit\(/.test(readFileSync(f, 'utf8'))).map((f) => f.replace(/.*\/src\//, 'src/'));
  assert.deepEqual(semSoltar, []);
});
