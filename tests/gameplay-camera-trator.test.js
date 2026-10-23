import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFrontendModule } from './support/load-frontend-module.js';
const { lerVistaTrator, alternarVistaTrator, criarVistaExterna } = await loadFrontendModule('../../src/components/gameplay/vistaTrator.ts');
const { COMANDOS_CABINE } = await loadFrontendModule('../../src/components/gameplay/comandosCabine.ts');
const THREE = await import('three');
test('vista alterna e persiste na sessão; contrato real expõe Cross/A/C', () => {
  assert.equal(COMANDOS_CABINE.camera.disponivel, true);
  assert.equal(COMANDOS_CABINE.camera.botao, 0);
  assert.deepEqual(COMANDOS_CABINE.camera.teclas, ['c']);
  const inicial = lerVistaTrator();
  assert.notEqual(alternarVistaTrator(), inicial);
  assert.notEqual(lerVistaTrator(), inicial);
  assert.equal(alternarVistaTrator(), inicial);
});
test('vista externa fica atrás/acima da máquina e olha para o caminho', () => {
  const camera = new THREE.PerspectiveCamera(), maquina = new THREE.Object3D();
  maquina.position.set(20, 1, 3); maquina.updateMatrixWorld(true);
  criarVistaExterna()(camera, maquina);
  assert.deepEqual(camera.position.toArray(), [10, 7, 3]);
  const frente = camera.getWorldDirection(new THREE.Vector3());
  assert.ok(frente.x > 0 && frente.y < 0);
});
