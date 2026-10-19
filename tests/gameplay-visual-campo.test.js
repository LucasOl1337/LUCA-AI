import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadFrontendModule } from './support/load-frontend-module.js';
const { criarCampoVisual, MARCOS_CAMPO } = await loadFrontendModule('../../src/components/gameplay/visual/campoVisual.ts');

function palco() {
  const mundo = new THREE.Group();
  const geometry = new THREE.PlaneGeometry(300, 220).rotateX(-Math.PI / 2);
  const terreno = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  terreno.name = 'sompo-agri-terrain'; terreno.position.y = 2;
  const arvore = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), new THREE.MeshBasicMaterial(), 1);
  arvore.name = 'sompo-agri-treeline-generated-cerrado';
  mundo.add(terreno, arvore);
  const fardo = new THREE.Group();
  fardo.add(new THREE.Mesh(new THREE.BoxGeometry(1.44, 1.44, 1.25).translate(0, 0.72, 0), new THREE.MeshStandardMaterial()));
  return { mundo, terreno, arvore, fardo };
}

test('campo reaproveita geometria e material, assenta no chão e não altera terreno ou obstáculo', () => {
  const p = palco();
  const vertices = Array.from(p.terreno.geometry.attributes.position.array);
  const antes = p.mundo.children.slice();
  const campo = criarCampoVisual(p.mundo, p.fardo);
  const fardos = campo.raiz.getObjectByName('gameplay-fardos-decorativos');
  const arvores = campo.raiz.getObjectByName('gameplay-arvores-decorativas');
  assert.equal(fardos.count, 3);
  assert.equal(arvores.count, 4);
  assert.equal(fardos.geometry, p.fardo.children[0].geometry);
  assert.equal(fardos.material, p.fardo.children[0].material);
  assert.equal(arvores.geometry, p.arvore.geometry);
  assert.equal(arvores.material, p.arvore.material);
  const matriz = new THREE.Matrix4(), ponto = new THREE.Vector3();
  fardos.getMatrixAt(0, matriz); ponto.setFromMatrixPosition(matriz);
  assert.ok(Math.abs(ponto.y - 2) < 1e-6);
  assert.equal(ponto.x, MARCOS_CAMPO.fardos[0].x);
  assert.ok(MARCOS_CAMPO.fardos.every(p => p.z >= 8));
  assert.ok(MARCOS_CAMPO.arvores.every(p => p.z >= 28));
  assert.deepEqual(Array.from(p.terreno.geometry.attributes.position.array), vertices);
  assert.equal(p.fardo.parent, null);
  let disposed = 0;
  p.fardo.children[0].geometry.addEventListener('dispose', () => disposed++);
  p.arvore.material.addEventListener('dispose', () => disposed++);
  campo.descartar();
  assert.deepEqual(p.mundo.children, antes);
  assert.equal(disposed, 0, 'não descarta recursos emprestados do palco');
});

test('campo sem terreno não cria nada e terreno sem árvores mantém apenas fardos', () => {
  const vazio = new THREE.Group();
  const sem = criarCampoVisual(vazio, new THREE.Group());
  assert.equal(vazio.children.length, 0); sem.descartar();
  const p = palco(); p.arvore.removeFromParent();
  const campo = criarCampoVisual(p.mundo, p.fardo);
  assert.equal(campo.raiz.children.length, 1);
  campo.descartar();
});
